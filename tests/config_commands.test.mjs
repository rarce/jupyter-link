import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 'tk', port: 32123 })),
  loadConfigFile: vi.fn(() => ({})),
  saveConfigFile: vi.fn((d) => ({ ...d })),
  configPath: vi.fn(() => '/tmp/c.json'),
};
vi.mock('../src/lib/common.mjs', () => C);

const { default: Get } = await import('../src/commands/config/get.mjs');
const { default: Set } = await import('../src/commands/config/set.mjs');

describe('config:get', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.JUPYTER_URL; delete process.env.JUPYTER_TOKEN; delete process.env.JUPYTER_LINK_PORT; });

  test('reports default source', async () => {
    C.getConfig.mockReturnValue({ baseUrl: 'http://h', token: 'tk', port: 32123 });
    await new Get([], {}).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://h', token: '***', source: expect.objectContaining({ url: 'default', token: 'default', port: 'default' }),
    }));
  });

  test('marks env source', async () => {
    process.env.JUPYTER_URL = 'x';
    await new Get([], {}).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ url: 'env' }) }));
    delete process.env.JUPYTER_URL;
  });

  test('token null when unset', async () => {
    C.getConfig.mockReturnValue({ baseUrl: 'http://h', token: undefined, port: 32123 });
    await new Get([], {}).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ token: null }));
  });
});

describe('config:set', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws if no fields', async () => {
    C.readStdinJson.mockResolvedValue({});
    await expect(new Set([], {}).run()).rejects.toThrow('at least one');
  });

  test('saves provided fields', async () => {
    C.readStdinJson.mockResolvedValue({ url: 'u', token: 't', port: 99 });
    await new Set([], {}).run();
    expect(C.saveConfigFile).toHaveBeenCalledWith({ url: 'u', token: 't', port: 99 });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
