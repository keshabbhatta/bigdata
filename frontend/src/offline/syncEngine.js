// Client-side synchronization engine.
//
//   PUSH: send pending outbox events in small gzip batches. An event is marked
//         synced ONLY after the server acknowledges it. If the connection drops
//         mid-request we simply retry later — the server ignores duplicates
//         (idempotency by eventId), so retries are always safe.
//   PULL: ask for every record changed after our last known sequence number
//         and store the server's merged version. Local edits that are still
//         pending are re-applied on top ("rebase"), so nothing typed offline is
//         hidden by a pull.
//
// Sync runs when the connection comes back, every 20 seconds while online,
// shortly after each local edit, and when the user taps "Sync now".
import { db, getMeta, setMeta } from './indexedDB.js';
import { api, setPendingCount } from '../services/api.js';
import { receiveServerTime } from './device.js';
import { isOffline, onProfileChange } from './networkSim.js';
import { vvAddDot } from '../../../shared/versionVector.js';

const BATCH = 25;

class SyncEngine {
  constructor() {
    this.status = { state: 'idle', lastSyncAt: null, lastError: null, progress: null, lastResult: null };
    this.listeners = new Set();
    this.running = null;
    this.timer = null;
    this.enabled = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  set(patch) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  async start() {
    if (this.enabled) return;
    this.enabled = true;
    this.status.lastSyncAt = await getMeta('lastSyncAt');
    window.addEventListener('online', () => this.schedule(300));
    window.addEventListener('offline', () => this.set({ state: 'offline' }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedule(300); });
    onProfileChange(() => this.schedule(200));
    this.interval = setInterval(() => this.schedule(0), 20000);
    this.schedule(200);
  }

  stop() {
    this.enabled = false;
    clearInterval(this.interval);
    clearTimeout(this.timer);
  }

  /** Debounced trigger (used after local edits). */
  schedule(delay = 1500) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync().catch(() => {}), delay);
  }

  async sync() {
    if (!this.enabled) return null;
    if (this.running) return this.running;
    setPendingCount(await db.outbox.where('status').equals('PENDING').count());
    if (isOffline()) {
      this.set({ state: 'offline' });
      return null;
    }
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }

  async run() {
    const started = performance.now();
    const log = { at: Date.now(), pushed: 0, pulled: 0, conflicts: 0, duplicates: 0, rejected: 0, rawBytes: 0, sentBytes: 0, receivedBytes: 0, ok: false };
    this.set({ state: 'syncing', progress: 'Sending changes', lastError: null });
    try {
      await this.pushAll(log);
      this.set({ progress: 'Receiving updates' });
      await this.pullAll(log);
      log.ok = true;
      log.durationMs = Math.round(performance.now() - started);
      const now = Date.now();
      await setMeta('lastSyncAt', now);
      this.set({ state: 'synced', lastSyncAt: now, progress: null, lastResult: log });
    } catch (err) {
      log.durationMs = Math.round(performance.now() - started);
      log.error = err.message;
      const state = err.offline ? 'offline' : err.status === 401 ? 'auth' : 'error';
      this.set({ state, lastError: err.message, progress: null, lastResult: log });
    } finally {
      // Keep the history readable: skip successful syncs that moved nothing.
      if (!log.ok || log.pushed || log.pulled || log.rejected) await db.syncLog.add(log);
      const count = await db.syncLog.count();
      if (count > 200) {
        const old = await db.syncLog.orderBy('id').limit(count - 200).primaryKeys();
        await db.syncLog.bulkDelete(old);
      }
      setPendingCount(await db.outbox.where('status').equals('PENDING').count());
    }
    return log;
  }

  async pushAll(log) {
    for (;;) {
      const batch = await db.outbox.where('[status+seq]').between(['PENDING', 0], ['PENDING', Infinity]).limit(BATCH).toArray();
      if (!batch.length) return;
      const events = batch.map(({ seq, status, attempts, before, result, syncedAt, reason, ...e }) => e);
      await db.outbox.where('seq').anyOf(batch.map((b) => b.seq)).modify((e) => { e.attempts = (e.attempts || 0) + 1; });
      const res = await api.push(events);
      log.rawBytes += res.__stats.rawBytes;
      log.sentBytes += res.__stats.sentBytes;
      log.receivedBytes += res.__stats.receivedBytes;
      receiveServerTime(res.serverHlc);

      await db.transaction('rw', db.outbox, db.records, async () => {
        for (const r of res.results) {
          const item = batch.find((b) => b.eventId === r.eventId);
          if (!item) continue;
          const rejected = r.status === 'rejected' || (r.status === 'duplicate' && r.previous === 'rejected');
          if (rejected) {
            log.rejected += 1;
            await db.outbox.update(item.seq, { status: 'REJECTED', reason: r.reason || r.result?.reason || 'Rejected by server', syncedAt: Date.now() });
            await revertLocal(item);
          } else {
            if (r.status === 'duplicate') log.duplicates += 1;
            if (r.status === 'conflict') log.conflicts += r.conflicts?.length || 1;
            log.pushed += 1;
            await db.outbox.update(item.seq, { status: 'SYNCED', result: r, syncedAt: Date.now() });
          }
        }
      });
      setPendingCount(await db.outbox.where('status').equals('PENDING').count());
      this.set({ progress: `Sent ${log.pushed} changes` });
    }
  }

  async pullAll(log) {
    let since = await getMeta('lastSeq', 0);
    for (let page = 0; page < 100; page += 1) {
      const res = await api.pull(since);
      log.receivedBytes += res.__stats.receivedBytes;
      receiveServerTime(res.serverHlc);
      await this.applyPull(res);
      log.pulled += res.records.length;
      since = res.lastSeq;
      this.set({ progress: `Received ${log.pulled} updates` });
      if (!res.hasMore) break;
    }
    // Trim acknowledged events (keep the last 300 for the history screen).
    const synced = await db.outbox.where('status').equals('SYNCED').primaryKeys();
    if (synced.length > 300) await db.outbox.bulkDelete(synced.slice(0, synced.length - 300));
  }

  async applyPull({ records, conflicts, lastSeq }) {
    await db.transaction('rw', db.records, db.outbox, db.conflicts, db.meta, async () => {
      for (const rec of records) {
        const pending = await db.outbox.where('recordId').equals(rec.id).filter((e) => e.status === 'PENDING').sortBy('seq');
        let data = rec.data;
        let vv = rec.vv;
        for (const e of pending) { data = { ...data, ...e.changes }; vv = vvAddDot(vv, e.dot); }
        await db.records.put({
          ...rec, data, vv, patientId: data.patientId ?? null,
          updatedAt: new Date(rec.updatedAt).getTime(), pendingCount: pending.length, localOnly: false,
        });
      }
      const touched = new Set(records.map((r) => r.id));
      if (touched.size) await db.conflicts.where('recordId').anyOf([...touched]).delete();
      if (conflicts.length) await db.conflicts.bulkPut(conflicts);
      await setMeta('lastSeq', lastSeq);
    });
  }
}

// Undo a rejected local change so the phone shows what the server accepted.
async function revertLocal(event) {
  const rec = await db.records.get(event.recordId);
  if (!rec) return;
  if (event.op === 'CREATE' && rec.localOnly) {
    await db.records.delete(rec.id);
    return;
  }
  const data = { ...rec.data };
  for (const [k, v] of Object.entries(event.before || {})) {
    if (v === null) delete data[k]; else data[k] = v;
  }
  await db.records.update(rec.id, { data, pendingCount: Math.max(0, (rec.pendingCount || 1) - 1) });
}

export const syncEngine = new SyncEngine();
