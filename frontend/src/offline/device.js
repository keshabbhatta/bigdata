// Identity and clock of THIS phone/browser.
import { HybridLogicalClock } from '../../../shared/hlc.js';

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Fallback for insecure origins (e.g. http://192.168.x.x during testing).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function loadDeviceId() {
  let id = localStorage.getItem('rh.deviceId');
  if (!id) {
    id = `dev-${uuid().slice(0, 8)}`;
    localStorage.setItem('rh.deviceId', id);
  }
  return id;
}

export const deviceId = loadDeviceId();

export const clock = new HybridLogicalClock(deviceId, { last: localStorage.getItem('rh.hlc') || undefined });

export function tick() {
  const t = clock.now();
  localStorage.setItem('rh.hlc', t);
  return t;
}

export function receiveServerTime(hlc) {
  if (!hlc) return;
  localStorage.setItem('rh.hlc', clock.receive(hlc));
}

export const APP_VERSION = '1.0.0';
