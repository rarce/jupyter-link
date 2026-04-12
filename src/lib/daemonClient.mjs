import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { getConfig } from './common.mjs';
import { VERSION } from './version.mjs';

function defaultPort() { return getConfig().port; }

export async function request(op, args = {}, { port = defaultPort(), timeoutMs = 120000 } = {}) {
  const client = new net.Socket();
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => { client.destroy(); reject(new Error(`IPC request '${op}' timed out after ${timeoutMs}ms`)); }, timeoutMs);
    client.connect(port, '127.0.0.1', () => { client.write(JSON.stringify({ op, args }) + '\n'); });
    client.on('data', (data) => {
      buffer += data.toString('utf8');
      const idx = buffer.indexOf('\n');
      if (idx >= 0) { const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1); clearTimeout(timer); try { resolve(JSON.parse(line)); } catch (e) { reject(e); } client.destroy(); }
    });
    client.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(200);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.connect(port, '127.0.0.1');
  });
}

async function waitPortFree(port, maxMs = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (!(await isPortOpen(port))) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

function pidFilePath(port) {
  return join(os.tmpdir(), `jupyter-link-daemon-${port}.pid`);
}

async function killStaleDaemon(port) {
  // 1) Try graceful shutdown op (works for daemons >= 0.2.2).
  try { await request('shutdown', {}, { port, timeoutMs: 2000 }); } catch {}
  if (await waitPortFree(port, 1500)) return true;
  // 2) Fallback: read PID file and SIGTERM.
  try {
    const pid = Number(readFileSync(pidFilePath(port), 'utf8').trim());
    if (pid > 0) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  } catch {}
  return waitPortFree(port, 1500);
}

export async function ensureDaemon({ port = defaultPort() } = {}) {
  // Is a daemon already running?
  try {
    const ping = await request('ping', {}, { port, timeoutMs: 2000 });
    if (ping && ping.ok) {
      // Version handshake: stale daemon must be replaced.
      let daemonVersion = null;
      try { const v = await request('version', {}, { port, timeoutMs: 2000 }); daemonVersion = v && v.version; } catch {}
      if (daemonVersion === VERSION) return { port };
      await killStaleDaemon(port);
    }
  } catch {}

  const daemonPath = new URL('../../scripts/daemon.mjs', import.meta.url).pathname;
  const child = spawn(process.execPath, [daemonPath], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    try {
      const res = await request('ping', {}, { port, timeoutMs: 1000 });
      if (res && res.ok) return { port };
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Failed to start daemon');
}
