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
  nowIso: () => '2026-04-12T10:00:00Z',
  validateNotebookPath: (p) => p,
}));

vi.mock('../src/lib/daemonClient.mjs', () => ({
  ensureDaemon: (...args) => mockEnsureDaemon(...args),
  request: (...args) => mockRequest(...args),
}));

const { default: RunCell } = await import('../src/commands/run/cell.mjs');

const run = (argv) => new RunCell(argv, oclifConfig()).run();

function nb(cells = []) {
  return { type: 'notebook', content: { nbformat: 4, nbformat_minor: 5, metadata: {}, cells } };
}

describe('run:cell', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEnsureDaemon.mockResolvedValue(); });

  test('throws if --notebook missing', async () => {
    await expect(run(['--ref', 'ch-1', '--code', 'x=1'])).rejects.toThrow('--notebook');
  });

  test('throws if --ref missing', async () => {
    await expect(run(['--notebook', 'nb.ipynb', '--code', 'x=1'])).rejects.toThrow('--ref');
  });

  test('throws if code is empty', async () => {
    await expect(run(['--notebook', 'nb.ipynb', '--ref', 'ch-1'])).rejects.toThrow(/code/);
  });

  test('full pipeline: insert + execute + collect + update', async () => {
    const outputs = [{ output_type: 'stream', name: 'stdout', text: '42\n' }];
    mockHttpJson
      .mockResolvedValueOnce(nb([]))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(nb([{ cell_type: 'code', source: 'print(42)', outputs: [], execution_count: null, metadata: {} }]))
      .mockResolvedValueOnce({});
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-123' })
      .mockResolvedValueOnce({ outputs, execution_count: 1, status: 'ok' });

    await run(['--notebook', 'demo.ipynb', '--ref', 'ch-abc', '--code', 'print(42)']);

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenNthCalledWith(1, 'exec', expect.objectContaining({ channel_ref: 'ch-abc', code: 'print(42)' }));
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'collect', expect.objectContaining({ channel_ref: 'ch-abc', parent_msg_id: 'msg-123', timeout_s: 60 }));
    expect(mockOk).toHaveBeenCalledWith({ cell_id: 0, status: 'ok', execution_count: 1, outputs });
    expect(mockHttpJson).toHaveBeenCalledTimes(4);
  });

  test('uses custom --timeout', async () => {
    mockHttpJson
      .mockResolvedValueOnce(nb([])).mockResolvedValueOnce({})
      .mockResolvedValueOnce(nb([{ cell_type: 'code', source: 'x=1', outputs: [], execution_count: null, metadata: {} }])).mockResolvedValueOnce({});
    mockRequest.mockResolvedValueOnce({ parent_msg_id: 'msg-1' }).mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' });
    await run(['--notebook', 'nb.ipynb', '--ref', 'ch-1', '--code', 'x=1', '--timeout', '120']);
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'collect', expect.objectContaining({ timeout_s: 120 }));
  });

  test('inserts cell at --index 0', async () => {
    const existing = { cell_type: 'code', source: 'existing', outputs: [], execution_count: 1, metadata: {} };
    mockHttpJson
      .mockResolvedValueOnce(nb([existing])).mockResolvedValueOnce({})
      .mockResolvedValueOnce(nb([{ cell_type: 'code', source: 'new', outputs: [], execution_count: null, metadata: {} }, existing])).mockResolvedValueOnce({});
    mockRequest.mockResolvedValueOnce({ parent_msg_id: 'm' }).mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' });
    await run(['--notebook', 'nb.ipynb', '--ref', 'ch-1', '--code', 'new', '--index', '0']);
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ cell_id: 0 }));
  });

  test('propagates execution error status', async () => {
    const errOuts = [{ output_type: 'error', ename: 'NameError', evalue: 'x', traceback: ['...'] }];
    mockHttpJson
      .mockResolvedValueOnce(nb([])).mockResolvedValueOnce({})
      .mockResolvedValueOnce(nb([{ cell_type: 'code', source: 'print(x)', outputs: [], execution_count: null, metadata: {} }])).mockResolvedValueOnce({});
    mockRequest.mockResolvedValueOnce({ parent_msg_id: 'm' }).mockResolvedValueOnce({ outputs: errOuts, execution_count: 2, status: 'error' });
    await run(['--notebook', 'nb.ipynb', '--ref', 'ch-1', '--code', 'print(x)']);
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', outputs: errOuts }));
  });

  test('throws if exec returns error', async () => {
    mockHttpJson.mockResolvedValueOnce(nb([])).mockResolvedValueOnce({});
    mockRequest.mockResolvedValueOnce({ error: 'channel not found' });
    await expect(run(['--notebook', 'nb.ipynb', '--ref', 'ch-1', '--code', 'x=1'])).rejects.toThrow('channel not found');
  });
});

describe('run:cell RTC path', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEnsureDaemon.mockResolvedValue(); });

  test('uses daemon rtc ops when --room is provided', async () => {
    const outputs = [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }];
    mockRequest
      .mockResolvedValueOnce({ cell_id: 3, index: 3, total_cells: 4 })
      .mockResolvedValueOnce({ parent_msg_id: 'msg-rtc' })
      .mockResolvedValueOnce({ outputs, execution_count: 5, status: 'ok' })
      .mockResolvedValueOnce({ ok: true, cell_id: 3 });
    await run(['--notebook', 'demo.ipynb', '--ref', 'ch-1', '--room', 'room-abc', '--code', 'print("hi")']);

    expect(mockHttpJson).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(4);
    expect(mockRequest).toHaveBeenNthCalledWith(1, 'rtc:insert-cell', expect.objectContaining({ room_ref: 'room-abc', source: 'print("hi")' }));
    expect(mockRequest).toHaveBeenNthCalledWith(4, 'rtc:update-cell', expect.objectContaining({ room_ref: 'room-abc', cell_id: 3, outputs, execution_count: 5 }));
    expect(mockOk).toHaveBeenCalledWith({ cell_id: 3, status: 'ok', execution_count: 5, outputs });
  });

  test('RTC path does not require --notebook when --room is given', async () => {
    mockRequest
      .mockResolvedValueOnce({ cell_id: 0, index: 0 })
      .mockResolvedValueOnce({ parent_msg_id: 'm' })
      .mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' })
      .mockResolvedValueOnce({ ok: true });
    await run(['--ref', 'ch-2', '--room', 'room-xyz', '--code', 'x=1']);
    expect(mockHttpJson).not.toHaveBeenCalled();
  });

  test('RTC path propagates insert error', async () => {
    mockRequest.mockResolvedValueOnce({ error: 'room connection is dead' });
    await expect(run(['--ref', 'ch-3', '--room', 'room-bad', '--code', 'x=1'])).rejects.toThrow('room connection is dead');
  });
});
