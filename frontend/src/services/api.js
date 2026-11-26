// HTTP client for the Node.js API.
import { deviceId, APP_VERSION } from '../offline/device.js';
import { simulate, OfflineError } from '../offline/networkSim.js';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

let token = null;
let pendingCountHeader = 0;
export function setToken(t) { token = t; }
export function setPendingCount(n) { pendingCountHeader = n; }

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// gzip the request body when the browser supports it (saves bandwidth on 2G).
async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @returns {Promise<any>} parsed JSON. Adds `__stats` for sync requests.
 */
export async function request(path, { method, body, compress = false, auth = true } = {}) {
  const headers = { 'X-Device-Id': deviceId, 'X-App-Version': APP_VERSION, 'X-Pending-Count': String(pendingCountHeader) };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let payload;
  let rawBytes = 0;
  let sentBytes = 0;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    const text = JSON.stringify(body);
    rawBytes = new TextEncoder().encode(text).length;
    payload = text;
    if (compress && rawBytes > 512) {
      const zipped = await gzip(text);
      if (zipped) { payload = zipped; headers['Content-Encoding'] = 'gzip'; }
    }
    sentBytes = typeof payload === 'string' ? rawBytes : payload.length;
  }

  await simulate(sentBytes);
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method: method || (body !== undefined ? 'POST' : 'GET'), headers, body: payload });
  } catch {
    throw new OfflineError('Server not reachable');
  }
  const text = await res.text();
  await simulate(text.length);
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, json.error || `Request failed (${res.status})`);
  if (json && typeof json === 'object') {
    Object.defineProperty(json, '__stats', { value: { rawBytes, sentBytes, receivedBytes: text.length, instance: res.headers.get('X-Instance-Id') } });
  }
  return json;
}

export const api = {
  login: (username, password) => request('/auth/login', { body: { username, password, deviceId }, auth: false }),
  googleLogin: (credential, signup) => request('/auth/google', { body: { credential, signup }, auth: false }),
  register: (form) => request('/auth/register', { body: form, auth: false }),
  me: () => request('/auth/me'),
  authConfig: () => request('/auth/config', { auth: false }),
  push: (events) => request('/sync/push', { body: { events }, compress: true }),
  pull: (since, limit = 300) => request('/sync/pull', { body: { since, limit } }),
  syncStatus: () => request('/sync/status'),
  conflicts: (status = 'open') => request(`/conflicts?status=${status}`),
  resolveConflict: (id, value, note) => request(`/conflicts/${id}/resolve`, { body: { value, note } }),
  analytics: (ward) => request(`/analytics${ward ? `?ward=${ward}` : ''}`),
  adminOverview: () => request('/admin/overview'),
  audit: () => request('/admin/audit?limit=60'),
  addUser: (u) => request('/admin/users', { body: u }),
  approveUser: (id, patientId) => request(`/admin/users/${id}/approve`, { body: { patientId } }),
  rejectUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  updateUser: (id, changes) => request(`/admin/users/${id}`, { method: 'PATCH', body: changes }),
  resetPassword: (id, password) => request(`/admin/users/${id}/password`, { body: { password } }),
  setSyncMode: (mode) => request('/admin/sync-mode', { body: { mode } }),
  backup: () => request('/admin/backup', { body: {} }),
  backups: () => request('/admin/backups'),
  failover: () => request('/admin/failover', { body: {} }),
  flushOutbox: () => request('/admin/outbox/flush', { body: {} }),
  attachments: (recordId) => request(`/records/${recordId}/attachments`),
  upload: (recordId, file, dataBase64) => request('/attachments', { body: { recordId, filename: file.name, contentType: file.type, dataBase64 } }),
  async download(id) {
    const res = await fetch(`${BASE}/api/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res.blob();
  },
};
