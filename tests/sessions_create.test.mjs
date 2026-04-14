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

const { default: SessionsCreate } = await import('../src/commands/sessions/create.mjs');
const run = (argv) => new SessionsCreate(argv, oclifConfig()).run();

describe('sessions:create', () => {
  beforeEach(() => vi.clearAllMocks());

  test('throws if --notebook missing', async () => {
    await expect(run([])).rejects.toThrow('--notebook');
  });

  test('returns existing session if one already exists', async () => {
    const existing = { id: 'sess-123', notebook: { path: 'demo.ipynb' }, kernel: { id: 'k', name: 'python3' } };
    mockHttpJson.mockResolvedValue([existing]);
    await run(['--notebook', 'demo.ipynb']);
    expect(mockHttpJson).toHaveBeenCalledTimes(1);
    expect(mockHttpJson).toHaveBeenCalledWith('GET', expect.stringContaining('/api/sessions'), 'test-tok');
    expect(mockOk).toHaveBeenCalledWith(existing);
  });

  test('creates new session when none exists', async () => {
    const newS = { id: 'sess-456', notebook: { path: 'new.ipynb' }, kernel: { id: 'k' } };
    mockHttpJson.mockResolvedValueOnce([]).mockResolvedValueOnce(newS);
    await run(['--notebook', 'new.ipynb']);
    expect(mockHttpJson).toHaveBeenCalledTimes(2);
    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.stringContaining('/api/sessions'), 'test-tok', {
      path: 'new.ipynb', name: 'new.ipynb', type: 'notebook', kernel: { name: 'python3' },
    });
    expect(mockOk).toHaveBeenCalledWith(newS);
  });

  test('uses custom --kernel-name', async () => {
    mockHttpJson.mockResolvedValueOnce([]).mockResolvedValueOnce({ id: 's1' });
    await run(['--notebook', 'julia.ipynb', '--kernel-name', 'julia-1.9']);
    expect(mockHttpJson).toHaveBeenNthCalledWith(2, 'POST', expect.any(String), 'test-tok',
      expect.objectContaining({ kernel: { name: 'julia-1.9' } }));
  });
});
