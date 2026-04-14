import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, nowIso, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag, readCode } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class InsertCell extends Command {
  static description = 'Insert a code cell with agent metadata';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    room: commonFlags.room,
    code: commonFlags.code,
    'code-file': commonFlags['code-file'],
    index: commonFlags.index,
    position: commonFlags.position,
    metadata: commonFlags.metadata,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(InsertCell);
    applyUrlFlag(flags);

    const path = flags.notebook;
    const roomRef = flags.room;
    const source = await readCode(flags);
    const agentMeta = flags.metadata ? JSON.parse(flags.metadata) : {};
    if (!path && !roomRef) throw new Error('--notebook is required');

    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:insert-cell', {
        room_ref: roomRef,
        index: flags.index,
        position: flags.position,
        source,
        metadata: agentMeta,
      });
      if (out.error) throw new Error(out.error);
      ok(out);
      return;
    }

    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const nbj = nb.content; const cells = nbj.cells || (nbj.cells = []);
    const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...agentMeta };
    const cell = { cell_type: 'code', metadata: { agent: meta }, source, outputs: [], execution_count: null };
    let insertAt;
    if (typeof flags.index === 'number') insertAt = Math.max(0, Math.min(flags.index, cells.length));
    else insertAt = flags.position === 'start' ? 0 : cells.length;
    cells.splice(insertAt, 0, cell);
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
    ok({ cell_id: insertAt, index: insertAt });
  }
}
