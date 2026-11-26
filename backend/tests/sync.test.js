// Integration tests for the sync engine. Start the API first (npm run dev),
// then run: npm test   (uses API_URL, default http://localhost:4000)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridLogicalClock } from '../../shared/hlc.js';
import { DEMO_WARDS } from '../../shared/areas.js';

const WARD_1 = DEMO_WARDS[0]; // Ward 1, Indrawati Rural Municipality (Sita and Gita's ward)

const API = process.env.API_URL || 'http://localhost:4000';

async function call(path, { token, device, body, method } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(device ? { 'X-Device-Id': device } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

async function login(username, password) {
  const r = await call('/auth/login', { body: { username, password } });
  assert.ok(r.token, `login ${username} failed: ${r.error}`);
  return r.token;
}

// A tiny simulated phone: its own device id, counter and clock.
function device(name, token) {
  const id = `${name}-${crypto.randomUUID().slice(0, 8)}`;
  const clock = new HybridLogicalClock(id);
  let counter = 0;
  return {
    id,
    event(entity, record, op, changes, extra = {}) {
      counter += 1;
      return {
        eventId: crypto.randomUUID(), recordId: record.id, entity, ward: record.ward, op, changes,
        seenVV: record.vv || {}, dot: { d: id, c: counter }, hlc: clock.now(), schemaVersion: 2,
        createdAt: new Date().toISOString(), ...extra,
      };
    },
    push: (events) => call('/sync/push', { token, device: id, body: { events } }),
    // Follow hasMore so the test works however much data the database holds.
    async pull(since = 0) {
      const out = { records: [], conflicts: [] };
      for (let cursor = since; ;) {
        const r = await call('/sync/pull', { token, device: id, body: { since: cursor, limit: 1000 } });
        out.records.push(...r.records);
        out.conflicts.push(...r.conflicts);
        cursor = r.lastSeq;
        if (!r.hasMore) return out;
      }
    },
  };
}

const state = {};

test('workers can sign in', async () => {
  state.sita = await login('sita', 'fchv123');
  state.gita = await login('gita', 'fchv123');
  state.maya = await login('maya', 'fchv123');
  state.sup = await login('supervisor', 'super123');
  const bad = await call('/auth/login', { body: { username: 'sita', password: 'wrong' } });
  assert.equal(bad.status, 401);
});

test('pull only returns records from the worker\'s own ward (sharding)', async () => {
  const d = device('sita-phone', state.sita);
  const r = await d.pull();
  assert.ok(r.records.length > 0);
  assert.ok(r.records.every((x) => x.ward === WARD_1));
  state.preg = r.records.find((x) => x.entity === 'pregnancy' && !x.deleted);
  state.patient = r.records.find((x) => x.entity === 'patient' && !x.deleted);
  assert.ok(state.preg && state.patient);
});

test('concurrent offline edits of a clinical field are both kept as a conflict', async () => {
  const a = device('sita-phone', state.sita);
  const b = device('gita-phone', state.gita);
  // Both phones start from the same version of the record, then go offline.
  const ea = a.event('pregnancy', state.preg, 'UPDATE', { bpSystolic: 120, bpDiastolic: 80 });
  const eb = b.event('pregnancy', state.preg, 'UPDATE', { bpSystolic: 140, bpDiastolic: 90 });
  const ra = await a.push([ea]);
  assert.equal(ra.results[0].status, 'applied');
  const rb = await b.push([eb]);
  assert.equal(rb.results[0].status, 'conflict');
  assert.deepEqual(rb.results[0].conflicts.map((c) => c.field).sort(), ['bpDiastolic', 'bpSystolic']);
  state.conflictId = rb.results[0].conflicts[0].conflictId;

  const pulled = await b.pull();
  const rec = pulled.records.find((x) => x.id === state.preg.id);
  assert.equal(rec.data.bpSystolic, 120, 'first value stays in place, not silently overwritten');
  assert.equal(rec.openConflicts, 2);
  const c = pulled.conflicts.find((x) => x.id === state.conflictId);
  assert.deepEqual(c.observations.map((o) => o.value).sort(), [120, 140]);
});

test('a causal update (device saw the latest version) applies cleanly', async () => {
  const a = device('sita-phone', state.sita);
  const latest = (await a.pull()).records.find((x) => x.id === state.preg.id);
  const r = await a.push([a.event('pregnancy', latest, 'UPDATE', { weightKg: 61 })]);
  assert.equal(r.results[0].status, 'applied');
});

test('concurrent non-clinical edits converge with last-writer-wins', async () => {
  const a = device('sita-phone', state.sita);
  const b = device('gita-phone', state.gita);
  const ea = a.event('patient', state.patient, 'UPDATE', { phone: '9800000001' });
  await new Promise((r) => setTimeout(r, 5));
  const eb = b.event('patient', state.patient, 'UPDATE', { phone: '9800000002' }); // later HLC
  await a.push([ea]);
  const rb = await b.push([eb]);
  assert.equal(rb.results[0].status, 'applied');
  const rec = (await a.pull()).records.find((x) => x.id === state.patient.id);
  assert.equal(rec.data.phone, '9800000002');
});

test('retrying the same event is idempotent', async () => {
  const a = device('sita-phone', state.sita);
  const e = a.event('visit', { id: crypto.randomUUID(), ward: WARD_1, vv: {} }, 'CREATE', {
    patientId: state.patient.id, type: 'general', date: '2026-11-20', findings: 'Duplicate test',
  });
  const first = await a.push([e]);
  const second = await a.push([e]);
  assert.equal(first.results[0].status, 'applied');
  assert.equal(second.results[0].status, 'duplicate');
  state.visit = { id: e.recordId, ward: WARD_1, vv: {} };
});

test('visits are append-only', async () => {
  const a = device('sita-phone', state.sita);
  const r = await a.push([a.event('visit', state.visit, 'UPDATE', { findings: 'edited' })]);
  assert.equal(r.results[0].status, 'rejected');
});

test('a worker cannot write into another ward', async () => {
  const m = device('maya-phone', state.maya);
  const r = await m.push([m.event('patient', state.patient, 'UPDATE', { notes: 'x' })]);
  assert.equal(r.results[0].status, 'rejected');
});

test('events from the old app version (schema v1) are upcast', async () => {
  const a = device('sita-phone', state.sita);
  const latest = (await a.pull()).records.find((x) => x.id === state.preg.id);
  const r = await a.push([a.event('pregnancy', latest, 'UPDATE', { weight: '63' }, { schemaVersion: 1 })]);
  assert.equal(r.results[0].status, 'applied');
  const rec = (await a.pull()).records.find((x) => x.id === state.preg.id);
  assert.equal(rec.data.weightKg, 63);
});

test('a supervisor resolves the conflict and every device receives it', async () => {
  const r = await call(`/conflicts/${state.conflictId}/resolve`, { token: state.sup, body: { value: 140, note: 'Rechecked at health post' } });
  assert.equal(r.status, 'resolved');
  const again = await call(`/conflicts/${state.conflictId}/resolve`, { token: state.sup, body: { value: 120 } });
  assert.equal(again.status, 409);
  const rec = (await device('gita-phone', state.gita).pull()).records.find((x) => x.id === state.preg.id);
  assert.equal(rec.data.bpSystolic, 140);
  assert.equal(rec.openConflicts, 1); // diastolic still open
});

test('naive mode (baseline) silently loses one of the values', async () => {
  const admin = await login('admin', 'admin123');
  await call('/admin/sync-mode', { token: admin, body: { mode: 'naive' } });
  try {
    await new Promise((r) => setTimeout(r, 3100)); // settings cache
    const a = device('sita-phone', state.sita);
    const b = device('gita-phone', state.gita);
    const latest = (await a.pull()).records.find((x) => x.id === state.preg.id);
    await a.push([a.event('pregnancy', latest, 'UPDATE', { hemoglobin: 9.1 })]);
    const rb = await b.push([b.event('pregnancy', latest, 'UPDATE', { hemoglobin: 11.4 })]);
    assert.equal(rb.results[0].status, 'applied');
    const rec = (await a.pull()).records.find((x) => x.id === state.preg.id);
    assert.equal(rec.data.hemoglobin, 11.4); // 9.1 is gone without a trace
  } finally {
    await call('/admin/sync-mode', { token: admin, body: { mode: 'safe' } });
  }
});

test('a patient sees only her own records and cannot change anything', async () => {
  const token = await login('mother', 'patient123');
  const d = device('mother-phone', token);
  const r = await d.pull();
  const own = r.records.find((x) => x.entity === 'patient');
  assert.ok(own);
  assert.ok(r.records.every((x) => x.id === own.id || x.data.patientId === own.id));
  const push = await d.push([d.event('patient', own, 'UPDATE', { phone: '9811111111' })]);
  assert.equal(push.results[0].status, 'rejected');
  const analytics = await call('/analytics', { token });
  assert.equal(analytics.status, 403);
});
