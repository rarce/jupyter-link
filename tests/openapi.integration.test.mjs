import { describe, test, expect, beforeAll } from 'vitest';
import { getConfig, httpJson } from '../scripts/util.mjs';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

let openapiReady = false;

async function initOpenApi() {
  const schemaPath = process.env.JUPYTER_API_SCHEMA;
  if (!schemaPath) return false;
  let mod;
  try { mod = await import('vitest-openapi'); } catch { return false; }
  let spec;
  try { spec = YAML.parse(await readFile(schemaPath, 'utf8')); } catch { return false; }
  try {
    // Support common initialization shapes
    if (typeof mod.default === 'function') {
      // Some bundles export default(jestOpenAPI)
      mod.default(spec);
    }
    if (typeof mod.jestOpenAPI === 'function') {
      mod.jestOpenAPI(spec);
    }
    // If matchers export exists, attach it
    if (mod.matchers && typeof expect.extend === 'function') {
      expect.extend(mod.matchers);
    }
    // Probe matcher exists
    if (typeof expect({}).toSatisfyApiSpec !== 'function') return false;
    return true;
  } catch {
    return false;
  }
}

async function serverAvailable() {
  try {
    const { baseUrl, token } = getConfig();
    await httpJson('GET', `${baseUrl}/api`, token, undefined, 2000);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  openapiReady = await initOpenApi();
});

describe('OpenAPI compatibility (optional)', () => {
  test('GET /api/sessions satisfies OpenAPI spec', async () => {
    if (!openapiReady) return; // skip if not configured
    if (!(await serverAvailable())) return; // skip if no server
    const { baseUrl, token } = getConfig();
    const body = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    expect({ status: 200, method: 'get', path: '/api/sessions', body }).toSatisfyApiSpec();
  });

  test('GET /api/contents satisfies OpenAPI spec', async () => {
    if (!openapiReady) return;
    if (!(await serverAvailable())) return;
    const { baseUrl, token } = getConfig();
    const body = await httpJson('GET', `${baseUrl}/api/contents`, token);
    expect({ status: 200, method: 'get', path: '/api/contents', body }).toSatisfyApiSpec();
  });
});

