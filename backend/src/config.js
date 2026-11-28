import 'dotenv/config';
import os from 'node:os';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

// Database addresses are often pasted with small mistakes from a provider's dashboard:
// spaces or line breaks, surrounding quotes, or the whole psql command
// (psql 'postgresql://...'). Keep only the postgres://... or postgresql://... part.
export function cleanDbUrl(v) {
  const s = String(v || '').replace(/\s+/g, '');
  const m = s.match(/postgres(?:ql)?:\/\/[^'"]+/);
  return m ? m[0] : s;
}

/** The address without the password, safe to print in logs. */
export function describeDbUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return url ? 'an address that is not a valid postgresql:// link' : '(not set)';
  }
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  instanceId: process.env.INSTANCE_ID || `api-${os.hostname()}`,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: list(process.env.CORS_ORIGINS || '*'),

  db: {
    primaryUrl: cleanDbUrl(process.env.DATABASE_URL) || 'postgres://ruralhealth:ruralhealth@localhost:5432/ruralhealth',
    replicaUrl: cleanDbUrl(process.env.DATABASE_REPLICA_URL) || '',
    ssl: process.env.DATABASE_SSL === 'true',
  },

  kafka: {
    brokers: list(process.env.KAFKA_BROKERS),
    clientId: 'ruralhealth-api',
    replicationFactor: Number(process.env.KAFKA_REPLICATION_FACTOR) || 1,
    partitions: Number(process.env.KAFKA_PARTITIONS) || 3,
  },

  etcd: { hosts: list(process.env.ETCD_HOSTS) },

  minio: {
    endPoint: process.env.MINIO_ENDPOINT || '',
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },

  autoFailover: process.env.AUTO_FAILOVER === 'true',
  // Self-registered accounts with these roles can sign in without approval.
  autoApproveRoles: list(process.env.AUTO_APPROVE_ROLES ?? 'worker'),
  seedDemoData: process.env.SEED_DEMO_DATA !== 'false',
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',
};
