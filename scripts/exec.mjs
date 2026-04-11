import crypto from 'node:crypto';
import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, joinUrl, newSessionId, nowIso } from './util.mjs';
import { makeExecuteRequest, mapIopubToOutput, isStatusIdle, isParent } from './jupyter_proto.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const notebookPath = input.path ?? input.notebook;
  const code = input.code ?? input.source;
  const reuseAgent = Boolean(input.reuse_agent_cell ?? input.update_agent);
  const autoSave = Boolean(input.auto_save);
  if (!notebookPath) throw new Error('notebook path is required');
  if (!code) throw new Error('code is required');

  const { baseUrl, token } = getConfig();
  // pick a session
  const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
  let session = sessions.find(s => s.notebook && s.notebook.path === notebookPath);
  if (!session) {
    const name = notebookPath.split('/').pop();
    session = sessions.find(s => (s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name)) || (s.path && s.path.endsWith('/' + name)));
  }
  if (!session) throw new Error('No running session found for the target notebook');
  const kernelId = session.kernel && session.kernel.id;
  if (!kernelId) throw new Error('Selected session has no kernel id');

  // read notebook and select cell
  const nbWrap = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(notebookPath)}?content=1`, token);
  if (nbWrap.type !== 'notebook') throw new Error('Path is not a notebook');
  const nb = nbWrap.content;
  const cells = nb.cells || (nb.cells = []);
  let idx = null;
  if (reuseAgent) {
    for (let i = cells.length - 1; i >= 0; i--) {
      const md = (cells[i].metadata && cells[i].metadata.agent) || {};
      if (md.role === 'jupyter-driver') { idx = i; break; }
    }
  }
  const agentMeta = { role: 'jupyter-driver', request_id: crypto.randomBytes(8).toString('hex'), created_at: nowIso(), auto_save: autoSave };
  if (idx == null) {
    cells.push({ cell_type: 'code', metadata: { agent: agentMeta }, source: code, outputs: [], execution_count: null });
    idx = cells.length - 1;
  } else {
    const cell = cells[idx];
    cell.source = code;
    cell.metadata = cell.metadata || {};
    cell.metadata.agent = agentMeta;
    cell.outputs = [];
    cell.execution_count = null;
  }
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(notebookPath)}`, token, { type: 'notebook', format: 'json', content: nb });

  // open ws and execute
  const url = new URL(baseUrl);
  const wsScheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  query.set('session_id', newSessionId());
  const wsUrl = `${wsScheme}//${url.host}${url.pathname.replace(/\/$/, '')}/api/kernels/${kernelId}/channels?${query.toString()}`;

  const WS = globalThis.WebSocket;
  if (!WS) throw new Error('WebSocket API not available in Node. Use Node >=20 or enable experimental WebSocket');
  const ws = new WS(wsUrl);
  const outputs = [];
  let parentMsgId = null;
  let gotReply = false;
  let gotIdle = false;
  let executionCount = null;
  let status = 'unknown';

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('execution timeout')), (input.timeout_s || 60) * 1000);
    ws.on('open', () => {
      const msg = makeExecuteRequest(code, query.get('session_id'));
      parentMsgId = msg.header.msg_id;
      ws.send(JSON.stringify(msg));
    });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      const channel = msg.channel;
      const msgType = msg.header && msg.header.msg_type;
      if (channel === 'iopub' && isParent(msg, parentMsgId)) {
        const out = mapIopubToOutput(msg);
        if (out) outputs.push(out);
        if (isStatusIdle(msg)) gotIdle = true;
      }
      if (channel === 'shell' && msgType === 'execute_reply' && isParent(msg, parentMsgId)) {
        gotReply = true;
        status = (msg.content && msg.content.status) || status;
        executionCount = (msg.content && msg.content.execution_count) || executionCount;
        if (gotIdle) { clearTimeout(timeout); ws.close(); resolve(); }
      }
      if (gotReply && gotIdle) { clearTimeout(timeout); ws.close(); resolve(); }
    });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    ws.on('close', () => { if (!(gotReply && gotIdle)) { clearTimeout(timeout); resolve(); } });
  });

  // update cell with outputs
  const nb2Wrap = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(notebookPath)}?content=1`, token);
  const nb2 = nb2Wrap.content;
  const cell = nb2.cells[idx];
  cell.outputs = outputs;
  cell.execution_count = executionCount;
  cell.metadata = cell.metadata || {};
  cell.metadata.agent = { ...cell.metadata.agent, auto_save: autoSave };
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(notebookPath)}`, token, { type: 'notebook', format: 'json', content: nb2 });
  if (autoSave) {
    // nothing extra; PUT above persists changes
  }

  ok({ cell_index: idx, outputs, execution_count: executionCount, status });
}

main().catch(fail);
