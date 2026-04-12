import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = { readStdinJson: vi.fn(), ok: vi.fn(), assertNodeVersion: vi.fn() };
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);
const { default: Exec } = await import('../src/commands/execute/code.mjs');

describe('execute:code', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without channel_ref', async () => {
    C.readStdinJson.mockResolvedValue({ code: 'x' });
    await expect(new Exec([], {}).run()).rejects.toThrow(/channel_ref/);
  });

  test('executes and returns parent_msg_id', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', code: 'print(1)' });
    D.request.mockResolvedValue({ parent_msg_id: 'm1' });
    await new Exec([], {}).run();
    expect(D.request).toHaveBeenCalledWith('exec', expect.objectContaining({ channel_ref: 'c', code: 'print(1)', stop_on_error: true }));
    expect(C.ok).toHaveBeenCalledWith({ parent_msg_id: 'm1' });
  });

  test('daemon error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ channel_ref: 'c', code: 'x' });
    D.request.mockResolvedValue({ error: 'nope' });
    await expect(new Exec([], {}).run()).rejects.toThrow('nope');
  });

  test('accepts ref and source aliases', async () => {
    C.readStdinJson.mockResolvedValue({ ref: 'c', source: 'x', allow_stdin: true, stop_on_error: false });
    D.request.mockResolvedValue({ parent_msg_id: 'm' });
    await new Exec([], {}).run();
    expect(D.request).toHaveBeenCalledWith('exec', { channel_ref: 'c', code: 'x', allow_stdin: true, stop_on_error: false });
  });
});
