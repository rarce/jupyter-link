import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion } from './util.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const filters = input.filters || {};
  const { baseUrl, token } = getConfig();
  const data = await httpJson('GET', `${baseUrl}/api/sessions`, token);
  if (!filters || (Object.keys(filters).length === 0)) return ok(data);
  const name = filters.name;
  const path = filters.path;
  const out = [];
  for (const s of data) {
    const nbPath = (s.notebook && s.notebook.path) || s.path;
    if (path && nbPath === path) out.push(s);
    else if (name && (nbPath === name || nbPath.endsWith('/' + name))) out.push(s);
  }
  ok(out);
}

main().catch(fail);

