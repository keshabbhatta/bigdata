import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridLogicalClock, compareHlc, decodeHlc } from '../hlc.js';
import { vvCompare, vvMerge, vvHasSeen, vvAddDot } from '../versionVector.js';
import { decideField } from '../merge.js';
import { upcastEvent, validateChanges } from '../schema.js';

test('HLC is monotonic even when the wall clock goes backwards', () => {
  let t = 1_000_000;
  const clock = new HybridLogicalClock('dev-A', { now: () => t });
  const a = clock.now();
  t = 500_000; // clock jumps back (battery died, wrong date set)
  const b = clock.now();
  const c = clock.now();
  assert.equal(compareHlc(a, b), -1);
  assert.equal(compareHlc(b, c), -1);
  assert.equal(decodeHlc(c).millis, 1_000_000);
});

test('HLC receive moves past a remote timestamp from the future', () => {
  const clock = new HybridLogicalClock('dev-A', { now: () => 1000 });
  const remote = new HybridLogicalClock('srv', { now: () => 9000 }).now();
  const after = clock.receive(remote);
  assert.equal(compareHlc(remote, after), -1);
  assert.equal(compareHlc(after, clock.now()), -1);
});

test('version vector comparison', () => {
  assert.equal(vvCompare({ a: 1 }, { a: 1 }), 'equal');
  assert.equal(vvCompare({ a: 2 }, { a: 1 }), 'after');
  assert.equal(vvCompare({ a: 1 }, { a: 1, b: 1 }), 'before');
  assert.equal(vvCompare({ a: 2 }, { a: 1, b: 1 }), 'concurrent');
  assert.deepEqual(vvMerge({ a: 2, b: 1 }, { a: 1, c: 4 }), { a: 2, b: 1, c: 4 });
  assert.equal(vvHasSeen({ a: 3 }, { d: 'a', c: 3 }), true);
  assert.equal(vvHasSeen({ a: 2 }, { d: 'a', c: 3 }), false);
  assert.deepEqual(vvAddDot({ a: 1 }, { d: 'b', c: 5 }), { a: 1, b: 5 });
});

const meta = (d, c, hlc) => ({ dot: { d, c }, hlc });

test('causal update is applied', () => {
  const r = decideField({
    entity: 'pregnancy', field: 'bpSystolic', incomingValue: 130, incomingHlc: 'x',
    seenVV: { A: 1 }, currentValue: 120, currentMeta: meta('A', 1, 'a'),
  });
  assert.equal(r.action, 'apply');
});

test('concurrent clinical edit becomes a conflict, never an overwrite', () => {
  const r = decideField({
    entity: 'pregnancy', field: 'bpSystolic', incomingValue: 140, incomingHlc: 'z',
    seenVV: { B: 1 }, currentValue: 120, currentMeta: meta('A', 2, 'a'),
  });
  assert.equal(r.action, 'conflict');
});

test('concurrent non-clinical edit uses last-writer-wins by HLC', () => {
  const base = { entity: 'patient', field: 'phone', seenVV: {}, currentValue: '111', currentMeta: meta('A', 1, '000000000000002:00000:A') };
  assert.equal(decideField({ ...base, incomingValue: '222', incomingHlc: '000000000000003:00000:B' }).action, 'apply');
  assert.equal(decideField({ ...base, incomingValue: '222', incomingHlc: '000000000000001:00000:B' }).action, 'skip');
});

test('concurrent same value is a no-op', () => {
  const r = decideField({
    entity: 'pregnancy', field: 'bpSystolic', incomingValue: 120, incomingHlc: 'z',
    seenVV: {}, currentValue: 120, currentMeta: meta('A', 2, 'a'),
  });
  assert.equal(r.action, 'noop');
});

test('naive mode always overwrites (used only for the comparison experiment)', () => {
  const r = decideField({
    entity: 'pregnancy', field: 'bpSystolic', incomingValue: 140, incomingHlc: 'z',
    seenVV: {}, currentValue: 120, currentMeta: meta('A', 2, 'a'), mode: 'naive',
  });
  assert.equal(r.action, 'apply');
});

test('schema v1 events are upcast to v2', () => {
  const e = upcastEvent({ schemaVersion: 1, changes: { bp: '150/95', weight: '61' } });
  assert.deepEqual(e.changes, { bpSystolic: 150, bpDiastolic: 95, weightKg: 61 });
  assert.equal(e.schemaVersion, 2);
});

test('validation catches bad values', () => {
  assert.deepEqual(validateChanges('pregnancy', { bpSystolic: 120 }), []);
  assert.equal(validateChanges('pregnancy', { bpSystolic: 999 }).length, 1);
  assert.equal(validateChanges('patient', { name: '' }, { requireAll: true }).length, 2);
  assert.equal(validateChanges('patient', { hacker: 1 }).length, 1);
});
