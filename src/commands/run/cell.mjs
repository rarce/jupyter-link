import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, nowIso, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag, readCode } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class RunCell extends Command {
  static description = 'Insert a cell, execute it, collect outputs, and update the cell in one step';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    ref: commonFlags.ref,
    room: commonFlags.room,
    code: commonFlags.code,
    'code-file': commonFlags['code-file'],
    index: commonFlags.index,
    position: commonFlags.position,
    timeout: commonFlags.timeout,
    'stop-on-error': commonFlags['stop-on-error'],
    metadata: commonFlags.metadata,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(RunCell);
    applyUrlFlag(flags);

    const path = flags.notebook;
    const channelRef = flags.ref;
    const roomRef = flags.room;
    const code = await readCode(flags);
    const agentMeta = flags.metadata ? JSON.parse(flags.metadata) : {};

    if (!path && !roomRef) throw new Error('--notebook is required');
    if (!channelRef) throw new Error('--ref is required (call open:kernel-channels first)');
    if (!code) throw new Error('--code, --code-file, or --code=- is required');
    if (path) validateNotebookPath(path);

    await ensureDaemon();

    let cellId;
    if (roomRef) {
      const insertOut = await request('rtc:insert-cell', {
        room_ref: roomRef,
        index: flags.index,
        position: flags.position,
        source: code,
        metadata: agentMeta,
        editable: false,
      });
      if (insertOut.error) throw new Error(insertOut.error);
      cellId = insertOut.cell_id;
    } else {
      const { baseUrl, token } = getConfig();
      const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
      if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
      const nbj = nb.content;
      const cells = nbj.cells || (nbj.cells = []);
      const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...agentMeta };
      const cell = { cell_type: 'code', metadata: { agent: meta }, source: code, outputs: [], execution_count: null };
      let insertAt;
      if (typeof flags.index === 'number') insertAt = Math.max(0, Math.min(flags.index, cells.length));
      else insertAt = flags.position === 'start' ? 0 : cells.length;
      cells.splice(insertAt, 0, cell);
      await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
      cellId = insertAt;
    }

    const execOut = await request('exec', { channel_ref: channelRef, code, allow_stdin: false, stop_on_error: flags['stop-on-error'] });
    if (execOut.error) throw new Error(execOut.error);
    const parentMsgId = execOut.parent_msg_id;

    const collectArgs = { channel_ref: channelRef, parent_msg_id: parentMsgId, timeout_s: flags.timeout };
    if (roomRef) { collectArgs.room_ref = roomRef; collectArgs.cell_id = cellId; }
    const collectOut = await request('collect', collectArgs);
    if (collectOut.error) throw new Error(collectOut.error);
    const outputs = collectOut.outputs || [];
    const executionCount = collectOut.execution_count;
    const status = collectOut.status || 'unknown';

    if (roomRef) {
      const updateOut = await request('rtc:update-cell', {
        room_ref: roomRef, cell_id: cellId, outputs, execution_count: executionCount, editable: true,
      });
      if (updateOut.error) throw new Error(updateOut.error);
    } else {
      const { baseUrl, token } = getConfig();
      const nb2 = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
      const nbj2 = nb2.content;
      const cells2 = nbj2.cells || [];
      if (cellId >= 0 && cellId < cells2.length) {
        const targetCell = cells2[cellId];
        targetCell.outputs = outputs;
        if (executionCount !== undefined && executionCount !== null) targetCell.execution_count = executionCount;
        await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj2 });
      }
    }

    ok({ cell_id: cellId, status, execution_count: executionCount ?? null, outputs });
  }
}
