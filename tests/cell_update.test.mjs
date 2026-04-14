import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  readStdinJson: vi.fn(), httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p), validateKernelId: vi.fn((id) => id), assertHttpUrl: vi.fn((u) => new URL(u)), encodeNotebookPath: vi.fn((p) => encodeURIComponent(p)),
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };

vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);

const { default: Update } = await import('../src/commands/cell/update.mjs');

describe('cell:update', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without path/room_ref', async () => {
    C.readStdinJson.mockResolvedValue({ source: 'a' });
    await expect(new Update([], {}).run()).rejects.toThrow('path is required');
  });

  test('RTC path', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r', cell_id: 1, source: 'x', outputs: [], execution_count: 2 });
    D.request.mockResolvedValue({ ok: true });
    await new Update([], {}).run();
    expect(D.request).toHaveBeenCalledWith('rtc:update-cell', expect.objectContaining({ room_ref: 'r', cell_id: 1 }));
    expect(C.ok).toHaveBeenCalled();
  });

  test('RTC error propagates', async () => {
    C.readStdinJson.mockResolvedValue({ room_ref: 'r' });
    D.request.mockResolvedValue({ error: 'bad' });
    await expect(new Update([], {}).run()).rejects.toThrow('bad');
  });

  test('REST updates by index', async () => {
    const cell = { source: 'old', outputs: [], metadata: {} };
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb', cell_id: 0, source: 'new', outputs: [{ output_type: 'stream' }], execution_count: 3, metadata: { role: 'x' } });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [cell] } }).mockResolvedValueOnce({});
    await new Update([], {}).run();
    expect(cell.source).toBe('new');
    expect(cell.execution_count).toBe(3);
    expect(cell.metadata.agent).toEqual({ role: 'x' });
    expect(C.ok).toHaveBeenCalledWith({ ok: true });
  });

  test('REST finds latest agent cell when idx missing', async () => {
    const cells = [
      { metadata: { agent: { role: 'jupyter-driver' } } },
      { metadata: {} },
      { metadata: { agent: { role: 'jupyter-driver' } } },
    ];
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb', source: 's' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells } }).mockResolvedValueOnce({});
    await new Update([], {}).run();
    expect(cells[2].source).toBe('s');
  });

  test('REST throws if no agent cell found', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb', source: 's' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{ metadata: {} }] } });
    await expect(new Update([], {}).run()).rejects.toThrow('No agent-managed cell');
  });

  test('REST rejects index out of range', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'n.ipynb', cell_id: 5, source: 'x' });
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } });
    await expect(new Update([], {}).run()).rejects.toThrow('out of range');
  });

  test('REST rejects non-notebook', async () => {
    C.readStdinJson.mockResolvedValue({ path: 'x.txt', cell_id: 0, source: 'x' });
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Update([], {}).run()).rejects.toThrow('not a notebook');
  });
});
