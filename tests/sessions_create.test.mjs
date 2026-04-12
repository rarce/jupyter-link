import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock common.mjs — we intercept the I/O and HTTP functions
const mockReadStdinJson = vi.fn();
const mockHttpJson = vi.fn();
const mockOk = vi.fn();
const mockGetConfig = vi.fn(() => ({ baseUrl: 'http://localhost:8888', token: 'test-tok', port: 32123 }));

vi.mock('../src/lib/common.mjs', () => ({
  readStdinJson: (...args) => mockReadStdinJson(...args),
  httpJson: (...args) => mockHttpJson(...args),
  ok: (...args) => mockOk(...args),
  getConfig: (...args) => mockGetConfig(...args),
  assertNodeVersion: () => {},
  nowIso: () => '2026-04-12T10:00:00Z',
}));

// Import after mocks are set up
const { default: SessionsCreate } = await import('../src/commands/sessions/create.mjs');

describe('sessions:create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws if path is missing', async () => {
    mockReadStdinJson.mockResolvedValue({});
    const cmd = new SessionsCreate([], {} );
    await expect(cmd.run()).rejects.toThrow('path is required');
  });

  test('returns existing session if one already exists', async () => {
    const existingSession = {
      id: 'sess-123', path: 'demo.ipynb',
      notebook: { path: 'demo.ipynb' },
      kernel: { id: 'kern-abc', name: 'python3' },
    };
    mockReadStdinJson.mockResolvedValue({ path: 'demo.ipynb' });
    mockHttpJson.mockResolvedValue([existingSession]); // GET /api/sessions

    const cmd = new SessionsCreate([], {});
    await cmd.run();

    // Should only have called GET /api/sessions, not POST
    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockHttpJson).toHaveBeenCalledWith('GET', expect.stringContaining('/api/sessions'), 'test-tok');
    expect(mockOk).toHaveBeenCalledWith(existingSession);
  });

  test('creates new session when none exists', async () => {
    const newSession = {
      id: 'sess-456', path: 'new.ipynb',
      notebook: { path: 'new.ipynb' },
      kernel: { id: 'kern-def', name: 'python3' },
    };
    mockReadStdinJson.mockResolvedValue({ path: 'new.ipynb' });
    mockHttpJson
      .mockResolvedValueOnce([]) // GET /api/sessions — empty
      .mockResolvedValueOnce(newSession); // POST /api/sessions

    const cmd = new SessionsCreate([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenCalledTimes(2);
    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.stringContaining('/api/sessions'), 'test-tok', {
      path: 'new.ipynb', name: 'new.ipynb', type: 'notebook', kernel: { name: 'python3' },
    });
    expect(mockOk).toHaveBeenCalledWith(newSession);
  });

  test('uses custom kernel_name', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'julia.ipynb', kernel_name: 'julia-1.9' });
    mockHttpJson
      .mockResolvedValueOnce([]) // no sessions
      .mockResolvedValueOnce({ id: 's1', kernel: { name: 'julia-1.9' } });

    const cmd = new SessionsCreate([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.any(String), 'test-tok',
      expect.objectContaining({ kernel: { name: 'julia-1.9' } })
    );
  });

  test('accepts fallback "notebook" param', async () => {
    mockReadStdinJson.mockResolvedValue({ notebook: 'alt.ipynb' });
    mockHttpJson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 's2' });

    const cmd = new SessionsCreate([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.any(String), 'test-tok',
      expect.objectContaining({ path: 'alt.ipynb' })
    );
  });
});
