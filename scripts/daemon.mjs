import net from 'node:net';
import crypto from 'node:crypto';
import os from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { mapIopubToOutput, isStatusIdle, isParent, makeExecuteRequest } from './jupyter_proto.mjs';
import { nowIso, newSessionId, getConfig } from '../src/lib/common.mjs';
import { detectRTC, resolveRoom } from '../src/lib/rtcDetect.mjs';
import { connectRoom, notebookToJSON, connectGlobalAwareness } from '../src/lib/yjsClient.mjs';
import { VERSION } from '../src/lib/version.mjs';

export function pidFilePath(port = getConfig().port) {
  return join(os.tmpdir(), `jupyter-link-daemon-${port}.pid`);
}

const PORT = getConfig().port;
// helper functions imported from jupyter_proto.mjs

// State
export const channels = new Map(); // ref -> { ws, sessionId, kernelId, url, outputsByParent }
export const rooms = new Map();    // ref -> { handle (RoomHandle), roomId, path, baseUrl }
let globalAwareness = null;        // singleton handle for JupyterLab:globalAwareness room

async function ensureGlobalAwareness({ baseUrl, token, agentName, agentColor }) {
  if (globalAwareness && !globalAwareness.dead) return globalAwareness;
  try {
    globalAwareness = await connectGlobalAwareness({ baseUrl, token, agentName, agentColor });
  } catch {
    globalAwareness = null; // non-fatal: stay usable without the panel presence
  }
  return globalAwareness;
}

export function wsUrlFor(baseUrl, token, kernelId, sessionId) {
  const url = new URL(baseUrl);
  const wsScheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  query.set('session_id', sessionId);
  const u = `${wsScheme}//${url.host}${url.pathname.replace(/\/$/, '')}/api/kernels/${kernelId}/channels?${query.toString()}`;
  return u;
}

export function handleOpen({ baseUrl, token, kernelId }) {
  if (!baseUrl || !kernelId) throw new Error('baseUrl and kernelId are required');
  const sessionId = newSessionId();
  const url = wsUrlFor(baseUrl, token, kernelId, sessionId);
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('WebSocket API not available in Node. Use Node >=20 or enable experimental WebSocket');
  const ws = new WS(url);
  const ref = 'ch-' + crypto.randomBytes(6).toString('hex');
  const state = { ws, sessionId, kernelId, url, outputsByParent: new Map(), ready: false };
  channels.set(ref, state);
  ws.addEventListener('open', () => { state.ready = true; });
  ws.addEventListener('message', (event) => {
    const raw = event.data;
    const text = typeof raw === 'string'
      ? raw
      : raw instanceof ArrayBuffer
        ? Buffer.from(raw).toString('utf8')
        : Buffer.from(raw.buffer || raw).toString('utf8');
    let msg; try { msg = JSON.parse(text); } catch { return; }
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
  ws.addEventListener('close', () => { state.ready = false; state.dead = true; });
  ws.addEventListener('error', () => { state.ready = false; state.dead = true; });
  return { channel_ref: ref, session_id: sessionId };
}

export function handleExec({ channel_ref, code, allow_stdin = false, stop_on_error = true }) {
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

export async function handleCollect({ channel_ref, parent_msg_id, timeout_s = 60, room_ref, cell_id }) {
  const ch = channels.get(channel_ref);
  if (!ch) throw new Error('unknown channel_ref');
  const agg = ch.outputsByParent.get(parent_msg_id);
  if (!agg) throw new Error('unknown parent_msg_id');

  // If room_ref + cell_id provided, stream outputs to Y.Doc as they arrive
  let rtcRoom = null;
  let rtcCellIdx = null;
  if (room_ref && cell_id !== undefined && cell_id !== null) {
    const st = rooms.get(room_ref);
    if (st && !st.handle.dead) {
      rtcRoom = st;
      rtcCellIdx = cell_id;
    }
  }

  // Snapshot output count so we know when new outputs arrive
  let lastPushed = 0;

  function pushLiveOutputs() {
    if (!rtcRoom || rtcCellIdx === null) return;
    try {
      const notebook = rtcRoom.handle.notebook;
      if (rtcCellIdx < notebook.cells.length) {
        const cell = notebook.getCell(rtcCellIdx);
        // Push all outputs accumulated so far
        if (agg.outputs.length > lastPushed) {
          cell.setOutputs([...agg.outputs]);
          lastPushed = agg.outputs.length;
        }
      }
    } catch {
      // Non-fatal: if Y.Doc write fails, we still collect outputs normally
    }
  }

  // Set up a polling interval for live streaming (every 200ms)
  let liveInterval = null;
  if (rtcRoom) {
    liveInterval = setInterval(pushLiveOutputs, 200);
  }

  let timedOut = false;
  if (!(agg.gotReply && agg.gotIdle)) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (agg.resolve === resolve) agg.resolve = undefined; timedOut = true; resolve(); }, timeout_s * 1000);
      agg.resolve = () => { clearTimeout(timer); resolve(); };
    });
  }

  // Final push of all outputs
  if (liveInterval) clearInterval(liveInterval);
  pushLiveOutputs();

  const status = timedOut ? 'timeout' : (agg.status || (agg.gotReply ? 'ok' : 'unknown'));
  // Clean up to prevent memory leak
  ch.outputsByParent.delete(parent_msg_id);
  return { outputs: agg.outputs, execution_count: agg.execution_count, status };
}

export function handleClose({ channel_ref }) {
  const ch = channels.get(channel_ref);
  if (!ch) return { ok: true };
  try { ch.ws.close(); } catch {}
  channels.delete(channel_ref);
  return { ok: true };
}

export function handleList() {
  const arr = [];
  for (const [ref, st] of channels.entries()) arr.push({ channel_ref: ref, kernel_id: st.kernelId, url: st.url, ready: st.ready });
  return { channels: arr };
}

// ---------- RTC operations ----------

export async function handleRtcDetect({ baseUrl, token }) {
  if (!baseUrl) throw new Error('baseUrl is required');
  return detectRTC(baseUrl, token);
}

export async function handleRtcConnect({ baseUrl, token, notebookPath, syncTimeoutMs, agentName, agentColor }) {
  if (!baseUrl || !notebookPath) throw new Error('baseUrl and notebookPath are required');
  // Resolve room ID from notebook path
  const { sessionId, fileId, roomId, path } = await resolveRoom(baseUrl, token, notebookPath);
  // Check if we already have a connection for this room
  for (const [ref, st] of rooms.entries()) {
    if (st.roomId === roomId && !st.handle.dead) {
      return { room_ref: ref, room_id: roomId, file_id: fileId, path, already_connected: true };
    }
  }
  // Connect via Yjs WebSocket (sessionId is required by jupyter-collaboration to match the PUT session)
  const handle = await connectRoom({ baseUrl, token, roomId, sessionId, syncTimeoutMs, agentName, agentColor });
  const ref = 'room-' + crypto.randomBytes(6).toString('hex');
  rooms.set(ref, { handle, roomId, path, baseUrl, fileId });
  // Also join the global awareness room so the agent appears in JupyterLab's
  // "Online Collaborators" panel. Non-fatal if it fails.
  await ensureGlobalAwareness({ baseUrl, token, agentName, agentColor });
  return { room_ref: ref, room_id: roomId, file_id: fileId, path, synced: handle.synced, global_awareness: !!(globalAwareness && !globalAwareness.dead) };
}

export function handleRtcDisconnect({ room_ref }) {
  const st = rooms.get(room_ref);
  if (!st) return { ok: true };
  st.handle.destroy();
  rooms.delete(room_ref);
  return { ok: true };
}

export function handleRtcStatus({ room_ref }) {
  if (room_ref) {
    const st = rooms.get(room_ref);
    if (!st) throw new Error('unknown room_ref');
    const nb = notebookToJSON(st.handle);
    // Gather awareness info: list of connected collaborators
    const awarenessStates = st.handle.awareness.getStates();
    const collaborators = [];
    for (const [clientId, state] of awarenessStates) {
      if (state && state.user) {
        collaborators.push({ clientId, name: state.user.name, color: state.user.color });
      }
    }
    return { room_ref, room_id: st.roomId, path: st.path, synced: st.handle.synced, dead: st.handle.dead, cells: nb.cells ? nb.cells.length : 0, collaborators };
  }
  // List all rooms
  const arr = [];
  for (const [ref, st] of rooms.entries()) {
    arr.push({ room_ref: ref, room_id: st.roomId, path: st.path, synced: st.handle.synced, dead: st.handle.dead });
  }
  return { rooms: arr };
}

// ---------- RTC cell operations ----------

function getRoomOrThrow(room_ref) {
  const st = rooms.get(room_ref);
  if (!st) throw new Error('unknown room_ref');
  if (st.handle.dead) throw new Error('room connection is dead');
  return st;
}

export function handleRtcReadNotebook({ room_ref, cells: cellIndices, cell_id, range, max_chars = 3000 }) {
  const st = getRoomOrThrow(room_ref);
  const nb = notebookToJSON(st.handle);
  const cells = nb.cells || [];

  // Determine which cells to return (same logic as cell:read command)
  let indices;
  if (cellIndices !== undefined) {
    indices = Array.isArray(cellIndices) ? cellIndices : [cellIndices];
  } else if (cell_id !== undefined) {
    indices = [cell_id];
  } else if (range !== undefined) {
    const [start, end] = range;
    indices = [];
    for (let i = start; i < Math.min(end, cells.length); i++) indices.push(i);
  } else {
    // Return summary of all cells
    const summary = cells.map((c, i) => {
      const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
      return {
        index: i,
        cell_type: c.cell_type,
        source_preview: src.slice(0, 120),
        execution_count: c.execution_count ?? null,
        has_outputs: (c.outputs || []).length > 0,
      };
    });
    return { total_cells: cells.length, cells: summary };
  }

  const result = [];
  for (const i of indices) {
    if (i < 0 || i >= cells.length) {
      result.push({ index: i, error: `out of range (0..${cells.length - 1})` });
    } else {
      const c = cells[i];
      const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
      const entry = { index: i, cell_type: c.cell_type, source: src.slice(0, max_chars) };
      if (c.cell_type === 'code') {
        entry.execution_count = c.execution_count ?? null;
        entry.outputs = c.outputs || [];
      }
      if (c.metadata?.agent) entry.agent = c.metadata.agent;
      result.push(entry);
    }
  }
  return { total_cells: cells.length, cells: result };
}

export function handleRtcInsertCell({ room_ref, index, position = 'end', source = '', metadata = {} }) {
  const st = getRoomOrThrow(room_ref);
  const notebook = st.handle.notebook;
  const totalCells = notebook.cells.length;

  let insertAt;
  if (typeof index === 'number') {
    insertAt = Math.max(0, Math.min(index, totalCells));
  } else {
    insertAt = position === 'start' ? 0 : totalCells;
  }

  const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...metadata };
  notebook.insertCell(insertAt, {
    cell_type: 'code',
    source,
    metadata: { agent: meta },
    outputs: [],
    execution_count: null,
  });

  return { cell_id: insertAt, index: insertAt, total_cells: notebook.cells.length };
}

export function handleRtcUpdateCell({ room_ref, cell_id, index, source, outputs, execution_count, metadata }) {
  const st = getRoomOrThrow(room_ref);
  const notebook = st.handle.notebook;
  let idx = cell_id ?? index;

  // If no index given, find the latest agent-managed cell
  if (idx === undefined || idx === null) {
    const nbJson = notebookToJSON(st.handle);
    const cells = nbJson.cells || [];
    for (let i = cells.length - 1; i >= 0; i--) {
      const md = (cells[i].metadata && cells[i].metadata.agent) || {};
      if (md.role === 'jupyter-driver') { idx = i; break; }
    }
    if (idx === undefined || idx === null) throw new Error('No agent-managed cell found to update');
  }

  const totalCells = notebook.cells.length;
  if (idx < 0 || idx >= totalCells) throw new Error('cell index out of range');

  const cell = notebook.getCell(idx);

  if (source !== undefined) {
    cell.setSource(source);
  }
  if (outputs !== undefined) {
    cell.setOutputs(outputs);
  }
  if (execution_count !== undefined) {
    cell.execution_count = execution_count;
  }
  if (metadata !== undefined) {
    // Merge agent metadata
    const existing = cell.getMetadata() || {};
    cell.setMetadata({ ...existing, agent: metadata });
  }

  return { ok: true, cell_id: idx };
}

export function dispatch(req) {
  switch (req.op) {
    case 'ping': return { ok: true };
    case 'version': return { version: VERSION };
    case 'shutdown':
      setImmediate(() => { try { server.close(); } catch {} try { unlinkSync(pidFilePath()); } catch {} process.exit(0); });
      return { ok: true };
    case 'open': return handleOpen(req.args || {});
    case 'exec': return handleExec(req.args || {});
    case 'collect': return handleCollect(req.args || {});
    case 'close': return handleClose(req.args || {});
    case 'list': return handleList();
    case 'rtc:detect': return handleRtcDetect(req.args || {});
    case 'rtc:connect': return handleRtcConnect(req.args || {});
    case 'rtc:disconnect': return handleRtcDisconnect(req.args || {});
    case 'rtc:status': return handleRtcStatus(req.args || {});
    case 'rtc:read-notebook': return handleRtcReadNotebook(req.args || {});
    case 'rtc:insert-cell': return handleRtcInsertCell(req.args || {});
    case 'rtc:update-cell': return handleRtcUpdateCell(req.args || {});
    default: return { error: 'unknown op' };
  }
}

export const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      let req; try { req = JSON.parse(line); } catch { socket.write(JSON.stringify({ error: 'bad json' }) + '\n'); continue; }
      try {
        const res = dispatch(req);
        Promise.resolve(res).then((out) => socket.write(JSON.stringify(out) + '\n')).catch((e) => { try { socket.write(JSON.stringify({ error: e.message || String(e) }) + '\n'); } catch {} });
      } catch (e) {
        socket.write(JSON.stringify({ error: e.message || String(e) }) + '\n');
      }
    }
  });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, '127.0.0.1', () => {
    try { writeFileSync(pidFilePath(PORT), String(process.pid)); } catch {}
  });
  const cleanup = () => { try { unlinkSync(pidFilePath(PORT)); } catch {} };
  process.on('exit', cleanup);
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
}
