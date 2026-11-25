import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { signToken, audit } from '../middleware/auth.js';
import { registerAccount, pendingMessage, SIGNUP_ROLES } from '../services/accountService.js';

// Very small in-memory rate limits per IP: 10 FAILED sign-ins per minute, 10 sign-ups per hour.
const limiter = (windowMs, max) => {
  const hits = new Map();
  const recent = (ip) => (hits.get(ip) || []).filter((t) => Date.now() - t < windowMs);
  return { blocked: (ip) => recent(ip).length >= max, record: (ip) => hits.set(ip, [...recent(ip), Date.now()]) };
};
const failedLogins = limiter(60_000, 10);
const signups = limiter(3_600_000, 10);

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.full_name, role: u.role, wards: u.wards, patientId: u.patient_id || null });

// Sign in with a username OR an email address.
export async function login(req, res) {
  const { username, password } = req.body || {};
  if (failedLogins.blocked(req.ip)) return res.status(429).json({ error: 'Too many sign-in attempts. Wait a minute and try again.' });
  if (!username || !password) return res.status(400).json({ error: 'Enter your email (or username) and password.' });
  const id = String(username).trim().toLowerCase();
  const { rows } = await query(
    'SELECT * FROM users WHERE username = $1 OR lower(email) = $1 ORDER BY (username = $1) DESC LIMIT 1', [id],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    failedLogins.record(req.ip);
    await audit({ username: id }, 'auth.login_failed', id, null, req.ip);
    const hint = user?.auth_provider === 'google' ? ' This account was created with Google; use "Continue with Google".' : '';
    return res.status(401).json({ error: `Email/username or password is incorrect.${hint}` });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been switched off. Contact your administrator.' });
  if (!user.approved) return res.status(403).json({ error: pendingMessage(user).replace('Account created. ', ''), pending: true });
  await audit({ id: user.id, username: user.username }, 'auth.login', user.username, { deviceId: req.body.deviceId }, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
}

// Create an account from the sign-up form. Saved in PostgreSQL (users table).
export async function register(req, res) {
  if (signups.blocked(req.ip)) return res.status(429).json({ error: 'Too many new accounts from this network. Try again later.' });
  signups.record(req.ip);
  const user = await registerAccount(req.body || {});
  await audit({ id: user.id, username: user.username }, 'auth.register', user.username, { role: user.role, wards: user.wards, approved: user.approved }, req.ip);
  if (!user.approved) return res.status(201).json({ pending: true, message: pendingMessage(user) });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

// Sign in with Google: the browser gets an ID token from Google Identity
// Services; we verify it with Google and match the (Google-verified) email to a
// user. When `signup` is sent and no account uses that email yet, one is created.
export async function googleLogin(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'Google sign-in is not set up on this server yet. Use your email and password.' });
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
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [info.email]);
  let user = rows[0];
  if (!user) {
    const signup = req.body?.signup;
    if (!signup || !SIGNUP_ROLES[signup.tab]) {
      await audit({ username: info.email }, 'auth.google_unknown', info.email, null, req.ip);
      return res.status(404).json({ error: `No account uses ${info.email} yet. Tap "Create an account", then "Continue with Google".` });
    }
    user = await registerAccount({ fullName: info.name || info.email.split('@')[0], tab: signup.tab, ward: signup.ward, google: { email: info.email } });
    await audit({ id: user.id, username: user.username }, 'auth.register_google', info.email, { role: user.role, approved: user.approved }, req.ip);
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been switched off. Contact your administrator.' });
  if (!user.approved) return res.json({ pending: true, message: pendingMessage(user) });
  await audit({ id: user.id, username: user.username }, 'auth.login_google', info.email, null, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
}

export function authConfig(_req, res) {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}

export function me(req, res) {
  res.json({ user: req.user });
}
