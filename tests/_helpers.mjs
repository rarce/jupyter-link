import { vi } from 'vitest';

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
    ...overrides,
  };
}

export function makeDaemonMock() {
  return {
    ensureDaemon: vi.fn().mockResolvedValue(),
    request: vi.fn(),
  };
}
