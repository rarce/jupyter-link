import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
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
      // Skip large binary mimes, keep text representations
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
    // Keep last 5 frames max, truncate each
    const trimmed = tb.slice(-5).map(line => line.slice(0, maxChars));
    return { output_type: type, ename: out.ename, evalue: out.evalue, traceback: trimmed };
  }
  return out;
}

export function summarizeCell(cell, index, maxChars) {
  const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
  const result = {
    index,
    cell_type: cell.cell_type,
    source: source.slice(0, maxChars),
  };
  if (cell.cell_type === 'code') {
    result.execution_count = cell.execution_count ?? null;
    result.outputs = (cell.outputs || []).map(o => summarizeOutput(o, maxChars));
  }
  if (cell.metadata?.agent) {
    result.agent = cell.metadata.agent;
  }
  return result;
}

export default class ReadCell extends Command {
  static description = 'Read specific cells from a notebook with their outputs, source, and metadata';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    const roomRef = input.room_ref;
    if (!path && !roomRef) throw new Error('path is required');
    const maxChars = input.max_chars ?? 3000;

    // RTC path: read from Y.Doc via daemon
    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:read-notebook', {
        room_ref: roomRef,
        cells: input.cells,
        cell_id: input.cell_id,
        range: input.range,
        max_chars: maxChars,
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
    const cells = nb.content.cells || [];

    // Determine which cells to return
    let indices;
    if (input.cells !== undefined) {
      // Explicit list of indices: {"cells": [0, 4, 8]}
      indices = Array.isArray(input.cells) ? input.cells : [input.cells];
    } else if (input.cell_id !== undefined) {
      // Single cell: {"cell_id": 4}
      indices = [input.cell_id];
    } else if (input.range !== undefined) {
      // Range: {"range": [4, 10]} → cells 4..9
      const [start, end] = input.range;
      indices = [];
      for (let i = start; i < Math.min(end, cells.length); i++) indices.push(i);
    } else {
      // No filter: return summary of all cells (source truncated, no outputs)
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

    // Validate and return requested cells
    const result = [];
    for (const i of indices) {
      if (i < 0 || i >= cells.length) {
        result.push({ index: i, error: `out of range (0..${cells.length - 1})` });
      } else {
        result.push(summarizeCell(cells[i], i, maxChars));
      }
    }
    ok({ total_cells: cells.length, cells: result });
  }
}
