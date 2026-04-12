import net from 'node:net';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { mapIopubToOutput, isStatusIdle, isParent, makeExecuteRequest } from './jupyter_proto.mjs';
import { nowIso, newSessionId, getConfig } from '../src/lib/common.mjs';
import { detectRTC, resolveRoom } from '../src/lib/rtcDetect.mjs';
import { connectRoom, notebookToJSON } from '../src/lib/yjsClient.mjs';

const PORT = getConfig().port;
// helper functions imported from jupyter_proto.mjs

// State
const channels = new Map(); // ref -> { ws, sessionId, kernelId, url, outputsByParent }
const rooms = new Map();    // ref -> { handle (RoomHandle), roomId, path, baseUrl }

export function wsUrlFor(baseUrl, token, kernelId, sessionId) {
  const url = new URL(baseUrl);
  const wsScheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  query.set('session_id', sessionId);
  const u = `${wsScheme}//${url.host}${url.pathname.replace(/\/$/, '')}/api/kernels/${kernelId}/channels?${query.toString()}`;
  return u;
}

function handleOpen({ baseUrl, token, kernelId }) {
  if (!baseUrl || !kernelId) throw new Error('baseUrl and kernelId are required');
  const sessionId = newSessionId();
  const url = wsUrlFor(baseUrl, token, kernelId, sessionId);
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('WebSocket API not available in Node. Use Node >=20 or enable experimental WebSocket');
  const ws = new WS(url);
  const ref = 'ch-' + crypto.randomBytes(6).toString('hex');
  const state = { ws, sessionId, kernelId, url, outputsByParent: new Map(), ready: false };
  channels.set(ref, state);
  ws.on('open', () => { state.ready = true; });
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    const parentId = msg.parent_header && msg.parent_header.msg_id;
    if (!parentId) return;
    let agg = state.outputsByParent.get(parentId);
    if (!agg) return;
    const channel = msg.channel;
    const msgType = msg.header && msg.header.msg_type;
    if (channel === 'iopub' && isParent(msg, parentId)) {
      const out = mapIopubToOutput(msg);
      if (out) agg.outputs.push(out);
      if (isStatusIdle(msg)) agg.gotIdle = true;
    }
    if (channel === 'shell' && msgType === 'execute_reply' && isParent(msg, parentId)) {
      agg.gotReply = true;
      agg.status = (msg.content && msg.content.status) || agg.status;
      agg.execution_count = (msg.content && msg.content.execution_count) || agg.execution_count;
    }
    if (agg.gotReply && agg.gotIdle && !agg.resolved) {
      agg.resolved = true;
      if (agg.resolve) agg.resolve();
    }
  });
  ws.on('close', () => { state.ready = false; state.dead = true; });
  ws.on('error', () => { state.ready = false; state.dead = true; });
  return { channel_ref: ref, session_id: sessionId };
}

function handleExec({ channel_ref, code, allow_stdin = false, stop_on_error = true }) {
  const ch = channels.get(channel_ref);
  if (!ch) throw new Error('unknown channel_ref');
  if (ch.dead) throw new Error('channel is closed or errored');
  if (!ch.ready) throw new Error('channel not ready');
  const msg = makeExecuteRequest(code, ch.sessionId, allow_stdin, stop_on_error);
  const parentId = msg.header.msg_id;
  ch.outputsByParent.set(parentId, { outputs: [], execution_count: null, status: 'unknown', gotReply: false, gotIdle: false, resolved: false });
  ch.ws.send(JSON.stringify(msg));
  return { parent_msg_id: parentId };
}

async function handleCollect({ channel_ref, parent_msg_id, timeout_s = 60 }) {
  const ch = channels.get(channel_ref);
  if (!ch) throw new Error('unknown channel_ref');
  const agg = ch.outputsByParent.get(parent_msg_id);
  if (!agg) throw new Error('unknown parent_msg_id');
  let timedOut = false;
  if (!(agg.gotReply && agg.gotIdle)) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (agg.resolve === resolve) agg.resolve = undefined; timedOut = true; resolve(); }, timeout_s * 1000);
      agg.resolve = () => { clearTimeout(timer); resolve(); };
    });
  }
  const status = timedOut ? 'timeout' : (agg.status || (agg.gotReply ? 'ok' : 'unknown'));
  // Clean up to prevent memory leak
  ch.outputsByParent.delete(parent_msg_id);
  return { outputs: agg.outputs, execution_count: agg.execution_count, status };
}

function handleClose({ channel_ref }) {
  const ch = channels.get(channel_ref);
  if (!ch) return { ok: true };
  try { ch.ws.close(); } catch {}
  channels.delete(channel_ref);
  return { ok: true };
}

function handleList() {
  const arr = [];
  for (const [ref, st] of channels.entries()) arr.push({ channel_ref: ref, kernel_id: st.kernelId, url: st.url, ready: st.ready });
  return { channels: arr };
}

// ---------- RTC operations ----------

async function handleRtcDetect({ baseUrl, token }) {
  if (!baseUrl) throw new Error('baseUrl is required');
  return detectRTC(baseUrl, token);
}

async function handleRtcConnect({ baseUrl, token, notebookPath, syncTimeoutMs }) {
  if (!baseUrl || !notebookPath) throw new Error('baseUrl and notebookPath are required');
  // Resolve room ID from notebook path
  const { sessionId, fileId, roomId, path } = await resolveRoom(baseUrl, token, notebookPath);
  // Check if we already have a connection for this room
  for (const [ref, st] of rooms.entries()) {
    if (st.roomId === roomId && !st.handle.dead) {
      return { room_ref: ref, room_id: roomId, file_id: fileId, path, already_connected: true };
    }
  }
  // Connect via Yjs WebSocket
  const handle = await connectRoom({ baseUrl, token, roomId, syncTimeoutMs });
  const ref = 'room-' + crypto.randomBytes(6).toString('hex');
  rooms.set(ref, { handle, roomId, path, baseUrl, fileId });
  return { room_ref: ref, room_id: roomId, file_id: fileId, path, synced: handle.synced };
}

function handleRtcDisconnect({ room_ref }) {
  const st = rooms.get(room_ref);
  if (!st) return { ok: true };
  st.handle.destroy();
  rooms.delete(room_ref);
  return { ok: true };
}

function handleRtcStatus({ room_ref }) {
  if (room_ref) {
    const st = rooms.get(room_ref);
    if (!st) throw new Error('unknown room_ref');
    const nb = notebookToJSON(st.handle);
    return { room_ref, room_id: st.roomId, path: st.path, synced: st.handle.synced, dead: st.handle.dead, cells: nb.cells ? nb.cells.length : 0 };
  }
  // List all rooms
  const arr = [];
  for (const [ref, st] of rooms.entries()) {
    arr.push({ room_ref: ref, room_id: st.roomId, path: st.path, synced: st.handle.synced, dead: st.handle.dead });
  }
  return { rooms: arr };
}

const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      let req; try { req = JSON.parse(line); } catch { socket.write(JSON.stringify({ error: 'bad json' }) + '\n'); continue; }
      try {
        let res;
        switch (req.op) {
          case 'ping': res = { ok: true }; break;
          case 'open': res = handleOpen(req.args || {}); break;
          case 'exec': res = handleExec(req.args || {}); break;
          case 'collect': res = handleCollect(req.args || {}); break;
          case 'close': res = handleClose(req.args || {}); break;
          case 'list': res = handleList(); break;
          case 'rtc:detect': res = handleRtcDetect(req.args || {}); break;
          case 'rtc:connect': res = handleRtcConnect(req.args || {}); break;
          case 'rtc:disconnect': res = handleRtcDisconnect(req.args || {}); break;
          case 'rtc:status': res = handleRtcStatus(req.args || {}); break;
          default: res = { error: 'unknown op' };
        }
        Promise.resolve(res).then((out) => socket.write(JSON.stringify(out) + '\n')).catch((e) => { try { socket.write(JSON.stringify({ error: e.message || String(e) }) + '\n'); } catch {} });
      } catch (e) {
        socket.write(JSON.stringify({ error: e.message || String(e) }) + '\n');
      }
    }
  });
});

server.listen(PORT, '127.0.0.1');
