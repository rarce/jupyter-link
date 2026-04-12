import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';

export default class ContentsCreate extends Command {
  static description = 'Create a new empty notebook with proper nbformat v4 boilerplate';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    if (!path) throw new Error('path is required');
    const kernelName = input.kernel_name ?? input.kernel ?? 'python3';
    const displayName = input.display_name ?? kernelName.replace(/^\w/, c => c.toUpperCase()).replace(/(\d)/, ' $1');
    const language = input.language ?? (kernelName.startsWith('python') ? 'python' : kernelName);
    const { baseUrl, token } = getConfig();

    // Check if notebook already exists
    try {
      const existing = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token);
      if (existing && existing.type === 'notebook') return ok({ ok: true, created: false, path });
    } catch { /* 404 — does not exist, proceed to create */ }

    const nb = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { display_name: displayName, language, name: kernelName },
        language_info: { name: language },
      },
      cells: [],
    };

    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, {
      type: 'notebook', format: 'json', content: nb,
    });
    ok({ ok: true, created: true, path });
  }
}
