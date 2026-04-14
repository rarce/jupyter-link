import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = { readStdinJson: vi.fn(), ok: vi.fn(), assertNodeVersion: vi.fn(), validateNotebookPath: (p) => p, validateKernelId: (id) => id, assertHttpUrl: (u) => new URL(u), encodeNotebookPath: (p) => encodeURIComponent(p) };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Close } = await import('../src/commands/close/channels.mjs');

describe('close:channels', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without refs', async () => {
    C.readStdinJson.mockResolvedValue({});
    await expect(new Close([], {}).run()).rejects.toThrow(/required/);
  });

  test('closes channel only', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c1' });
    D.request.mockResolvedValueOnce({});
    await new Close([], {}).run();
    expect(D.request).toHaveBeenCalledWith('close', { channel_ref: 'c1' });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ channel_closed: true }));
  });

  test('closes room only', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r1' });
    D.request.mockResolvedValueOnce({});
    await new Close([], {}).run();
    expect(D.request).toHaveBeenCalledWith('rtc:disconnect', { room_ref: 'r1' });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ room_disconnected: true }));
  });

  test('closes both', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', room_ref: 'r' });
    D.request.mockResolvedValue({});
    await new Close([], {}).run();
    expect(D.request).toHaveBeenCalledTimes(2);
  });

  test('channel error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c' });
    D.request.mockResolvedValueOnce({ error: 'x' });
    await expect(new Close([], {}).run()).rejects.toThrow('x');
  });

  test('room error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r' });
    D.request.mockResolvedValueOnce({ error: 'y' });
    await expect(new Close([], {}).run()).rejects.toThrow('y');
  });
});
