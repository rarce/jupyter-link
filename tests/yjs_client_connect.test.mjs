import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MSG_SYNC = 0;

class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.binaryType = 'arraybuffer';
    this.sent = [];
    this._listeners = { open: [], message: [], close: [], error: [] };
    FakeWS.last = this;
  }
  addEventListener(type, fn) { this._listeners[type].push(fn); }
  send(buf) { this.sent.push(buf); }
  close() { this.readyState = 3; this._fire('close', {}); }
  _fire(type, ev) { for (const fn of this._listeners[type]) fn(ev); }
  _open() { this.readyState = 1; this._fire('open', {}); }
  _recv(buf) { this._fire('message', { data: buf.buffer ? buf.buffer : buf }); }
}

let origWS;
beforeEach(() => {
  origWS = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  FakeWS.last = null;
});
afterEach(() => { globalThis.WebSocket = origWS; });

const { connectRoom, notebookToJSON } = await import('../src/lib/yjsClient.mjs');

function makeSyncStep2Message(serverDoc) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep2(enc, serverDoc);
  return encoding.toUint8Array(enc);
}

describe('connectRoom', () => {
  test('rejects if WebSocket is not available', async () => {
    globalThis.WebSocket = undefined;
    await expect(connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r' })).rejects.toThrow('WebSocket API not available');
  });

  test('resolves handle after SyncStep2', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'json:notebook:x', syncTimeoutMs: 5000 });
    const ws = FakeWS.last;
    ws._open();
    // Client should have sent SyncStep1 + awareness update after open
    expect(ws.sent.length).toBeGreaterThanOrEqual(1);
    // Server sends SyncStep2
    const serverDoc = new Y.Doc();
    ws._recv(makeSyncStep2Message(serverDoc));
    const handle = await p;
    expect(handle.synced).toBe(true);
    expect(handle.roomId).toBe('json:notebook:x');
    handle.destroy();
    expect(handle.dead).toBe(true);
  });

  test('syncTimeout resolves after timeout', async () => {
    vi.useFakeTimers();
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 100 });
    FakeWS.last._open();
    vi.advanceTimersByTime(150);
    const handle = await p;
    expect(handle.synced).toBe(true);
    handle.destroy();
    vi.useRealTimers();
  });

  test('rejects if ws closes before sync', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 5000 });
    const ws = FakeWS.last;
    ws._open();
    ws._fire('close', {});
    await expect(p).rejects.toThrow('closed before sync');
  });

  test('rejects on ws error before sync', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 5000 });
    FakeWS.last._fire('error', { message: 'boom' });
    await expect(p).rejects.toThrow('WebSocket error');
  });

  test('notebookToJSON returns notebook snapshot', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 50 });
    FakeWS.last._open();
    const handle = await p;
    const snap = notebookToJSON(handle);
    expect(snap).toHaveProperty('cells');
    handle.destroy();
  });

  test('ignores malformed awareness messages', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 50 });
    const ws = FakeWS.last;
    ws._open();
    // Send a message with MSG_AWARENESS prefix but no valid payload
    ws._recv(new Uint8Array([1, 0]));
    const handle = await p;
    handle.destroy();
  });

  test('local doc update sends sync message', async () => {
    const p = connectRoom({ baseUrl: 'http://h', token: 't', roomId: 'r', syncTimeoutMs: 50 });
    const ws = FakeWS.last;
    ws._open();
    const handle = await p;
    const sentBefore = ws.sent.length;
    // Mutate the shared doc -> should trigger onDocUpdate -> send
    handle.ydoc.getMap('test').set('k', 'v');
    expect(ws.sent.length).toBeGreaterThan(sentBefore);
    handle.destroy();
  });
});
