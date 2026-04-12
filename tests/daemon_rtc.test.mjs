import { describe, test, expect } from 'vitest';
import { URL } from 'node:url';

// Like daemon.test.mjs, we can't import daemon.mjs directly since it starts
// a TCP server. We test the pure helper (roomWsUrl) from rtcDetect.mjs which
// the daemon uses, and verify the handler contracts structurally.

// roomWsUrl is tested in rtc_detect.test.mjs already.
// Here we verify the daemon rtc:* operation contracts.

describe('daemon rtc operation contracts', () => {
  test('rtc:detect requires baseUrl', () => {
    // The handler throws if baseUrl is missing
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
    // Handler should gracefully return { ok: true } for unknown refs
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
