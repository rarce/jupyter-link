import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, nowIso, validateNotebookPath } from '../lib/common.mjs';
import {
  commonFlags, applyUrlFlag, readCode,
  getCachedChannel, cacheChannel, dropCachedChannel,
} from '../lib/flags.mjs';
import { ensureDaemon, request } from '../lib/daemonClient.mjs';

// One-shot notebook execution: resolves notebook → kernel → open (cached) →
// insert cell → execute → collect → update cell. Keeps channel_ref in
// ~/.config/jupyter-link/state.json so repeated invocations reuse the same
// open WebSocket. On stale-ref errors we evict and retry once.
export default class Exec extends Command {
  static description = 'Execute code against a notebook in a single call (auto-opens and reuses channels)';
  static examples = [
    '$ jupyter-link exec --url http://host:8888/notebooks/foo.ipynb?token=XYZ --code-file /tmp/x.py',
    '$ jupyter-link exec --notebook foo.ipynb --code "print(1+1)"',
  ];
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    code: commonFlags.code,
    'code-file': commonFlags['code-file'],
    index: commonFlags.index,
    position: commonFlags.position,
    timeout: commonFlags.timeout,
    'kernel-name': commonFlags['kernel-name'],
    'stop-on-error': commonFlags['stop-on-error'],
    metadata: commonFlags.metadata,
  };

  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(Exec);
    applyUrlFlag(flags);

    const path = flags.notebook;
    if (!path) throw new Error('--notebook (or --url with /notebooks/<path>) is required');
    validateNotebookPath(path);
    const code = await readCode(flags);
    if (!code) throw new Error('--code, --code-file, or --code=- is required');
    const agentMeta = flags.metadata ? JSON.parse(flags.metadata) : {};

    await ensureDaemon();
    const { baseUrl, token } = getConfig();

    const cacheKey = `${baseUrl}|${path}`;
    const channelRef = await this.#resolveChannel(cacheKey, baseUrl, token, path, flags['kernel-name']);

    try {
      return await this.#runOnce({ channelRef, baseUrl, token, path, code, flags, agentMeta });
    } catch (e) {
      // Daemon will surface "unknown ref" / closed-socket errors when the cached
      // channel is dead. Evict and retry once with a fresh channel.
      if (/channel|ref|closed|unknown/i.test(e.message)) {
        dropCachedChannel(cacheKey);
        const fresh = await this.#resolveChannel(cacheKey, baseUrl, token, path, flags['kernel-name']);
        return await this.#runOnce({ channelRef: fresh, baseUrl, token, path, code, flags, agentMeta });
      }
      throw e;
    }
  }

  async #resolveChannel(cacheKey, baseUrl, token, path, kernelName) {
    const cached = getCachedChannel(cacheKey);
    if (cached?.ref) return cached.ref;

    const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
    let session = sessions.find(s => s.notebook && s.notebook.path === path);
    if (!session) {
      const name = path.split('/').pop();
      session = sessions.find(s => s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name));
    }
    if (!session) {
      const name = path.split('/').pop();
      const body = { path, name, type: 'notebook', kernel: { name: kernelName } };
      session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
    }
    const kernelId = session.kernel && session.kernel.id;
    if (!kernelId) throw new Error('Selected session has no kernel id');

    const out = await request('open', { baseUrl, token, kernelId });
    if (out.error) throw new Error(out.error);
    cacheChannel(cacheKey, { ref: out.channel_ref || out.ref, kernelId });
    return out.channel_ref || out.ref;
  }

  async #runOnce({ channelRef, baseUrl, token, path, code, flags, agentMeta }) {
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    const nbj = nb.content;
    const cells = nbj.cells || (nbj.cells = []);
    const meta = { role: 'jupyter-driver', created_at: nowIso(), auto_save: false, ...agentMeta };
    const cell = { cell_type: 'code', metadata: { agent: meta }, source: code, outputs: [], execution_count: null };
    let insertAt;
    if (typeof flags.index === 'number') insertAt = Math.max(0, Math.min(flags.index, cells.length));
    else insertAt = flags.position === 'start' ? 0 : cells.length;
    cells.splice(insertAt, 0, cell);
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj });
    const cellId = insertAt;

    const execOut = await request('exec', {
      channel_ref: channelRef, code, allow_stdin: false, stop_on_error: flags['stop-on-error'],
    });
    if (execOut.error) throw new Error(execOut.error);

    const collectOut = await request('collect', {
      channel_ref: channelRef, parent_msg_id: execOut.parent_msg_id, timeout_s: flags.timeout,
    });
    if (collectOut.error) throw new Error(collectOut.error);

    const outputs = collectOut.outputs || [];
    const executionCount = collectOut.execution_count;

    const nb2 = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    const nbj2 = nb2.content;
    const cells2 = nbj2.cells || [];
    if (cellId >= 0 && cellId < cells2.length) {
      cells2[cellId].outputs = outputs;
      if (executionCount !== undefined && executionCount !== null) cells2[cellId].execution_count = executionCount;
      await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nbj2 });
    }

    ok({ cell_id: cellId, status: collectOut.status || 'unknown', execution_count: executionCount ?? null, outputs });
  }
}
