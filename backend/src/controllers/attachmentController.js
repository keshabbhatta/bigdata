// Attachments (photos of ANC cards, lab reports) are stored in MinIO object
// storage; PostgreSQL only keeps the metadata (DDIA Ch.3/4 — keep large blobs
// out of the transactional database).
import { query } from '../database/pool.js';
import { canAccessWard, audit } from '../middleware/auth.js';
import { putObject, getObject } from '../services/storageService.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function upload(req, res) {
  const { recordId, filename, contentType, dataBase64 } = req.body || {};
  if (!recordId || !filename || !dataBase64) return res.status(400).json({ error: 'recordId, filename and dataBase64 are required.' });
  if (!ALLOWED.includes(contentType)) return res.status(400).json({ error: 'Upload a JPG, PNG, WEBP image or a PDF.' });
  const rec = (await query('SELECT id, ward FROM records WHERE id = $1', [recordId])).rows[0];
  if (!rec || !canAccessWard(req.user, rec.ward)) return res.status(404).json({ error: 'Record not found.' });
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'Files must be 5 MB or smaller.' });
  const id = crypto.randomUUID();
  const safeName = filename.replace(/[^\w.\-]+/g, '_').slice(0, 100);
  const key = `${rec.ward}/${recordId}/${id}-${safeName}`;
  const stored = await putObject('attachments', key, buffer, contentType);
  await query(
    `INSERT INTO attachments (id, record_id, ward, filename, content_type, size_bytes, storage, object_key, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, recordId, rec.ward, safeName, contentType, buffer.length, stored.storage, key, req.user.id],
  );
  await audit(req.user, 'attachment.upload', id, { recordId, size: buffer.length }, req.ip);
  res.status(201).json({ id, filename: safeName, contentType, size: buffer.length, storage: stored.storage });
}

export async function listForRecord(req, res) {
  const rec = (await query('SELECT ward FROM records WHERE id = $1', [req.params.recordId])).rows[0];
  if (!rec || !canAccessWard(req.user, rec.ward)) return res.status(404).json({ error: 'Record not found.' });
  const { rows } = await query(
    `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.storage, a.created_at, u.full_name AS uploaded_by
     FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.record_id = $1 ORDER BY a.created_at DESC`,
    [req.params.recordId],
  );
  res.json({ attachments: rows });
}

export async function download(req, res) {
  const a = (await query('SELECT * FROM attachments WHERE id = $1', [req.params.id])).rows[0];
  if (!a || !canAccessWard(req.user, a.ward)) return res.status(404).json({ error: 'File not found.' });
  const buf = await getObject('attachments', a.object_key);
  res.setHeader('Content-Type', a.content_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${a.filename}"`);
  res.send(buf);
}
