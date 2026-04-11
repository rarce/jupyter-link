import { Command } from '@oclif/core';
import { ok, getConfig, loadConfigFile, configPath } from '../../lib/common.mjs';

export default class ConfigGet extends Command {
  static description = 'Show effective configuration (env vars > config file > defaults)';
  async run() {
    const file = loadConfigFile();
    const env = process.env;
    const config = getConfig();
    const source = {
      url: env.JUPYTER_URL ? 'env' : file.url ? 'file' : 'default',
      token: env.JUPYTER_TOKEN ? 'env' : file.token ? 'file' : 'default',
      port: env.JUPYTER_LINK_PORT ? 'env' : file.port ? 'file' : 'default',
    };
    ok({ url: config.baseUrl, token: config.token ? '***' : null, port: config.port, source, path: configPath() });
  }
}
