import { Command, Flags } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';

export default class SessionsCreate extends Command {
  static description = 'Create a Jupyter session (start a kernel) for a notebook';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    'kernel-name': commonFlags['kernel-name'],
    type: Flags.string({ description: 'Session type', default: 'notebook' }),
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(SessionsCreate);
    applyUrlFlag(flags);
    const path = flags.notebook;
    if (!path) throw new Error('--notebook is required');
    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();

    const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    const existing = sessions.find(s => s.notebook && s.notebook.path === path);
    if (existing) return ok(existing);

    const name = path.split('/').pop();
    const body = { path, name, type: flags.type, kernel: { name: flags['kernel-name'] } };
    const session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
    ok(session);
  }
}
