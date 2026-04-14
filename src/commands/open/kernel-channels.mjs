import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag, rtcFlag } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class OpenKernelChannels extends Command {
  static description = 'Open persistent kernel WS channels and optionally connect an RTC room';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    'kernel-id': commonFlags['kernel-id'],
    'kernel-name': commonFlags['kernel-name'],
    rtc: commonFlags.rtc,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(OpenKernelChannels);
    applyUrlFlag(flags);

    const { baseUrl, token } = getConfig();
    let kernelId = flags['kernel-id'];
    const nbPath = flags.notebook;
    if (!kernelId) {
      if (!nbPath) throw new Error('--kernel-id or --notebook is required');
      validateNotebookPath(nbPath);
      const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
      let session = sessions.find(s => s.notebook && s.notebook.path === nbPath);
      if (!session) {
        const name = nbPath.split('/').pop();
        session = sessions.find(s => s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name));
      }
      if (!session) {
        const name = nbPath.split('/').pop();
        const body = { path: nbPath, name, type: 'notebook', kernel: { name: flags['kernel-name'] } };
        session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
      }
      kernelId = session.kernel && session.kernel.id;
      if (!kernelId) throw new Error('Selected session has no kernel id');
    }
    await ensureDaemon();
    const out = await request('open', { baseUrl, token, kernelId });
    if (out.error) throw new Error(out.error);

    const result = { ...out };
    const strict = rtcFlag(flags.rtc) === true;
    const tryRtc = rtcFlag(flags.rtc) !== false;
    if (tryRtc && nbPath) {
      try {
        const rtcOut = await request('rtc:connect', { baseUrl, token, notebookPath: nbPath });
        if (rtcOut.error) {
          if (strict) throw new Error(rtcOut.error);
          result.rtc_connected = false;
          result.rtc_error = rtcOut.error;
        } else {
          result.room_ref = rtcOut.room_ref;
          result.room_id = rtcOut.room_id;
          result.rtc_connected = true;
        }
      } catch (e) {
        if (strict) throw e;
        result.rtc_connected = false;
        result.rtc_error = e.message;
      }
    }
    ok(result);
  }
}
