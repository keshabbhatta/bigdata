// Field-level merge rules — the heart of the conflict engine.
//
// For each field an incoming event wants to change, decide what to do:
//
//   apply     the writer had already seen the current value (causal update),
//             or the field has never been written                -> write it
//   noop      concurrent, but both sides wrote the same value    -> nothing to do
//   apply     concurrent, non-clinical field, incoming HLC newer -> last-writer-wins
//   skip      concurrent, non-clinical field, incoming HLC older -> keep current
//   conflict  concurrent, CLINICAL field, different values       -> keep BOTH,
//             flag for clinical review, never silently overwrite
//
// Non-clinical fields behave like a CRDT LWW-register (deterministic, so every
// replica converges to the same value). Clinical fields behave like a
// multi-value register: all concurrent values survive until a human resolves it.

import { isClinical } from './schema.js';
import { compareHlc } from './hlc.js';
import { vvHasSeen } from './versionVector.js';

export function sameValue(a, b) {
  if (a === b) return true;
  if ((a === undefined || a === null || a === '') && (b === undefined || b === null || b === '')) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {object} p
 * @param {string} p.entity
 * @param {string} p.field
 * @param {*}      p.incomingValue
 * @param {string} p.incomingHlc
 * @param {object} p.seenVV        version vector the writer had when editing
 * @param {*}      p.currentValue
 * @param {object} p.currentMeta   {dot, hlc, userId, deviceId} of the current value
 * @param {'safe'|'naive'} [p.mode] 'naive' = last-arrival-wins (for comparison)
 */
export function decideField({ entity, field, incomingValue, incomingHlc, seenVV, currentValue, currentMeta, mode = 'safe' }) {
  if (mode === 'naive') return { action: 'apply', reason: 'naive-overwrite' };
  if (!currentMeta) return { action: 'apply', reason: 'first-write' };
  if (vvHasSeen(seenVV, currentMeta.dot)) return { action: 'apply', reason: 'causal' };
  // Neither side saw the other: concurrent edit.
  if (sameValue(incomingValue, currentValue)) return { action: 'noop', reason: 'concurrent-same-value' };
  if (isClinical(entity, field)) return { action: 'conflict', reason: 'concurrent-clinical' };
  return compareHlc(incomingHlc, currentMeta.hlc) > 0
    ? { action: 'apply', reason: 'lww-newer' }
    : { action: 'skip', reason: 'lww-older' };
}
