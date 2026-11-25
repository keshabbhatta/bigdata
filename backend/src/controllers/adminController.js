import { systemOverview, createUser, runBackup, listBackups, auditLog } from '../services/adminService.js';
import { setSyncMode } from '../services/clock.js';
import { promoteReplica } from '../coordination/failover.js';
import { audit } from '../middleware/auth.js';
import { publishOnce } from '../kafka/outboxPublisher.js';
import { approveUser, rejectUser, updateUser, resetPassword } from '../services/accountService.js';
import { forgetUser } from '../middleware/auth.js';

export async function overview(_req, res) {
  res.json(await systemOverview());
}

export async function addUser(req, res) {
  const user = await createUser(req.body || {});
  await audit(req.user, 'user.create', user.username, { role: user.role, wards: user.wards }, req.ip);
  res.status(201).json({ user });
}

export async function approve(req, res) {
  const user = await approveUser(req.user, req.params.id, req.body || {});
  forgetUser(user.id);
  await audit(req.user, 'user.approve', user.username, { role: user.role, patientId: user.patient_id }, req.ip);
  res.json({ user });
}

export async function reject(req, res) {
  const user = await rejectUser(req.user, req.params.id);
  forgetUser(user.id);
  await audit(req.user, 'user.reject', user.username, { role: user.role }, req.ip);
  res.json({ removed: user.id });
}

export async function editUser(req, res) {
  const user = await updateUser(req.user, req.params.id, req.body || {});
  forgetUser(user.id);
  await audit(req.user, 'user.update', user.username, { changes: Object.keys(req.body || {}), role: user.role, active: user.active }, req.ip);
  res.json({ user });
}

export async function setPassword(req, res) {
  const user = await resetPassword(req.params.id, req.body?.password);
  await audit(req.user, 'user.password_reset', user.username, null, req.ip);
  res.json({ ok: true });
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
