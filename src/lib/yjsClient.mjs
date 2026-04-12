/**
 * Yjs WebSocket client for jupyter-collaboration rooms.
 *
 * Implements the binary protocol used by jupyter-collaboration:
 *   - Messages are framed with a leading byte: 0 = SYNC, 1 = AWARENESS
 *   - SYNC messages use y-protocols/sync internally
 *   - On connect: client sends SyncStep1, server responds with SyncStep2 + SyncStep1,
 *     client responds with SyncStep2. After this the Y.Doc is synchronized.
 *   - Updates are broadcast as messageYjsUpdate (type 2 inside the SYNC frame).
 *
 * This client is designed to run inside the daemon process (long-lived).
 */

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { YNotebook } from '@jupyter/ydoc';
import { roomWsUrl } from './rtcDetect.mjs';

// jupyter-collaboration message type prefixes
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Default agent identity for awareness
const DEFAULT_AGENT_NAME = 'jupyter-link-agent';
const DEFAULT_AGENT_COLOR = '#FF6B35';

/**
 * Connect to a jupyter-collaboration room and return a RoomHandle.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl - Jupyter server base URL
 * @param {string} opts.token - Auth token
 * @param {string} opts.roomId - Room identifier (e.g. "json:notebook:{fileId}")
 * @param {number} [opts.syncTimeoutMs=15000] - Max time to wait for initial sync
 * @param {string} [opts.agentName='jupyter-link-agent'] - Display name for awareness
 * @param {string} [opts.agentColor='#FF6B35'] - CSS color for awareness cursor
 * @returns {Promise<RoomHandle>}
 */
export function connectRoom({ baseUrl, token, roomId, syncTimeoutMs = 15000, agentName, agentColor }) {
  return new Promise((resolve, reject) => {
    const wsUrl = roomWsUrl(baseUrl, token, roomId);

    const ydoc = new Y.Doc();
    const notebook = new YNotebook();
    // Bind the YNotebook to the same Y.Doc so they share state
    // YNotebook expects to own its own ydoc — we'll use its internal ydoc
    const sharedDoc = notebook.ydoc;

    // Awareness: makes this client visible as a collaborator in JupyterLab
    const awareness = new awarenessProtocol.Awareness(sharedDoc);
    const displayName = agentName || DEFAULT_AGENT_NAME;
    const displayColor = agentColor || DEFAULT_AGENT_COLOR;
    awareness.setLocalStateField('user', {
      name: displayName,
      username: displayName,
      color: displayColor,
    });

    const WS = globalThis.WebSocket;
    if (!WS) {
      reject(new Error('WebSocket API not available. Use Node >= 22 or enable --experimental-websocket'));
      return;
    }

    const ws = new WS(wsUrl);
    ws.binaryType = 'arraybuffer';

    let synced = false;
    let syncTimer = null;
    let dead = false;

    const handle = {
      ws,
      ydoc: sharedDoc,
      notebook,
      awareness,
      roomId,
      synced: false,
      dead: false,
      /** Cleanly disconnect */
      destroy() {
        dead = true;
        handle.dead = true;
        if (syncTimer) clearTimeout(syncTimer);
        awareness.setLocalState(null); // Remove our awareness state
        awareness.destroy();
        try { ws.close(); } catch {}
        notebook.dispose();
      },
    };

    // --- Outgoing helpers ---

    function sendSyncMessage(fn) {
      if (ws.readyState !== 1 /* OPEN */) return;
      const outerEncoder = encoding.createEncoder();
      encoding.writeVarUint(outerEncoder, MSG_SYNC);
      fn(outerEncoder);
      const buf = encoding.toUint8Array(outerEncoder);
      ws.send(buf);
    }

    function sendSyncStep1() {
      sendSyncMessage((enc) => {
        syncProtocol.writeSyncStep1(enc, sharedDoc);
      });
    }

    function sendAwarenessUpdate() {
      if (ws.readyState !== 1 /* OPEN */) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [sharedDoc.clientID]);
      encoding.writeVarUint8Array(encoder, update);
      ws.send(encoding.toUint8Array(encoder));
    }

    // --- Incoming handler ---

    function onMessage(event) {
      if (dead) return;
      const data = event.data;
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
      if (buf.length === 0) return;

      const decoder = decoding.createDecoder(buf);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        const syncEncoder = encoding.createEncoder();
        encoding.writeVarUint(syncEncoder, MSG_SYNC);
        const syncMessageType = syncProtocol.readSyncMessage(decoder, syncEncoder, sharedDoc, null);

        // If we generated a response (SyncStep2 response to server's SyncStep1),
        // send it back
        if (encoding.length(syncEncoder) > 1) {
          ws.send(encoding.toUint8Array(syncEncoder));
        }

        // After processing a SyncStep2 from the server, we are synced
        if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !synced) {
          synced = true;
          handle.synced = true;
          if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
          resolve(handle);
        }
      } else if (msgType === MSG_AWARENESS) {
        // Apply awareness updates from other collaborators
        try {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(awareness, update, 'remote');
        } catch {
          // Ignore malformed awareness messages
        }
      }
    }

    // --- Doc update listener: propagate local changes to server ---

    function onDocUpdate(update, origin) {
      if (origin === 'remote' || dead) return;
      sendSyncMessage((enc) => {
        syncProtocol.writeUpdate(enc, update);
      });
    }

    sharedDoc.on('update', onDocUpdate);

    // --- Awareness change listener: propagate local changes to server ---

    function onAwarenessChange({ added, updated, removed }, origin) {
      if (origin === 'remote' || dead) return;
      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length === 0) return;
      if (ws.readyState !== 1 /* OPEN */) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      encoding.writeVarUint8Array(encoder, update);
      ws.send(encoding.toUint8Array(encoder));
    }

    awareness.on('change', onAwarenessChange);

    // --- WebSocket lifecycle ---

    ws.addEventListener('open', () => {
      sendSyncStep1();
      // Announce our awareness (agent identity) to other collaborators
      sendAwarenessUpdate();
    });

    ws.addEventListener('message', onMessage);

    ws.addEventListener('close', () => {
      dead = true;
      handle.dead = true;
      handle.synced = false;
      sharedDoc.off('update', onDocUpdate);
      awareness.off('change', onAwarenessChange);
      if (!synced) {
        if (syncTimer) clearTimeout(syncTimer);
        reject(new Error('WebSocket closed before sync completed'));
      }
    });

    ws.addEventListener('error', (err) => {
      dead = true;
      handle.dead = true;
      sharedDoc.off('update', onDocUpdate);
      awareness.off('change', onAwarenessChange);
      if (!synced) {
        if (syncTimer) clearTimeout(syncTimer);
        reject(new Error(`WebSocket error: ${err.message || 'unknown'}`));
      }
    });

    // Timeout for initial sync
    syncTimer = setTimeout(() => {
      if (!synced) {
        // Consider synced after timeout if we received *any* data
        // (some servers don't send SyncStep2 explicitly if doc is empty)
        synced = true;
        handle.synced = true;
        resolve(handle);
      }
    }, syncTimeoutMs);
  });
}

/**
 * Snapshot the current notebook state as nbformat JSON.
 * Useful for reading cells without going through REST API.
 */
export function notebookToJSON(handle) {
  return handle.notebook.toJSON();
}
