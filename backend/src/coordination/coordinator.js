// Distributed coordination with etcd (Raft consensus) — DDIA Ch.9 & Ch.10.
//
// What etcd coordinates in this system (two concrete pieces of shared state):
//
//  1. LEADERSHIP — several API instances run behind the load balancer, but only
//     one may run the outbox publisher and the database failover monitor.
//     Instances campaign in an etcd election; etcd's Raft log guarantees that at
//     most one holds the lease. If the leader dies, its lease expires and another
//     instance is elected within a few seconds.
//
//  2. DATABASE LEADER POINTER — the key /ruralhealth/db/leader says which
//     PostgreSQL node accepts writes, plus an epoch number. When the leader
//     promotes the replica it bumps the epoch; every instance watches the key and
//     switches its write pool. Messages with an older epoch are ignored (a fencing
//     token), so a returning old primary is never written to again.
//
// Without ETCD_HOSTS the instance runs standalone and is always the leader.

import { Etcd3 } from 'etcd3';
import { config } from '../config.js';
import { setLeader, dbState } from '../database/pool.js';
import { metrics } from '../middleware/metrics.js';

const DB_KEY = '/ruralhealth/db/leader';
const ELECTION = 'ruralhealth-api-leader';

const state = {
  mode: config.etcd.hosts.length ? 'etcd' : 'standalone',
  isLeader: false,
  leaderId: null,
  connected: false,
  lastError: null,
  since: null,
};

let client = null;
let callbacks = { onElected: () => {}, onDemoted: () => {} };

export function coordinationStatus() {
  return { ...state, instanceId: config.instanceId, hosts: config.etcd.hosts };
}

function becomeLeader() {
  if (state.isLeader) return;
  state.isLeader = true;
  state.leaderId = config.instanceId;
  state.since = new Date().toISOString();
  metrics.isLeader.set(1);
  console.log(`[coord] ${config.instanceId} is now the LEADER`);
  callbacks.onElected();
}

function loseLeadership() {
  if (!state.isLeader) return;
  state.isLeader = false;
  metrics.isLeader.set(0);
  console.log(`[coord] ${config.instanceId} lost leadership`);
  callbacks.onDemoted();
}

function getClient() {
  if (!client) client = new Etcd3({ hosts: config.etcd.hosts, dialTimeout: 3000 });
  return client;
}

/**
 * Called once at startup, BEFORE touching the database: if a failover already
 * happened, this instance must connect to the promoted node, not the old primary.
 */
export async function loadDbPointer() {
  if (state.mode === 'standalone') return;
  for (let i = 0; i < 10; i += 1) {
    try {
      const current = await getClient().get(DB_KEY).string();
      if (current) applyDbPointer(current);
      return;
    } catch (e) {
      console.warn('[coord] waiting for etcd:', e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export async function startCoordination({ onElected, onDemoted }) {
  callbacks = { onElected, onDemoted };
  if (state.mode === 'standalone') {
    becomeLeader();
    return;
  }
  getClient();

  // Follow the database leader pointer.
  const watchDbKey = async () => {
    try {
      const current = await client.get(DB_KEY).string();
      if (current) applyDbPointer(current);
      const watcher = await client.watch().key(DB_KEY).create();
      watcher.on('put', (kv) => applyDbPointer(kv.value.toString()));
      watcher.on('error', (e) => { state.lastError = e.message; });
      state.connected = true;
    } catch (e) {
      state.connected = false;
      state.lastError = e.message;
      console.warn('[coord] etcd not reachable, retrying in 3s:', e.message);
      setTimeout(watchDbKey, 3000);
    }
  };
  await watchDbKey();

  // Leader election. The lease TTL (5s) bounds how long a dead leader blocks others.
  const campaign = async () => {
    try {
      const election = client.election(ELECTION, 5);
      const observer = await election.observe();
      state.leaderId = observer.leader() || state.leaderId;
      observer.on('change', (leader) => { state.leaderId = leader; });
      const c = election.campaign(config.instanceId);
      c.on('elected', () => becomeLeader());
      c.on('error', (e) => {
        state.lastError = e.message;
        loseLeadership();
        setTimeout(campaign, 3000);
      });
    } catch (e) {
      state.lastError = e.message;
      setTimeout(campaign, 3000);
    }
  };
  campaign();
}

function applyDbPointer(raw) {
  try {
    const { leader, epoch } = JSON.parse(raw);
    setLeader(leader, Number(epoch) || 0);
  } catch (e) {
    console.warn('[coord] bad db pointer value:', raw, e.message);
  }
}

/** Announce a new database leader to every API instance. */
export async function announceDbLeader(leader) {
  const epoch = dbState().epoch + 1;
  const value = JSON.stringify({ leader, epoch, by: config.instanceId, at: new Date().toISOString() });
  if (client) await client.put(DB_KEY).value(value);
  setLeader(leader, epoch); // apply locally immediately as well
  return { leader, epoch };
}

export async function stopCoordination() {
  if (client) client.close();
}
