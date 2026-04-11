import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion } from './util.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const path = input.path ?? input.notebook;
  const nb = input.nb_json ?? input.content;
  if (!path) throw new Error('path is required');
  if (!nb) throw new Error('nb_json is required');
  const { baseUrl, token } = getConfig();
  const body = { type: 'notebook', format: 'json', content: nb };
  await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, body);
  ok({ ok: true });
}

main().catch(fail);

