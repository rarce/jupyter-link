import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = { ok: vi.fn(), assertNodeVersion: vi.fn() };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
vi.mock('../src/lib/flags.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadState: () => ({}), dropCachedChannel: vi.fn() };
});
const { default: Close } = await import('../src/commands/close/channels.mjs');

describe('close:channels', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without refs', async () => {
    await expect(new Close([], oclifConfig()).run()).rejects.toThrow(/required/);
  });

  test('closes channel only', async () => {
    D.request.mockResolvedValueOnce({});
    await new Close(['--ref', 'c1'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('close', { channel_ref: 'c1' });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ channel_closed: true }));
  });

  test('closes room only', async () => {
    D.request.mockResolvedValueOnce({});
    await new Close(['--room', 'r1'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('rtc:disconnect', { room_ref: 'r1' });
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ room_disconnected: true }));
  });

  test('closes both', async () => {
    D.request.mockResolvedValue({});
    await new Close(['--ref', 'c', '--room', 'r'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledTimes(2);
  });

  test('channel error propagates', async () => {
    D.request.mockResolvedValueOnce({ error: 'x' });
    await expect(new Close(['--ref', 'c'], oclifConfig()).run()).rejects.toThrow('x');
  });

  test('room error propagates', async () => {
    D.request.mockResolvedValueOnce({ error: 'y' });
    await expect(new Close(['--room', 'r'], oclifConfig()).run()).rejects.toThrow('y');
  });
});
