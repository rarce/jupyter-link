import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, validateNotebookPath } from './util.mjs';

function summarizeOutput(out, maxChars) {
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

function summarizeCell(cell, index, maxChars) {
  const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
  const result = { index, cell_type: cell.cell_type, source: source.slice(0, maxChars) };
  if (cell.cell_type === 'code') {
    result.execution_count = cell.execution_count ?? null;
    result.outputs = (cell.outputs || []).map(o => summarizeOutput(o, maxChars));
  }
  if (cell.metadata?.agent) result.agent = cell.metadata.agent;
  return result;
}

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const path = input.path ?? input.notebook;
  if (!path) throw new Error('path is required');
  validateNotebookPath(path);
  const { baseUrl, token } = getConfig();
  const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
  if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
  const cells = nb.content.cells || [];
  const maxChars = input.max_chars ?? 3000;

  let indices;
  if (input.cells !== undefined) {
    indices = Array.isArray(input.cells) ? input.cells : [input.cells];
  } else if (input.cell_id !== undefined) {
    indices = [input.cell_id];
  } else if (input.range !== undefined) {
    const [start, end] = input.range;
    indices = [];
    for (let i = start; i < Math.min(end, cells.length); i++) indices.push(i);
  } else {
    const summary = cells.map((c, i) => {
      const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
      return { index: i, cell_type: c.cell_type, source_preview: src.slice(0, 120), execution_count: c.execution_count ?? null, has_outputs: (c.outputs || []).length > 0 };
    });
    ok({ total_cells: cells.length, cells: summary });
    return;
  }

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

main().catch(fail);
