// REST endpoints for patients. The mobile app works through /api/sync, but these
// endpoints let other systems (or Postman) read and write records directly.
// Writes go through the SAME sync pipeline, so conflict rules still apply.
import { readQuery, query } from '../database/pool.js';
import { allowedWards, canAccessWard } from '../middleware/auth.js';
import { serverWrite, toClientRecord } from '../services/syncService.js';

export async function listPatients(req, res) {
  const wards = allowedWards(req.user);
  const q = (req.query.q || '').toString().trim();
  const { rows } = await readQuery(
    `SELECT * FROM records WHERE entity = 'patient' AND NOT deleted
       AND ($1::text[] IS NULL OR ward = ANY($1))
       AND ($2 = '' OR data->>'name' ILIKE '%' || $2 || '%' OR data->>'village' ILIKE '%' || $2 || '%')
     ORDER BY data->>'name' LIMIT 500`,
    [wards, q],
  );
  res.json({ patients: rows.map(toClientRecord) });
}

export async function getPatient(req, res) {
  const { rows } = await query("SELECT * FROM records WHERE id = $1 AND entity = 'patient'", [req.params.id]);
  const p = rows[0];
  if (!p || !canAccessWard(req.user, p.ward)) return res.status(404).json({ error: 'Patient not found.' });
  const related = await query(
    "SELECT * FROM records WHERE data->>'patientId' = $1 AND NOT deleted ORDER BY created_at",
    [req.params.id],
  );
  res.json({ patient: toClientRecord(p), related: related.rows.map(toClientRecord) });
}

export async function createPatient(req, res) {
  const { ward, ...changes } = req.body || {};
  if (!ward) return res.status(400).json({ error: 'ward is required.' });
  const r = await serverWrite(req.user, { entity: 'patient', ward, op: 'CREATE', changes });
  res.status(r.status === 'rejected' ? 400 : 201).json(r);
}

export async function updatePatient(req, res) {
  const { rows } = await query("SELECT ward FROM records WHERE id = $1 AND entity = 'patient'", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Patient not found.' });
  const { ward: _ignored, ...changes } = req.body || {};
  const r = await serverWrite(req.user, { entity: 'patient', recordId: req.params.id, ward: rows[0].ward, op: 'UPDATE', changes });
  res.status(r.status === 'rejected' ? 400 : 200).json(r);
}
