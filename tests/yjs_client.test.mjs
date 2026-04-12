import { describe, test, expect } from 'vitest';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { YNotebook } from '@jupyter/ydoc';

/**
 * These tests verify that the Yjs primitives we use in yjsClient.mjs work
 * correctly — encoding/decoding sync messages, Y.Doc sync between two docs,
 * and YNotebook cell operations.
 *
 * We can't test the actual WebSocket connection without a running
 * jupyter-collaboration server, so we test the sync protocol logic in
 * isolation using two Y.Docs that sync locally.
 */

describe('Yjs sync protocol round-trip', () => {
  test('two Y.Docs sync via SyncStep1 + SyncStep2', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // doc1 has some data
    doc1.getMap('test').set('key', 'value');

    // doc1 → SyncStep1
    const enc1 = encoding.createEncoder();
    syncProtocol.writeSyncStep1(enc1, doc1);
    const step1 = encoding.toUint8Array(enc1);

    // doc2 receives SyncStep1, generates SyncStep2
    const dec1 = decoding.createDecoder(step1);
    const enc2 = encoding.createEncoder();
    syncProtocol.readSyncMessage(dec1, enc2, doc2, null);
    const step2 = encoding.toUint8Array(enc2);

    // doc2 → SyncStep1 (doc2 also needs to send its state)
    const enc3 = encoding.createEncoder();
    syncProtocol.writeSyncStep1(enc3, doc2);
    const step1from2 = encoding.toUint8Array(enc3);

    // doc1 receives SyncStep2 from doc2 — should now have doc2's ack
    const dec2 = decoding.createDecoder(step2);
    const enc4 = encoding.createEncoder();
    syncProtocol.readSyncMessage(dec2, enc4, doc1, null);

    // doc1 receives SyncStep1 from doc2, generates SyncStep2
    const dec3 = decoding.createDecoder(step1from2);
    const enc5 = encoding.createEncoder();
    syncProtocol.readSyncMessage(dec3, enc5, doc1, null);
    const step2from1 = encoding.toUint8Array(enc5);

    // doc2 receives SyncStep2 from doc1
    const dec4 = decoding.createDecoder(step2from1);
    const enc6 = encoding.createEncoder();
    syncProtocol.readSyncMessage(dec4, enc6, doc2, null);

    // Now doc2 should have doc1's data
    expect(doc2.getMap('test').get('key')).toBe('value');
  });

  test('incremental updates propagate between docs', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Initial sync (both empty)
    syncDocs(doc1, doc2);

    // doc1 makes a change
    doc1.getMap('data').set('x', 42);
    const update = Y.encodeStateAsUpdate(doc1, Y.encodeStateVector(doc2));
    Y.applyUpdate(doc2, update);

    expect(doc2.getMap('data').get('x')).toBe(42);
  });
});

describe('YNotebook cell operations', () => {
  test('insert and read a code cell', () => {
    const nb = new YNotebook();
    nb.insertCell(0, {
      cell_type: 'code',
      source: 'print("hello")',
      metadata: {},
      outputs: [],
      execution_count: null,
    });
    expect(nb.cells.length).toBe(1);
    const cell = nb.getCell(0);
    expect(cell.cell_type).toBe('code');
    expect(cell.getSource()).toBe('print("hello")');
  });

  test('insert multiple cells and delete one', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'a = 1', metadata: {}, outputs: [], execution_count: null });
    nb.insertCell(1, { cell_type: 'code', source: 'b = 2', metadata: {}, outputs: [], execution_count: null });
    nb.insertCell(2, { cell_type: 'markdown', source: '# Title', metadata: {} });
    expect(nb.cells.length).toBe(3);

    nb.deleteCell(1);
    expect(nb.cells.length).toBe(2);
    expect(nb.getCell(0).getSource()).toBe('a = 1');
    expect(nb.getCell(1).getSource()).toBe('# Title');
  });

  test('toJSON produces valid nbformat structure', () => {
    const nb = new YNotebook();
    nb.insertCell(0, {
      cell_type: 'code',
      source: 'x = 1',
      metadata: {},
      outputs: [],
      execution_count: null,
    });
    const json = nb.toJSON();
    expect(json).toHaveProperty('cells');
    expect(json.cells).toHaveLength(1);
    expect(json.cells[0].cell_type).toBe('code');
    expect(json.cells[0].source).toBe('x = 1');
  });

  test('setOutputs and getOutputs on a code cell', () => {
    const nb = new YNotebook();
    nb.insertCell(0, {
      cell_type: 'code',
      source: 'print(1)',
      metadata: {},
      outputs: [],
      execution_count: null,
    });
    const cell = nb.getCell(0);
    const outputs = [{ output_type: 'stream', name: 'stdout', text: '1\n' }];
    cell.setOutputs(outputs);
    expect(cell.getOutputs()).toEqual(outputs);
  });
});

describe('message framing (MSG_SYNC prefix)', () => {
  test('SYNC messages have prefix byte 0', () => {
    const doc = new Y.Doc();
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // MSG_SYNC = 0
    syncProtocol.writeSyncStep1(encoder, doc);
    const buf = encoding.toUint8Array(encoder);

    const decoder = decoding.createDecoder(buf);
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(0);
  });
});

// Helper: full bidirectional sync between two docs
function syncDocs(doc1, doc2) {
  const e1 = encoding.createEncoder();
  syncProtocol.writeSyncStep1(e1, doc1);
  const s1 = encoding.toUint8Array(e1);

  const d1 = decoding.createDecoder(s1);
  const r1 = encoding.createEncoder();
  syncProtocol.readSyncMessage(d1, r1, doc2, null);
  const s2 = encoding.toUint8Array(r1);

  const e2 = encoding.createEncoder();
  syncProtocol.writeSyncStep1(e2, doc2);
  const s1b = encoding.toUint8Array(e2);

  if (s2.length > 0) {
    const d2 = decoding.createDecoder(s2);
    const r2 = encoding.createEncoder();
    syncProtocol.readSyncMessage(d2, r2, doc1, null);
  }

  const d3 = decoding.createDecoder(s1b);
  const r3 = encoding.createEncoder();
  syncProtocol.readSyncMessage(d3, r3, doc1, null);
  const s2b = encoding.toUint8Array(r3);

  if (s2b.length > 0) {
    const d4 = decoding.createDecoder(s2b);
    const r4 = encoding.createEncoder();
    syncProtocol.readSyncMessage(d4, r4, doc2, null);
  }
}
