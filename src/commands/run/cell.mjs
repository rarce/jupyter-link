import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, nowIso } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class RunCell extends Command {
  static description = 'Insert a cell, execute it, collect outputs, and update the cell in one step';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    const channelRef = input.channel_ref ?? input.ref;
    const code = input.code ?? input.source ?? '';
    const timeoutS = input.timeout_s ?? 60;
    const index = input.index;
    const position = input.position || 'end';
    const agentMeta = input.metadata || {};

    if (!path) throw new Error('path is required');
    if (!channelRef) throw new Error('channel_ref is required (call open:kernel-channels first)');
    if (!code) throw new Error('code is required');

    const { baseUrl, token } = getConfig();

    // 1. Insert cell into notebook
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const nbj = nb.content;
    const cells = nbj.cells || (nbj.cells = []);
    const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...agentMeta };
    const cell = { cell_type: 'code', metadata: { agent: meta }, source: code, outputs: [], execution_count: null };
    let insertAt;
    if (typeof index === 'number') insertAt = Math.max(0, Math.min(index, cells.length));
    else insertAt = position === 'start' ? 0 : cells.length;
    cells.splice(insertAt, 0, cell);
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
    const cellId = insertAt;

    // 2. Execute code on kernel channel
    await ensureDaemon();
    const execOut = await request('exec', { channel_ref: channelRef, code, allow_stdin: false, stop_on_error: input.stop_on_error !== false });
    if (execOut.error) throw new Error(execOut.error);
    const parentMsgId = execOut.parent_msg_id;

    // 3. Collect outputs
    const collectOut = await request('collect', { channel_ref: channelRef, parent_msg_id: parentMsgId, timeout_s: timeoutS });
    if (collectOut.error) throw new Error(collectOut.error);
    const outputs = collectOut.outputs || [];
    const executionCount = collectOut.execution_count;
    const status = collectOut.status || 'unknown';

    // 4. Update cell with outputs
    const nb2 = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    const nbj2 = nb2.content;
    const cells2 = nbj2.cells || [];
    if (cellId >= 0 && cellId < cells2.length) {
      const targetCell = cells2[cellId];
      targetCell.outputs = outputs;
      if (executionCount !== undefined && executionCount !== null) targetCell.execution_count = executionCount;
      await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj2 });
    }

    ok({ cell_id: cellId, status, execution_count: executionCount ?? null, outputs });
  }
}
