import { Command, Flags } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';

export default class ContentsCreate extends Command {
  static description = 'Create a new empty notebook with proper nbformat v4 boilerplate';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    'kernel-name': commonFlags['kernel-name'],
    'display-name': Flags.string({ description: 'Kernel display name' }),
    language: Flags.string({ description: 'Kernel language' }),
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(ContentsCreate);
    applyUrlFlag(flags);
    const path = flags.notebook;
    if (!path) throw new Error('--notebook is required');
    validateNotebookPath(path);
    const kernelName = flags['kernel-name'];
    const displayName = flags['display-name'] ?? kernelName.replace(/^\w/, c => c.toUpperCase()).replace(/(\d)/, ' $1');
    const language = flags.language ?? (kernelName.startsWith('python') ? 'python' : kernelName);
    const { baseUrl, token } = getConfig();

    try {
      const existing = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token);
      if (existing && existing.type === 'notebook') return ok({ ok: true, created: false, path });
    } catch { /* 404 — proceed */ }

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
