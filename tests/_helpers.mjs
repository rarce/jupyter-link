import { vi } from 'vitest';

// Minimal oclif config stub: enough for `this.parse()` to not blow up.
export function oclifConfig() {
  return {
    runHook: async () => ({ successes: [], failures: [] }),
  };
}

export function makeCommonMock(overrides = {}) {
  return {
    readStdinJson: vi.fn(),
    httpJson: vi.fn(),
    ok: vi.fn(),
    getConfig: vi.fn(() => ({ baseUrl: 'http://localhost:8888', token: 'tok', port: 32123 })),
    assertNodeVersion: vi.fn(),
    nowIso: vi.fn(() => '2026-04-12T10:00:00Z'),
    loadConfigFile: vi.fn(() => ({})),
    saveConfigFile: vi.fn((d) => ({ ...d })),
    configPath: vi.fn(() => '/tmp/jupyter-link/config.json'),
    assertHttpUrl: vi.fn((u) => new URL(u)),
    validateKernelId: vi.fn((id) => id),
    validateSessionId: vi.fn((id) => id),
    validateNotebookPath: vi.fn((p) => p),
    encodeNotebookPath: vi.fn((p) => encodeURIComponent(p)),
    ...overrides,
  };
}

export function makeDaemonMock() {
  return {
    ensureDaemon: vi.fn().mockResolvedValue(),
    request: vi.fn(),
  };
}
