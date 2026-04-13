import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, nowIso } from './util.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const path = input.path ?? input.notebook;
  const index = input.index;
  const position = input.position || 'end';
  const source = input.code ?? input.source ?? '';
  const agentMeta = input.metadata || {};
  if (!path) throw new Error('path is required');
  const { baseUrl, token } = getConfig();
  const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
  if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
  const nbj = nb.content;
  const cells = nbj.cells || (nbj.cells = []);
  const meta = { ...agentMeta, role: 'jupyter-driver', created_at: nowIso(), auto_save: false };
  const cell = { cell_type: 'code', metadata: { agent: meta }, source, outputs: [], execution_count: null };
  let insertAt;
  if (typeof index === 'number') insertAt = Math.max(0, Math.min(index, cells.length));
  else insertAt = position === 'start' ? 0 : cells.length;
  cells.splice(insertAt, 0, cell);
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
  ok({ cell_id: insertAt, index: insertAt });
}

main().catch(fail);

