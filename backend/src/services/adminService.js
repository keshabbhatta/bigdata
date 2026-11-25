import zlib from 'node:zlib';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
import { query, dbState } from '../database/pool.js';
import { config } from '../config.js';
import { kafkaStatus } from '../kafka/producer.js';
import { coordinationStatus } from '../coordination/coordinator.js';
import { dbHealth, refreshDbHealth } from '../coordination/failover.js';
import { storageStatus, putObject, listObjects } from './storageService.js';
import { getSyncMode } from './clock.js';
import { validateEmail, validatePassword } from './accountService.js';

const gzip = promisify(zlib.gzip);

export async function systemOverview() {
  await refreshDbHealth().catch(() => {});
  const [outbox, events, devices, users] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE published_at IS NULL)::int AS pending,
                  count(*) FILTER (WHERE published_at IS NOT NULL)::int AS published FROM outbox`),
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE received_at > now() - interval '1 hour')::int AS last_hour,
                  count(*) FILTER (WHERE status = 'conflict')::int AS conflicts,
                  count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                  max(seq) AS last_seq FROM sync_events`),
    query(`SELECT d.device_id, d.last_seen, d.last_sync_at, d.last_pull_seq, d.pending_reported, d.events_pushed,
                  d.app_version, d.user_agent, u.full_name, u.username, u.role
           FROM devices d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.last_seen DESC NULLS LAST LIMIT 100`),
    query(`SELECT id, username, full_name, role, wards, email, active, approved, auth_provider, patient_id, created_at
           FROM users ORDER BY approved, id`),
  ]);
  return {
    instanceId: config.instanceId,
    syncMode: await getSyncMode(),
    coordination: coordinationStatus(),
    database: { ...dbHealth(), ...dbState() },
    kafka: kafkaStatus(),
    storage: storageStatus(),
    outbox: outbox.rows[0],
    events: events.rows[0],
    devices: devices.rows,
    users: users.rows,
  };
}

export async function createUser({ username, password, fullName, role, wards, email, patientId }) {
  if (!username || !password || !fullName) throw Object.assign(new Error('Username, password and full name are required.'), { status: 400 });
  if (!['admin', 'supervisor', 'worker', 'patient'].includes(role)) throw Object.assign(new Error('Role must be admin, supervisor, worker or patient.'), { status: 400 });
  if (role === 'patient' && !patientId) throw Object.assign(new Error('Choose which patient record this account belongs to.'), { status: 400 });
  validatePassword(password);
  if (email?.trim()) email = await validateEmail(email);
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, full_name, role, wards, email, patient_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, username, full_name, role, wards, email, active`,
      [username.trim().toLowerCase(), hash, fullName.trim(), role, wards || [], email?.trim() || null, patientId || null],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw Object.assign(new Error('That username or email is already used.'), { status: 409 });
    throw e;
  }
}

export async function runBackup() {
  const started = Date.now();
  const records = await query('SELECT * FROM records ORDER BY server_seq');
  const conflicts = await query('SELECT * FROM conflicts');
  const lines = [
    JSON.stringify({ type: 'meta', createdAt: new Date().toISOString(), instance: config.instanceId, records: records.rowCount }),
    ...records.rows.map((r) => JSON.stringify({ type: 'record', ...r })),
    ...conflicts.rows.map((c) => JSON.stringify({ type: 'conflict', ...c })),
  ].join('\n');
  const raw = Buffer.from(lines);
  const compressed = await gzip(raw);
  const key = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson.gz`;
  const stored = await putObject('backups', key, compressed, 'application/gzip');
  return { ...stored, records: records.rowCount, rawBytes: raw.length, compressedBytes: compressed.length, durationMs: Date.now() - started };
}

export function listBackups() {
  return listObjects('backups');
}

export async function auditLog(limit = 100) {
  const { rows } = await query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [Math.min(Number(limit) || 100, 500)]);
  return rows;
}
