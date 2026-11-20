import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { api } from './routes/index.js';
import { registry, httpMetrics } from './middleware/metrics.js';
import { migrate } from './database/migrate.js';
import { seedDemoData, seedUsers } from './database/seed.js';
import { closePools, withAdvisoryLock } from './database/pool.js';
import { initStorage } from './services/storageService.js';
import { connectKafka, disconnectKafka } from './kafka/producer.js';
import { startOutboxPublisher, stopOutboxPublisher } from './kafka/outboxPublisher.js';
import { startCoordination, stopCoordination, loadDbPointer } from './coordination/coordinator.js';
import { startFailoverMonitor, stopFailoverMonitor, refreshDbHealth } from './coordination/failover.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      frameSrc: ['https://accounts.google.com'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
  exposedHeaders: ['X-Instance-Id'],
}));
app.use(compression());
// inflate:true lets the app send gzip-compressed sync batches (saves bandwidth on 2G).
app.use(express.json({ limit: '2mb', inflate: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev', { skip: (req) => req.path === '/metrics' }));
app.use(httpMetrics);
app.use((_req, res, next) => { res.setHeader('X-Instance-Id', config.instanceId); next(); });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
app.use('/api', api);

// Serve the built React app (single-server deployment).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'dist');
if (config.serveFrontend && fs.existsSync(dist)) {
  app.use(express.static(dist, {
    setHeaders: (res, file) => {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^(?!\/api|\/metrics).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  console.log('[web] serving frontend from', dist);
}

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error('[error]', req.method, req.path, err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Try again.' : err.message });
});

async function start() {
  await loadDbPointer();
  // Wait for the database (it may still be starting inside Docker).
  for (let i = 1; ; i += 1) {
    try {
      await migrate();
      break;
    } catch (e) {
      if (i >= 30) throw e;
      console.log(`[startup] database not ready (${e.message}); retry ${i}/30`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Two API instances start at the same time in Docker; only one may seed.
  await withAdvisoryLock(424243, () => (config.seedDemoData ? seedDemoData() : seedUsers()));
  await initStorage();
  await refreshDbHealth();
  if (config.kafka.brokers.length) connectKafka();

  await startCoordination({
    onElected: () => { startOutboxPublisher(); startFailoverMonitor(); },
    onDemoted: () => { stopOutboxPublisher(); stopFailoverMonitor(); },
  });

  const server = app.listen(config.port, () => {
    console.log(`[web] RuralHealth Sync API ${config.instanceId} listening on :${config.port}`);
  });

  const shutdown = async () => {
    console.log('[web] shutting down');
    server.close();
    stopOutboxPublisher();
    stopFailoverMonitor();
    await disconnectKafka();
    await stopCoordination();
    await closePools();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((e) => {
  console.error('[startup] fatal:', e);
  process.exit(1);
});

export { app };
