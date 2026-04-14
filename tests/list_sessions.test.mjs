import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
};
vi.mock('../src/lib/common.mjs', () => C);
const { default: List } = await import('../src/commands/list/sessions.mjs');

describe('list:sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns all when no filters', async () => {
    C.httpJson.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await new List([], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('filters by exact --notebook', async () => {
    C.httpJson.mockResolvedValue([
      { notebook: { path: 'a.ipynb' }, id: 1 },
      { notebook: { path: 'b.ipynb' }, id: 2 },
    ]);
    await new List(['--notebook', 'a.ipynb'], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })]);
  });

  test('filters by --name suffix', async () => {
    C.httpJson.mockResolvedValue([
      { notebook: { path: 'dir/a.ipynb' }, id: 1 },
      { notebook: { path: 'b.ipynb' }, id: 2 },
    ]);
    await new List(['--name', 'a.ipynb'], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })]);
  });
});
