import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p), validateKernelId: vi.fn((id) => id), assertHttpUrl: vi.fn((u) => new URL(u)), encodeNotebookPath: vi.fn((p) => encodeURIComponent(p)),
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Save } = await import('../src/commands/save/notebook.mjs');

describe('save:notebook', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without path/room_ref', async () => {
    C.readStdinJson.mockResolvedValue({});
    await expect(new Save([], {}).run()).rejects.toThrow('path is required');
  });

  test('RTC no-op reports synced status', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r' });
    D.request.mockResolvedValue({ synced: true });
    await new Save([], {}).run();
    expect(D.request).toHaveBeenCalledWith('rtc:status', { room_ref: 'r' });
    expect(C.ok).toHaveBeenCalledWith({ ok: true, rtc: true, synced: true });
  });

  test('RTC error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r' });
    D.request.mockResolvedValue({ error: 'z' });
    await expect(new Save([], {}).run()).rejects.toThrow('z');
  });

  test('REST round-trips notebook', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [] } }).mockResolvedValueOnce({});
    await new Save([], {}).run();
    expect(C.httpJson).toHaveBeenCalledTimes(2);
    expect(C.ok).toHaveBeenCalledWith({ ok: true });
  });

  test('REST rejects non-notebook', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'x.txt' });
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Save([], {}).run()).rejects.toThrow('not a notebook');
  });
});
