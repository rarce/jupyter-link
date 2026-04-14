import { getConfig, httpJson, readStdinJson, ok, fail, assertNodeVersion, validateNotebookPath } from './util.mjs';
import { ensureDaemon, request } from './ipc_client.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const { baseUrl, token } = getConfig();
  let kernelId = input.kernel_id;
  if (!kernelId) {
    // discover by session/notebook
    const nbPath = input.path ?? input.notebook;
    if (!nbPath) throw new Error('kernel_id or notebook path required');
    validateNotebookPath(nbPath);
    const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    let session = sessions.find(s => s.notebook && s.notebook.path === nbPath);
    if (!session) {
      const name = nbPath.split('/').pop();
      session = sessions.find(s => (s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name)));
    }
    if (!session) throw new Error('No running session for target notebook');
    kernelId = session.kernel && session.kernel.id;
    if (!kernelId) throw new Error('Selected session has no kernel id');
  }

  await ensureDaemon();
  const out = await request('open', { baseUrl, token, kernelId });
  if (out.error) throw new Error(out.error);
  ok(out);
}

main().catch(fail);

