import { ok, readStdinJson } from './util.mjs';

// This skill opens channels within the execute step.
// We return a stub channel_ref so callers that strictly follow the policy can proceed.
(async function() {
  await readStdinJson();
  ok({ channel_ref: "inline-exec" });
})();

