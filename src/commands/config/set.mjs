import { Command, Flags } from '@oclif/core';
import { ok, saveConfigFile, configPath } from '../../lib/common.mjs';
import { commonFlags, parseJupyterUrl } from '../../lib/flags.mjs';

export default class ConfigSet extends Command {
  static description = 'Save Jupyter connection settings to ~/.config/jupyter-link/config.json';
  static flags = {
    url: commonFlags.url,
    token: Flags.string({ description: 'Jupyter auth token' }),
    port: Flags.integer({ description: 'Daemon IPC port' }),
  };
  async run() {
    const { flags } = await this.parse(ConfigSet);
    const data = {};
    if (flags.url !== undefined) {
      // When URL carries ?token=…, store both.
      const p = parseJupyterUrl(flags.url);
      data.url = p.baseUrl;
      if (p.token && flags.token === undefined) data.token = p.token;
    }
    if (flags.token !== undefined) data.token = flags.token;
    if (flags.port !== undefined) data.port = flags.port;
    if (Object.keys(data).length === 0) throw new Error('Provide at least one of: --url, --token, --port');
    const merged = saveConfigFile(data);
    ok({ ok: true, path: configPath(), config: merged });
  }
}
