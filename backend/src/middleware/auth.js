import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../database/pool.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, name: user.full_name, role: user.role, wards: user.wards, pid: user.patient_id || null },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: p.sub, username: p.username, name: p.name, role: p.role, wards: p.wards || [], patientId: p.pid || null };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

// Role-based access control.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your role does not allow this action.' });
    }
    next();
  };
}

// Patients may only read their own health record.
export function staffOrWorker(req, res, next) {
  if (req.user?.role === 'patient') return res.status(403).json({ error: 'Patients can only open their own health record.' });
  next();
}

// Workers (and patients) only see their own wards; supervisors and admins see all.
export function allowedWards(user) {
  return user.role === 'worker' || user.role === 'patient' ? user.wards : null; // null = all wards
}

export function canAccessWard(user, ward) {
  const wards = allowedWards(user);
  return wards === null || wards.includes(ward);
}

// Keep track of each device that talks to the server (shown in the admin dashboard).
export async function trackDevice(req, _res, next) {
  const deviceId = req.headers['x-device-id'];
  if (deviceId && req.user) {
    req.deviceId = String(deviceId).slice(0, 80);
    const pending = Number(req.headers['x-pending-count']);
    query(
      `INSERT INTO devices (device_id, user_id, user_agent, app_version, last_seen, pending_reported)
       VALUES ($1, $2, $3, $4, now(), $5)
       ON CONFLICT (device_id) DO UPDATE SET user_id = $2, user_agent = $3, app_version = $4, last_seen = now(),
         pending_reported = COALESCE($5, devices.pending_reported)`,
      [req.deviceId, req.user.id, (req.headers['user-agent'] || '').slice(0, 200), req.headers['x-app-version'] || null,
        Number.isFinite(pending) ? pending : null],
    ).catch((e) => console.warn('[device] track failed:', e.message));
  }
  next();
}

export async function audit(user, action, target, details, ip) {
  try {
    await query(
      'INSERT INTO audit_log (user_id, username, action, target, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [user?.id || null, user?.username || null, action, target || null, details ? JSON.stringify(details) : null, ip || null],
    );
  } catch (e) {
    console.warn('[audit] failed:', e.message);
  }
}
