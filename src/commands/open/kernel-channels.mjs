import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class OpenKernelChannels extends Command {
  static description = 'Open persistent kernel WS channels and optionally connect an RTC room';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const { baseUrl, token } = getConfig();
    let kernelId = input.kernel_id;
    const nbPath = input.path ?? input.notebook;
    if (!kernelId) {
      if (!nbPath) throw new Error('kernel_id or notebook path required');
      validateNotebookPath(nbPath);
      const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token);
      let session = sessions.find(s => s.notebook && s.notebook.path === nbPath);
      if (!session) { const name = nbPath.split('/').pop(); session = sessions.find(s => s.notebook && s.notebook.path && s.notebook.path.endsWith('/' + name)); }
      if (!session) {
        // Auto-create session if kernel_name is provided (or default to python3)
        const kernelName = input.kernel_name ?? input.kernel ?? 'python3';
        const name = nbPath.split('/').pop();
        const body = { path: nbPath, name, type: 'notebook', kernel: { name: kernelName } };
        session = await httpJson('POST', `${baseUrl}/api/sessions`, token, body);
      }
      kernelId = session.kernel && session.kernel.id;
      if (!kernelId) throw new Error('Selected session has no kernel id');
    }
    await ensureDaemon();
    const out = await request('open', { baseUrl, token, kernelId });
    if (out.error) throw new Error(out.error);

    const result = { ...out };

    // RTC is auto-preferred: if the server has jupyter-collaboration, use it.
    // Modes: undefined|'auto' = try, degrade silently; true = strict (throw on failure);
    //        false = opt-out (REST only).
    const rtcMode = input.rtc === undefined ? 'auto' : input.rtc;
    const strict = rtcMode === true;
    if (rtcMode !== false && nbPath) {
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
