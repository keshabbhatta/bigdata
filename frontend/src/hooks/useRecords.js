// Live queries on the local database. Components re-render automatically when
// IndexedDB changes (after a local edit or after a sync pulls new data).
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../offline/indexedDB.js';

const alive = (r) => !r.deleted;

export function usePatients() {
  return useLiveQuery(async () => {
    const rows = await db.records.where('entity').equals('patient').filter(alive).toArray();
    return rows.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
  }, [], undefined);
}

export function useRecord(id) {
  return useLiveQuery(() => (id ? db.records.get(id) : undefined), [id], null);
}

export function useRelated(patientId) {
  return useLiveQuery(
    () => (patientId ? db.records.where('patientId').equals(patientId).filter(alive).toArray() : []),
    [patientId], [],
  );
}

export function usePregnancies() {
  return useLiveQuery(async () => {
    const [pregs, patients] = await Promise.all([
      db.records.where('entity').equals('pregnancy').filter(alive).toArray(),
      db.records.where('entity').equals('patient').toArray(),
    ]);
    const byId = new Map(patients.map((p) => [p.id, p]));
    return pregs.map((p) => ({ ...p, patient: byId.get(p.data.patientId) }));
  }, [], undefined);
}

export function useVisits() {
  return useLiveQuery(async () => {
    const [visits, patients] = await Promise.all([
      db.records.where('entity').equals('visit').filter(alive).toArray(),
      db.records.where('entity').equals('patient').toArray(),
    ]);
    const byId = new Map(patients.map((p) => [p.id, p]));
    return visits
      .map((v) => ({ ...v, patient: byId.get(v.data.patientId) }))
      .sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '') || b.updatedAt - a.updatedAt);
  }, [], undefined);
}

export function useConflicts(status = 'open') {
  return useLiveQuery(async () => {
    const list = await db.conflicts.where('status').equals(status).toArray();
    const out = [];
    for (const c of list) {
      const rec = await db.records.get(c.recordId);
      const patientId = rec?.entity === 'patient' ? rec.id : rec?.data?.patientId;
      const patient = patientId ? await db.records.get(patientId) : null;
      out.push({ ...c, record: rec, patient });
    }
    return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [status], undefined);
}

export function useOutbox() {
  return useLiveQuery(() => db.outbox.orderBy('seq').reverse().limit(200).toArray(), [], []);
}

export function useSyncLog() {
  return useLiveQuery(() => db.syncLog.orderBy('id').reverse().limit(30).toArray(), [], []);
}
