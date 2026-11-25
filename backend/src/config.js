import 'dotenv/config';
import os from 'node:os';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 4000,
  instanceId: process.env.INSTANCE_ID || `api-${os.hostname()}`,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: list(process.env.CORS_ORIGINS || '*'),

  db: {
    primaryUrl: process.env.DATABASE_URL || 'postgres://ruralhealth:ruralhealth@localhost:5432/ruralhealth',
    replicaUrl: process.env.DATABASE_REPLICA_URL || '',
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
