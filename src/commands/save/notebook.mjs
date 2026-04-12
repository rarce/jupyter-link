import { Command } from '@oclif/core';
import { getConfig, httpJson, readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class SaveNotebook extends Command {
  static description = 'Save notebook (round-trip PUT, or no-op when using RTC)';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const path = input.path ?? input.notebook;
    const roomRef = input.room_ref;
    if (!path && !roomRef) throw new Error('path is required');

    // RTC path: Y.Doc changes auto-save to disk via jupyter-collaboration (~1s).
    // Nothing to do, but we can verify the room is still connected.
    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:status', { room_ref: roomRef });
      if (out.error) throw new Error(out.error);
      ok({ ok: true, rtc: true, synced: out.synced });
      return;
    }

    // REST path (original)
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb.content });
    ok({ ok: true });
  }
}
