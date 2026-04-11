import crypto from 'node:crypto';
import { URL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'jupyter-link', 'config.json');
}

export function loadConfigFile() {
  try { return JSON.parse(readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

export function saveConfigFile(data) {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  const existing = loadConfigFile();
  const merged = { ...existing, ...data };
  // Remove keys explicitly set to null
  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
  writeFileSync(p, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function getConfig(env = process.env) {
  const file = loadConfigFile();
  const baseUrl = (env.JUPYTER_URL || file.url || 'http://127.0.0.1:8888').replace(/\/$/, '');
  const token = env.JUPYTER_TOKEN || file.token || undefined;
  const port = Number(env.JUPYTER_LINK_PORT || file.port || 32123);
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
  const u = new URL(url);
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

