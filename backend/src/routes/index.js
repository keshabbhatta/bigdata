import { Router } from 'express';
import express from 'express';
import { requireAuth, requireRole, trackDevice, staffOrWorker } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as patients from '../controllers/patientController.js';
import * as sync from '../controllers/syncController.js';
import * as admin from '../controllers/adminController.js';
import * as attachments from '../controllers/attachmentController.js';
import { listConflicts, resolveConflict } from '../services/conflictService.js';
import { getAnalytics } from '../services/analyticsService.js';
import { config } from '../config.js';
import { dbState } from '../database/pool.js';
import { coordinationStatus } from '../coordination/coordinator.js';

// Wrap async handlers so thrown errors reach the error middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const api = Router();

api.get('/health', (_req, res) => res.json({
  ok: true, instance: config.instanceId, time: new Date().toISOString(),
  db: dbState(), leader: coordinationStatus().isLeader,
}));

api.post('/auth/login', h(auth.login));
api.post('/auth/google', h(auth.googleLogin));
api.get('/auth/config', auth.authConfig);
api.get('/auth/me', requireAuth, auth.me);

api.use(requireAuth, trackDevice);

api.get('/patients', staffOrWorker, h(patients.listPatients));
api.post('/patients', staffOrWorker, h(patients.createPatient));
api.get('/patients/:id', staffOrWorker, h(patients.getPatient));
api.put('/patients/:id', staffOrWorker, h(patients.updatePatient));

api.post('/sync/push', h(sync.push));
api.post('/sync/pull', h(sync.pull));
api.get('/sync/status', h(sync.status));

api.get('/conflicts', staffOrWorker, h(async (req, res) => res.json({ conflicts: await listConflicts(req.user, req.query.status || 'open') })));
// Clinical decisions are made by supervisors (or admins), not by volunteers.
api.post('/conflicts/:id/resolve', requireRole('admin', 'supervisor'), h(async (req, res) => res.json(await resolveConflict(req.user, req.params.id, req.body || {}, req.ip))));

api.get('/analytics', staffOrWorker, h(async (req, res) => res.json(await getAnalytics(req.user, req.query.ward))));

api.post('/attachments', staffOrWorker, express.json({ limit: '8mb' }), h(attachments.upload));
api.get('/attachments/:id', staffOrWorker, h(attachments.download));
api.get('/records/:recordId/attachments', staffOrWorker, h(attachments.listForRecord));

const adminOnly = requireRole('admin');
const staff = requireRole('admin', 'supervisor');
api.get('/admin/overview', staff, h(admin.overview));
api.get('/admin/audit', staff, h(admin.audits));
api.post('/admin/users', adminOnly, h(admin.addUser));
api.post('/admin/sync-mode', adminOnly, h(admin.changeSyncMode));
api.post('/admin/backup', adminOnly, h(admin.backup));
api.get('/admin/backups', staff, h(admin.backups));
api.post('/admin/failover', adminOnly, h(admin.failover));
api.post('/admin/outbox/flush', adminOnly, h(admin.flushOutbox));
