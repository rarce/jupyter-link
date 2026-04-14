import { Flags } from '@oclif/core';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { assertHttpUrl, validateNotebookPath } from './common.mjs';

// Shared flag definitions reused across commands. Individual commands pick only
// the ones they need via spread: `static flags = { notebook: commonFlags.notebook, ... }`.
export const commonFlags = {
  notebook: Flags.string({ char: 'n', description: 'Notebook path (server-relative, POSIX-style)' }),
  ref: Flags.string({ description: 'Channel ref from open:kernel-channels' }),
  room: Flags.string({ description: 'RTC room_ref from open:kernel-channels' }),
  code: Flags.string({ description: "Code literal. Use '-' to read raw stdin." }),
  'code-file': Flags.string({ description: 'Path to a file whose contents are the code' }),
  'parent-id': Flags.string({ description: 'parent_msg_id from execute:code' }),
  timeout: Flags.integer({ description: 'Timeout in seconds', default: 60 }),
  index: Flags.integer({ description: 'Cell index (0-based)' }),
  position: Flags.string({ description: 'Insert position when index is omitted', options: ['start', 'end'], default: 'end' }),
  'kernel-name': Flags.string({ description: 'Kernel spec name (e.g. python3)', default: 'python3' }),
  'kernel-id': Flags.string({ description: 'Explicit kernel id (skips session lookup)' }),
  'stop-on-error': Flags.boolean({ description: 'Stop kernel on first error', default: true, allowNo: true }),
  'allow-stdin': Flags.boolean({ description: 'Allow kernel to request stdin', default: false }),
  'max-chars': Flags.integer({ description: 'Max characters per output/source field', default: 3000 }),
  metadata: Flags.string({ description: 'JSON string merged into cell agent metadata' }),
  rtc: Flags.string({ description: 'RTC mode', options: ['auto', 'on', 'off'], default: 'auto' }),
  url: Flags.string({ description: 'Full Jupyter URL (may include ?token=… and /notebooks/<path>)' }),
};

// Read code from --code-file, --code (literal), or stdin when --code=-.
export async function readCode(flags) {
  if (flags['code-file']) return readFileSync(flags['code-file'], 'utf8');
  if (flags.code === '-') {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  }
  return flags.code ?? '';
}

// Parse a Jupyter URL like http://host:8888/notebooks/foo/bar.ipynb?token=XYZ
// into { baseUrl, token, notebookPath }.
export function parseJupyterUrl(raw) {
  const u = assertHttpUrl(raw);
  const baseUrl = `${u.protocol}//${u.host}`;
  const token = u.searchParams.get('token') || undefined;
  let notebookPath;
  const m = u.pathname.match(/\/(?:notebooks|lab\/tree|tree)\/(.+)$/);
  if (m) notebookPath = decodeURIComponent(m[1]);
  if (notebookPath) validateNotebookPath(notebookPath);
  return { baseUrl, token, notebookPath };
}

// If --url is set, parse it and apply baseUrl/token via env, and backfill --notebook
// when the URL path contains /notebooks/<path>. Mutates `flags`.
export function applyUrlFlag(flags) {
  if (!flags.url) return;
  const p = parseJupyterUrl(flags.url);
  if (p.baseUrl) process.env.JUPYTER_URL = p.baseUrl;
  if (p.token) process.env.JUPYTER_TOKEN = p.token;
  if (!flags.notebook && p.notebookPath) flags.notebook = p.notebookPath;
}

// 'auto' → undefined (try, degrade silently), 'on' → true (strict), 'off' → false.
export function rtcFlag(v) {
  if (v === 'on') return true;
  if (v === 'off') return false;
  return undefined;
}

// Channel cache: persisted map of notebookPath → channel_ref so the top-level
// `exec` command can reuse an open channel between invocations. Refs are
// ephemeral inside the daemon process; callers must handle reopen on failure.
export function statePath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'jupyter-link', 'state.json');
}
export function loadState() {
  try { return JSON.parse(readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
export function saveState(data) {
  const p = statePath();
  const dir = dirname(p);
  mkdirSync(dir, { recursive: true });
  try { chmodSync(dir, 0o700); } catch {}
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch {}
}
export function cacheChannel(key, entry) {
  const s = loadState();
  s.channels = s.channels || {};
  s.channels[key] = { ...entry, cachedAt: Date.now() };
  saveState(s);
}
export function getCachedChannel(key) {
  const s = loadState();
  return s.channels?.[key];
}
export function dropCachedChannel(key) {
  const s = loadState();
  if (s.channels && s.channels[key]) { delete s.channels[key]; saveState(s); }
}
