import { readStdinJson, ok, fail, assertNodeVersion, getConfig, httpJson } from './util.mjs';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import YAML from 'yaml';

const DEFAULT_SCHEMA_URL = 'https://raw.githubusercontent.com/jupyter/jupyter_server/master/jupyter_server/services/api/api.yaml';

async function loadSchema(input) {
  const schemaUrl = input.schema_url || process.env.JUPYTER_API_SCHEMA_URL || DEFAULT_SCHEMA_URL;
  const schemaPath = input.schema_path || process.env.JUPYTER_API_SCHEMA;
  if (schemaPath) {
    const text = await readFile(schemaPath, 'utf8');
    return YAML.parse(text);
  }
  // try fetch from URL (may fail offline)
  try {
    const res = await fetch(schemaUrl);
    if (!res.ok) throw new Error(`fetch schema failed: ${res.status}`);
    const text = await res.text();
    return YAML.parse(text);
  } catch (e) {
    throw new Error('Could not load API schema. Provide schema_path or allow network. ' + (e.message || e));
  }
}

function expectPaths(schema, paths) {
  const missing = [];
  for (const p of paths) if (!schema.paths || !schema.paths[p]) missing.push(p);
  return missing;
}

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const schema = await loadSchema(input);
  const required = ['/api/sessions', '/api/contents', '/api/kernels/{kernel_id}/channels'];
  const missing = expectPaths(schema, required);
  const { baseUrl, token } = getConfig();
  const checks = [];
  try {
    const sessions = await httpJson('GET', new URL('/api/sessions', baseUrl).toString(), token);
    checks.push({ endpoint: '/api/sessions', ok: true, count: Array.isArray(sessions) ? sessions.length : undefined });
  } catch (e) {
    checks.push({ endpoint: '/api/sessions', ok: false, error: e.message });
  }
  try {
    const contents = await httpJson('GET', new URL('/api/contents', baseUrl).toString(), token);
    checks.push({ endpoint: '/api/contents', ok: true, type: typeof contents });
  } catch (e) {
    checks.push({ endpoint: '/api/contents', ok: false, error: e.message });
  }
  ok({ schema_ok: missing.length === 0, missing_paths: missing, http_checks: checks });
}

main().catch(fail);

