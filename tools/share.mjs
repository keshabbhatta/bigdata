// `npm run share`: gives the running app a public HTTPS link that opens on ANY
// phone or computer (any Wi-Fi or mobile data), using a free Cloudflare quick tunnel.
//
// The app must already be running: Docker (http://localhost:8088) or `npm run dev`
// (http://localhost:5173). Keep this window open while people use the link; Ctrl+C stops it.
// The link changes every time you start it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (url, timeout = 4000) => {
  try { return (await fetch(url, { signal: AbortSignal.timeout(timeout) })).ok; } catch { return false; }
};

// 1. Which local app is running?
const candidates = [['http://localhost:8088', 'Docker'], ['http://localhost:5173', 'npm run dev']];
let target = null;
for (const [url, name] of candidates) {
  if (await ok(`${url}/api/health`)) { target = { url, name }; break; }
}
if (!target) {
  console.error('\nThe app is not running yet. Start it first, then run npm run share again:');
  console.error('  Docker:   cd infrastructure  then  docker compose up -d');
  console.error('  or        npm run dev\n');
  process.exit(1);
}

// 2. Find cloudflared.
const local = path.join(process.env.LOCALAPPDATA || '', 'cloudflared', 'cloudflared.exe');
const exe = fs.existsSync(local) ? local : 'cloudflared';

function startTunnel() {
  return new Promise((resolve) => {
    const child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', target.url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let done = false;
    const onData = (buf) => {
      const text = buf.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !done) { done = true; resolve({ child, url: m[0] }); }
      if (/429|Too Many Requests|provisioning failed/i.test(text) && !done) { done = true; resolve({ child, error: 'busy' }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => { if (!done) { done = true; resolve({ error: 'missing' }); } });
    child.on('exit', () => { if (!done) { done = true; resolve({ error: 'exited' }); } });
  });
}

let tunnel;
for (let attempt = 1; attempt <= 4; attempt += 1) {
  console.log(attempt === 1 ? `\nCreating a public link for ${target.url} (${target.name})...` : `Trying again (${attempt}/4)...`);
  tunnel = await startTunnel();
  if (tunnel.url) break;
  if (tunnel.error === 'missing') {
    console.error('\ncloudflared is not installed. Download cloudflared-windows-amd64.exe from');
    console.error('https://github.com/cloudflare/cloudflared/releases/latest and save it as');
    console.error(`${local}\n`);
    process.exit(1);
  }
  tunnel.child?.kill();
  console.log('Cloudflare is busy right now (too many new links). Waiting 30 seconds...');
  await sleep(30000);
}
if (!tunnel?.url) {
  console.error('\nCould not create a link. Wait a few minutes and run npm run share again.\n');
  process.exit(1);
}

// 3. Wait until the link really works.
process.stdout.write('Checking the link');
let ready = false;
// New links can take one or two minutes before they answer.
for (let i = 0; i < 75 && !ready; i += 1) {
  ready = await ok(`${tunnel.url}/api/health`, 8000);
  if (!ready) { process.stdout.write('.'); await sleep(2000); }
}
console.log(ready ? ' working.' : ' not answering yet (it may need another minute).');

const line = '='.repeat(64);
console.log(`\n${line}\n  Open on any phone or computer (any Wi-Fi or mobile data):\n\n    ${tunnel.url}\n\n  Demo login: sita / fchv123 (health worker)\n  Keep this window open. Ctrl+C stops the link.\n${line}\n`);

const stop = () => { tunnel.child.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
tunnel.child.on('exit', () => { console.log('The link has stopped. Run npm run share again for a new one.'); process.exit(0); });
