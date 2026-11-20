// Synchronization engine — server side.
//
// What happens to each event a device pushes (all inside ONE database transaction,
// DDIA Ch.8 — atomicity):
//   1. Upcast old-format events to the current schema            (Ch.5 evolution)
//   2. Validate structure, values and ward permission
//   3. Insert into sync_events; a duplicate event_id stops here    (idempotency, Ch.9/11)
//   4. Lock the record row (SELECT ... FOR UPDATE)                 (Ch.8 isolation)
//   5. Merge field by field using version vectors + HLC           (Ch.6 concurrency)
//      - clinical fields edited concurrently become conflicts      (never overwritten)
//   6. Bump the record's change sequence so other devices pull it
//   7. Write the change to the outbox table                        (transactional outbox)
// If anything fails, the whole transaction rolls back and the device retries later.

import { ENTITIES, OPS, upcastEvent, validateChanges } from '../../../shared/schema.js';
import { decideField, sameValue } from '../../../shared/merge.js';
import { vvAddDot } from '../../../shared/versionVector.js';
import { withTransaction, query } from '../database/pool.js';
import { canAccessWard, allowedWards } from '../middleware/auth.js';
import { serverClock, getSyncMode } from './clock.js';
import { metrics } from '../middleware/metrics.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RejectError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

function checkShape(e) {
  if (!e || typeof e !== 'object') return 'Event must be an object';
  if (!UUID_RE.test(e.eventId || '')) return 'eventId must be a UUID';
  if (!UUID_RE.test(e.recordId || '')) return 'recordId must be a UUID';
  if (!ENTITIES[e.entity]) return `Unknown entity "${e.entity}"`;
  if (!OPS.includes(e.op)) return `Unknown operation "${e.op}"`;
  if (typeof e.ward !== 'string' || !e.ward) return 'ward is required';
  if (!e.dot || typeof e.dot.d !== 'string' || !Number.isInteger(e.dot.c)) return 'dot {d, c} is required';
  if (typeof e.hlc !== 'string') return 'hlc timestamp is required';
  if (e.changes && typeof e.changes !== 'object') return 'changes must be an object';
  return null;
}

/**
 * Process a single event. Never throws for business-rule problems — returns a
 * result with status 'applied' | 'conflict' | 'duplicate' | 'rejected'.
 */
export async function processEvent(rawEvent, user, deviceId) {
  const event = upcastEvent(rawEvent);
  const base = { eventId: event.eventId, recordId: event.recordId };

  const shapeProblem = checkShape(event);
  if (shapeProblem) return reject(base, shapeProblem);
  if (user.role === 'patient') return reject(base, 'Patients can view their records but not change them');
  if (!canAccessWard(user, event.ward)) return reject(base, `You cannot write to ${event.ward}`);
  const def = ENTITIES[event.entity];
  if (def.appendOnly && event.op !== 'CREATE') return reject(base, `${def.label} records are append-only; record a new one instead`);
  const problems = validateChanges(event.entity, event.changes || {}, { requireAll: event.op === 'CREATE' });
  if (problems.length) return reject(base, problems.join('; '));

  serverClock.receive(event.hlc);
  const mode = await getSyncMode();

  try {
    const result = await withTransaction((client) => applyInTransaction(client, event, user, deviceId, mode));
    metrics.syncEvents.inc({ status: result.status });
    if (result.conflicts?.length) metrics.conflicts.inc(result.conflicts.length);
    return result;
  } catch (err) {
    if (err instanceof RejectError) {
      // Record the rejected event so it can be audited, outside the rolled-back tx.
      await query(
        `INSERT INTO sync_events (event_id, device_id, user_id, entity, record_id, ward, op, schema_version, changes, hlc, status, result)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rejected',$11) ON CONFLICT (event_id) DO NOTHING`,
        [event.eventId, deviceId, user.id, event.entity, event.recordId, event.ward, event.op, event.schemaVersion,
          JSON.stringify(event.changes || {}), event.hlc, JSON.stringify({ reason: err.reason })],
      ).catch(() => {});
      return reject(base, err.reason);
    }
    throw err;
  }
}

function reject(base, reason) {
  metrics.syncEvents.inc({ status: 'rejected' });
  return { ...base, status: 'rejected', reason };
}

async function applyInTransaction(client, event, user, deviceId, mode) {
  const { eventId, recordId, entity, ward, op, dot, hlc } = event;
  const changes = event.changes || {};
  const clientCreatedAt = Number.isFinite(Date.parse(event.createdAt)) ? new Date(event.createdAt) : null;

  // 3. Idempotency: the unique index on event_id decides.
  const inserted = await client.query(
    `INSERT INTO sync_events (event_id, device_id, user_id, entity, record_id, ward, op, schema_version,
                              changes, seen_vv, dot, hlc, client_created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (event_id) DO NOTHING RETURNING seq`,
    [eventId, deviceId, user.id, entity, recordId, ward, op, event.schemaVersion,
      JSON.stringify(changes), JSON.stringify(event.seenVV || {}), JSON.stringify(dot), hlc, clientCreatedAt],
  );
  if (inserted.rowCount === 0) {
    const prev = await client.query('SELECT status, result FROM sync_events WHERE event_id = $1', [eventId]);
    metrics.syncEvents.inc({ status: 'duplicate' });
    return { eventId, recordId, status: 'duplicate', previous: prev.rows[0]?.status, result: prev.rows[0]?.result };
  }

  // 4. Create-if-missing, then lock the row.
  await client.query(
    `INSERT INTO records (id, ward, entity, server_seq, created_by, created_at)
     VALUES ($1, $2, $3, nextval('record_seq'), $4, COALESCE($5, now()))
     ON CONFLICT (ward, id) DO NOTHING`,
    [recordId, ward, entity, user.id, clientCreatedAt],
  );
  const found = await client.query('SELECT * FROM records WHERE id = $1 FOR UPDATE', [recordId]);
  if (found.rowCount > 1) throw new RejectError('Record exists in more than one ward');
  const rec = found.rows[0];
  if (rec.ward !== ward) throw new RejectError(`Record belongs to ${rec.ward}; records cannot move between wards`);
  if (rec.entity !== entity) throw new RejectError(`Record is a ${rec.entity}, not a ${entity}`);

  // 5. Field-by-field merge.
  const data = { ...rec.data };
  const fieldMeta = { ...rec.field_meta };
  const applied = [];
  const skipped = [];
  const noop = [];
  const conflicts = [];
  const seenVV = event.seenVV || {};
  const writeMeta = { dot, hlc, userId: user.id, userName: user.name, deviceId, at: new Date().toISOString() };

  for (const [field, incomingValue] of Object.entries(changes)) {
    const decision = decideField({
      entity, field, incomingValue, incomingHlc: hlc, seenVV,
      currentValue: data[field], currentMeta: fieldMeta[field], mode,
    });
    if (decision.action === 'apply') {
      data[field] = incomingValue;
      fieldMeta[field] = writeMeta;
      applied.push(field);
    } else if (decision.action === 'noop') {
      noop.push(field);
    } else if (decision.action === 'skip') {
      skipped.push(field);
    } else if (decision.action === 'conflict') {
      const conflictId = await recordConflict(client, {
        rec, field, currentValue: data[field], currentMeta: fieldMeta[field], incomingValue, writeMeta, eventId,
      });
      conflicts.push({ field, conflictId });
    }
  }

  const deleted = op === 'DELETE' ? true : rec.deleted;
  const vv = vvAddDot(rec.vv, dot);
  const openConflicts = (await client.query(
    "SELECT count(*)::int AS n FROM conflicts WHERE record_id = $1 AND status = 'open'", [recordId],
  )).rows[0].n;

  // 6. New change sequence number -> other devices will pull this record.
  const updated = await client.query(
    `UPDATE records SET data = $1, field_meta = $2, vv = $3, version = version + 1, deleted = $4,
       open_conflicts = $5, server_seq = nextval('record_seq'), updated_by = $6, updated_at = now()
     WHERE ward = $7 AND id = $8 RETURNING server_seq, version`,
    [JSON.stringify(data), JSON.stringify(fieldMeta), JSON.stringify(vv), deleted, openConflicts, user.id, ward, recordId],
  );

  const status = conflicts.length ? 'conflict' : 'applied';
  const result = { applied, skipped, noop, conflicts, mode, upcastedFrom: event.upcastedFrom };
  await client.query('UPDATE sync_events SET status = $1, result = $2 WHERE event_id = $3', [status, JSON.stringify(result), eventId]);

  // 7. Transactional outbox — same transaction as the data change.
  const appliedChanges = Object.fromEntries(applied.map((f) => [f, changes[f]]));
  const payload = {
    eventId, entity, recordId, ward, op, status, deviceId, userId: user.id, hlc,
    changes: appliedChanges, conflictFields: conflicts.map((c) => c.field),
    village: data.village ?? null, visitType: data.type ?? null, date: data.date ?? null,
    riskLevel: data.riskLevel ?? null, patientId: data.patientId ?? null,
    occurredAt: (clientCreatedAt || new Date()).toISOString(), receivedAt: new Date().toISOString(),
  };
  await client.query('INSERT INTO outbox (topic, key, payload) VALUES ($1, $2, $3), ($4, $2, $5)', [
    ENTITIES[entity].topic, ward, JSON.stringify(payload),
    'sync-events', JSON.stringify({ eventId, deviceId, ward, entity, op, status, conflicts: conflicts.length, receivedAt: payload.receivedAt }),
  ]);

  return {
    eventId, recordId, status, applied, skipped, noop, conflicts,
    serverSeq: updated.rows[0].server_seq, version: updated.rows[0].version,
  };
}

async function recordConflict(client, { rec, field, currentValue, currentMeta, incomingValue, writeMeta, eventId }) {
  const observation = (value, meta, evId) => ({
    value, userId: meta?.userId ?? null, userName: meta?.userName ?? null, deviceId: meta?.deviceId ?? null,
    hlc: meta?.hlc ?? null, at: meta?.at ?? null, eventId: evId ?? null,
  });
  const open = await client.query(
    "SELECT id, observations FROM conflicts WHERE record_id = $1 AND field = $2 AND status = 'open' FOR UPDATE",
    [rec.id, field],
  );
  if (open.rowCount) {
    const obs = open.rows[0].observations;
    if (!obs.some((o) => sameValue(o.value, incomingValue))) obs.push(observation(incomingValue, writeMeta, eventId));
    await client.query('UPDATE conflicts SET observations = $1, updated_at = now() WHERE id = $2', [JSON.stringify(obs), open.rows[0].id]);
    return open.rows[0].id;
  }
  const created = await client.query(
    `INSERT INTO conflicts (record_id, ward, entity, field, observations) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [rec.id, rec.ward, rec.entity, field, JSON.stringify([
      observation(currentValue, currentMeta, null),
      observation(incomingValue, writeMeta, eventId),
    ])],
  );
  return created.rows[0].id;
}

/** Push a batch: each event in its own transaction so one bad event can't block the rest. */
export async function pushEvents(events, user, deviceId) {
  const stop = metrics.pushDuration.startTimer();
  const results = [];
  for (const e of events) results.push(await processEvent(e, user, deviceId));
  stop();
  await query(
    'UPDATE devices SET events_pushed = events_pushed + $1, last_sync_at = now() WHERE device_id = $2',
    [results.filter((r) => r.status === 'applied' || r.status === 'conflict').length, deviceId],
  ).catch(() => {});
  return { results, serverHlc: serverClock.now() };
}

/** Pull every record (in the user's wards) that changed after `since`. */
export async function pullChanges(user, deviceId, since = 0, limit = 300) {
  const wards = allowedWards(user);
  const cappedLimit = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  const { rows } = await query(
    `SELECT id, ward, entity, data, vv, version, deleted, open_conflicts, server_seq, created_at, updated_at
     FROM records
     WHERE server_seq > $1 AND ($2::text[] IS NULL OR ward = ANY($2))
       AND ($4::uuid IS NULL OR id = $4 OR data->>'patientId' = $4::text)
     ORDER BY server_seq ASC LIMIT $3`,
    [Number(since) || 0, wards, cappedLimit + 1, user.role === 'patient' ? (user.patientId || '00000000-0000-0000-0000-000000000000') : null],
  );
  const hasMore = rows.length > cappedLimit;
  const records = rows.slice(0, cappedLimit);
  const ids = records.map((r) => r.id);
  const conflicts = ids.length
    ? (await query('SELECT * FROM conflicts WHERE record_id = ANY($1::uuid[]) ORDER BY created_at', [ids])).rows
    : [];
  const lastSeq = records.length ? records[records.length - 1].server_seq : Number(since) || 0;
  if (deviceId) {
    await query('UPDATE devices SET last_pull_seq = $1, last_sync_at = now() WHERE device_id = $2', [lastSeq, deviceId]).catch(() => {});
  }
  return {
    records: records.map(toClientRecord),
    conflicts: conflicts.map(toClientConflict),
    lastSeq,
    hasMore,
    serverHlc: serverClock.now(),
  };
}

export function toClientRecord(r) {
  return {
    id: r.id, ward: r.ward, entity: r.entity, data: r.data, vv: r.vv, version: r.version,
    deleted: r.deleted, openConflicts: r.open_conflicts, serverSeq: r.server_seq,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function toClientConflict(c) {
  return {
    id: c.id, recordId: c.record_id, ward: c.ward, entity: c.entity, field: c.field,
    observations: c.observations, status: c.status, resolution: c.resolution,
    resolvedAt: c.resolved_at, createdAt: c.created_at, updatedAt: c.updated_at,
  };
}

/** Write from the server itself (REST API / conflict resolution) through the same pipeline. */
export async function serverWrite(user, { entity, recordId, ward, op, changes }) {
  const { rows } = await query("SELECT nextval('server_dot_seq')::int AS c");
  const existing = recordId ? await query('SELECT vv FROM records WHERE id = $1', [recordId]) : { rows: [] };
  return processEvent({
    eventId: crypto.randomUUID(), recordId: recordId || crypto.randomUUID(), entity, ward, op,
    changes, seenVV: existing.rows[0]?.vv || {}, dot: { d: 'server', c: rows[0].c },
    hlc: serverClock.now(), schemaVersion: 2, createdAt: new Date().toISOString(),
  }, user, 'server');
}
