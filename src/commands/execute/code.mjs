import { Command } from '@oclif/core';
import { ok, assertNodeVersion } from '../../lib/common.mjs';
import { commonFlags, readCode } from '../../lib/flags.mjs';
import { ensureDaemon, request } from '../../lib/daemonClient.mjs';

export default class ExecuteCode extends Command {
  static description = 'Send execute_request on an open channel and return parent_msg_id';
  static flags = {
    ref: commonFlags.ref,
    code: commonFlags.code,
    'code-file': commonFlags['code-file'],
    'allow-stdin': commonFlags['allow-stdin'],
    'stop-on-error': commonFlags['stop-on-error'],
  };
  async run() {
    assertNodeVersion();
    const { flags } = await this.parse(ExecuteCode);
    if (!flags.ref) throw new Error('--ref is required (call open:kernel-channels first)');
    const code = await readCode(flags);
    if (!code) throw new Error('--code, --code-file, or --code=- is required');
    await ensureDaemon();
    const out = await request('exec', {
      channel_ref: flags.ref,
      code,
      allow_stdin: flags['allow-stdin'],
      stop_on_error: flags['stop-on-error'],
    });
    if (out.error) throw new Error(out.error);
    ok({ parent_msg_id: out.parent_msg_id });
  }
}
