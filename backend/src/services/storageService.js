// Object storage for attachments and backups.
// Uses MinIO (S3-compatible) when configured; otherwise local disk, so the app
// still works on a single free cloud server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Minio from 'minio';
import { config } from '../config.js';

const localRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage');
const BUCKETS = ['attachments', 'backups'];

const state = { backend: 'disk', ready: false, lastError: null };
let minio = null;

export async function initStorage() {
  if (!config.minio.endPoint) {
    state.backend = 'disk';
    for (const b of BUCKETS) await fs.mkdir(path.join(localRoot, b), { recursive: true });
    state.ready = true;
    return;
  }
  state.backend = 'minio';
  minio = new Minio.Client(config.minio);
  const tryInit = async () => {
    try {
      for (const b of BUCKETS) {
        if (!(await minio.bucketExists(b))) await minio.makeBucket(b);
      }
      // Lifecycle rule: old backups expire automatically (cost control).
      await minio.setBucketLifecycle('backups', {
        Rule: [{ ID: 'expire-old-backups', Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: 30 } }],
      }).catch((e) => console.warn('[storage] lifecycle rule not set:', e.message));
      state.ready = true;
      state.lastError = null;
      console.log('[storage] MinIO ready');
    } catch (e) {
      state.ready = false;
      state.lastError = e.message;
      console.warn('[storage] MinIO not reachable yet, retrying in 5s:', e.message);
      setTimeout(tryInit, 5000);
    }
  };
  await tryInit();
}

export function storageStatus() {
  return { ...state, endpoint: config.minio.endPoint || null };
}

export async function putObject(bucket, key, buffer, contentType = 'application/octet-stream') {
  if (state.backend === 'minio') {
    if (!state.ready) throw new Error('Object storage is not available right now.');
    await minio.putObject(bucket, key, buffer, buffer.length, { 'Content-Type': contentType });
  } else {
    const file = path.join(localRoot, bucket, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  }
  return { bucket, key, storage: state.backend, size: buffer.length };
}

export async function getObject(bucket, key) {
  if (state.backend === 'minio') {
    const stream = await minio.getObject(bucket, key);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
  }
  return fs.readFile(path.join(localRoot, bucket, path.normalize(key).replace(/^(\.\.[/\\])+/, '')));
}

export async function listObjects(bucket) {
  if (state.backend === 'minio') {
    if (!state.ready) return [];
    const out = [];
    const stream = minio.listObjectsV2(bucket, '', true);
    for await (const o of stream) out.push({ key: o.name, size: o.size, lastModified: o.lastModified });
    return out.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
  }
  const dir = path.join(localRoot, bucket);
  const names = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const n of names) {
    const s = await fs.stat(path.join(dir, n));
    out.push({ key: n, size: s.size, lastModified: s.mtime });
  }
  return out.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
}
