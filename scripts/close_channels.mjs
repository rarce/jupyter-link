import { readStdinJson, ok, fail, assertNodeVersion } from './util.mjs';
import { ensureDaemon, request } from './ipc_client.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const ref = input.channel_ref ?? input.ref;
  if (!ref) throw new Error('channel_ref is required');
  await ensureDaemon();
  const out = await request('close', { channel_ref: ref });
  if (out.error) throw new Error(out.error);
  ok(out);
}

main().catch(fail);

