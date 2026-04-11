import { describe, test, expect } from 'vitest';
import { getConfig, httpJson } from '../scripts/util.mjs';

async function serverAvailable() {
  try {
    const { baseUrl, token } = getConfig();
    await httpJson('GET', `${baseUrl}/api/sessions`, token, undefined, 2000);
    return true;
  } catch {
    return false;
  }
}

describe('Jupyter Server API', () => {
  test('GET /api/sessions returns array', async () => {
    if (!(await serverAvailable())) return; // skip if no server
    const { baseUrl, token } = getConfig();
    const data = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/contents returns an object', async () => {
    if (!(await serverAvailable())) return; // skip if no server
    const { baseUrl, token } = getConfig();
    const data = await httpJson('GET', `${baseUrl}/api/contents`, token);
    expect(typeof data).toBe('object');
  });
});

