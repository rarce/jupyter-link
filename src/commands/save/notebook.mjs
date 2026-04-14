import { Command } from '@oclif/core';
import { getConfig, httpJson, ok, assertNodeVersion, validateNotebookPath } from '../../lib/common.mjs';
import { commonFlags, applyUrlFlag } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class SaveNotebook extends Command {
  static description = 'Save notebook (round-trip PUT, or no-op when using RTC)';
  static flags = {
    url: commonFlags.url,
    notebook: commonFlags.notebook,
    room: commonFlags.room,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(SaveNotebook);
    applyUrlFlag(flags);

    const path = flags.notebook;
    const roomRef = flags.room;
    if (!path && !roomRef) throw new Error('--notebook is required');

    if (roomRef) {
      await ensureDaemon();
      const out = await request('rtc:status', { room_ref: roomRef });
      if (out.error) throw new Error(out.error);
      ok({ ok: true, rtc: true, synced: out.synced });
      return;
    }

    validateNotebookPath(path);
    const { baseUrl, token } = getConfig();
    const nb = await httpJson('GET', `${baseUrl}/api/contents/${encodeURIComponent(path)}?content=1`, token);
    if (nb.type !== 'notebook') throw new Error('Path is not a notebook');
    await httpJson('PUT', `${baseUrl}/api/contents/${encodeURIComponent(path)}`, token, { type: 'notebook', format: 'json', content: nb.content });
    ok({ ok: true });
  }
}
