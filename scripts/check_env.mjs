import { getConfig, httpJson, ok, fail, assertNodeVersion } from './util.mjs';

async function main() {
  assertNodeVersion();
  const { baseUrl, token } = getConfig();
  // Try sessions and contents root
  const sessions = await httpJson('GET', `${baseUrl}/api/sessions`, token).catch(e => ({ error: e.message }));
  const contents = await httpJson('GET', `${baseUrl}/api/contents`, token).catch(e => ({ error: e.message }));
  ok({
    ok: !sessions.error && !contents.error,
    sessions_ok: !sessions.error,
    contents_ok: !contents.error,
    details: { sessions, contents }
  });
}

main().catch(fail);

