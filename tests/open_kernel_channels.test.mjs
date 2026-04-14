import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockReadStdinJson = vi.fn();
const mockHttpJson = vi.fn();
const mockOk = vi.fn();
const mockGetConfig = vi.fn(() => ({ baseUrl: 'http://localhost:8888', token: 'test-tok', port: 32123 }));
const mockEnsureDaemon = vi.fn();
const mockRequest = vi.fn();

vi.mock('../src/lib/common.mjs', () => ({
  readStdinJson: (...args) => mockReadStdinJson(...args),
  httpJson: (...args) => mockHttpJson(...args),
  ok: (...args) => mockOk(...args),
  getConfig: (...args) => mockGetConfig(...args),
  assertNodeVersion: () => {},
  validateNotebookPath: (p) => p, validateKernelId: (id) => id, assertHttpUrl: (u) => new URL(u), encodeNotebookPath: (p) => encodeURIComponent(p),
}));

vi.mock('../src/lib/daemonClient.mjs', () => ({
  ensureDaemon: (...args) => mockEnsureDaemon(...args),
  request: (...args) => mockRequest(...args),
}));

const { default: OpenKernelChannels } = await import('../src/commands/open/kernel-channels.mjs');

describe('open:kernel-channels – auto-create session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureDaemon.mockResolvedValue();
  });

  test('creates session automatically when no session exists', async () => {
    const newSession = {
      id: 'sess-new',
      path: 'fresh.ipynb',
      notebook: { path: 'fresh.ipynb' },
      kernel: { id: 'kern-new', name: 'python3' },
    };

    mockReadStdinJson.mockResolvedValue({ path: 'fresh.ipynb', rtc: false });
    mockHttpJson
      .mockResolvedValueOnce([])           // GET /api/sessions — empty
      .mockResolvedValueOnce(newSession);   // POST /api/sessions — create
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-new', session_id: 'sid-1' });

    const cmd = new OpenKernelChannels([], {});
    await cmd.run();

    // Should have created a session via POST
    expect(mockHttpJson).toHaveBeenCalledTimes(2);
    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.stringContaining('/api/sessions'), 'test-tok', {
      path: 'fresh.ipynb', name: 'fresh.ipynb', type: 'notebook', kernel: { name: 'python3' },
    });

    // Should have opened the channel with the new kernel ID
    expect(mockRequest).toHaveBeenCalledWith('open', {
      baseUrl: 'http://localhost:8888', token: 'test-tok', kernelId: 'kern-new',
    });
    expect(mockOk).toHaveBeenCalledWith({ channel_ref: 'ch-new', session_id: 'sid-1' });
  });

  test('uses custom kernel_name when auto-creating session', async () => {
    const newSession = {
      id: 'sess-julia', notebook: { path: 'julia.ipynb' },
      kernel: { id: 'kern-julia', name: 'julia-1.9' },
    };

    mockReadStdinJson.mockResolvedValue({ path: 'julia.ipynb', kernel_name: 'julia-1.9', rtc: false });
    mockHttpJson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(newSession);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-j' });

    const cmd = new OpenKernelChannels([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.any(String), expect.any(String),
      expect.objectContaining({ kernel: { name: 'julia-1.9' } })
    );
  });

  test('uses existing session when one is found (no auto-create)', async () => {
    const existingSession = {
      id: 'sess-existing',
      notebook: { path: 'demo.ipynb' },
      kernel: { id: 'kern-existing', name: 'python3' },
    };

    mockReadStdinJson.mockResolvedValue({ path: 'demo.ipynb', rtc: false });
    mockHttpJson.mockResolvedValueOnce([existingSession]); // GET returns existing session
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-e', session_id: 'sid-e' });

    const cmd = new OpenKernelChannels([], {});
    await cmd.run();

    // Should NOT have called POST
    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('open', expect.objectContaining({ kernelId: 'kern-existing' }));
  });

  test('uses kernel_id directly without session lookup', async () => {
    mockReadStdinJson.mockResolvedValue({ kernel_id: 'direct-kern' });
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch-d' });

    const cmd = new OpenKernelChannels([], {});
    await cmd.run();

    // Should NOT have called httpJson at all (no session lookup)
    expect(mockHttpJson).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith('open', expect.objectContaining({ kernelId: 'direct-kern' }));
  });
});

describe('open:kernel-channels – RTC auto-preferred', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEnsureDaemon.mockResolvedValue(); });

  test('auto-connects RTC when path is given and plugin is available', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb' }); // rtc undefined → auto
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest
      .mockResolvedValueOnce({ channel_ref: 'ch', session_id: 's' })
      .mockResolvedValueOnce({ room_ref: 'room-1', room_id: 'json:notebook:x' });

    await new OpenKernelChannels([], {}).run();

    expect(mockRequest).toHaveBeenNthCalledWith(2, 'rtc:connect', expect.objectContaining({ notebookPath: 'nb.ipynb' }));
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ room_ref: 'room-1', rtc_connected: true }));
  });

  test('auto degrades to REST if rtc:connect fails', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb' });
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest
      .mockResolvedValueOnce({ channel_ref: 'ch' })
      .mockResolvedValueOnce({ error: 'no plugin' });

    await new OpenKernelChannels([], {}).run();

    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ rtc_connected: false, rtc_error: 'no plugin' }));
  });

  test('rtc:false skips rtc:connect entirely', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', rtc: false });
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest.mockResolvedValueOnce({ channel_ref: 'ch' });

    await new OpenKernelChannels([], {}).run();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalledWith('rtc:connect', expect.anything());
  });

  test('rtc:true throws on connect failure', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', rtc: true });
    mockHttpJson.mockResolvedValueOnce([{ notebook: { path: 'nb.ipynb' }, kernel: { id: 'k' } }]);
    mockRequest
      .mockResolvedValueOnce({ channel_ref: 'ch' })
      .mockResolvedValueOnce({ error: 'boom' });

    await expect(new OpenKernelChannels([], {}).run()).rejects.toThrow('boom');
  });
});
