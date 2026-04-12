import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { YNotebook } from '@jupyter/ydoc';

class FakeWS {
  constructor() { this.readyState = 0; this.sent = []; this._h = {}; FakeWS.last = this; }
  on(t, fn) { this._h[t] = fn; }
  send(d) { this.sent.push(d); }
  close() { if (this._h.close) this._h.close(); }
  _open() { this.readyState = 1; if (this._h.open) this._h.open(); }
  _msg(obj) { if (this._h.message) this._h.message(Buffer.from(JSON.stringify(obj))); }
}

let origWS;
beforeEach(() => { origWS = globalThis.WebSocket; globalThis.WebSocket = FakeWS; });
afterEach(() => { globalThis.WebSocket = origWS; });

const d = await import('../scripts/daemon.mjs');

function resetState() { d.channels.clear(); d.rooms.clear(); }

describe('daemon handlers: kernel channels', () => {
  beforeEach(() => resetState());

  test('wsUrlFor builds wss for https base', () => {
    const u = d.wsUrlFor('https://x.example/lab/', 'tok', 'k1', 's1');
    expect(u).toMatch(/^wss:\/\/x\.example\/lab\/api\/kernels\/k1\/channels\?/);
    expect(u).toContain('token=tok');
    expect(u).toContain('session_id=s1');
  });

  test('handleOpen requires baseUrl and kernelId', () => {
    expect(() => d.handleOpen({})).toThrow('required');
  });

  test('handleOpen creates a channel', () => {
    const res = d.handleOpen({ baseUrl: 'http://h', token: 't', kernelId: 'k1' });
    expect(res.channel_ref).toMatch(/^ch-/);
    expect(res.session_id).toBeTruthy();
    expect(d.channels.size).toBe(1);
  });

  test('handleExec throws on unknown channel', () => {
    expect(() => d.handleExec({ channel_ref: 'nope', code: 'x' })).toThrow('unknown channel_ref');
  });

  test('handleExec throws if not ready', () => {
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    expect(() => d.handleExec({ channel_ref: r.channel_ref, code: 'x' })).toThrow('not ready');
  });

  test('handleExec on dead channel throws', () => {
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    d.channels.get(r.channel_ref).dead = true;
    expect(() => d.handleExec({ channel_ref: r.channel_ref, code: 'x' })).toThrow('closed or errored');
  });

  test('exec + collect full flow via WS messages', async () => {
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    FakeWS.last._open();
    const exec = d.handleExec({ channel_ref: r.channel_ref, code: 'print(1)' });
    const pid = exec.parent_msg_id;
    // simulate iopub stream + status idle + shell reply
    FakeWS.last._msg({
      channel: 'iopub', parent_header: { msg_id: pid },
      header: { msg_type: 'stream' }, content: { name: 'stdout', text: 'hi\n' },
    });
    FakeWS.last._msg({
      channel: 'iopub', parent_header: { msg_id: pid },
      header: { msg_type: 'status' }, content: { execution_state: 'idle' },
    });
    FakeWS.last._msg({
      channel: 'shell', parent_header: { msg_id: pid },
      header: { msg_type: 'execute_reply' }, content: { status: 'ok', execution_count: 7 },
    });
    const col = await d.handleCollect({ channel_ref: r.channel_ref, parent_msg_id: pid, timeout_s: 1 });
    expect(col.status).toBe('ok');
    expect(col.execution_count).toBe(7);
    expect(col.outputs.length).toBeGreaterThan(0);
  });

  test('collect times out', async () => {
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    FakeWS.last._open();
    const exec = d.handleExec({ channel_ref: r.channel_ref, code: 'x' });
    const col = await d.handleCollect({ channel_ref: r.channel_ref, parent_msg_id: exec.parent_msg_id, timeout_s: 0.05 });
    expect(col.status).toBe('timeout');
  });

  test('collect unknown channel/parent', async () => {
    await expect(d.handleCollect({ channel_ref: 'x', parent_msg_id: 'y' })).rejects.toThrow('unknown channel_ref');
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    await expect(d.handleCollect({ channel_ref: r.channel_ref, parent_msg_id: 'nope' })).rejects.toThrow('unknown parent_msg_id');
  });

  test('handleClose + handleList', () => {
    const r = d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    expect(d.handleList().channels).toHaveLength(1);
    expect(d.handleClose({ channel_ref: r.channel_ref })).toEqual({ ok: true });
    expect(d.handleList().channels).toHaveLength(0);
    expect(d.handleClose({ channel_ref: 'missing' })).toEqual({ ok: true });
  });

  test('ws message ignores bad json and unknown parent', () => {
    d.handleOpen({ baseUrl: 'http://h', kernelId: 'k' });
    const ws = FakeWS.last;
    ws._h.message(Buffer.from('not-json'));
    ws._msg({ channel: 'iopub', header: {} }); // no parent_header
    ws._msg({ channel: 'iopub', parent_header: { msg_id: 'unknown' }, header: {} });
    // ws close/error don't throw
    ws._h.close();
    expect(d.channels.size).toBe(1); // state remains, just marked dead
  });
});

function makeFakeRoom() {
  const notebook = new YNotebook();
  const awareness = { getStates: () => new Map([[1, { user: { name: 'me', color: '#fff' } }]]) };
  const handle = { notebook, awareness, synced: true, dead: false, destroy: vi.fn(function () { this.dead = true; }) };
  return { handle, roomId: 'room-id', path: 'n.ipynb', baseUrl: 'http://h', fileId: 'fid' };
}

describe('daemon handlers: RTC', () => {
  beforeEach(() => resetState());

  test('rtc:disconnect unknown returns ok', () => {
    expect(d.handleRtcDisconnect({ room_ref: 'x' })).toEqual({ ok: true });
  });

  test('rtc:disconnect destroys and deletes', () => {
    const st = makeFakeRoom();
    d.rooms.set('r1', st);
    d.handleRtcDisconnect({ room_ref: 'r1' });
    expect(st.handle.destroy).toHaveBeenCalled();
    expect(d.rooms.has('r1')).toBe(false);
  });

  test('rtc:status of specific room', () => {
    const st = makeFakeRoom();
    d.rooms.set('r1', st);
    const res = d.handleRtcStatus({ room_ref: 'r1' });
    expect(res.room_id).toBe('room-id');
    expect(res.collaborators).toHaveLength(1);
  });

  test('rtc:status unknown throws', () => {
    expect(() => d.handleRtcStatus({ room_ref: 'nope' })).toThrow('unknown room_ref');
  });

  test('rtc:status lists all rooms when no ref', () => {
    d.rooms.set('r1', makeFakeRoom());
    d.rooms.set('r2', makeFakeRoom());
    const res = d.handleRtcStatus({});
    expect(res.rooms).toHaveLength(2);
  });

  test('rtc:insert-cell appends', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    const res = d.handleRtcInsertCell({ room_ref: 'r', source: 'print(1)' });
    expect(res.cell_id).toBe(0);
    expect(st.handle.notebook.cells.length).toBe(1);
  });

  test('rtc:insert-cell at index', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    const res = d.handleRtcInsertCell({ room_ref: 'r', index: 0, source: 'b' });
    expect(res.cell_id).toBe(0);
    expect(st.handle.notebook.cells.length).toBe(2);
  });

  test('rtc:insert-cell position=start', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    const res = d.handleRtcInsertCell({ room_ref: 'r', position: 'start', source: 'b' });
    expect(res.cell_id).toBe(0);
  });

  test('rtc:insert-cell unknown room throws', () => {
    expect(() => d.handleRtcInsertCell({ room_ref: 'x' })).toThrow('unknown room_ref');
  });

  test('rtc:insert-cell on dead room throws', () => {
    const st = makeFakeRoom();
    st.handle.dead = true;
    d.rooms.set('r', st);
    expect(() => d.handleRtcInsertCell({ room_ref: 'r' })).toThrow('dead');
  });

  test('rtc:update-cell updates source/outputs/execution_count/metadata', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'old', metadata: { role: 'jupyter-driver' } });
    const res = d.handleRtcUpdateCell({
      room_ref: 'r', cell_id: 0,
      source: 'new', outputs: [{ output_type: 'stream', name: 'stdout', text: 'hi' }], execution_count: 3, metadata: { role: 'jupyter-driver', x: 1 },
    });
    expect(res.ok).toBe(true);
  });

  test('rtc:update-cell finds latest agent cell', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    d.handleRtcInsertCell({ room_ref: 'r', source: 'b' });
    const res = d.handleRtcUpdateCell({ room_ref: 'r', source: 'updated' });
    expect(res.cell_id).toBe(1);
  });

  test('rtc:update-cell out of range', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    expect(() => d.handleRtcUpdateCell({ room_ref: 'r', cell_id: 5, source: 'x' })).toThrow('out of range');
  });

  test('rtc:update-cell no agent cell', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    expect(() => d.handleRtcUpdateCell({ room_ref: 'r', source: 'x' })).toThrow('No agent-managed cell');
  });

  test('rtc:read-notebook summary', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    const res = d.handleRtcReadNotebook({ room_ref: 'r' });
    expect(res.total_cells).toBe(1);
    expect(res.cells[0]).toHaveProperty('source_preview');
  });

  test('rtc:read-notebook by indices array', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    d.handleRtcInsertCell({ room_ref: 'r', source: 'b' });
    const res = d.handleRtcReadNotebook({ room_ref: 'r', cells: [0, 1] });
    expect(res.cells).toHaveLength(2);
    expect(res.cells[0].source).toBe('a');
  });

  test('rtc:read-notebook by cell_id + out of range + range', () => {
    const st = makeFakeRoom();
    d.rooms.set('r', st);
    d.handleRtcInsertCell({ room_ref: 'r', source: 'a' });
    expect(d.handleRtcReadNotebook({ room_ref: 'r', cell_id: 0 }).cells[0].source).toBe('a');
    expect(d.handleRtcReadNotebook({ room_ref: 'r', cell_id: 9 }).cells[0]).toHaveProperty('error');
    expect(d.handleRtcReadNotebook({ room_ref: 'r', range: [0, 10] }).cells).toHaveLength(1);
  });

  test('rtc:detect requires baseUrl', async () => {
    await expect(d.handleRtcDetect({})).rejects.toThrow('baseUrl is required');
  });

  test('rtc:connect requires baseUrl+notebookPath', async () => {
    await expect(d.handleRtcConnect({})).rejects.toThrow('required');
  });
});

describe('dispatch', () => {
  beforeEach(() => resetState());

  test('unknown op', () => {
    expect(d.dispatch({ op: 'xxx' })).toEqual({ error: 'unknown op' });
  });

  test('ping', () => {
    expect(d.dispatch({ op: 'ping' })).toEqual({ ok: true });
  });

  test('routes to handleList', () => {
    expect(d.dispatch({ op: 'list' })).toEqual({ channels: [] });
  });

  test('routes to rtc:status', () => {
    expect(d.dispatch({ op: 'rtc:status', args: {} })).toEqual({ rooms: [] });
  });
});
