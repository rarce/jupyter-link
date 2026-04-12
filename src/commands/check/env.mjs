import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { detectRTC } from '../../lib/rtcDetect.mjs';

export default class CheckEnv extends Command {
  static description = 'Verify connectivity and basic Jupyter Server compatibility';
  async run() {
    assertNodeVersion();
    const { baseUrl, token } = getConfig();
    const [sessions, contents, rtc] = await Promise.all([
      httpJson('GET', `${baseUrl}/api/sessions`, token).catch(e => ({ error: e.message })),
      httpJson('GET', `${baseUrl}/api/contents`, token).catch(e => ({ error: e.message })),
      detectRTC(baseUrl, token).catch(e => ({ available: false, error: e.message })),
    ]);
    ok({
      ok: !sessions.error && !contents.error,
      sessions_ok: !sessions.error,
      contents_ok: !contents.error,
      rtc_available: rtc.available,
      details: { sessions, contents, rtc },
    });
  }
}

