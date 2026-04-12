import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    exclude: ['node_modules/**', 'test-jupyter/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/**/*.mjs',
        'scripts/daemon.mjs',
        'scripts/jupyter_proto.mjs',
        'scripts/util.mjs',
      ],
      exclude: [
        'tests/**',
        'test-jupyter/**',
        'scripts/check_env.mjs',
        'scripts/close_channels.mjs',
        'scripts/collect_outputs.mjs',
        'scripts/exec.mjs',
        'scripts/execute_code.mjs',
        'scripts/insert_cell.mjs',
        'scripts/ipc_client.mjs',
        'scripts/list_sessions.mjs',
        'scripts/noop_collect_outputs.mjs',
        'scripts/noop_open_channels.mjs',
        'scripts/open_kernel_channels.mjs',
        'scripts/read_cell.mjs',
        'scripts/read_notebook.mjs',
        'scripts/save_notebook.mjs',
        'scripts/test_api.mjs',
        'scripts/update_cell.mjs',
        'scripts/write_notebook.mjs',
      ],
      thresholds: {
        statements: 70,
        branches: 80,
        functions: 75,
        lines: 70,
      },
    },
  },
});
