import net from 'node:net';
import { spawn } from 'node:child_process';
import { getConfig } from './common.mjs';

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

export async function ensureDaemon({ port = defaultPort() } = {}) {
  try { const res = await request('ping', {}, { port }); if (res && res.ok) return { port }; } catch {}
  const daemonPath = new URL('../../scripts/daemon.mjs', import.meta.url).pathname;
  const child = spawn(process.execPath, [daemonPath], { cwd: process.cwd(), env: process.env, detached: true, stdio: 'ignore' });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) { try { const res = await request('ping', {}, { port }); if (res && res.ok) return { port }; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Failed to start daemon');
}
