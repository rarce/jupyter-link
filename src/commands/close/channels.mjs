import { Command } from '@oclif/core';
import { ok, assertNodeVersion } from '../../lib/common.mjs';
import { commonFlags, dropCachedChannel, loadState } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class CloseChannels extends Command {
  static description = 'Close a previously opened channel_ref (and optionally an RTC room_ref)';
  static flags = {
    ref: commonFlags.ref,
    room: commonFlags.room,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(CloseChannels);
    if (!flags.ref && !flags.room) throw new Error('--ref or --room is required');
    await ensureDaemon();

    const results = {};
    if (flags.ref) {
      const out = await request('close', { channel_ref: flags.ref });
      if (out.error) throw new Error(out.error);
      results.channel_closed = true;
      // Evict matching cache entries so exec/run don't reuse a stale ref.
      const s = loadState();
      for (const [k, v] of Object.entries(s.channels || {})) {
        if (v.ref === flags.ref) dropCachedChannel(k);
      }
    }
    if (flags.room) {
      const out = await request('rtc:disconnect', { room_ref: flags.room });
      if (out.error) throw new Error(out.error);
      results.room_disconnected = true;
    }
    ok({ ok: true, ...results });
  }
}
