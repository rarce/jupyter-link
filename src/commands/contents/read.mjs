import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';

export default class ReadNotebook extends Command {
  static description = 'Read a notebook JSON via Contents API';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(ReadNotebook);
    applyUrlFlag(flags);
    const path = flags.notebook;
    if (!path) throw new Error('--notebook is required');
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    ok(nb.content);
  }
}
