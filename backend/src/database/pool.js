// Connection pools for the PostgreSQL primary (writes) and replica (reads).
//
// DDIA Ch.6 — leader/follower replication:
//   * writes and the sync protocol always go to the current leader so a device
//     immediately reads back what it just wrote (read-after-write consistency);
//   * analytics and list screens read from the follower, tolerating a little
//     replication lag, which keeps heavy reads off the leader.
// If the primary fails, the replica can be promoted (see coordination/failover.js);
// every API instance then switches its write pool to the new leader.

import pg from 'pg';
import { config } from '../config.js';

// Return BIGINT/COUNT as JS numbers (values here are far below 2^53).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

function makePool(url, name) {
  if (!url) return null;
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 4000,
    idleTimeoutMillis: 30000,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err) => console.error(`[db:${name}] idle client error:`, err.message));
  return pool;
}

const pools = {
  primary: makePool(config.db.primaryUrl, 'primary'),
  replica: makePool(config.db.replicaUrl, 'replica'),
};

const state = {
  leader: 'primary', // which pool currently accepts writes
  epoch: 0,          // increases on every failover (a fencing token)
  replicaHealthy: Boolean(pools.replica),
};

export function dbState() {
  return { leader: state.leader, epoch: state.epoch, replicaConfigured: Boolean(pools.replica), replicaHealthy: state.replicaHealthy };
}

export function getPool(name) {
  return pools[name];
}

export function writePool() {
  return pools[state.leader];
}

export function setLeader(name, epoch) {
  if (!pools[name]) throw new Error(`No pool named ${name}`);
  if (epoch < state.epoch) return false; // stale message from an older term — ignore (fencing)
  if (state.leader !== name) console.warn(`[db] leader switched: ${state.leader} -> ${name} (epoch ${epoch})`);
  state.leader = name;
  state.epoch = epoch;
  return true;
}

export function query(text, params) {
  return writePool().query(text, params);
}

// Read from the follower when possible; fall back to the leader on error.
export async function readQuery(text, params) {
  const replicaUsable = pools.replica && state.leader === 'primary' && state.replicaHealthy;
  if (replicaUsable) {
    try {
      return await pools.replica.query(text, params);
    } catch (err) {
      state.replicaHealthy = false;
      console.warn('[db] replica read failed, using leader:', err.message);
      setTimeout(() => { state.replicaHealthy = true; }, 10000);
    }
  }
  return writePool().query(text, params);
}

export async function withTransaction(fn) {
  const client = await writePool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may be gone */ }
    throw err;
  } finally {
    client.release();
  }
}

// Run fn while holding a cluster-wide PostgreSQL advisory lock, so only one API
// instance does it at a time (used for migrations and demo-data seeding).
export async function withAdvisoryLock(key, fn) {
  const client = await writePool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [key]);
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => {});
    client.release();
  }
}

export async function closePools() {
  await Promise.all(Object.values(pools).filter(Boolean).map((p) => p.end()));
}
