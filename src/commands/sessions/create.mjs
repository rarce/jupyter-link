import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';

export default class SessionsCreate extends Command {
  static description = 'Create a Jupyter session (start a kernel) for a notebook';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    if (!path) throw new Error('path is required');
    const kernelName = input.kernel_name ?? input.kernel ?? 'python3';
    const type = input.type ?? 'notebook';
    const { baseUrl, token } = getConfig();

    // Check if a session already exists for this notebook
    const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    const existing = sessions.find(s => s.notebook && s.notebook.path === path);
    if (existing) return ok(existing);

    // Create new session via Jupyter Sessions API
    const name = path.split('/').pop();
    const body = { path, name, type, kernel: { name: kernelName } };
    const session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
    ok(session);
  }
}
