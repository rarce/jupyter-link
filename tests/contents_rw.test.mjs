import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
};
vi.mock('../src/lib/common.mjs', () => C);

const { default: Read } = await import('../src/commands/contents/read.mjs');
const { default: Write } = await import('../src/commands/contents/write.mjs');

describe('contents:read', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws without path', async () => {
    C.readStdinJson.mockResolvedValue({});
    await expect(new Read([], {}).run()).rejects.toThrow('path is required');
  });

  test('returns notebook content', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb' });
    C.httpJson.mockResolvedValue({ type: 'notebook', content: { cells: [] } });
    await new Read([], {}).run();
    expect(C.ok).toHaveBeenCalledWith({ cells: [] });
  });

  test('rejects non-notebook', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'x.txt' });
    C.httpJson.mockResolvedValue({ type: 'file' });
    await expect(new Read([], {}).run()).rejects.toThrow('not a notebook');
  });
});

describe('contents:write', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws without path', async () => {
    C.readStdinJson.mockResolvedValue({ nb_json: {} });
    await expect(new Write([], {}).run()).rejects.toThrow('path is required');
  });

  test('throws without nb_json', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb' });
    await expect(new Write([], {}).run()).rejects.toThrow('nb_json is required');
  });

  test('PUTs notebook content', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb', nb_json: { cells: [] } });
    C.httpJson.mockResolvedValue({});
    await new Write([], {}).run();
    expect(C.httpJson).toHaveBeenCalledWith('PUT', expect.stringContaining('/api/contents/'), 't', expect.objectContaining({ type: 'notebook' }));
    expect(C.ok).toHaveBeenCalledWith({ ok: true });
  });
});
