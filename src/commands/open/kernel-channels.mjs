import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class OpenKernelChannels extends Command {
  static description = 'Open persistent kernel WS channels and return a channel_ref';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const { baseUrl, token } = getConfig();
    let kernelId = input.kernel_id;
    if (!kernelId) {
      const nbPath = input.path ?? input.notebook;
      if (!nbPath) throw new Error('kernel_id or notebook path required');
      const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
      let session = sessions.find(s => s.notebook && s.notebook.path === nbPath);
      if (!session) { const name = nbPath.split('/').pop(); session = sessions.find(s => s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name)); }
      if (!session) {
        // Auto-create session if kernel_name is provided (or default to python3)
        const kernelName = input.kernel_name ?? input.kernel ?? 'python3';
        const name = nbPath.split('/').pop();
        const body = { path: nbPath, name, type: 'notebook', kernel: { name: kernelName } };
        session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
      }
      kernelId = session.kernel && session.kernel.id;
      if (!kernelId) throw new Error('Selected session has no kernel id');
    }
    await ensureDaemon();
    const out = await request('open', { baseUrl, token, kernelId });
    if (out.error) throw new Error(out.error);
    ok(out);
  }
}

