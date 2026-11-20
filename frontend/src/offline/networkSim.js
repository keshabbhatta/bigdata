// Network simulator for demonstrations and experiments. It lets you show the
// app working offline, on slow 2G, or on a flaky connection — without actually
// unplugging anything. Settings are per browser.

export const PROFILES = {
  real: { label: 'Real network', latency: 0, kbps: 0, failRate: 0 },
  offline: { label: 'Offline', offline: true },
  '2g': { label: '2G', latency: 650, kbps: 40, failRate: 0.05 },
  '3g': { label: '3G', latency: 250, kbps: 400, failRate: 0.02 },
  flaky: { label: 'Flaky', latency: 300, kbps: 150, failRate: 0.35 },
};

const listeners = new Set();
let current = localStorage.getItem('rh.network') || 'real';
if (!PROFILES[current]) current = 'real';

export function getProfile() {
  return current;
}

export function setProfile(name) {
  current = PROFILES[name] ? name : 'real';
  localStorage.setItem('rh.network', current);
  listeners.forEach((fn) => fn(current));
}

export function onProfileChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isOffline() {
  return current === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

export class OfflineError extends Error {
  constructor(msg = 'No connection') { super(msg); this.offline = true; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Delay and maybe fail a request according to the active profile. */
export async function simulate(bytes = 0) {
  const p = PROFILES[current];
  if (isOffline()) throw new OfflineError();
  if (!p.latency && !p.kbps) return;
  const transfer = p.kbps ? (bytes * 8) / (p.kbps * 1000) * 1000 : 0;
  await sleep(p.latency + transfer);
  if (Math.random() < p.failRate) throw new OfflineError('Connection dropped (simulated)');
}
