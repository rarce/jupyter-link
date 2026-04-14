import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, nowIso, validateNotebookPath } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class InsertCell extends Command {
  static description = 'Insert a code cell with agent metadata';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    const index = input.index;
    const position = input.position || 'end';
    const source = input.code ?? input.source ?? '';
    const agentMeta = input.metadata || {};
    const roomRef = input.room_ref;
    if (!path && !roomRef) throw new Error('path is required');

    // RTC path: use Y.Doc via daemon
    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:insert-cell', {
        room_ref: roomRef,
        index,
        position,
        source,
        metadata: agentMeta,
      });
      if (out.error) throw new Error(out.error);
      ok(out);
      return;
    }

    // REST path (original)
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const nbj = nb.content; const cells = nbj.cells || (nbj.cells = []);
    const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...agentMeta };
    const cell = { cell_type: 'code', metadata: { agent: meta }, source, outputs: [], execution_count: null };
    let insertAt; if (typeof index === 'number') insertAt = Math.max(0, Math.min(index, cells.length)); else insertAt = position === 'start' ? 0 : cells.length;
    cells.splice(insertAt, 0, cell);
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
    ok({ cell_id: insertAt, index: insertAt });
  }
}
