import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';

export default class ReadNotebook extends Command {
  static description = 'Read a notebook JSON via Contents API';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    if (!path) throw new Error('path is required');
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    ok(nb.content);
  }
}

