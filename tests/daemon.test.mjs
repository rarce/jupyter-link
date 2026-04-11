import { describe, test, expect } from 'vitest';
import { URL } from 'node:url';

// wsUrlFor is inlined here because importing daemon.mjs starts a TCP server as a side effect
function wsUrlFor(baseUrl, token, kernelId, sessionId) {
  const url = new URL(baseUrl);
  const wsScheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if (token) query.set('token', token);
  query.set('session_id', sessionId);
  return `${wsScheme}//${url.host}${url.pathname.replace(/\/$/, '')}/api/kernels/${kernelId}/channels?${query.toString()}`;
}

describe('wsUrlFor', () => {
  test('converts http to ws scheme', () => {
    const url = wsUrlFor('http://localhost:8888', null, 'kernel-1', 'sess-1');
    expect(url).toMatch(/^ws:\/\//);
    expect(url).toContain('localhost:8888');
    expect(url).toContain('/api/kernels/kernel-1/channels');
    expect(url).toContain('session_id=sess-1');
  });

  test('converts https to wss scheme', () => {
    const url = wsUrlFor('https://jupyter.example.com', null, 'k1', 's1');
    expect(url).toMatch(/^wss:\/\//);
    expect(url).toContain('jupyter.example.com');
  });

  test('includes token in query when provided', () => {
    const url = wsUrlFor('http://localhost:8888', 'my-token', 'k1', 's1');
    expect(url).toContain('token=my-token');
    expect(url).toContain('session_id=s1');
  });

  test('omits token from query when null', () => {
    const url = wsUrlFor('http://localhost:8888', null, 'k1', 's1');
    expect(url).not.toContain('token=');
  });

  test('strips trailing slash from base URL path', () => {
    const url = wsUrlFor('http://localhost:8888/', null, 'k1', 's1');
    expect(url).toContain('ws://localhost:8888/api/kernels/');
    expect(url).not.toContain('//api/');
  });

  test('handles base URL with subpath', () => {
    const url = wsUrlFor('http://localhost:8888/jupyter', null, 'k1', 's1');
    expect(url).toContain('/jupyter/api/kernels/k1/channels');
  });
});
