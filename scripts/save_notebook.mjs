import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, validateNotebookPath } from './util.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const path = input.path ?? input.notebook;
  if (!path) throw new Error('path is required');
  validateNotebookPath(path);
  const { baseUrl, token } = getConfig();
  const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
  if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb.content });
  ok({ ok: true });
}

main().catch(fail);

