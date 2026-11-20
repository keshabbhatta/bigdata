// Hybrid Logical Clock (DDIA Ch.9 — unreliable clocks; Ch.10 — ordering).
//
// Phone clocks in the field are often wrong (no NTP, flat battery, manual edits).
// Ordering edits purely by wall-clock time can silently lose data. An HLC combines
// physical time with a logical counter so that:
//   * timestamps always move forward on a device, even if its clock jumps back;
//   * if event A causally happened before event B, then hlc(A) < hlc(B);
//   * timestamps stay close to real time, so humans can still read them.
//
// Encoded as a fixed-width string so plain string comparison gives the order:
//   "<15-digit ms>:<5-char base36 counter>:<nodeId>"

const pad = (n, w) => String(n).padStart(w, '0');

export function encodeHlc(millis, counter, nodeId) {
  return `${pad(millis, 15)}:${pad(counter.toString(36), 5)}:${nodeId}`;
}

export function decodeHlc(hlc) {
  if (!hlc || typeof hlc !== 'string') return { millis: 0, counter: 0, nodeId: '' };
  const [ms, ctr, ...rest] = hlc.split(':');
  return { millis: Number(ms), counter: parseInt(ctr, 36), nodeId: rest.join(':') };
}

export function compareHlc(a, b) {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a < b ? -1 : 1;
}

export function hlcToDate(hlc) {
  return new Date(decodeHlc(hlc).millis);
}

export class HybridLogicalClock {
  constructor(nodeId, { now = () => Date.now(), last } = {}) {
    this.nodeId = nodeId;
    this.nowFn = now;
    this.millis = 0;
    this.counter = 0;
    if (last) {
      const d = decodeHlc(last);
      this.millis = d.millis;
      this.counter = d.counter;
    }
  }

  // Timestamp for a local event.
  now() {
    const pt = this.nowFn();
    if (pt > this.millis) {
      this.millis = pt;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return encodeHlc(this.millis, this.counter, this.nodeId);
  }

  // Merge a timestamp received from another node (server or device).
  receive(remote) {
    const r = decodeHlc(remote);
    const pt = this.nowFn();
    const l = Math.max(this.millis, r.millis, pt);
    if (l === this.millis && l === r.millis) this.counter = Math.max(this.counter, r.counter) + 1;
    else if (l === this.millis) this.counter += 1;
    else if (l === r.millis) this.counter = r.counter + 1;
    else this.counter = 0;
    this.millis = l;
    return encodeHlc(this.millis, this.counter, this.nodeId);
  }

  current() {
    return encodeHlc(this.millis, this.counter, this.nodeId);
  }
}
