/**
 * RTC detection and file-ID resolution for jupyter-collaboration.
 *
 * jupyter-collaboration exposes:
 *   GET /api/collaboration/session/{path}  -> session info with file_id
 *   WS  /api/collaboration/room/{room_id}  -> Yjs sync room
 *
 * When the extension is NOT installed those endpoints return 404, so a
 * single probe is enough.
 */

import { joinUrl } from './common.mjs';

/**
 * Detect whether jupyter-collaboration is available on the server.
 * Returns { available: true/false, version?: string }.
 */
export async function detectRTC(baseUrl, token) {
  const url = joinUrl(baseUrl, '/api/collaboration/session/');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `token ${token}`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(t);
    // The endpoint only accepts PUT. When the extension is installed:
    //   - 405 Method Not Allowed (endpoint exists, wrong method)
    //   - 200 in some versions
    // When the extension is NOT installed: 404 (no such route).
    if (res.ok || res.status === 405) return { available: true };
    if (res.status === 404) {
      // Heuristic fallback: some proxies return 404 from the extension with a body
      // that mentions collaboration. Keep as available only if we can confirm it.
      const txt = await res.text().catch(() => '');
      return { available: txt.includes('collaboration') };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Resolve a notebook path to a file_id and room_id via the collaboration
 * session endpoint.
 *
 * GET /api/collaboration/session/{encoded_path}
 * Returns { sessionId, fileId, roomId } or throws.
 *
 * The room_id format is: `json:notebook:{file_id}`
 */
export async function resolveRoom(baseUrl, token, notebookPath) {
  // The path sent to the API should not have a leading slash
  const cleanPath = notebookPath.replace(/^\//, '');
  const url = joinUrl(baseUrl, `/api/collaboration/session/${encodeURIComponent(cleanPath)}`);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `token ${token}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ format: 'json', type: 'notebook' }), signal: controller.signal });
  clearTimeout(t);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Failed to resolve room for ${cleanPath}: ${res.status} ${txt}`);
  }
  const data = await res.json();
  // Response shape: { sessionId: "...", fileId: "...", format: "json", type: "notebook", ... }
  const fileId = data.fileId || data.file_id;
  const sessionId = data.sessionId || data.session_id;
  if (!fileId) throw new Error(`No fileId returned for ${cleanPath}`);
  const roomId = `json:notebook:${fileId}`;
  return { sessionId, fileId, roomId, path: cleanPath };
}

/**
 * Build the collaboration WebSocket URL for a given room.
 */
export function roomWsUrl(baseUrl, token, roomId, sessionId) {
  const u = new URL(baseUrl);
  const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (sessionId) params.set('sessionId', sessionId);
  return `${wsScheme}//${u.host}${u.pathname.replace(/\/$/, '')}/api/collaboration/room/${roomId}?${params.toString()}`;
}
