import { Command } from '@oclif/core';
import { readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class CloseChannels extends Command {
  static description = 'Close a previously opened channel_ref';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const ref = input.channel_ref ?? input.ref;
    if (!ref) throw new Error('channel_ref is required');
    await ensureDaemon();
    const out = await request('close', { channel_ref: ref });
    if (out.error) throw new Error(out.error);
    ok(out);
  }
}

