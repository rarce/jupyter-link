# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

jupyter-link is a CLI (npm package) and AgentSkill that connects to a running Jupyter Server, executes code in notebook kernels, and persists outputs back to `.ipynb` files. Implements the Jupyter Server REST API, Jupyter Messaging Protocol v5.3, and nbformat v4.

## Commands

```bash
npm run build               # Generate oclif manifest
npm test                    # Run all tests (Vitest)
npm run test:coverage       # Tests with coverage report
npx vitest run tests/common.test.mjs   # Run single test file
npx vitest --grep "stream"             # Filter by test name
```

## Architecture

**oclif CLI** with commands in `src/commands/` routed through `bin/run`. A persistent TCP daemon (`scripts/daemon.mjs`) pools WebSocket channels for concurrent kernel operations.

- `src/lib/common.mjs` — Config (env + file), HTTP fetch, stdin/stdout JSON I/O
- `src/lib/daemonClient.mjs` — IPC client to spawn/connect daemon
- `scripts/jupyter_proto.mjs` — Jupyter messaging protocol (headers, execute_request, output mapping)
- `scripts/daemon.mjs` — TCP daemon managing WebSocket channel pool

**Config priority:** env vars > `~/.config/jupyter-link/config.json` > defaults

**Data flow:** List sessions → find kernel → insert/update cell → open WS channel (via daemon) → send execute_request → collect iopub outputs → map to nbformat → save notebook

**Distribution:** npm package (`npx jupyter-link@version`) + AgentSkill via `npx skills add <repo>`

## Environment Variables

- `JUPYTER_URL` — Jupyter Server base URL (default: `http://127.0.0.1:8888`)
- `JUPYTER_TOKEN` — Server authentication token
- `JUPYTER_LINK_PORT` — Daemon IPC port (default: `32123`)

## Runtime

- Node.js 20+ (uses native fetch, WebSocket, crypto)
