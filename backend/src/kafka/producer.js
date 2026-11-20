// Kafka producer. Topics are partitioned by ward (the message key), so all
// events of one ward stay in order within a partition (DDIA Ch.11 — log-based
// message brokers). The producer is idempotent: retries never create duplicates.
import { Kafka, CompressionTypes, Partitioners, logLevel } from 'kafkajs';
import { config } from '../config.js';

export const TOPICS = ['patient-events', 'maternal-health-events', 'clinic-visit-events', 'sync-events'];

const state = { enabled: config.kafka.brokers.length > 0, connected: false, lastError: null, published: 0, brokers: config.kafka.brokers };
let producer = null;
let kafka = null;
let lastAttempt = 0;

export function kafkaStatus() {
  return { ...state };
}

export async function connectKafka() {
  if (!state.enabled) return false;
  if (state.connected) return true;
  // Back off between attempts so a missing broker doesn't flood the logs.
  if (Date.now() - lastAttempt < 15000) return false;
  lastAttempt = Date.now();
  try {
    kafka = kafka || new Kafka({
      clientId: `${config.kafka.clientId}-${config.instanceId}`,
      brokers: config.kafka.brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 3 },
    });
    const admin = kafka.admin();
    await admin.connect();
    const existing = new Set(await admin.listTopics());
    const missing = TOPICS.filter((t) => !existing.has(t));
    if (missing.length) {
      await admin.createTopics({
        waitForLeaders: true,
        topics: missing.map((topic) => ({
          topic, numPartitions: config.kafka.partitions, replicationFactor: config.kafka.replicationFactor,
        })),
      });
      console.log('[kafka] created topics:', missing.join(', '));
    }
    await admin.disconnect();
    producer = kafka.producer({
      idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner, // key = ward -> same partition
    });
    producer.on(producer.events.DISCONNECT, () => { state.connected = false; });
    await producer.connect();
    state.connected = true;
    state.lastError = null;
    console.log('[kafka] producer connected to', config.kafka.brokers.join(','));
    return true;
  } catch (e) {
    state.connected = false;
    state.lastError = e.message;
    console.warn('[kafka] connection failed:', e.message);
    return false;
  }
}

/** Send messages grouped by topic. Throws on failure so the outbox row stays unpublished. */
export async function sendBatch(topicMessages) {
  if (!state.connected || !producer) throw new Error('Kafka producer not connected');
  try {
    await producer.sendBatch({ topicMessages, compression: CompressionTypes.GZIP, acks: -1 });
    state.published += topicMessages.reduce((n, t) => n + t.messages.length, 0);
  } catch (e) {
    state.lastError = e.message;
    state.connected = false;
    throw e;
  }
}

export async function disconnectKafka() {
  if (producer) await producer.disconnect().catch(() => {});
  state.connected = false;
}
