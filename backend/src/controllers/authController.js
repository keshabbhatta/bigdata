import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { signToken, audit } from '../middleware/auth.js';

// Very small in-memory rate limit: at most 10 FAILED sign-ins per IP per minute.
const failures = new Map();
const recent = (ip) => (failures.get(ip) || []).filter((t) => Date.now() - t < 60_000);
const tooManyAttempts = (ip) => recent(ip).length >= 10;
const recordFailure = (ip) => failures.set(ip, [...recent(ip), Date.now()]);

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Too many sign-in attempts. Wait a minute and try again.' });
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [String(username).trim().toLowerCase()]);
  const user = rows[0];
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    recordFailure(req.ip);
    await audit({ username }, 'auth.login_failed', username, null, req.ip);
    return res.status(401).json({ error: 'Username or password is incorrect.' });
  }
  await audit({ id: user.id, username: user.username }, 'auth.login', user.username, { deviceId: req.body.deviceId }, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.full_name, role: u.role, wards: u.wards, patientId: u.patient_id || null });

// Sign in with Google: the browser gets an ID token from Google Identity
// Services; we verify it with Google and match the email to an existing user.
// Accounts are still created by an admin — Google only proves who you are.
export async function googleLogin(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'Google sign-in is not set up on this server yet. Use your username and password.' });
  const credential = req.body?.credential;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
  let info;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    info = await r.json();
    if (!r.ok) throw new Error(info.error_description || 'invalid token');
  } catch (e) {
    return res.status(401).json({ error: `Google could not confirm this sign-in (${e.message}).` });
  }
  if (info.aud !== clientId || String(info.email_verified) !== 'true') {
    return res.status(401).json({ error: 'This Google sign-in was not issued for RuralHealth Sync.' });
  }
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1) AND active', [info.email]);
  if (!rows[0]) {
    await audit({ username: info.email }, 'auth.google_unknown', info.email, null, req.ip);
    return res.status(403).json({ error: `${info.email} is not registered. Ask your health post administrator to add this email to your account.` });
  }
  await audit({ id: rows[0].id, username: rows[0].username }, 'auth.login_google', info.email, null, req.ip);
  res.json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
}

export function authConfig(_req, res) {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}

export function me(req, res) {
  res.json({ user: req.user });
}
