import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(), nowIso: () => '2026-04-12T10:00:00Z',
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };

vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);

const { default: Insert } = await import('../src/commands/cell/insert.mjs');

describe('cell:insert', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws if no path and no room_ref', async () => {
    C.readStdinJson.mockResolvedValue({ code: 'x=1' });
    await expect(new Insert([], {}).run()).rejects.toThrow('path is required');
  });

  test('RTC path calls rtc:insert-cell', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r1', code: 'x=1', position: 'end' });
    D.request.mockResolvedValue({ cell_id: 2, index: 2 });
    await new Insert([], {}).run();
    expect(D.request).toHaveBeenCalledWith('rtc:insert-cell', expect.objectContaining({ room_ref: 'r1', source: 'x=1' }));
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 2, index: 2 });
  });

  test('RTC error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r1', code: 'x' });
    D.request.mockResolvedValue({ error: 'dead' });
    await expect(new Insert([], {}).run()).rejects.toThrow('dead');
  });

  test('REST path appends cell at end', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'nb.ipynb', code: 'y=2' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } }).mockResolvedValueOnce({});
    await new Insert([], {}).run();
    expect(C.httpJson).toHaveBeenCalledTimes(2);
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 1, index: 1 });
  });

  test('REST path inserts at specific index', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'nb.ipynb', code: 'a', index: 0 });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}, {}] } }).mockResolvedValueOnce({});
    await new Insert([], {}).run();
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 0, index: 0 });
  });

  test('REST rejects non-notebook', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'x.txt', code: 'a' });
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Insert([], {}).run()).rejects.toThrow('not a notebook');
  });

  test('position=start inserts at 0', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'nb.ipynb', code: 'a', position: 'start' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } }).mockResolvedValueOnce({});
    await new Insert([], {}).run();
    expect(C.ok).toHaveBeenCalledWith({ cell_id: 0, index: 0 });
  });
});
