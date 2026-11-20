import { HybridLogicalClock } from '../../../shared/hlc.js';
import { config } from '../config.js';
import { query } from '../database/pool.js';

// The server keeps its own hybrid logical clock. Every timestamp a device sends
// is merged in, so the server's clock is always ahead of anything it has seen.
export const serverClock = new HybridLogicalClock(config.instanceId);

// Sync mode: 'safe' (field-level merge + clinical conflicts) or 'naive'
// (last-arrival-wins). Naive mode only exists to measure how much data a
// simple offline cache would lose — it is the baseline in the experiments.
let syncModeCache = { value: 'safe', at: 0 };

export async function getSyncMode() {
  if (Date.now() - syncModeCache.at < 3000) return syncModeCache.value;
  try {
    const { rows } = await query("SELECT value FROM app_settings WHERE key = 'sync_mode'");
    syncModeCache = { value: rows[0]?.value === 'naive' ? 'naive' : 'safe', at: Date.now() };
  } catch {
    syncModeCache.at = Date.now();
  }
  return syncModeCache.value;
}

export async function setSyncMode(mode) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('sync_mode', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [JSON.stringify(mode)],
  );
  syncModeCache = { value: mode, at: Date.now() };
}
