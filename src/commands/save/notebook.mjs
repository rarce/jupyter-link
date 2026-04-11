import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';

export default class SaveNotebook extends Command {
  static description = 'Save notebook (round-trip PUT)';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook; if (!path) throw new Error('path is required');
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb.content });
    ok({ ok: true });
  }
}

