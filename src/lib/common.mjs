import crypto from 'node:crypto';
import { URL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

// ---------- Security validators ----------
// Accept only http(s) base URLs — never file:, javascript:, data:, ws: (callers derive ws:// themselves)
export function assertHttpUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Refusing non-http(s) URL scheme: ${u.protocol}`);
  }
  return u;
}

// Kernel/session IDs from Jupyter are UUIDs. Validate to prevent path/query injection
// when interpolated into WS URLs.
// Accept any short alphanumeric/hyphen token. Real Jupyter kernel/session IDs are UUIDs;
// we keep the regex lenient (e.g. for tests) but still reject anything that could alter
// URL structure (slashes, query chars, whitespace, control bytes).
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export function validateKernelId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Invalid kernel id');
  return id;
}
export function validateSessionId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Invalid session id');
  return id;
}

// Notebook paths must be server-relative POSIX-style. Reject traversal, absolute,
// schemes, and control bytes. Jupyter already enforces this server-side; this is
// defense in depth so malicious stdin can't round-trip through the Contents API.
export function validateNotebookPath(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('notebook path is required');
  if (p.length > 1024) throw new Error('notebook path too long');
  if (p.includes('\0')) throw new Error('notebook path contains null byte');
  if (/[\x00-\x1f]/.test(p)) throw new Error('notebook path contains control characters');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) throw new Error('notebook path must not contain a URL scheme');
  if (p.startsWith('/') || p.startsWith('\\')) throw new Error('notebook path must be relative');
  const parts = p.split(/[\\/]/);
  for (const seg of parts) if (seg === '..') throw new Error('notebook path must not contain ".." segments');
  return p;
}

export function encodeNotebookPath(p) {
  return encodeURIComponent(validateNotebookPath(p));
}

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'jupyter-link', 'config.json');
}

export function loadConfigFile() {
  try { return JSON.parse(readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

export function saveConfigFile(data) {
  const p = configPath();
  const dir = dirname(p);
  mkdirSync(dir, { recursive: true });
  try { chmodSync(dir, 0o700); } catch {}
  const existing = loadConfigFile();
  const merged = { ...existing, ...data };
  // Remove keys explicitly set to null
  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
  if (merged.url !== undefined) assertHttpUrl(merged.url);
  writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch {}
  return merged;
}

export function getConfig(env = process.env) {
  const file = loadConfigFile();
  const baseUrl = (env.JUPYTER_URL || file.url || 'http://127.0.0.1:8888').replace(/\/$/, '');
  assertHttpUrl(baseUrl);
  const token = env.JUPYTER_TOKEN || file.token || undefined;
  const port = Number(env.JUPYTER_LINK_PORT || file.port || 32123);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid daemon port: ${port}`);
  return { baseUrl, token, port };
}

export function assertNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) throw new Error('Node >=20 is required');
}

export function joinUrl(base, path, params = undefined) {
  const u = new URL(path.startsWith('/') ? path : `/${path}`, base);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}

export async function httpJson(method, url, token, body = undefined, timeoutMs = 30000) {
  const u = assertHttpUrl(url);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(u, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: controller.signal });
  clearTimeout(t);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${method} ${u.pathname} -> ${res.status}: ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString('utf8').trim();
  return buf ? JSON.parse(buf) : {};
}

export function ok(data) { process.stdout.write(JSON.stringify(data) + '\n'); }
export function fail(err) {
  const msg = (err && err.message) || String(err);
  process.stderr.write(msg + '\n');
  process.stdout.write(JSON.stringify({ error: msg, stack: err && err.stack }) + '\n');
  process.exit(1);
}

export function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
export function newSessionId() { return crypto.randomUUID().replace(/-/g, ''); }

