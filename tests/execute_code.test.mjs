import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = { ok: vi.fn(), assertNodeVersion: vi.fn() };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Exec } = await import('../src/commands/execute/code.mjs');

describe('execute:code', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without --ref', async () => {
    await expect(new Exec(['--code', 'x'], oclifConfig()).run()).rejects.toThrow(/--ref/);
  });

  test('throws without code', async () => {
    await expect(new Exec(['--ref', 'c'], oclifConfig()).run()).rejects.toThrow(/code/);
  });

  test('executes and returns parent_msg_id', async () => {
    D.request.mockResolvedValue({ parent_msg_id: 'm1' });
    await new Exec(['--ref', 'c', '--code', 'print(1)'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('exec', expect.objectContaining({
      channel_ref: 'c', code: 'print(1)', stop_on_error: true, allow_stdin: false,
    }));
    expect(C.ok).toHaveBeenCalledWith({ parent_msg_id: 'm1' });
  });

  test('daemon error propagates', async () => {
    D.request.mockResolvedValue({ error: 'nope' });
    await expect(new Exec(['--ref', 'c', '--code', 'x'], oclifConfig()).run()).rejects.toThrow('nope');
  });

  test('--no-stop-on-error and --allow-stdin', async () => {
    D.request.mockResolvedValue({ parent_msg_id: 'm' });
    await new Exec(['--ref', 'c', '--code', 'x', '--no-stop-on-error', '--allow-stdin'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('exec', {
      channel_ref: 'c', code: 'x', allow_stdin: true, stop_on_error: false,
    });
  });
});
