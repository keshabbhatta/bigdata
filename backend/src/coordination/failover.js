// Database failover (DDIA Ch.6 — "Handling node outages: leader failure").
//
// The elected API leader checks the PostgreSQL primary every few seconds. After
// three failed checks in a row it promotes the replica (pg_promote) and
// announces the new database leader through etcd. Three checks, not one, so a
// short network blip doesn't trigger an unnecessary failover (Ch.9 — timeouts).
import { getPool, dbState } from '../database/pool.js';
import { config } from '../config.js';
import { announceDbLeader } from './coordinator.js';
import { audit } from '../middleware/auth.js';

let timer = null;
let failures = 0;
const health = { primaryOk: null, replicaOk: null, replicaLagSeconds: null, replicaInRecovery: null, checkedAt: null, lastFailover: null };

export function dbHealth() {
  return { ...health, ...dbState(), autoFailover: config.autoFailover };
}

async function check(pool) {
  if (!pool) return null;
  try {
    await Promise.race([pool.query('SELECT 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]);
    return true;
  } catch {
    return false;
  }
}

export async function refreshDbHealth() {
  const primary = getPool('primary');
  const replica = getPool('replica');
  health.primaryOk = await check(primary);
  health.replicaOk = await check(replica);
  if (replica && health.replicaOk) {
    try {
      const { rows } = await replica.query(
        `SELECT pg_is_in_recovery() AS rec,
                CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
                     ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) END AS lag`,
      );
      health.replicaInRecovery = rows[0].rec;
      health.replicaLagSeconds = rows[0].lag === null ? null : Number(rows[0].lag);
    } catch { /* ignore */ }
  }
  health.checkedAt = new Date().toISOString();
  return health;
}

export async function promoteReplica(reason, user = null) {
  const replica = getPool('replica');
  if (!replica) throw new Error('No replica is configured (DATABASE_REPLICA_URL).');
  if (dbState().leader === 'replica') throw new Error('The replica is already the database leader.');
  const { rows } = await replica.query('SELECT pg_is_in_recovery() AS rec');
  if (rows[0].rec) await replica.query('SELECT pg_promote(true, 30)');
  const announced = await announceDbLeader('replica');
  health.lastFailover = { at: new Date().toISOString(), reason, epoch: announced.epoch };
  console.warn(`[failover] replica promoted (${reason}); epoch ${announced.epoch}`);
  await audit(user || { username: config.instanceId }, 'db.failover', 'replica', { reason, epoch: announced.epoch });
  return health.lastFailover;
}

export function startFailoverMonitor() {
  if (timer) return;
  timer = setInterval(async () => {
    await refreshDbHealth();
    if (!config.autoFailover || dbState().leader !== 'primary' || !getPool('replica')) return;
    failures = health.primaryOk ? 0 : failures + 1;
    if (failures >= 3 && health.replicaOk) {
      failures = 0;
      try { await promoteReplica('primary unreachable for 3 checks'); } catch (e) { console.error('[failover] failed:', e.message); }
    }
  }, 3000);
}

export function stopFailoverMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
