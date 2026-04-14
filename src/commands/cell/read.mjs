import { Command, Flags } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export function summarizeOutput(out, maxChars) {
  const type = out.output_type;
  if (type === 'stream') {
    const text = Array.isArray(out.text) ? out.text.join('') : (out.text || '');
    return { output_type: type, name: out.name, text: text.slice(0, maxChars) };
  }
  if (type === 'execute_result' || type === 'display_data') {
    const data = {};
    for (const [mime, val] of Object.entries(out.data || {})) {
      const text = Array.isArray(val) ? val.join('') : (val || '');
      if (mime.startsWith('image/') || mime.startsWith('application/pdf')) {
        data[mime] = `<${text.length} chars>`;
      } else {
        data[mime] = text.slice(0, maxChars);
      }
    }
    return { output_type: type, data, execution_count: out.execution_count };
  }
  if (type === 'error') {
    const tb = out.traceback || [];
    const trimmed = tb.slice(-5).map(line => line.slice(0, maxChars));
    return { output_type: type, ename: out.ename, evalue: out.evalue, traceback: trimmed };
  }
  return out;
}

export function summarizeCell(cell, index, maxChars) {
  const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
  const result = { index, cell_type: cell.cell_type, source: source.slice(0, maxChars) };
  if (cell.cell_type === 'code') {
    result.execution_count = cell.execution_count ?? null;
    result.outputs = (cell.outputs || []).map(o => summarizeOutput(o, maxChars));
  }
  if (cell.metadata?.agent) result.agent = cell.metadata.agent;
  return result;
}

function parseIntList(s) {
  return s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isInteger(n));
}

export default class ReadCell extends Command {
  static description = 'Read specific cells from a notebook with their outputs, source, and metadata';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    room: commonFlags.room,
    cells: Flags.string({ description: 'Comma-separated cell indices (e.g. "0,4,8")' }),
    'cell-id': Flags.integer({ description: 'Single cell index' }),
    range: Flags.string({ description: 'Range "start:end" (end-exclusive)' }),
    'max-chars': commonFlags['max-chars'],
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(ReadCell);
    applyUrlFlag(flags);

    const path = flags.notebook;
    const roomRef = flags.room;
    if (!path && !roomRef) throw new Error('--notebook is required');
    const maxChars = flags['max-chars'];

    const cellsList = flags.cells ? parseIntList(flags.cells) : undefined;
    const range = flags.range ? flags.range.split(':').map(n => parseInt(n, 10)) : undefined;

    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:read-notebook', {
        room_ref: roomRef,
        cells: cellsList,
        cell_id: flags['cell-id'],
        range,
        max_chars: maxChars,
      });
      if (out.error) throw new Error(out.error);
      ok(out);
      return;
    }

    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const cells = nb.content.cells || [];

    let indices;
    if (cellsList !== undefined) indices = cellsList;
    else if (flags['cell-id'] !== undefined) indices = [flags['cell-id']];
    else if (range !== undefined) {
      const [start, end] = range;
      indices = [];
      for (let i = start; i < Math.min(end, cells.length); i++) indices.push(i);
    } else {
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
      ok({ total_cells: cells.length, cells: summary });
      return;
    }

    const result = [];
    for (const i of indices) {
      if (i < 0 || i >= cells.length) result.push({ index: i, error: `out of range (0..${cells.length - 1})` });
      else result.push(summarizeCell(cells[i], i, maxChars));
    }
    ok({ total_cells: cells.length, cells: result });
  }
}
