// `npm run dev` from the project root: starts the API (http://localhost:4000) and
// the web app (http://localhost:5173) together, with live reload. Ctrl+C stops both.
// Needs PostgreSQL on localhost:5432 (Docker: cd infrastructure && docker compose up -d postgres-primary).
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const isWin = process.platform === 'win32';

const reachable = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port });
  s.setTimeout(1500);
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.once('timeout', () => { s.destroy(); resolve(false); });
});

if (!(await reachable(5432))) {
  console.error('\nPostgreSQL is not running on localhost:5432.\nStart it first:\n  cd infrastructure\n  docker compose up -d postgres-primary\nthen run npm run dev again.\n');
  process.exit(1);
}
for (const dir of ['backend', 'frontend']) {
  if (!fs.existsSync(new URL(`${dir}/node_modules`, root))) {
    console.error(`\n${dir}/node_modules is missing. Run: npm run install:all\n`);
    process.exit(1);
  }
}
if (!fs.existsSync(new URL('backend/.env', root))) {
  fs.copyFileSync(new URL('backend/.env.example', root), new URL('backend/.env', root));
  console.log('Created backend/.env from backend/.env.example');
}

const apps = [
  { name: 'api', dir: 'backend', color: '\x1b[36m' },
  { name: 'web', dir: 'frontend', color: '\x1b[35m' },
];
let stopping = false;
const children = apps.map(({ name, dir, color }) => {
  const child = spawn(`npm --prefix ${dir} run dev`, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `${color}[${name}]\x1b[0m `;
  const print = (buf) => buf.toString().split(/\r?\n/).filter(Boolean).forEach((line) => console.log(tag + line));
  child.stdout.on('data', print);
  child.stderr.on('data', print);
  child.on('exit', (code) => { if (!stopping) { console.log(`${tag}stopped (exit ${code}); stopping the other one too`); stopAll(code ?? 1); } });
  return child;
});

console.log('\nStarting Sewika in development mode:');
console.log('  App  http://localhost:5173   (on a phone on the same Wi-Fi: http://<this PC IP>:5173)');
console.log('  API  http://localhost:4000\n  Ctrl+C stops both.\n');

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (isWin) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 800);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
