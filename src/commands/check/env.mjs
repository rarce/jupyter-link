import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion } from '../../lib/common.mjs';

export default class CheckEnv extends Command {
  static description = 'Verify connectivity and basic Jupyter Server compatibility';
  async run() {
    assertNodeVersion();
    const { baseUrl, token } = getConfig();
    const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token).catch(e => ({ error: e.message }));
    const contents = await httpJson('GET', `${baseUrl}/api/contents`, token).catch(e => ({ error: e.message }));
    ok({ ok: !sessions.error && !contents.error, sessions_ok: !sessions.error, contents_ok: !contents.error, details: { sessions, contents } });
  }
}

