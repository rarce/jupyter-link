import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p),
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Save } = await import('../src/commands/save/notebook.mjs');

describe('save:notebook', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without --notebook/--room', async () => {
    await expect(new Save([], oclifConfig()).run()).rejects.toThrow('--notebook');
  });

  test('RTC no-op reports synced status', async () => {
    D.request.mockResolvedValue({ synced: true });
    await new Save(['--room', 'r'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('rtc:status', { room_ref: 'r' });
    expect(C.ok).toHaveBeenCalledWith({ ok: true, rtc: true, synced: true });
  });

  test('RTC error propagates', async () => {
    D.request.mockResolvedValue({ error: 'z' });
    await expect(new Save(['--room', 'r'], oclifConfig()).run()).rejects.toThrow('z');
  });

  test('REST round-trips notebook', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [] } }).mockResolvedValueOnce({});
    await new Save(['--notebook', 'n.ipynb'], oclifConfig()).run();
    expect(C.httpJson).toHaveBeenCalledTimes(2);
    expect(C.ok).toHaveBeenCalledWith({ ok: true });
  });

  test('REST rejects non-notebook', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Save(['--notebook', 'x.txt'], oclifConfig()).run()).rejects.toThrow('not a notebook');
  });
});
