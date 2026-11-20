// Outbox publisher (Transactional Outbox Pattern).
//
// Only the LEADER instance (chosen through etcd / Raft) runs this loop, so two
// API servers never publish the same rows. Rows are claimed with
// FOR UPDATE SKIP LOCKED and marked published only after Kafka acknowledges
// them: delivery is at-least-once, and consumers de-duplicate by eventId.
import { withTransaction, query } from '../database/pool.js';
import { config } from '../config.js';
import { connectKafka, sendBatch, kafkaStatus } from './producer.js';
import { metrics } from '../middleware/metrics.js';

let timer = null;
let running = false;
const BATCH = 500;

export function startOutboxPublisher() {
  if (timer) return;
  console.log('[outbox] publisher started on', config.instanceId);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await publishOnce();
    } catch (e) {
      console.warn('[outbox] publish error:', e.message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, 1000);
}

export function stopOutboxPublisher() {
  if (timer) clearInterval(timer);
  timer = null;
  console.log('[outbox] publisher stopped on', config.instanceId);
}

export async function publishOnce() {
  const pending = (await query('SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL')).rows[0].n;
  metrics.outboxPending.set(pending);
  if (!pending) return 0;

  if (!config.kafka.brokers.length) {
    // No Kafka configured (e.g. a single free cloud server): keep a week of
    // history in the outbox and trim the rest so the table does not grow forever.
    await query("DELETE FROM outbox WHERE published_at IS NULL AND created_at < now() - interval '7 days'");
    return 0;
  }
  if (!kafkaStatus().connected && !(await connectKafka())) return 0;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, topic, key, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED',
      [BATCH],
    );
    if (!rows.length) return 0;
    const byTopic = new Map();
    for (const r of rows) {
      if (!byTopic.has(r.topic)) byTopic.set(r.topic, []);
      byTopic.get(r.topic).push({ key: r.key || 'none', value: JSON.stringify(r.payload), headers: { outboxId: String(r.id) } });
    }
    const topicMessages = [...byTopic.entries()].map(([topic, messages]) => ({ topic, messages }));
    try {
      await sendBatch(topicMessages);
    } catch (e) {
      // Keep the rows unpublished; record the failure and retry on the next tick.
      await client.query('UPDATE outbox SET attempts = attempts + 1, last_error = $1 WHERE id = ANY($2::bigint[])', [e.message, rows.map((r) => r.id)]);
      console.warn('[outbox] Kafka publish failed, will retry:', e.message);
      return 0;
    }
    await client.query('UPDATE outbox SET published_at = now(), attempts = attempts + 1 WHERE id = ANY($1::bigint[])', [rows.map((r) => r.id)]);
    for (const { topic, messages } of topicMessages) metrics.kafkaPublished.inc({ topic }, messages.length);
    return rows.length;
  });
}
