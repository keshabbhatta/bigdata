// Clinical conflict review. A conflict is only closed by a person choosing the
// correct value (or entering a new one). The decision is written as a normal
// versioned change, so every device pulls the resolution on its next sync.

import { ENTITIES, validateChanges } from '../../../shared/schema.js';
import { vvAddDot } from '../../../shared/versionVector.js';
import { withTransaction, query } from '../database/pool.js';
import { allowedWards, canAccessWard, audit } from '../middleware/auth.js';
import { serverClock } from './clock.js';
import { toClientConflict } from './syncService.js';

export async function listConflicts(user, status = 'open') {
  const wards = allowedWards(user);
  const { rows } = await query(
    `SELECT c.*, r.data AS record_data, r.entity AS record_entity
     FROM conflicts c JOIN records r ON r.id = c.record_id AND r.ward = c.ward
     WHERE ($1::text = 'all' OR c.status = $1) AND ($2::text[] IS NULL OR c.ward = ANY($2))
     ORDER BY c.status = 'open' DESC, c.updated_at DESC LIMIT 200`,
    [status, wards],
  );
  return rows.map((r) => ({ ...toClientConflict(r), record: r.record_data }));
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function resolveConflict(user, conflictId, { value, note }, ip) {
  if (!/^[0-9a-f-]{36}$/i.test(String(conflictId))) throw new HttpError(404, 'Conflict not found.');
  return withTransaction(async (client) => {
    const c = (await client.query('SELECT * FROM conflicts WHERE id = $1 FOR UPDATE', [conflictId])).rows[0];
    if (!c) throw new HttpError(404, 'Conflict not found.');
    if (!canAccessWard(user, c.ward)) throw new HttpError(403, 'This conflict is outside your wards.');
    if (c.status !== 'open') throw new HttpError(409, 'This conflict was already resolved.');
    const problems = validateChanges(c.entity, { [c.field]: value });
    if (problems.length) throw new HttpError(400, problems.join('; '));

    const rec = (await client.query('SELECT * FROM records WHERE ward = $1 AND id = $2 FOR UPDATE', [c.ward, c.record_id])).rows[0];
    const dotC = (await client.query("SELECT nextval('server_dot_seq')::int AS c")).rows[0].c;
    const dot = { d: 'server', c: dotC };
    const hlc = serverClock.now();
    const data = { ...rec.data, [c.field]: value };
    const fieldMeta = {
      ...rec.field_meta,
      [c.field]: { dot, hlc, userId: user.id, userName: user.name, deviceId: 'server', at: new Date().toISOString(), resolution: true },
    };
    const resolution = { value, note: note || '', by: user.name, byUserId: user.id, at: new Date().toISOString() };

    await client.query(
      "UPDATE conflicts SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = now(), updated_at = now() WHERE id = $3",
      [JSON.stringify(resolution), user.id, conflictId],
    );
    const open = (await client.query("SELECT count(*)::int AS n FROM conflicts WHERE record_id = $1 AND status = 'open'", [c.record_id])).rows[0].n;
    await client.query(
      `UPDATE records SET data = $1, field_meta = $2, vv = $3, version = version + 1, open_conflicts = $4,
         server_seq = nextval('record_seq'), updated_by = $5, updated_at = now() WHERE ward = $6 AND id = $7`,
      [JSON.stringify(data), JSON.stringify(fieldMeta), JSON.stringify(vvAddDot(rec.vv, dot)), open, user.id, c.ward, c.record_id],
    );
    await client.query('INSERT INTO outbox (topic, key, payload) VALUES ($1, $2, $3)', [
      ENTITIES[c.entity].topic, c.ward,
      JSON.stringify({ eventId: crypto.randomUUID(), entity: c.entity, recordId: c.record_id, ward: c.ward, op: 'RESOLVE', status: 'applied',
        changes: { [c.field]: value }, conflictId, userId: user.id, hlc, occurredAt: resolution.at, receivedAt: resolution.at }),
    ]);
    await audit(user, 'conflict.resolve', conflictId, { field: c.field, value, note, recordId: c.record_id }, ip);
    return { id: conflictId, status: 'resolved', resolution };
  });
}
