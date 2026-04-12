import { Command } from '@oclif/core';
import { readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class CloseChannels extends Command {
  static description = 'Close a previously opened channel_ref (and optionally an RTC room_ref)';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const ref = input.channel_ref ?? input.ref;
    const roomRef = input.room_ref;
    if (!ref && !roomRef) throw new Error('channel_ref or room_ref is required');
    await ensureDaemon();

    const results = {};

    // Close kernel channel if provided
    if (ref) {
      const out = await request('close', { channel_ref: ref });
      if (out.error) throw new Error(out.error);
      results.channel_closed = true;
    }

    // Disconnect RTC room if provided
    if (roomRef) {
      const out = await request('rtc:disconnect', { room_ref: roomRef });
      if (out.error) throw new Error(out.error);
      results.room_disconnected = true;
    }

    ok({ ok: true, ...results });
  }
}
