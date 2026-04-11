import { Command } from '@oclif/core';
import { readStdinJson, ok, saveConfigFile, configPath } from '../../lib/common.mjs';

export default class ConfigSet extends Command {
  static description = 'Save Jupyter connection settings to ~/.config/jupyter-link/config.json';
  async run() {
    const input = await readStdinJson();
    const data = {};
    if (input.url !== undefined) data.url = input.url;
    if (input.token !== undefined) data.token = input.token;
    if (input.port !== undefined) data.port = input.port;
    if (Object.keys(data).length === 0) throw new Error('Provide at least one of: url, token, port');
    const merged = saveConfigFile(data);
    ok({ ok: true, path: configPath(), config: merged });
  }
}
