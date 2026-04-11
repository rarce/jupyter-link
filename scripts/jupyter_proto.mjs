import crypto from 'node:crypto';

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function makeHeader(msg_type, session, username = 'agent') {
  return {
    msg_id: 'msg-' + crypto.randomUUID().replace(/-/g, ''),
    username,
    session,
    date: nowIso(),
    msg_type,
    version: '5.3',
  };
}

export function makeExecuteRequest(code, session, allow_stdin = false, stop_on_error = true) {
  const header = makeHeader('execute_request', session);
  return {
    header,
    parent_header: {},
    metadata: {},
    content: {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin,
      stop_on_error,
    },
    channel: 'shell',
  };
}

export function mapIopubToOutput(msg) {
  const t = msg.msg_type || (msg.header && msg.header.msg_type);
  const c = msg.content || {};
  if (t === 'stream') return { output_type: 'stream', name: c.name || 'stdout', text: c.text || '' };
  if (t === 'execute_result') return { output_type: 'execute_result', execution_count: c.execution_count, data: c.data || {}, metadata: c.metadata || {} };
  if (t === 'display_data') return { output_type: 'display_data', data: c.data || {}, metadata: c.metadata || {} };
  if (t === 'error') return { output_type: 'error', ename: c.ename || 'Error', evalue: c.evalue || '', traceback: c.traceback || [] };
  return null;
}

export function isStatusIdle(msg) {
  const t = msg.msg_type || (msg.header && msg.header.msg_type);
  return t === 'status' && msg.content && msg.content.execution_state === 'idle';
}

export function isParent(msg, parent_id) {
  return msg.parent_header && msg.parent_header.msg_id === parent_id;
}

