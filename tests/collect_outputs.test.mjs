import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = { ok: vi.fn(), assertNodeVersion: vi.fn() };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Collect } = await import('../src/commands/collect/outputs.mjs');

describe('collect:outputs', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without --ref', async () => {
    await expect(new Collect(['--parent-id', 'm'], oclifConfig()).run()).rejects.toThrow(/--ref/);
  });

  test('throws without --parent-id', async () => {
    await expect(new Collect(['--ref', 'c'], oclifConfig()).run()).rejects.toThrow(/--parent-id/);
  });

  test('forwards to daemon', async () => {
    D.request.mockResolvedValue({ outputs: [], status: 'ok' });
    await new Collect(['--ref', 'c', '--parent-id', 'm', '--timeout', '10'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('collect', { channel_ref: 'c', parent_msg_id: 'm', timeout_s: 10 });
    expect(C.ok).toHaveBeenCalled();
  });

  test('default timeout 60', async () => {
    D.request.mockResolvedValue({});
    await new Collect(['--ref', 'c', '--parent-id', 'm'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('collect', expect.objectContaining({ timeout_s: 60 }));
  });

  test('daemon error propagates', async () => {
    D.request.mockResolvedValue({ error: 'timeout' });
    await expect(new Collect(['--ref', 'c', '--parent-id', 'm'], oclifConfig()).run()).rejects.toThrow('timeout');
  });
});
