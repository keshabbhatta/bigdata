#!/usr/bin/env node
// Experiment runner: simulates many offline phones, then reconnects them all at
// once and measures what happens. Produces the numbers for the evaluation
// section of the paper (DO NOT invent numbers — run this and report its output).
//
//   node experiments/simulate-clients.js                      # 3, 10 and 50 clients, safe mode
//   node experiments/simulate-clients.js --clients 10 --mode naive
//   node experiments/simulate-clients.js --api http://localhost:8088 --events 40 --overlap 0.5
//
// Measures per run:
//   - offline writes (always succeed locally — they are simulated in memory here)
//   - total sync time, events/second, p50/p95 push latency per client
//   - bytes on the wire with and without gzip
//   - concurrent clinical edits: conflicts detected vs. readings lost
//   - duplicate pushes: detected as duplicates, never applied twice
//   - convergence: do all clients end up with identical copies?
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HybridLogicalClock } from '../shared/hlc.js';
import { vvAddDot } from '../shared/versionVector.js';
import { sameValue } from '../shared/merge.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const API = (args.api || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const CLIENT_COUNTS = (args.clients || '3,10,50').split(',').map(Number);
const EVENTS = Number(args.events || 20);        // offline events per client
const OVERLAP = Number(args.overlap || 0.3);     // share of events that edit shared "hot" records
const MODE = args.mode || 'safe';                // safe | naive
const BATCH = 25;
const WORKERS = [['sita', 'fchv123', 'ward-1'], ['gita', 'fchv123', 'ward-1']];

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const rnd = (n) => Math.floor(Math.random() * n);

async function http(pathname, { token, device, body, gzip } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers['X-Device-Id'] = device;
  let payload = body ? JSON.stringify(body) : undefined;
  const raw = payload ? Buffer.byteLength(payload) : 0;
  if (payload && gzip) { payload = gzipSync(payload); headers['Content-Encoding'] = 'gzip'; }
  const res = await fetch(`${API}/api${pathname}`, { method: body ? 'POST' : 'GET', headers, body: payload });
  const json = await res.json();
  if (!res.ok) throw new Error(`${pathname}: ${res.status} ${json.error}`);
  return { json, raw, sent: payload ? (typeof payload === 'string' ? raw : payload.length) : 0 };
}

class Client {
  constructor(i, token, ward) {
    this.id = `sim-${Date.now().toString(36)}-${i}`;
    this.token = token;
    this.ward = ward;
    this.clock = new HybridLogicalClock(this.id);
    this.counter = 0;
    this.records = new Map();
    this.queue = [];
    this.lastSeq = 0;
  }

  async pullAll() {
    for (;;) {
      const { json } = await http('/sync/pull', { token: this.token, device: this.id, body: { since: this.lastSeq, limit: 1000 } });
      for (const r of json.records) this.records.set(r.id, r);
      this.conflicts = json.conflicts;
      this.lastSeq = json.lastSeq;
      if (!json.hasMore) break;
    }
  }

  write(entity, rec, op, changes) {
    this.counter += 1;
    const dot = { d: this.id, c: this.counter };
    const e = { eventId: crypto.randomUUID(), recordId: rec.id, entity, ward: rec.ward, op, changes,
      seenVV: rec.vv || {}, dot, hlc: this.clock.now(), schemaVersion: 2, createdAt: new Date().toISOString() };
    this.queue.push(e);
    this.records.set(rec.id, { ...rec, entity, data: { ...(rec.data || {}), ...changes }, vv: vvAddDot(rec.vv, dot) });
    return e;
  }

  async pushAll(stats) {
    for (let i = 0; i < this.queue.length; i += BATCH) {
      const batch = this.queue.slice(i, i + BATCH);
      const t0 = performance.now();
      const { json, raw, sent } = await http('/sync/push', { token: this.token, device: this.id, body: { events: batch }, gzip: true });
      stats.latencies.push(performance.now() - t0);
      stats.rawBytes += raw;
      stats.sentBytes += sent;
      for (const r of json.results) stats.results[r.status] = (stats.results[r.status] || 0) + 1;
    }
  }
}

async function run(nClients) {
  const admin = (await http('/auth/login', { body: { username: 'admin', password: 'admin123' } })).json.token;
  await http('/admin/sync-mode', { token: admin, body: { mode: MODE } });
  await new Promise((r) => setTimeout(r, 3200)); // server caches the mode for 3 s

  const tokens = await Promise.all(WORKERS.map(([u, p]) => http('/auth/login', { body: { username: u, password: p } }).then((r) => r.json.token)));
  const clients = Array.from({ length: nClients }, (_, i) => new Client(i, tokens[i % tokens.length], WORKERS[i % WORKERS.length][2]));

  // 1. Initial download (first sync of a fresh phone)
  let t0 = performance.now();
  await Promise.all(clients.map((c) => c.pullAll()));
  const initialPullMs = performance.now() - t0;

  // 2. A setup phone creates three test mothers with pregnancies (so the demo
  //    records are never touched), then everyone pulls them and goes offline.
  const setup = clients[0];
  const testPatients = [];
  for (let k = 0; k < 3; k += 1) {
    const pat = setup.write('patient', { id: crypto.randomUUID(), ward: setup.ward, vv: {}, data: {} }, 'CREATE',
      { name: `Experiment Mother ${k + 1}`, village: 'Experiment', age: 24 + k, sex: 'female' });
    setup.write('pregnancy', { id: crypto.randomUUID(), ward: setup.ward, vv: {}, data: {} }, 'CREATE',
      { patientId: pat.recordId, lmp: '2026-06-01', status: 'active', riskLevel: 'low', bpSystolic: 110, bpDiastolic: 70 });
    testPatients.push(pat.recordId);
  }
  await setup.pushAll({ latencies: [], rawBytes: 0, sentBytes: 0, results: {} });
  setup.queue = [];
  await Promise.all(clients.map((c) => c.pullAll()));
  const hot = [...clients[0].records.values()].filter((r) => r.entity === 'pregnancy' && testPatients.includes(r.data.patientId));
  const patients = testPatients.map((id) => clients[0].records.get(id));
  let uniq = 0;
  const written = []; // every clinical value written to a hot record: { recordId, field, value }
  for (const c of clients) {
    for (let k = 0; k < EVENTS; k += 1) {
      const roll = Math.random();
      if (roll < OVERLAP && hot.length) {
        const rec = c.records.get(hot[rnd(hot.length)].id);
        uniq += 1;
        const value = +(100 + rnd(60) + uniq / 1000).toFixed(3); // unique reading, so we can trace it
        c.write('pregnancy', rec, 'UPDATE', { bpSystolic: value });
        written.push({ recordId: rec.id, field: 'bpSystolic', value, by: c.id });
      } else if (roll < OVERLAP + 0.5) {
        const p = patients[rnd(patients.length)];
        c.write('visit', { id: crypto.randomUUID(), ward: p.ward, vv: {} }, 'CREATE',
          { patientId: p.id, type: 'general', date: new Date().toISOString().slice(0, 10), findings: `experiment ${c.id}` });
      } else {
        c.write('patient', { id: crypto.randomUUID(), ward: c.ward, vv: {}, data: {} }, 'CREATE',
          { name: `Experiment Patient ${c.id.slice(-4)}-${k}`, village: 'Experiment', age: 20 + rnd(40), sex: 'female' });
      }
    }
  }
  const totalEvents = clients.reduce((n, c) => n + c.queue.length, 0);

  // 3. Connectivity returns for everyone at the same time.
  const stats = { latencies: [], rawBytes: 0, sentBytes: 0, results: {} };
  t0 = performance.now();
  await Promise.all(clients.map((c) => c.pushAll(stats)));
  const pushMs = performance.now() - t0;

  // 4. Duplicate test: re-send 10% of events (as if the ack was lost on 2G).
  const dupStats = { latencies: [], rawBytes: 0, sentBytes: 0, results: {} };
  const resend = clients.flatMap((c) => c.queue.filter(() => Math.random() < 0.1).map((e) => ({ c, e })));
  for (const c of clients) {
    const mine = resend.filter((x) => x.c === c).map((x) => x.e);
    if (mine.length) { c.queue = mine; await c.pushAll(dupStats); }
  }

  // 5. Everyone pulls; check convergence and lost readings.
  t0 = performance.now();
  await Promise.all(clients.map((c) => c.pullAll()));
  const finalPullMs = performance.now() - t0;
  const snapshot = (c) => JSON.stringify(hot.map((h) => c.records.get(h.id)?.data));
  const converged = clients.every((c) => snapshot(c) === snapshot(clients[0]));

  const final = clients[0];
  // A worker who edits the same reading twice meant to replace their own first value,
  // so only each worker's LAST reading per record/field must survive somewhere.
  const lastByWorker = new Map();
  for (const w of written) lastByWorker.set(`${w.by}|${w.recordId}|${w.field}`, w);
  let lost = 0;
  for (const w of lastByWorker.values()) {
    const rec = final.records.get(w.recordId);
    const inRecord = sameValue(rec?.data?.[w.field], w.value);
    const inConflict = (final.conflicts || []).some((c) => c.status === 'open' && c.recordId === w.recordId && c.field === w.field && c.observations.some((o) => sameValue(o.value, w.value)));
    if (!inRecord && !inConflict) lost += 1;
  }
  const { json: conflictList } = await http('/conflicts?status=open', { token: admin });

  // Restore safe mode and resolve the simulated conflicts so the next run starts clean.
  await http('/admin/sync-mode', { token: admin, body: { mode: 'safe' } });
  for (const c of conflictList.conflicts.filter((x) => hot.some((h) => h.id === x.recordId))) {
    await http(`/conflicts/${c.id}/resolve`, { token: admin, body: { value: c.observations.at(-1).value, note: 'experiment cleanup' } }).catch(() => {});
  }

  return {
    clients: nClients, mode: MODE, eventsPerClient: EVENTS, overlap: OVERLAP, totalEvents,
    initialPullMs: Math.round(initialPullMs),
    syncMs: Math.round(pushMs),
    eventsPerSecond: Math.round(totalEvents / (pushMs / 1000)),
    pushLatencyP50Ms: Math.round(pct(stats.latencies, 50)),
    pushLatencyP95Ms: Math.round(pct(stats.latencies, 95)),
    rawKB: +(stats.rawBytes / 1024).toFixed(1),
    gzipKB: +(stats.sentBytes / 1024).toFixed(1),
    compressionSavedPct: stats.rawBytes ? Math.round((1 - stats.sentBytes / stats.rawBytes) * 100) : 0,
    results: stats.results,
    clinicalWritesToHotRecords: written.length,
    finalReadingsPerWorker: lastByWorker.size,
    conflictObservationsOpen: conflictList.conflicts.filter((x) => hot.some((h) => h.id === x.recordId)).reduce((n, c) => n + c.observations.length, 0),
    readingsLost: lost,
    duplicatesResent: resend.length,
    duplicatesDetected: dupStats.results.duplicate || 0,
    duplicatesAppliedTwice: (dupStats.results.applied || 0) + (dupStats.results.conflict || 0),
    finalPullMs: Math.round(finalPullMs),
    converged,
  };
}

const rows = [];
for (const n of CLIENT_COUNTS) {
  process.stdout.write(`Running ${n} clients (${MODE} mode)… `);
  const r = await run(n);
  rows.push(r);
  console.log(`done in ${r.syncMs} ms`);
}
console.table(rows.map((r) => ({
  clients: r.clients, mode: r.mode, events: r.totalEvents, 'sync ms': r.syncMs, 'events/s': r.eventsPerSecond,
  'p95 ms': r.pushLatencyP95Ms, 'KB raw': r.rawKB, 'KB gzip': r.gzipKB, conflicts: r.results.conflict || 0,
  'readings lost': `${r.readingsLost}/${r.finalReadingsPerWorker}`, 'dup detected': `${r.duplicatesDetected}/${r.duplicatesResent}`,
  'dup applied twice': r.duplicatesAppliedTwice, converged: r.converged,
})));

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `run-${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ api: API, at: new Date().toISOString(), rows }, null, 2));
console.log(`Saved ${file}`);
