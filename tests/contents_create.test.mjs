import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const mockHttpJson = vi.fn();
const mockOk = vi.fn();
const mockGetConfig = vi.fn(() => ({ baseUrl: 'http://localhost:8888', token: 'test-tok', port: 32123 }));

vi.mock('../src/lib/common.mjs', () => ({
  httpJson: (...args) => mockHttpJson(...args),
  ok: (...args) => mockOk(...args),
  getConfig: (...args) => mockGetConfig(...args),
  assertNodeVersion: () => {},
  validateNotebookPath: (p) => p,
}));

const { default: ContentsCreate } = await import('../src/commands/contents/create.mjs');
const run = (argv) => new ContentsCreate(argv, oclifConfig()).run();

describe('contents:create', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws if --notebook missing', async () => {
    await expect(run([])).rejects.toThrow('--notebook');
  });

  test('returns created:false if notebook already exists', async () => {
    mockHttpJson.mockResolvedValue({ type: 'notebook', name: 'existing.ipynb' });
    await run(['--notebook', 'existing.ipynb']);
    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockHttpJson).toHaveBeenCalledWith('GET', expect.stringContaining('/api/contents/existing.ipynb'), 'test-tok');
    expect(mockOk).toHaveBeenCalledWith({ ok: true, created: false, path: 'existing.ipynb' });
  });

  test('creates new notebook when path does not exist', async () => {
    mockHttpJson
      .mockRejectedValueOnce(new Error('GET /api/contents/new.ipynb -> 404'))
      .mockResolvedValueOnce({});
    await run(['--notebook', 'new.ipynb']);
    expect(mockHttpJson).toHaveBeenCalledTimes(2);
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

  test('uses custom --kernel-name, --language, --display-name', async () => {
    mockHttpJson.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({});
    await run(['--notebook', 'r.ipynb', '--kernel-name', 'ir', '--language', 'R', '--display-name', 'R 4.3']);
    const putBody = mockHttpJson.mock.calls[1][3];
    expect(putBody.content.metadata.kernelspec).toEqual({ display_name: 'R 4.3', language: 'R', name: 'ir' });
    expect(putBody.content.metadata.language_info).toEqual({ name: 'R' });
  });

  test('defaults language to python for python3 kernel', async () => {
    mockHttpJson.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({});
    await run(['--notebook', 'py.ipynb']);
    const putBody = mockHttpJson.mock.calls[1][3];
    expect(putBody.content.metadata.language_info.name).toBe('python');
    expect(putBody.content.metadata.kernelspec.language).toBe('python');
  });
});
