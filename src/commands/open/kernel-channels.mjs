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
      if (!session) throw new Error('No running session for target notebook');
      kernelId = session.kernel && session.kernel.id;
      if (!kernelId) throw new Error('Selected session has no kernel id');
    }
    await ensureDaemon();
    const out = await request('open', { baseUrl, token, kernelId });
    if (out.error) throw new Error(out.error);
    ok(out);
  }
}

