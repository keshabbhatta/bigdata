// Self sign-up and account approval.
//
// Anyone can create an account from the sign-in page (or with Google), but what
// it may see depends on its role:
//   worker     sees one ward            -> can sign in right away (AUTO_APPROVE_ROLES)
//   supervisor sees every ward          -> an administrator approves it first
//   patient    sees only her own record -> staff link it to her patient record first
import dns from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { config } from '../config.js';
import { WARDS } from '../../../shared/schema.js';
import { isEmailFormat, normalizeEmail, passwordProblems } from '../../../shared/accounts.js';

const WARD_IDS = WARDS.map((w) => w.id);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sign-in tab -> account role. Administrators are never self-registered. */
export const SIGNUP_ROLES = { worker: 'worker', doctor: 'supervisor', patient: 'patient' };

export const httpError = (status, message) => Object.assign(new Error(message), { status });

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms)),
]);

/**
 * Does the email's domain accept mail? Looks for MX records (or, as the mail
 * standard allows, an address record when there is no MX). Catches typos such
 * as "gmial.com" and made-up domains. If DNS itself is unreachable we do not
 * block the sign-up.
 */
export async function domainReceivesMail(domain) {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    return mx.some((r) => r.exchange && r.exchange !== '.'); // a "null MX" means the domain refuses mail
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN') return false;
    if (e.code === 'ENODATA') {
      try {
        await withTimeout(dns.resolve(domain), 4000);
        return true;
      } catch (e2) {
        return !(e2.code === 'ENOTFOUND' || e2.code === 'ENODATA');
      }
    }
    console.warn(`[accounts] email domain check skipped for ${domain}: ${e.code || e.message}`);
    return true;
  }
}

export async function validateEmail(raw) {
  const email = normalizeEmail(raw);
  if (!isEmailFormat(email)) throw httpError(400, 'Enter a valid email address, for example name@gmail.com.');
  const domain = email.split('@')[1];
  if (!(await domainReceivesMail(domain))) throw httpError(400, `"${domain}" cannot receive email. Check the address for typos.`);
  return email;
}

export function validatePassword(password) {
  const problems = passwordProblems(password);
  if (problems.length) throw httpError(400, problems[0]);
}

export function pendingMessage(user) {
  return user.role === 'patient'
    ? 'Account created. Your health post will link it to your health record; you can sign in after that.'
    : 'Account created. Doctor accounts can see every ward, so an administrator approves them first. You can sign in after approval.';
}

/**
 * Create an account from the sign-up form, or from a verified Google sign-in
 * (`google = { email }`, no password needed).
 */
export async function registerAccount({ fullName, email, password, tab, ward, google = null }) {
  const role = SIGNUP_ROLES[tab];
  if (!role) throw httpError(400, 'Choose Health worker, Doctor or Patient.');
  const name = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) throw httpError(400, 'Enter your full name.');
  const cleanEmail = google ? normalizeEmail(google.email) : await validateEmail(email);
  if (!google) validatePassword(password);

  let wards;
  if (role === 'supervisor') wards = WARD_IDS;
  else if (WARD_IDS.includes(ward)) wards = [ward];
  else throw httpError(400, 'Choose your ward.');

  // Google accounts get a random password nobody knows; they sign in with Google.
  const hash = await bcrypt.hash(google ? randomBytes(32).toString('hex') : password, 10);
  const approved = config.autoApproveRoles.includes(role);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, full_name, role, wards, email, approved, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $1, $6, $7) RETURNING *`,
      [cleanEmail, hash, name, role, wards, approved, google ? 'google' : 'password'],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw httpError(409, 'An account with this email already exists. Sign in instead.');
    throw e;
  }
}

const ROLES = ['admin', 'supervisor', 'worker', 'patient'];
const PUBLIC_COLS = 'id, username, full_name, role, wards, email, active, approved, auth_provider, patient_id, created_at';

async function patientRecord(patientId) {
  if (!UUID_RE.test(String(patientId || ''))) throw httpError(400, 'Choose the patient record this account belongs to.');
  const rec = (await query("SELECT id, ward FROM records WHERE id = $1 AND entity = 'patient' AND NOT deleted", [patientId])).rows[0];
  if (!rec) throw httpError(404, 'That patient record was not found.');
  return rec;
}

/** Administrator edits an account: name, email, role, wards, patient link, on/off. */
export async function updateUser(actor, id, changes = {}) {
  const user = await pendingUser(id);
  const self = user.id === actor.id;
  const next = { role: user.role, active: user.active };
  const cols = {};

  if (changes.fullName !== undefined) {
    const name = String(changes.fullName || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) throw httpError(400, 'Enter the full name.');
    cols.full_name = name;
  }
  if (changes.email !== undefined && normalizeEmail(changes.email) !== (user.email || '')) {
    const email = changes.email ? await validateEmail(changes.email) : null;
    cols.email = email;
    // Self-registered accounts use their email as the username; keep them in step.
    if (email && user.username === user.email) cols.username = email;
  }
  if (changes.role !== undefined) {
    if (!ROLES.includes(changes.role)) throw httpError(400, 'Role must be admin, supervisor, worker or patient.');
    next.role = changes.role;
    cols.role = changes.role;
  }
  if (changes.active !== undefined) {
    next.active = Boolean(changes.active);
    cols.active = next.active;
  }
  if (self && (!next.active || next.role !== 'admin')) throw httpError(400, 'You cannot switch off or change the role of your own account.');
  if (user.role === 'admin' && (next.role !== 'admin' || !next.active)) {
    const others = (await query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active AND approved AND id <> $1", [user.id])).rows[0].n;
    if (!others) throw httpError(400, 'This is the last active administrator. Make someone else an administrator first.');
  }

  if (next.role === 'patient') {
    const pid = changes.patientId !== undefined ? changes.patientId : user.patient_id;
    const rec = await patientRecord(pid);
    cols.patient_id = rec.id;
    cols.wards = [rec.ward];
  } else {
    if (user.patient_id) cols.patient_id = null;
    if (next.role === 'supervisor' || next.role === 'admin') {
      cols.wards = Array.isArray(changes.wards) && changes.wards.length ? changes.wards.filter((w) => WARD_IDS.includes(w)) : (user.role === next.role ? user.wards : WARD_IDS);
    } else if (changes.wards !== undefined || user.role !== next.role) {
      const wards = (Array.isArray(changes.wards) ? changes.wards : user.wards).filter((w) => WARD_IDS.includes(w));
      if (!wards.length) throw httpError(400, 'Choose at least one ward for a health worker.');
      cols.wards = wards;
    }
  }
  if (changes.approved === true) cols.approved = true;

  const keys = Object.keys(cols);
  if (!keys.length) return (await query(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [user.id])).rows[0];
  try {
    const { rows } = await query(
      `UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${PUBLIC_COLS}`,
      [user.id, ...keys.map((k) => cols[k])],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw httpError(409, 'Another account already uses that email.');
    throw e;
  }
}

/** Administrator sets a new password (the user can then sign in with it). */
export async function resetPassword(id, password) {
  const user = await pendingUser(id);
  validatePassword(password);
  await query("UPDATE users SET password_hash = $2, auth_provider = 'password' WHERE id = $1", [user.id, await bcrypt.hash(password, 10)]);
  return user;
}

async function pendingUser(id) {
  if (!/^\d+$/.test(String(id))) throw httpError(404, 'Account not found.');
  const user = (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!user) throw httpError(404, 'Account not found.');
  return user;
}

const canDecide = (actor, user) => user.role !== 'supervisor' && user.role !== 'admin' ? true : actor.role === 'admin';

/** Approve a waiting account. Patients must be linked to their patient record. */
export async function approveUser(actor, id, { patientId } = {}) {
  const user = await pendingUser(id);
  if (!canDecide(actor, user)) throw httpError(403, 'Only an administrator can approve doctor accounts.');
  let wards = user.wards;
  let link = null;
  if (user.role === 'patient') {
    if (!UUID_RE.test(String(patientId || ''))) throw httpError(400, 'Choose the patient record this account belongs to.');
    const rec = (await query("SELECT id, ward FROM records WHERE id = $1 AND entity = 'patient' AND NOT deleted", [patientId])).rows[0];
    if (!rec) throw httpError(404, 'That patient record was not found.');
    wards = [rec.ward];
    link = rec.id;
  }
  const { rows } = await query(
    `UPDATE users SET approved = TRUE, wards = $2, patient_id = COALESCE($3, patient_id) WHERE id = $1
     RETURNING id, username, full_name, role, wards, email, approved, patient_id`,
    [user.id, wards, link],
  );
  return rows[0];
}

/** Reject (delete) an account that is still waiting for approval. */
export async function rejectUser(actor, id) {
  const user = await pendingUser(id);
  if (user.approved) throw httpError(409, 'Only accounts waiting for approval can be rejected.');
  if (!canDecide(actor, user)) throw httpError(403, 'Only an administrator can reject doctor accounts.');
  await query('DELETE FROM users WHERE id = $1 AND NOT approved', [user.id]);
  return user;
}
