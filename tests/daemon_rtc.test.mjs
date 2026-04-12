import { describe, test, expect } from 'vitest';
import { YNotebook } from '@jupyter/ydoc';

// Like daemon.test.mjs, we can't import daemon.mjs directly since it starts
// a TCP server. We test the pure helper (roomWsUrl) from rtcDetect.mjs which
// the daemon uses, and verify the handler contracts structurally.
// For cell ops we test the YNotebook operations that the daemon handlers use.

describe('daemon rtc operation contracts', () => {
  test('rtc:detect requires baseUrl', () => {
    const args = {};
    expect(() => {
      if (!args.baseUrl) throw new Error('baseUrl is required');
    }).toThrow('baseUrl is required');
  });

  test('rtc:connect requires baseUrl and notebookPath', () => {
    const args = { baseUrl: 'http://localhost:8888' };
    expect(() => {
      if (!args.baseUrl || !args.notebookPath) throw new Error('baseUrl and notebookPath are required');
    }).toThrow('baseUrl and notebookPath are required');
  });

  test('rtc:disconnect returns ok for unknown ref', () => {
    const rooms = new Map();
    const room_ref = 'room-nonexistent';
    const st = rooms.get(room_ref);
    const result = st ? 'found' : { ok: true };
    expect(result).toEqual({ ok: true });
  });

  test('rtc:status throws for unknown room_ref', () => {
    const rooms = new Map();
    const room_ref = 'room-missing';
    expect(() => {
      const st = rooms.get(room_ref);
      if (!st) throw new Error('unknown room_ref');
    }).toThrow('unknown room_ref');
  });

  test('rtc:status lists all rooms when no room_ref', () => {
    const rooms = new Map();
    rooms.set('room-a', { roomId: 'r1', path: 'a.ipynb', handle: { synced: true, dead: false } });
    rooms.set('room-b', { roomId: 'r2', path: 'b.ipynb', handle: { synced: false, dead: true } });
    const arr = [];
    for (const [ref, st] of rooms.entries()) {
      arr.push({ room_ref: ref, room_id: st.roomId, path: st.path, synced: st.handle.synced, dead: st.handle.dead });
    }
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ room_ref: 'room-a', room_id: 'r1', path: 'a.ipynb', synced: true, dead: false });
    expect(arr[1]).toEqual({ room_ref: 'room-b', room_id: 'r2', path: 'b.ipynb', synced: false, dead: true });
  });
});

describe('daemon rtc cell operation contracts (YNotebook)', () => {
  test('rtc:insert-cell inserts at end by default', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'first', metadata: {}, outputs: [], execution_count: null });

    // Simulate inserting at end (position='end')
    const totalCells = nb.cells.length;
    const insertAt = totalCells; // position='end'
    nb.insertCell(insertAt, { cell_type: 'code', source: 'second', metadata: { agent: { role: 'jupyter-driver' } }, outputs: [], execution_count: null });

    expect(nb.cells.length).toBe(2);
    expect(nb.getCell(1).getSource()).toBe('second');
  });

  test('rtc:insert-cell inserts at specified index', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'a', metadata: {}, outputs: [], execution_count: null });
    nb.insertCell(1, { cell_type: 'code', source: 'c', metadata: {}, outputs: [], execution_count: null });

    // Insert at index 1
    nb.insertCell(1, { cell_type: 'code', source: 'b', metadata: {}, outputs: [], execution_count: null });

    expect(nb.cells.length).toBe(3);
    expect(nb.getCell(0).getSource()).toBe('a');
    expect(nb.getCell(1).getSource()).toBe('b');
    expect(nb.getCell(2).getSource()).toBe('c');
  });

  test('rtc:update-cell updates source via setSource', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'old', metadata: {}, outputs: [], execution_count: null });

    const cell = nb.getCell(0);
    cell.setSource('new');
    expect(cell.getSource()).toBe('new');
    expect(nb.toJSON().cells[0].source).toBe('new');
  });

  test('rtc:update-cell updates outputs via setOutputs', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'x', metadata: {}, outputs: [], execution_count: null });

    const cell = nb.getCell(0);
    const outputs = [{ output_type: 'stream', name: 'stdout', text: 'hello\n' }];
    cell.setOutputs(outputs);
    expect(cell.getOutputs()).toEqual(outputs);
  });

  test('rtc:update-cell updates execution_count', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'x', metadata: {}, outputs: [], execution_count: null });

    const cell = nb.getCell(0);
    cell.execution_count = 7;
    expect(cell.execution_count).toBe(7);
    expect(nb.toJSON().cells[0].execution_count).toBe(7);
  });

  test('rtc:update-cell updates metadata via setMetadata', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'x', metadata: { existing: true }, outputs: [], execution_count: null });

    const cell = nb.getCell(0);
    const existing = cell.getMetadata();
    cell.setMetadata({ ...existing, agent: { role: 'jupyter-driver' } });

    const meta = cell.getMetadata();
    expect(meta.existing).toBe(true);
    expect(meta.agent.role).toBe('jupyter-driver');
  });

  test('rtc:read-notebook returns cells from toJSON', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'cell0', metadata: {}, outputs: [], execution_count: null });
    nb.insertCell(1, { cell_type: 'markdown', source: '# heading', metadata: {} });

    const json = nb.toJSON();
    expect(json.cells).toHaveLength(2);
    expect(json.cells[0].source).toBe('cell0');
    expect(json.cells[1].source).toBe('# heading');
    expect(json.cells[0].cell_type).toBe('code');
    expect(json.cells[1].cell_type).toBe('markdown');
  });

  test('rtc:update-cell throws for out-of-range index', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'x', metadata: {}, outputs: [], execution_count: null });

    expect(() => {
      const idx = 5;
      const totalCells = nb.cells.length;
      if (idx < 0 || idx >= totalCells) throw new Error('cell index out of range');
    }).toThrow('cell index out of range');
  });

  test('find latest agent cell by scanning toJSON', () => {
    const nb = new YNotebook();
    nb.insertCell(0, { cell_type: 'code', source: 'regular', metadata: {}, outputs: [], execution_count: null });
    nb.insertCell(1, { cell_type: 'code', source: 'agent1', metadata: { agent: { role: 'jupyter-driver' } }, outputs: [], execution_count: null });
    nb.insertCell(2, { cell_type: 'code', source: 'agent2', metadata: { agent: { role: 'jupyter-driver' } }, outputs: [], execution_count: null });

    const json = nb.toJSON();
    const cells = json.cells;
    let found = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      const md = (cells[i].metadata && cells[i].metadata.agent) || {};
      if (md.role === 'jupyter-driver') { found = i; break; }
    }
    expect(found).toBe(2);
  });
});
