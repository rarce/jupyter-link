import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';

export default class ListSessions extends Command {
  static description = 'List sessions and optionally filter by path or name';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const { baseUrl, token } = getConfig();
    const data = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    const filters = input.filters || {};
    if (!filters || Object.keys(filters).length === 0) return ok(data);
    const name = filters.name, path = filters.path;
    const out = [];
    for (const s of data) {
      const nbPath = (s.notebook && s.notebook.path) || s.path;
      if (path && nbPath === path) out.push(s);
      else if (name && (nbPath === name || nbPath.endsWith('/' + name))) out.push(s);
    }
    ok(out);
  }
}

