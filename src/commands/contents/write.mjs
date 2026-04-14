import { Command, Flags } from '@oclif/core';
import { readFileSync } from 'node:fs';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';

export default class WriteNotebook extends Command {
  static description = 'Write notebook JSON via Contents API';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    'content-file': Flags.string({ description: 'Path to JSON file with notebook content' }),
    content: Flags.string({ description: 'Literal notebook JSON (prefer --content-file for large payloads)' }),
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(WriteNotebook);
    applyUrlFlag(flags);
    const path = flags.notebook;
    if (!path) throw new Error('--notebook is required');
    const raw = flags['content-file'] ? readFileSync(flags['content-file'], 'utf8') : flags.content;
    if (!raw) throw new Error('--content or --content-file is required');
    const nb = JSON.parse(raw);
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb });
    ok({ ok: true });
  }
}
