import { describe, test, expect, vi, beforeEach } from 'vitest';

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
  validateNotebookPath: (p) => p, validateKernelId: (id) => id, assertHttpUrl: (u) => new URL(u), encodeNotebookPath: (p) => encodeURIComponent(p),
}));

const { default: ContentsCreate } = await import('../src/commands/contents/create.mjs');

describe('contents:create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws if path is missing', async () => {
    mockReadStdinJson.mockResolvedValue({});
    const cmd = new ContentsCreate([], {});
    await expect(cmd.run()).rejects.toThrow('path is required');
  });

  test('returns created:false if notebook already exists', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'existing.ipynb' });
    mockHttpJson.mockResolvedValue({ type: 'notebook', name: 'existing.ipynb' });

    const cmd = new ContentsCreate([], {});
    await cmd.run();

    // Should only have called GET, not PUT
    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockHttpJson).toHaveBeenCalledWith('GET', expect.stringContaining('/api/contents/existing.ipynb'), 'test-tok');
    expect(mockOk).toHaveBeenCalledWith({ ok: true, created: false, path: 'existing.ipynb' });
  });

  test('creates new notebook when path does not exist', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'new.ipynb' });
    // GET throws 404
    mockHttpJson
      .mockRejectedValueOnce(new Error('GET /api/contents/new.ipynb -> 404'))
      .mockResolvedValueOnce({}); // PUT succeeds

    const cmd = new ContentsCreate([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenCalledTimes(2);
    // Verify PUT call has proper nbformat v4 structure
    const putCall = mockHttpJson.mock.calls[1];
    expect(putCall[0]).toBe('PUT');
    expect(putCall[3]).toEqual({
      type: 'notebook', format: 'json',
      content: {
        nbformat: 4, nbformat_minor: 5,
        metadata: {
          kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
          language_info: { name: 'python' },
        },
        cells: [],
      },
    });
    expect(mockOk).toHaveBeenCalledWith({ ok: true, created: true, path: 'new.ipynb' });
  });

  test('uses custom kernel_name and language', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'r.ipynb', kernel_name: 'ir', language: 'R', display_name: 'R 4.3' });
    mockHttpJson
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({});

    const cmd = new ContentsCreate([], {});
    await cmd.run();

    const putBody = mockHttpJson.mock.calls[1][3];
    expect(putBody.content.metadata.kernelspec).toEqual({
      display_name: 'R 4.3', language: 'R', name: 'ir',
    });
    expect(putBody.content.metadata.language_info).toEqual({ name: 'R' });
  });

  test('defaults language to python for python3 kernel', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'py.ipynb' });
    mockHttpJson
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({});

    const cmd = new ContentsCreate([], {});
    await cmd.run();

    const putBody = mockHttpJson.mock.calls[1][3];
    expect(putBody.content.metadata.language_info.name).toBe('python');
    expect(putBody.content.metadata.kernelspec.language).toBe('python');
  });

  test('accepts fallback "notebook" param', async () => {
    mockReadStdinJson.mockResolvedValue({ notebook: 'alt.ipynb' });
    mockHttpJson
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({});

    const cmd = new ContentsCreate([], {});
    await cmd.run();

    expect(mockHttpJson).toHaveBeenNthCalledWith(1, 'GET', expect.stringContaining('alt.ipynb'), 'test-tok');
    expect(mockOk).toHaveBeenCalledWith({ ok: true, created: true, path: 'alt.ipynb' });
  });
});
