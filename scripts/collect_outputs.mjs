import { readStdinJson, ok, fail, assertNodeVersion } from './util.mjs';
import { ensureDaemon, request } from './ipc_client.mjs';

async function main() {
  assertNodeVersion();
  const input = await readStdinJson();
  const ref = input.channel_ref ?? input.ref;
  const parent = input.parent_msg_id ?? input.parent_id;
  if (!ref) throw new Error('channel_ref is required');
  if (!parent) throw new Error('parent_msg_id is required');
  await ensureDaemon();
  const out = await request('collect', { channel_ref: ref, parent_msg_id: parent, timeout_s: input.timeout_s || 60 });
  if (out.error) throw new Error(out.error);
  ok(out);
}

main().catch(fail);

