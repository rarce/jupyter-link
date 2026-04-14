import { describe, test, expect, vi, beforeEach } from 'vitest';
import { oclifConfig } from './_helpers.mjs';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p),
};
const D = { ensureDaemon: vi.fn().mockResolvedValue(), request: vi.fn() };

vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/daemonClient.mjs', () => D);

const { default: Update } = await import('../src/commands/cell/update.mjs');

describe('cell:update', () => {
  beforeEach(() => { vi.clearAllMocks(); D.ensureDaemon.mockResolvedValue(); });

  test('throws without notebook/room', async () => {
    await expect(new Update(['--code', 'a'], oclifConfig()).run()).rejects.toThrow('--notebook');
  });

  test('RTC path', async () => {
    D.request.mockResolvedValue({ ok: true });
    await new Update(['--room', 'r', '--cell-id', '1', '--code', 'x', '--outputs', '[]', '--execution-count', '2'], oclifConfig()).run();
    expect(D.request).toHaveBeenCalledWith('rtc:update-cell', expect.objectContaining({ room_ref: 'r', cell_id: 1 }));
    expect(C.ok).toHaveBeenCalled();
  });

  test('RTC error propagates', async () => {
    D.request.mockResolvedValue({ error: 'bad' });
    await expect(new Update(['--room', 'r'], oclifConfig()).run()).rejects.toThrow('bad');
  });

  test('REST updates by index', async () => {
    const cell = { source: 'old', outputs: [], metadata: {} };
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [cell] } }).mockResolvedValueOnce({});
    await new Update([
      '--notebook', 'n.ipynb', '--cell-id', '0',
      '--code', 'new',
      '--outputs', JSON.stringify([{ output_type: 'stream' }]),
      '--execution-count', '3',
      '--metadata', JSON.stringify({ role: 'x' }),
    ], oclifConfig()).run();
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
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells } }).mockResolvedValueOnce({});
    await new Update(['--notebook', 'n.ipynb', '--code', 's'], oclifConfig()).run();
    expect(cells[2].source).toBe('s');
  });

  test('REST throws if no agent cell found', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{ metadata: {} }] } });
    await expect(new Update(['--notebook', 'n.ipynb', '--code', 's'], oclifConfig()).run()).rejects.toThrow('No agent-managed cell');
  });

  test('REST rejects index out of range', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'notebook', content: { cells: [{}] } });
    await expect(new Update(['--notebook', 'n.ipynb', '--cell-id', '5', '--code', 'x'], oclifConfig()).run()).rejects.toThrow('out of range');
  });

  test('REST rejects non-notebook', async () => {
    C.httpJson.mockResolvedValueOnce({ type: 'file' });
    await expect(new Update(['--notebook', 'x.txt', '--cell-id', '0', '--code', 'x'], oclifConfig()).run()).rejects.toThrow('not a notebook');
  });
});
