import { Command } from '@oclif/core';
import { readStdinJson, ok, assertNodeVersion } from '../../lib/common.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class ExecuteCode extends Command {
  static description = 'Send execute_request on an open channel and return parent_msg_id';
  async run() {
    assertNodeVersion();
    const input = await readStdinJson();
    const ref = input.channel_ref ?? input.ref;
    if (!ref) throw new Error('channel_ref is required (call open_kernel_channels first)');
    await ensureDaemon();
    const out = await request('exec', { channel_ref: ref, code: input.code ?? input.source, allow_stdin: !!input.allow_stdin, stop_on_error: input.stop_on_error !== false });
    if (out.error) throw new Error(out.error);
    ok({ parent_msg_id: out.parent_msg_id });
  }
}

