// Prometheus metrics, scraped by Prometheus and shown in Grafana.
import client from 'prom-client';
import { config } from '../config.js';

export const registry = new client.Registry();
registry.setDefaultLabels({ instance_id: config.instanceId });
client.collectDefaultMetrics({ register: registry });

export const metrics = {
  httpRequests: new client.Counter({
    name: 'rh_http_requests_total', help: 'HTTP requests', labelNames: ['method', 'route', 'status'], registers: [registry],
  }),
  httpDuration: new client.Histogram({
    name: 'rh_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [registry],
  }),
  syncEvents: new client.Counter({
    name: 'rh_sync_events_total', help: 'Sync events processed by outcome', labelNames: ['status'], registers: [registry],
  }),
  conflicts: new client.Counter({
    name: 'rh_conflicts_detected_total', help: 'Clinical conflicts detected', registers: [registry],
  }),
  pushDuration: new client.Histogram({
    name: 'rh_sync_push_duration_seconds', help: 'Time to process one push batch',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10], registers: [registry],
  }),
  syncBytes: new client.Counter({
    name: 'rh_sync_request_bytes_total', help: 'Bytes received on sync push (after compression)', registers: [registry],
  }),
  outboxPending: new client.Gauge({
    name: 'rh_outbox_pending', help: 'Outbox rows not yet published to Kafka', registers: [registry],
  }),
  kafkaPublished: new client.Counter({
    name: 'rh_kafka_messages_published_total', help: 'Messages published to Kafka', labelNames: ['topic'], registers: [registry],
  }),
  isLeader: new client.Gauge({
    name: 'rh_is_leader', help: '1 if this API instance holds the etcd leadership', registers: [registry],
  }),
};

export function httpMetrics(req, res, next) {
  const end = metrics.httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path.startsWith('/api') ? 'unmatched' : 'static';
    metrics.httpRequests.inc({ method: req.method, route, status: res.statusCode });
    end({ method: req.method, route });
  });
  next();
}
