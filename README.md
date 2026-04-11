# jupyter-link

CLI and AgentSkill to execute code in running Jupyter kernels and persist outputs back to `.ipynb` notebooks.

## Features

- Discover running sessions and match by notebook path or name
- Read/write notebooks via Jupyter Contents API (nbformat v4)
- Insert or update code cells with agent metadata (`metadata.agent`)
- Open persistent kernel WebSocket channels for execution
- Send `execute_request` and collect iopub/shell outputs
- Map outputs to nbformat v4 format (stream, execute_result, display_data, error)
- Persistent config — set URL and token once, use everywhere

## Requirements

- Node.js 20+
- A running Jupyter Server (JupyterLab/Notebook)

## Installation

### As a global CLI
```bash
npm install -g jupyter-link
```

### Via npx (no install)
```bash
echo '{}' | npx jupyter-link@0.1.0 check:env
```

### As an AgentSkill
```bash
npx skills add <owner/repo>
```

## Quick Start

```bash
# 1. Configure connection (saved to ~/.config/jupyter-link/config.json)
echo '{"url":"http://localhost:8888","token":"your-token"}' | npx jupyter-link@0.1.0 config:set

# 2. Verify connectivity
echo '{}' | npx jupyter-link@0.1.0 check:env

# 3. List running sessions
echo '{}' | npx jupyter-link@0.1.0 list:sessions

# 4. Read cell outputs
echo '{"path":"notebook.ipynb","cells":[0,1,2]}' | npx jupyter-link@0.1.0 cell:read
```

## Commands

All commands read JSON from stdin and write JSON to stdout.

| Command | Description |
|---------|-------------|
| `config:set` | Save connection settings (url, token, port) |
| `config:get` | Show effective config with source per field |
| `check:env` | Verify Jupyter Server connectivity |
| `list:sessions` | List sessions, filter by path or name |
| `cell:read` | Read specific cells with outputs (preferred) |
| `cell:insert` | Insert a code cell with agent metadata |
| `cell:update` | Update cell source, outputs, execution_count |
| `contents:read` | Read full notebook JSON |
| `contents:write` | Write notebook JSON |
| `open:kernel-channels` | Open persistent WebSocket to kernel |
| `execute:code` | Send execute_request, get parent_msg_id |
| `collect:outputs` | Wait for outputs/reply/idle |
| `close:channels` | Close a channel |
| `save:notebook` | Save notebook (round-trip PUT) |

## Configuration

Priority: environment variables > config file > defaults.

| Source | URL | Token | Daemon Port |
|--------|-----|-------|-------------|
| Env var | `JUPYTER_URL` | `JUPYTER_TOKEN` | `JUPYTER_LINK_PORT` |
| Config file | `url` | `token` | `port` |
| Default | `http://127.0.0.1:8888` | — | `32123` |

## Tests

```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage report
```

## License

MIT
