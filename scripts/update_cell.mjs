import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, validateNotebookPath } from './util.mjs';

function findLatestAgentCellIndex(nb) {
  const cells = nb.cells || [];
  for (let i = cells.length - 1; i >= 0; i--) {
    const md = (cells[i].metadata && cells[i].metadata.agent) || {};
    if (md.role === 'jupyter-driver') return i;
  }
  return null;
}

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const path = input.path ?? input.notebook;
  let idx = input.cell_id ?? input.index;
  const source = input.code ?? input.source;
  const outputs = input.outputs;
  const execution_count = input.execution_count;
  const metadata = input.metadata;
  if (!path) throw new Error('path is required');
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
  if (metadata !== undefined) {
    cell.metadata = cell.metadata || {};
    cell.metadata.agent = metadata;
  }
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
  ok({ ok: true });
}

main().catch(fail);

