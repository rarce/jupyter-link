import { Command } from '@oclif/core';
import { ok, assertNodeVersion } from '../../lib/common.mjs';
import { commonFlags } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class CollectOutputs extends Command {
  static description = 'Wait for outputs/reply/idle for a parent_msg_id on a channel';
  static flags = {
    ref: commonFlags.ref,
    'parent-id': commonFlags['parent-id'],
    timeout: commonFlags.timeout,
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(CollectOutputs);
    if (!flags.ref) throw new Error('--ref is required');
    if (!flags['parent-id']) throw new Error('--parent-id is required');
    await ensureDaemon();
    const out = await request('collect', {
      channel_ref: flags.ref,
      parent_msg_id: flags['parent-id'],
      timeout_s: flags.timeout,
    });
    if (out.error) throw new Error(out.error);
    ok(out);
  }
}
