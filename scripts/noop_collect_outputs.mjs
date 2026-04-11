import { ok, readStdinJson } from './util.mjs';

// Outputs are collected within exec.mjs; return an empty placeholder.
(async function() {
  await readStdinJson();
  ok({ outputs: [], execution_count: null, status: "unknown" });
})();

