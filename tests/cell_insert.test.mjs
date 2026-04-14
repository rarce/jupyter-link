import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(), nowIso: () => '2026-04-12T10:00:00Z',
  validateNotebookPath: vi.fn((p) => p),
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };

vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);

const { default: Insert } = await import('../src/commands/cell/insert.mjs');

describe('cell:insert', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws if no notebook and no room', async () => {
    await expect(new Insert(['--code', 'x=1'], oclifConfig()).run()).rejects.toThrow('--notebook');
  });

  test('RTC path calls rtc:insert-cell', async () => {
    D.request.mockResolvedValue({ cell_id: 2, index: 2 });
    await new Insert(['--room', 'r1', '--code', 'x=1'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('rtc:insert-cell', expect.objectContaining({ room_ref: 'r1', source: 'x=1' }));
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 2, index: 2 });
  });

  test('RTC error propagates', async () => {
    D.request.mockResolvedValue({ error: 'dead' });
    await expect(new Insert(['--room', 'r1', '--code', 'x'], oclifConfig()).run()).rejects.toThrow('dead');
  });

  test('REST path appends cell at end', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } }).mockResolvedValueOnce({});
    await new Insert(['--notebook', 'nb.ipynb', '--code', 'y=2'], oclifConfig()).run();
    expect(C.httpJson).toHaveBeenCalledTimes(2);
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 1, index: 1 });
  });

  test('REST path inserts at specific index', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}, {}] } }).mockResolvedValueOnce({});
    await new Insert(['--notebook', 'nb.ipynb', '--code', 'a', '--index', '0'], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 0, index: 0 });
  });

  test('REST rejects non-notebook', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Insert(['--notebook', 'x.txt', '--code', 'a'], oclifConfig()).run()).rejects.toThrow('not a notebook');
  });

  test('position=start inserts at 0', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } }).mockResolvedValueOnce({});
    await new Insert(['--notebook', 'nb.ipynb', '--code', 'a', '--position', 'start'], oclifConfig()).run();
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 0, index: 0 });
  });
});
