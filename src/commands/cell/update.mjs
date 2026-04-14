import { Command, Flags } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag, readCode } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

function findLatestAgentCellIndex(nb) {
  const cells = nb.cells || [];
  for (let i = cells.length - 1; i >= 0; i--) {
    const md = (cells[i].metadata && cells[i].metadata.agent) || {};
    if (md.role === 'jupyter-driver') return i;
  }
  return null;
}

export default class UpdateCell extends Command {
  static description = 'Update a code cell (source/outputs/execution_count/metadata)';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    room: commonFlags.room,
    'cell-id': Flags.integer({ description: 'Target cell index (defaults to latest agent-managed cell)' }),
    code: commonFlags.code,
    'code-file': commonFlags['code-file'],
    outputs: Flags.string({ description: 'JSON array of nbformat outputs' }),
    'execution-count': Flags.integer({ description: 'Cell execution_count to set' }),
    metadata: commonFlags.metadata,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(UpdateCell);
    applyUrlFlag(flags);

    const path = flags.notebook;
    const roomRef = flags.room;
    let idx = flags['cell-id'];
    const source = (flags.code !== undefined || flags['code-file']) ? await readCode(flags) : undefined;
    const outputs = flags.outputs ? JSON.parse(flags.outputs) : undefined;
    const execution_count = flags['execution-count'];
    const metadata = flags.metadata ? JSON.parse(flags.metadata) : undefined;
    if (!path && !roomRef) throw new Error('--notebook is required');

    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:update-cell', {
        room_ref: roomRef, cell_id: idx, source, outputs, execution_count, metadata,
      });
      if (out.error) throw new Error(out.error);
      ok(out);
      return;
    }

    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const nbj = nb.content;
    if (idx === undefined || idx === null) idx = findLatestAgentCellIndex(nbj);
    if (idx === undefined || idx === null) throw new Error('No agent-managed cell found to update');
    const cells = nbj.cells || [];
    if (idx < 0 || idx >= cells.length) throw new Error('cell index out of range');
    const cell = cells[idx];
    if (source !== undefined) cell.source = source;
    if (outputs !== undefined) cell.outputs = outputs;
    if (execution_count !== undefined) cell.execution_count = execution_count;
    if (metadata !== undefined) { cell.metadata = cell.metadata || {}; cell.metadata.agent = metadata; }
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
    ok({ ok: true });
  }
}
