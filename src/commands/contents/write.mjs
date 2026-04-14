import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';

export default class WriteNotebook extends Command {
  static description = 'Write notebook JSON via Contents API';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    const nb = input.nb_json ?? input.content;
    if (!path) throw new Error('path is required');
    if (!nb) throw new Error('nb_json is required');
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb });
    ok({ ok: true });
  }
}

