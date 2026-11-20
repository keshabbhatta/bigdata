import { pushEvents, pullChanges } from '../services/syncService.js';
import { query } from '../database/pool.js';
import { metrics } from '../middleware/metrics.js';
import { serverClock } from '../services/clock.js';

const MAX_BATCH = 200;

export async function push(req, res) {
  const events = req.body?.events;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'Send { events: [...] }.' });
  if (events.length > MAX_BATCH) return res.status(413).json({ error: `Send at most ${MAX_BATCH} events per request.` });
  if (!req.deviceId) return res.status(400).json({ error: 'X-Device-Id header is required.' });
  metrics.syncBytes.inc(Number(req.headers['content-length']) || 0);
  const out = await pushEvents(events, req.user, req.deviceId);
  res.json(out);
}

export async function pull(req, res) {
  const { since = 0, limit = 300 } = req.body || {};
  res.json(await pullChanges(req.user, req.deviceId, since, limit));
}

export async function status(req, res) {
  const [seq, device, mine] = await Promise.all([
    query("SELECT last_value AS last_seq FROM record_seq"),
    req.deviceId ? query('SELECT * FROM devices WHERE device_id = $1', [req.deviceId]) : { rows: [] },
    query(
      `SELECT status, count(*)::int AS n FROM sync_events WHERE device_id = $1 GROUP BY status`,
      [req.deviceId || ''],
    ),
  ]);
  res.json({
    serverTime: new Date().toISOString(),
    serverHlc: serverClock.now(),
    serverLastSeq: seq.rows[0].last_seq,
    device: device.rows[0] || null,
    eventsByStatus: Object.fromEntries(mine.rows.map((r) => [r.status, r.n])),
  });
}
