import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p), validateKernelId: vi.fn((id) => id), assertHttpUrl: vi.fn((u) => new URL(u)), encodeNotebookPath: vi.fn((p) => encodeURIComponent(p)),
};
vi.mock('../src/lib/common.mjs', () => C);
const { default: List } = await import('../src/commands/list/sessions.mjs');

describe('list:sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns all when no filters', async () => {
    C.readStdinJson.mockResolvedValue({});
    C.httpJson.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await new List([], {}).run();
    expect(C.ok).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('filters by exact path', async () => {
    C.readStdinJson.mockResolvedValue({ filters: { path: 'a.ipynb' } });
    C.httpJson.mockResolvedValue([
      { notebook: { path: 'a.ipynb' }, id: 1 },
      { notebook: { path: 'b.ipynb' }, id: 2 },
    ]);
    await new List([], {}).run();
    expect(C.ok).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })]);
  });

  test('filters by name suffix', async () => {
    C.readStdinJson.mockResolvedValue({ filters: { name: 'a.ipynb' } });
    C.httpJson.mockResolvedValue([
      { notebook: { path: 'dir/a.ipynb' }, id: 1 },
      { notebook: { path: 'b.ipynb' }, id: 2 },
    ]);
    await new List([], {}).run();
    expect(C.ok).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })]);
  });
});
