import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 'tk', port: 32123 })),
  loadConfigFile: vi.fn(() => ({})),
  saveConfigFile: vi.fn((d) => ({ ...d })),
  configPath: vi.fn(() => '/tmp/c.json'),
  assertHttpUrl: (u) => new URL(u),
  validateNotebookPath: (p) => p,
};
vi.mock('../src/lib/common.mjs', () => C);

const { default: Get } = await import('../src/commands/config/get.mjs');
const { default: Set } = await import('../src/commands/config/set.mjs');

describe('config:get', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.JUPYTER_URL; delete process.env.JUPYTER_TOKEN; delete process.env.JUPYTER_LINK_PORT; });

  test('reports default source', async () => {
    C.getConfig.mockReturnValue({ baseUrl: 'http://h', token: 'tk', port: 32123 });
    await new Get([], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://h', token: '***', source: expect.objectContaining({ url: 'default', token: 'default', port: 'default' }),
    }));
  });

  test('marks env source', async () => {
    process.env.JUPYTER_URL = 'x';
    await new Get([], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ url: 'env' }) }));
    delete process.env.JUPYTER_URL;
  });

  test('token null when unset', async () => {
    C.getConfig.mockReturnValue({ baseUrl: 'http://h', token: undefined, port: 32123 });
    await new Get([], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ token: null }));
  });
});

describe('config:set', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws if no flags', async () => {
    await expect(new Set([], oclifConfig()).run()).rejects.toThrow('at least one');
  });

  test('saves provided flags', async () => {
    await new Set(['--url', 'http://u', '--token', 't', '--port', '99'], oclifConfig()).run();
    expect(C.saveConfigFile).toHaveBeenCalledWith({ url: 'http://u', token: 't', port: 99 });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  test('extracts token from URL', async () => {
    await new Set(['--url', 'http://u:8888/?token=XYZ'], oclifConfig()).run();
    expect(C.saveConfigFile).toHaveBeenCalledWith({ url: 'http://u:8888', token: 'XYZ' });
  });
});
