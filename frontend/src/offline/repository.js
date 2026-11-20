// Local writes. Every change is saved to IndexedDB *immediately* and an event is
// appended to the outbox in the SAME IndexedDB transaction (atomic: either both
// are stored or neither). The user never waits for the network.
import { db, getMeta, setMeta } from './indexedDB.js';
import { deviceId, tick, uuid } from './device.js';
import { SCHEMA_VERSION, validateChanges } from '../../../shared/schema.js';
import { sameValue } from '../../../shared/merge.js';
import { vvAddDot } from '../../../shared/versionVector.js';

export class ValidationError extends Error {
  constructor(problems) { super(problems.join('\n')); this.problems = problems; }
}

function clean(changes) {
  return Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
}

/**
 * Save a record locally and queue it for synchronization.
 * @param {{entity:string, id?:string, ward:string, op?:'CREATE'|'UPDATE'|'DELETE', changes:object}} p
 */
export async function saveRecord({ entity, id, ward, op, changes }) {
  const operation = op || (id ? 'UPDATE' : 'CREATE');
  const cleaned = clean(changes || {});
  const problems = validateChanges(entity, cleaned, { requireAll: operation === 'CREATE' });
  if (problems.length) throw new ValidationError(problems);

  return db.transaction('rw', db.records, db.outbox, db.meta, async () => {
    const recordId = id || uuid();
    const existing = await db.records.get(recordId);
    const base = existing || {
      id: recordId, entity, ward, data: {}, vv: {}, version: 0, deleted: false,
      openConflicts: 0, serverSeq: 0, createdAt: new Date().toISOString(),
    };
    const diff = operation === 'UPDATE'
      ? Object.fromEntries(Object.entries(cleaned).filter(([k, v]) => !sameValue(base.data[k], v)))
      : cleaned;
    if (operation === 'UPDATE' && Object.keys(diff).length === 0) return { id: recordId, unchanged: true };

    const counter = (await getMeta('counter', 0)) + 1;
    await setMeta('counter', counter);
    const dot = { d: deviceId, c: counter };
    const event = {
      eventId: uuid(), schemaVersion: SCHEMA_VERSION, deviceId, entity, recordId, ward: base.ward, op: operation,
      changes: diff, before: Object.fromEntries(Object.keys(diff).map((k) => [k, base.data[k] ?? null])),
      seenVV: base.vv, dot, hlc: tick(), createdAt: new Date().toISOString(), status: 'PENDING', attempts: 0,
    };
    const data = { ...base.data, ...diff };
    await db.records.put({
      ...base, data, vv: vvAddDot(base.vv, dot), deleted: operation === 'DELETE' ? true : base.deleted,
      patientId: data.patientId ?? null, updatedAt: Date.now(), pendingCount: (base.pendingCount || 0) + 1,
      localOnly: existing ? existing.localOnly : true,
    });
    await db.outbox.add(event);
    return { id: recordId, event };
  });
}

export const pendingCount = () => db.outbox.where('status').equals('PENDING').count();
