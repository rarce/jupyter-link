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
  nowIso: () => '2026-04-12T10:00:00Z',
}));

vi.mock('../src/lib/daemonClient.mjs', () => ({
  ensureDaemon: (...args) => mockEnsureDaemon(...args),
  request: (...args) => mockRequest(...args),
}));

const { default: RunCell } = await import('../src/commands/run/cell.mjs');

function makeNotebookResponse(cells = []) {
  return {
    type: 'notebook',
    content: {
      nbformat: 4, nbformat_minor: 5,
      metadata: { kernelspec: { name: 'python3' } },
      cells,
    },
  };
}

describe('run:cell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureDaemon.mockResolvedValue();
  });

  test('throws if path is missing', async () => {
    mockReadStdinJson.mockResolvedValue({ channel_ref: 'ch-1', code: 'x=1' });
    const cmd = new RunCell([], {});
    await expect(cmd.run()).rejects.toThrow('path is required');
  });

  test('throws if channel_ref is missing', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', code: 'x=1' });
    const cmd = new RunCell([], {});
    await expect(cmd.run()).rejects.toThrow('channel_ref is required');
  });

  test('throws if code is empty', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', channel_ref: 'ch-1' });
    const cmd = new RunCell([], {});
    await expect(cmd.run()).rejects.toThrow('code is required');
  });

  test('full pipeline: insert + execute + collect + update', async () => {
    const outputs = [{ output_type: 'stream', name: 'stdout', text: '42\n' }];

    mockReadStdinJson.mockResolvedValue({ path: 'demo.ipynb', channel_ref: 'ch-abc', code: 'print(42)' });

    // 1. GET notebook for insert
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([]))  // GET for insert
      .mockResolvedValueOnce({})  // PUT after insert
      .mockResolvedValueOnce(makeNotebookResponse([     // GET for update (cell was inserted)
        { cell_type: 'code', source: 'print(42)', outputs: [], execution_count: null, metadata: { agent: { role: 'jupyter-driver' } } },
      ]))
      .mockResolvedValueOnce({});  // PUT after update

    // 2. execute:code via daemon
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-123' })   // exec
      .mockResolvedValueOnce({ outputs, execution_count: 1, status: 'ok' });  // collect

    const cmd = new RunCell([], {});
    await cmd.run();

    // Verify daemon calls
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenNthCalledWith(1, 'exec', expect.objectContaining({
      channel_ref: 'ch-abc', code: 'print(42)',
    }));
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'collect', expect.objectContaining({
      channel_ref: 'ch-abc', parent_msg_id: 'msg-123', timeout_s: 60,
    }));

    // Verify final ok() output
    expect(mockOk).toHaveBeenCalledWith({
      cell_id: 0, status: 'ok', execution_count: 1, outputs,
    });

    // Verify notebook was updated (4 httpJson calls: GET, PUT, GET, PUT)
    expect(mockHttpJson).toHaveBeenCalledTimes(4);
  });

  test('uses custom timeout_s', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', channel_ref: 'ch-1', code: 'x=1', timeout_s: 120 });
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([]))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(makeNotebookResponse([{ cell_type: 'code', source: 'x=1', outputs: [], execution_count: null, metadata: {} }]))
      .mockResolvedValueOnce({});
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-1' })
      .mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' });

    const cmd = new RunCell([], {});
    await cmd.run();

    expect(mockRequest).toHaveBeenNthCalledWith(2, 'collect', expect.objectContaining({ timeout_s: 120 }));
  });

  test('inserts cell at specified index', async () => {
    const existingCell = { cell_type: 'code', source: 'existing', outputs: [], execution_count: 1, metadata: {} };

    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', channel_ref: 'ch-1', code: 'new_code', index: 0 });
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([existingCell]))  // GET — 1 cell
      .mockResolvedValueOnce({})  // PUT after insert
      .mockResolvedValueOnce(makeNotebookResponse([
        { cell_type: 'code', source: 'new_code', outputs: [], execution_count: null, metadata: {} },
        existingCell,
      ]))
      .mockResolvedValueOnce({});
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-1' })
      .mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' });

    const cmd = new RunCell([], {});
    await cmd.run();

    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ cell_id: 0 }));
  });

  test('propagates execution error status', async () => {
    const errorOutputs = [{ output_type: 'error', ename: 'NameError', evalue: 'x not defined', traceback: ['...'] }];

    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', channel_ref: 'ch-1', code: 'print(x)' });
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([]))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(makeNotebookResponse([
        { cell_type: 'code', source: 'print(x)', outputs: [], execution_count: null, metadata: {} },
      ]))
      .mockResolvedValueOnce({});
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-err' })
      .mockResolvedValueOnce({ outputs: errorOutputs, execution_count: 2, status: 'error' });

    const cmd = new RunCell([], {});
    await cmd.run();

    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      outputs: errorOutputs,
    }));
  });

  test('throws if exec returns error', async () => {
    mockReadStdinJson.mockResolvedValue({ path: 'nb.ipynb', channel_ref: 'ch-1', code: 'x=1' });
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([]))
      .mockResolvedValueOnce({});
    mockRequest.mockResolvedValueOnce({ error: 'channel not found' });

    const cmd = new RunCell([], {});
    await expect(cmd.run()).rejects.toThrow('channel not found');
  });

  test('accepts fallback param aliases (notebook, ref, source)', async () => {
    mockReadStdinJson.mockResolvedValue({ notebook: 'alt.ipynb', ref: 'ch-2', source: 'y=2' });
    mockHttpJson
      .mockResolvedValueOnce(makeNotebookResponse([]))
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(makeNotebookResponse([{ cell_type: 'code', source: 'y=2', outputs: [], execution_count: null, metadata: {} }]))
      .mockResolvedValueOnce({});
    mockRequest
      .mockResolvedValueOnce({ parent_msg_id: 'msg-a' })
      .mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' });

    const cmd = new RunCell([], {});
    await cmd.run();

    // Should succeed without throwing
    expect(mockOk).toHaveBeenCalled();
  });
});

describe('run:cell RTC path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureDaemon.mockResolvedValue();
  });

  test('uses daemon rtc ops when room_ref is provided', async () => {
    const outputs = [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }];

    mockReadStdinJson.mockResolvedValue({
      room_ref: 'room-abc',
      channel_ref: 'ch-1',
      code: 'print("hi")',
      path: 'demo.ipynb',
    });

    mockRequest
      .mockResolvedValueOnce({ cell_id: 3, index: 3, total_cells: 4 })    // rtc:insert-cell
      .mockResolvedValueOnce({ parent_msg_id: 'msg-rtc' })                 // exec
      .mockResolvedValueOnce({ outputs, execution_count: 5, status: 'ok' }) // collect
      .mockResolvedValueOnce({ ok: true, cell_id: 3 });                    // rtc:update-cell

    const cmd = new RunCell([], {});
    await cmd.run();

    // Should NOT have called httpJson at all (no REST)
    expect(mockHttpJson).not.toHaveBeenCalled();

    // Should have called daemon ops
    expect(mockRequest).toHaveBeenCalledTimes(4);
    expect(mockRequest).toHaveBeenNthCalledWith(1, 'rtc:insert-cell', expect.objectContaining({
      room_ref: 'room-abc',
      source: 'print("hi")',
    }));
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'exec', expect.objectContaining({
      channel_ref: 'ch-1',
    }));
    expect(mockRequest).toHaveBeenNthCalledWith(3, 'collect', expect.objectContaining({
      parent_msg_id: 'msg-rtc',
    }));
    expect(mockRequest).toHaveBeenNthCalledWith(4, 'rtc:update-cell', expect.objectContaining({
      room_ref: 'room-abc',
      cell_id: 3,
      outputs,
      execution_count: 5,
    }));

    expect(mockOk).toHaveBeenCalledWith({
      cell_id: 3, status: 'ok', execution_count: 5, outputs,
    });
  });

  test('RTC path does not require path when room_ref is given', async () => {
    mockReadStdinJson.mockResolvedValue({
      room_ref: 'room-xyz',
      channel_ref: 'ch-2',
      code: 'x=1',
    });

    mockRequest
      .mockResolvedValueOnce({ cell_id: 0, index: 0, total_cells: 1 })
      .mockResolvedValueOnce({ parent_msg_id: 'msg-1' })
      .mockResolvedValueOnce({ outputs: [], execution_count: 1, status: 'ok' })
      .mockResolvedValueOnce({ ok: true, cell_id: 0 });

    const cmd = new RunCell([], {});
    await cmd.run();

    expect(mockHttpJson).not.toHaveBeenCalled();
    expect(mockOk).toHaveBeenCalledWith(expect.objectContaining({ cell_id: 0, status: 'ok' }));
  });

  test('RTC path propagates insert error', async () => {
    mockReadStdinJson.mockResolvedValue({
      room_ref: 'room-bad',
      channel_ref: 'ch-3',
      code: 'x=1',
    });

    mockRequest.mockResolvedValueOnce({ error: 'room connection is dead' });

    const cmd = new RunCell([], {});
    await expect(cmd.run()).rejects.toThrow('room connection is dead');
  });
});
