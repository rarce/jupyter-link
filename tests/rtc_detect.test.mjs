import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { roomWsUrl } from '../src/lib/rtcDetect.mjs';

// We can't easily test detectRTC/resolveRoom without a real server,
// but we can test the pure functions and mock fetch for unit tests.

describe('roomWsUrl', () => {
  test('builds correct ws:// URL for http base', () => {
    const url = roomWsUrl('http://localhost:8888', 'tok123', 'json:notebook:abc-123');
    expect(url).toMatch(/^ws:\/\//);
    expect(url).toContain('localhost:8888');
    expect(url).toContain('/api/collaboration/room/json:notebook:abc-123');
    expect(url).toContain('token=tok123');
  });

  test('builds correct wss:// URL for https base', () => {
    const url = roomWsUrl('https://jupyter.example.com', null, 'json:notebook:xyz');
    expect(url).toMatch(/^wss:\/\//);
    expect(url).toContain('jupyter.example.com');
    expect(url).toContain('/api/collaboration/room/json:notebook:xyz');
    expect(url).not.toContain('token=');
  });

  test('strips trailing slash from base URL', () => {
    const url = roomWsUrl('http://localhost:8888/', null, 'json:notebook:foo');
    expect(url).toContain('ws://localhost:8888/api/collaboration/');
    expect(url).not.toContain('//api/');
  });

  test('handles base URL with subpath', () => {
    const url = roomWsUrl('http://localhost:8888/jupyter', null, 'json:notebook:bar');
    expect(url).toContain('/jupyter/api/collaboration/room/json:notebook:bar');
  });
});

describe('detectRTC', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns available:true when endpoint returns 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{}'),
    });
    const { detectRTC } = await import('../src/lib/rtcDetect.mjs');
    const result = await detectRTC('http://localhost:8888', 'tok');
    expect(result.available).toBe(true);
  });

  test('returns available:false when fetch throws (server down)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { detectRTC } = await import('../src/lib/rtcDetect.mjs');
    const result = await detectRTC('http://localhost:8888', null);
    expect(result.available).toBe(false);
  });

  test('returns available:false when 404 from base server (no collab)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('<html>Not Found</html>'),
    });
    const { detectRTC } = await import('../src/lib/rtcDetect.mjs');
    const result = await detectRTC('http://localhost:8888', null);
    expect(result.available).toBe(false);
  });
});

describe('resolveRoom', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('resolves notebook path to roomId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: 'sess-1', fileId: 'file-abc', format: 'json', type: 'notebook' }),
    });
    const { resolveRoom } = await import('../src/lib/rtcDetect.mjs');
    const result = await resolveRoom('http://localhost:8888', 'tok', 'work/demo.ipynb');
    expect(result.fileId).toBe('file-abc');
    expect(result.roomId).toBe('json:notebook:file-abc');
    expect(result.path).toBe('work/demo.ipynb');
  });

  test('strips leading slash from path', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fileId: 'f1', sessionId: 's1' }),
    });
    const { resolveRoom } = await import('../src/lib/rtcDetect.mjs');
    const result = await resolveRoom('http://localhost:8888', null, '/demo.ipynb');
    expect(result.path).toBe('demo.ipynb');
  });

  test('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('not found'),
    });
    const { resolveRoom } = await import('../src/lib/rtcDetect.mjs');
    await expect(resolveRoom('http://localhost:8888', null, 'x.ipynb'))
      .rejects.toThrow(/Failed to resolve room/);
  });
});
