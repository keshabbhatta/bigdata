// Local database on the phone (IndexedDB via Dexie). This is the app's primary
// data store: every screen reads from here, so it works with no internet.
//
//   records  — patients, pregnancies and visits (JSON documents, like the server)
//   outbox   — the local change queue: events not yet acknowledged by the server
//   conflicts— clinical conflicts pulled from the server
//   syncLog  — history of sync attempts (timings, bytes) for the Sync screen
//   meta     — small key/value settings (last pulled sequence, event counter …)
import Dexie from 'dexie';

export const db = new Dexie('ruralhealth-sync');

db.version(1).stores({
  records: 'id, entity, ward, patientId, updatedAt, serverSeq',
  outbox: '++seq, &eventId, status, recordId, [status+seq]',
  conflicts: 'id, recordId, status, ward',
  syncLog: '++id, at',
  meta: 'key',
});

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return db.meta.put({ key, value });
}

// Remove all local data (used when a different health worker signs in on a shared phone).
export async function clearLocalData() {
  await db.transaction('rw', db.records, db.outbox, db.conflicts, db.syncLog, db.meta, async () => {
    await Promise.all([db.records.clear(), db.outbox.clear(), db.conflicts.clear(), db.syncLog.clear()]);
    await db.meta.where('key').anyOf('lastSeq').delete();
  });
}

// Ask the browser not to evict our data when storage is low.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}
