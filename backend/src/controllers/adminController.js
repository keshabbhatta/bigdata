import { systemOverview, createUser, runBackup, listBackups, auditLog } from '../services/adminService.js';
import { setSyncMode } from '../services/clock.js';
import { promoteReplica } from '../coordination/failover.js';
import { audit } from '../middleware/auth.js';
import { publishOnce } from '../kafka/outboxPublisher.js';

export async function overview(_req, res) {
  res.json(await systemOverview());
}

export async function addUser(req, res) {
  const user = await createUser(req.body || {});
  await audit(req.user, 'user.create', user.username, { role: user.role, wards: user.wards }, req.ip);
  res.status(201).json({ user });
}

export async function changeSyncMode(req, res) {
  const mode = req.body?.mode;
  if (!['safe', 'naive'].includes(mode)) return res.status(400).json({ error: 'Mode must be "safe" or "naive".' });
  await setSyncMode(mode);
  await audit(req.user, 'sync.mode', mode, null, req.ip);
  res.json({ mode });
}

export async function backup(req, res) {
  const result = await runBackup();
  await audit(req.user, 'backup.create', result.key, { records: result.records, bytes: result.compressedBytes }, req.ip);
  res.json(result);
}

export async function backups(_req, res) {
  res.json({ backups: await listBackups() });
}

export async function failover(req, res) {
  try {
    res.json(await promoteReplica('manual failover from admin dashboard', req.user));
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
}

export async function flushOutbox(_req, res) {
  res.json({ published: await publishOnce() });
}

export async function audits(req, res) {
  res.json({ entries: await auditLog(req.query.limit) });
}
