// `npm run google -- <client-id>`: turns on "Continue with Google".
//
// 1. Saves the Google OAuth client ID in infrastructure/.env (used by Docker) and
//    backend/.env (used by `npm run dev`). Both files are ignored by Git.
// 2. Restarts the API containers if Docker is running, so the change applies at once.
//
// Get the client ID from https://console.cloud.google.com/apis/credentials
// (Create credentials > OAuth client ID > Web application). See README "Google sign-in".
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = (process.argv[2] || '').trim();

if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) {
  console.error(`
Usage:  npm run google -- <your-client-id>

The client ID looks like:  123456789012-abc123def456.apps.googleusercontent.com
Create one at https://console.cloud.google.com/apis/credentials
  Create credentials > OAuth client ID > Application type: Web application
  Authorized JavaScript origins:
    http://localhost:8088
    http://localhost:5173
    (and the https://....trycloudflare.com link from npm run share, if you use phones)
`);
  process.exit(1);
}

function setKey(file, key, value) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  fs.writeFileSync(file, text);
  console.log(`Saved in ${path.relative(root, file)}`);
}

setKey(path.join(root, 'infrastructure', '.env'), 'GOOGLE_CLIENT_ID', id);
setKey(path.join(root, 'backend', '.env'), 'GOOGLE_CLIENT_ID', id);

try {
  const running = execSync('docker compose ps --services --filter status=running', { cwd: path.join(root, 'infrastructure'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const apis = running.split(/\s+/).filter((s) => /^api-\d+$/.test(s));
  if (apis.length) {
    console.log(`Restarting ${apis.join(', ')} ...`);
    execSync(`docker compose up -d ${apis.join(' ')}`, { cwd: path.join(root, 'infrastructure'), stdio: 'inherit' });
    process.stdout.write('Waiting for the API');
    for (let i = 0; i < 60; i += 1) {
      try {
        const r = await (await fetch('http://localhost:8088/api/auth/config', { signal: AbortSignal.timeout(3000) })).json();
        if (r.googleClientId === id) { console.log(' ready.'); break; }
      } catch { /* still starting */ }
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
} catch { /* Docker not running: fine for npm run dev */ }

console.log(`
Google sign-in is on. If npm run dev is running, stop it (Ctrl+C) and start it again.
Then open the sign-in page and press Ctrl+Shift+R once.`);
