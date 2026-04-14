import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const mockHttpJson = vi.fn();
const mockOk = vi.fn();
const mockGetConfig = vi.fn(() => ({ baseUrl: 'http://localhost:8888', token: 'test-tok', port: 32123 }));
const mockEnsureDaemon = vi.fn();
const mockRequest = vi.fn();

vi.mock('../src/lib/common.mjs', () => ({
  httpJson: (...args) => mockHttpJson(...args),
  ok: (...args) => mockOk(...args),
  getConfig: (...args) => mockGetConfig(...args),
  assertNodeVersion: () => {},
  validateNotebookPath: (p) => p,
}));

vi.mock('../src/lib/daemonClient.mjs', () => ({
  ensureDaemon: (...args) => mockEnsureDaemon(...args),
  request: (...args) => mockRequest(...args),
}));

const { default: OpenKernelChannels } = await import('../src/commands/open/kernel-channels.mjs');

const run = (argv) => new OpenKernelChannels(argv, oclifConfig()).run();

describe('open:kernel-channels – auto-create session', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEnsureDaemon.mockResolvedValue(); });

  test('creates session automatically when no session exists', async () => {
    const newSession = { id: 's', notebook: { path: 'fresh.ipynb' }, kernel: { id: 'kern-new', name: 'python3' } };
    mockHttpJson.mockResolvedValueOnce([]).mockResolvedValueOnce(newSession);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-new', session_id: 'sid-1' });

    await run(['--notebook', 'fresh.ipynb', '--rtc', 'off']);

    expect(mockHttpJson).toHaveBeenCalledTimes(2);
    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.stringContaining('/api/sessions'), 'test-tok', {
      path: 'fresh.ipynb', name: 'fresh.ipynb', type: 'notebook', kernel: { name: 'python3' },
    });
    expect(mockRequest).toHaveBeenCalledWith('open', {
      baseUrl: 'http://localhost:8888', token: 'test-tok', kernelId: 'kern-new',
    });
    expect(mockOk).toHaveBeenCalledWith({ channel_ref: 'ch-new', session_id: 'sid-1' });
  });

  test('uses custom --kernel-name when auto-creating', async () => {
    const newSession = { id: 's', notebook: { path: 'julia.ipynb' }, kernel: { id: 'kern-julia' } };
    mockHttpJson.mockResolvedValueOnce([]).mockResolvedValueOnce(newSession);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-j' });

    await run(['--notebook', 'julia.ipynb', '--kernel-name', 'julia-1.9', '--rtc', 'off']);

    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.any(String), expect.any(String),
      expect.objectContaining({ kernel: { name: 'julia-1.9' } }));
  });

  test('uses existing session when one is found (no auto-create)', async () => {
    const existing = { id: 's', notebook: { path: 'demo.ipynb' }, kernel: { id: 'kern-existing' } };
    mockHttpJson.mockResolvedValueOnce([existing]);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-e', session_id: 'sid-e' });

    await run(['--notebook', 'demo.ipynb', '--rtc', 'off']);

    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('open', expect.objectContaining({ kernelId: 'kern-existing' }));
  });

  test('uses --kernel-id directly without session lookup', async () => {
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-d' });
    await run(['--kernel-id', 'direct-kern', '--rtc', 'off']);
    expect(mockHttpJson).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith('open', expect.objectContaining({ kernelId: 'direct-kern' }));
  });
});

describe('open:kernel-channels – RTC auto-preferred', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEnsureDaemon.mockResolvedValue(); });

  test('auto-connects RTC when path is given and plugin is available', async () => {
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest
      .mockResolvedValueOnce({ channel_ref: 'ch', session_id: 's' })
      .mockResolvedValueOnce({ room_ref: 'room-1', room_id: 'json:notebook:x' });

    await run(['--notebook', 'nb.ipynb']);

    expect(mockRequest).toHaveBeenNthCalledWith(2, 'rtc:connect', expect.objectContaining({ notebookPath: 'nb.ipynb' }));
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ room_ref: 'room-1', rtc_connected: true }));
  });

  test('auto degrades to REST if rtc:connect fails', async () => {
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch' }).mockResolvedValueOnce({ error: 'no plugin' });
    await run(['--notebook', 'nb.ipynb']);
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ rtc_connected: false, rtc_error: 'no plugin' }));
  });

  test('--rtc off skips rtc:connect entirely', async () => {
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch' });
    await run(['--notebook', 'nb.ipynb', '--rtc', 'off']);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalledWith('rtc:connect', expect.anything());
  });

  test('--rtc on throws on connect failure', async () => {
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch' }).mockResolvedValueOnce({ error: 'boom' });
    await expect(run(['--notebook', 'nb.ipynb', '--rtc', 'on'])).rejects.toThrow('boom');
  });
});
