import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = { readStdinJson: vi.fn(), ok: vi.fn(), assertNodeVersion: vi.fn() };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Collect } = await import('../src/commands/collect/outputs.mjs');

describe('collect:outputs', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without channel_ref', async () => {
    C.readStdinJson.mockResolvedValue({ parent_msg_id: 'm' });
    await expect(new Collect([], {}).run()).rejects.toThrow(/channel_ref/);
  });

  test('throws without parent_msg_id', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c' });
    await expect(new Collect([], {}).run()).rejects.toThrow(/parent_msg_id/);
  });

  test('forwards to daemon', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', parent_msg_id: 'm', timeout_s: 10 });
    D.request.mockResolvedValue({ outputs: [], status: 'ok' });
    await new Collect([], {}).run();
    expect(D.request).toHaveBeenCalledWith('collect', { channel_ref: 'c', parent_msg_id: 'm', timeout_s: 10 });
    expect(C.ok).toHaveBeenCalled();
  });

  test('default timeout 60', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', parent_msg_id: 'm' });
    D.request.mockResolvedValue({});
    await new Collect([], {}).run();
    expect(D.request).toHaveBeenCalledWith('collect', expect.objectContaining({ timeout_s: 60 }));
  });

  test('daemon error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', parent_msg_id: 'm' });
    D.request.mockResolvedValue({ error: 'timeout' });
    await expect(new Collect([], {}).run()).rejects.toThrow('timeout');
  });
});
