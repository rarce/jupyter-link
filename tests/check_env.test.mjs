import { describe, test, expect, vi, beforeEach } from 'vitest';

const C = {
  httpJson: vi.fn(), ok: vi.fn(),
  getConfig: vi.fn(() => ({ baseUrl: 'http://h', token: 't' })),
  assertNodeVersion: vi.fn(),
  validateNotebookPath: vi.fn((p) => p), validateKernelId: vi.fn((id) => id), assertHttpUrl: vi.fn((u) => new URL(u)), encodeNotebookPath: vi.fn((p) => encodeURIComponent(p)),
};
const R = { detectRTC: vi.fn() };
vi.mock('../src/lib/common.mjs', () => C);
vi.mock('../src/lib/rtcDetect.mjs', () => R);
const { default: Check } = await import('../src/commands/check/env.mjs');

describe('check:env', () => {
  beforeEach(() => vi.clearAllMocks());

  test('reports all ok', async () => {
    C.httpJson.mockResolvedValue([]);
    R.detectRTC.mockResolvedValue({ available: true });
    await new Check([], {}).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sessions_ok: true, contents_ok: true, rtc_available: true }));
  });

  test('reports errors', async () => {
    C.httpJson.mockImplementation((m, u) => u.includes('sessions') ? Promise.reject(new Error('sess-err')) : Promise.resolve([]));
    R.detectRTC.mockRejectedValue(new Error('rtc-err'));
    await new Check([], {}).run();
    expect(C.ok).toHaveBeenCalledWith(expect.objectContaining({ ok: false, sessions_ok: false, contents_ok: true, rtc_available: false }));
  });
});
