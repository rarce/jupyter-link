import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig, configPath, loadConfigFile, saveConfigFile, joinUrl, nowIso, newSessionId, assertNodeVersion } from '../src/lib/common.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('configPath', () => {
  const origEnv = process.env;

  afterEach(() => { process.env = origEnv; });

  test('uses XDG_CONFIG_HOME when set', () => {
    process.env = { ...origEnv, XDG_CONFIG_HOME: '/custom/config' };
    expect(configPath()).toBe('/custom/config/jupyter-link/config.json');
  });

  test('falls back to ~/.config when XDG_CONFIG_HOME not set', () => {
    process.env = { ...origEnv };
    delete process.env.XDG_CONFIG_HOME;
    const p = configPath();
    expect(p).toMatch(/\.config\/jupyter-link\/config\.json$/);
  });
});

describe('loadConfigFile', () => {
  test('returns parsed JSON from file', () => {
    readFileSync.mockReturnValue('{"url":"http://x:1234","token":"abc"}');
    const cfg = loadConfigFile();
    expect(cfg).toEqual({ url: 'http://x:1234', token: 'abc' });
  });

  test('returns empty object on missing file', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(loadConfigFile()).toEqual({});
  });

  test('returns empty object on invalid JSON', () => {
    readFileSync.mockReturnValue('not json');
    expect(loadConfigFile()).toEqual({});
  });
});

describe('saveConfigFile', () => {
  beforeEach(() => {
    readFileSync.mockReturnValue('{"url":"http://old:8888"}');
    writeFileSync.mockImplementation(() => {});
    mkdirSync.mockImplementation(() => {});
  });

  test('merges with existing config', () => {
    const result = saveConfigFile({ token: 'new-tok' });
    expect(result).toEqual({ url: 'http://old:8888', token: 'new-tok' });
    expect(writeFileSync).toHaveBeenCalled();
  });

  test('removes keys set to null', () => {
    const result = saveConfigFile({ url: null });
    expect(result).toEqual({});
  });

  test('creates directory recursively', () => {
    saveConfigFile({ url: 'http://x:1' });
    expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    readFileSync.mockReturnValue('{"url":"http://file:9999","token":"file-tok","port":55555}');
  });

  test('env vars take priority over file', () => {
    const cfg = getConfig({ JUPYTER_URL: 'http://env:1111', JUPYTER_TOKEN: 'env-tok', JUPYTER_LINK_PORT: '44444' });
    expect(cfg.baseUrl).toBe('http://env:1111');
    expect(cfg.token).toBe('env-tok');
    expect(cfg.port).toBe(44444);
  });

  test('falls back to config file values', () => {
    const cfg = getConfig({});
    expect(cfg.baseUrl).toBe('http://file:9999');
    expect(cfg.token).toBe('file-tok');
    expect(cfg.port).toBe(55555);
  });

  test('uses defaults when no env or file', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const cfg = getConfig({});
    expect(cfg.baseUrl).toBe('http://127.0.0.1:8888');
    expect(cfg.token).toBeUndefined();
    expect(cfg.port).toBe(32123);
  });

  test('strips trailing slash from URL', () => {
    const cfg = getConfig({ JUPYTER_URL: 'http://localhost:8888/' });
    expect(cfg.baseUrl).toBe('http://localhost:8888');
  });
});

describe('joinUrl', () => {
  test('joins base and path', () => {
    expect(joinUrl('http://localhost:8888', '/api/sessions')).toBe('http://localhost:8888/api/sessions');
  });

  test('prepends / if missing', () => {
    expect(joinUrl('http://localhost:8888', 'api/sessions')).toBe('http://localhost:8888/api/sessions');
  });

  test('adds query params', () => {
    const url = joinUrl('http://localhost:8888', '/api/contents', { content: '1', format: 'json' });
    expect(url).toContain('content=1');
    expect(url).toContain('format=json');
  });

  test('skips null/undefined params', () => {
    const url = joinUrl('http://localhost:8888', '/api/contents', { content: '1', foo: null, bar: undefined });
    expect(url).toContain('content=1');
    expect(url).not.toContain('foo');
    expect(url).not.toContain('bar');
  });
});

describe('nowIso', () => {
  test('returns ISO string without milliseconds', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe('newSessionId', () => {
  test('returns 32 hex chars (UUID without dashes)', () => {
    const id = newSessionId();
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  test('returns unique values', () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
  });
});

describe('assertNodeVersion', () => {
  test('does not throw on Node 20+', () => {
    expect(() => assertNodeVersion()).not.toThrow();
  });
});
