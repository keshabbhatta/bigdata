// Version vectors (DDIA Ch.6 — "Detecting concurrent writes").
//
// A version vector maps deviceId -> highest event counter seen from that device.
// Every write is tagged with a "dot" {d: deviceId, c: counter}. Comparing what a
// device had *seen* with what the server *has* tells us whether two writes are
// causally ordered (one saw the other) or concurrent (neither saw the other).

export function vvMerge(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
}

export function vvAddDot(vv = {}, dot) {
  if (!dot) return { ...vv };
  return vvMerge(vv, { [dot.d]: dot.c });
}

// Has a vector "seen" a particular dot (i.e. the write it identifies)?
export function vvHasSeen(vv = {}, dot) {
  if (!dot) return true;
  return (vv[dot.d] || 0) >= dot.c;
}

// Returns 'equal' | 'before' | 'after' | 'concurrent' for a relative to b.
export function vvCompare(a = {}, b = {}) {
  let aBigger = false;
  let bBigger = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    if (x > y) aBigger = true;
    if (y > x) bBigger = true;
  }
  if (aBigger && bBigger) return 'concurrent';
  if (aBigger) return 'after';
  if (bBigger) return 'before';
  return 'equal';
}
