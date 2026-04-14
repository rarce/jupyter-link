import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p),
};
vi.mock('../src/lib/common.mjs', () => C);

const { default: Read } = await import('../src/commands/contents/read.mjs');
const { default: Write } = await import('../src/commands/contents/write.mjs');

describe('contents:read', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws without --notebook', async () => {
    await expect(new Read([], oclifConfig()).run()).rejects.toThrow('--notebook');
  });

  test('returns notebook content', async () => {
    C.httpJson.mockResolvedValue({ type: 'notebook', content: { cells: [] } });
    await new Read(['--notebook', 'n.ipynb'], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith({ cells: [] });
  });

  test('rejects non-notebook', async () => {
    C.httpJson.mockResolvedValue({ type: 'file' });
    await expect(new Read(['--notebook', 'x.txt'], oclifConfig()).run()).rejects.toThrow('not a notebook');
  });
});

describe('contents:write', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws without --notebook', async () => {
    await expect(new Write(['--content', '{}'], oclifConfig()).run()).rejects.toThrow('--notebook');
  });

  test('throws without content', async () => {
    await expect(new Write(['--notebook', 'n.ipynb'], oclifConfig()).run()).rejects.toThrow(/content/);
  });

  test('PUTs notebook content via --content', async () => {
    C.httpJson.mockResolvedValue({});
    await new Write(['--notebook', 'n.ipynb', '--content', JSON.stringify({ cells: [] })], oclifConfig()).run();
    expect(C.httpJson).toHaveBeenCalledWith('PUT', expect.stringContaining('/api/contents/'), 't', expect.objectContaining({ type: 'notebook' }));
    expect(C.ok).toHaveBeenCalledWith({ ok: true });
  });
});
