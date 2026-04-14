import { Command, Flags } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';

export default class ListSessions extends Command {
  static description = 'List sessions and optionally filter by path or name';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    name: Flags.string({ description: 'Filter by notebook file name' }),
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(ListSessions);
    applyUrlFlag(flags);
    const { baseUrl, token } = getConfig();
    const data = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    if (!flags.notebook && !flags.name) return ok(data);
    const out = [];
    for (const s of data) {
      const nbPath = (s.notebook && s.notebook.path) || s.path;
      if (flags.notebook && nbPath === flags.notebook) out.push(s);
      else if (flags.name && (nbPath === flags.name || nbPath.endsWith('/' + flags.name))) out.push(s);
    }
    ok(out);
  }
}
