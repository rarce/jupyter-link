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

    mockReadStdinJson.mockResolvedValue({ path: 'fresh.ipynb' });
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

    mockReadStdinJson.mockResolvedValue({ path: 'julia.ipynb', kernel_name: 'julia-1.9' });
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

    mockReadStdinJson.mockResolvedValue({ path: 'demo.ipynb' });
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
