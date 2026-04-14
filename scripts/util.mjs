// Re-export from canonical source to avoid duplication
export {
  getConfig,
  assertNodeVersion,
  joinUrl,
  httpJson,
  readStdinJson,
  ok,
  fail,
  nowIso,
  newSessionId,
  assertHttpUrl,
  validateKernelId,
  validateSessionId,
  validateNotebookPath,
  encodeNotebookPath,
} from '../src/lib/common.mjs';
