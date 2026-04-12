# jupyter-link

An [AgentSkill](https://agentskills.io) that lets AI agents execute code in running Jupyter kernels and persist outputs back to `.ipynb` notebooks.

## Why

AI agents like Claude Code or Codex are great at writing and executing code, but they work in a terminal — no charts, no rich tables, no inline visualizations. Jupyter has all of that, but it's a manual, interactive tool.

**jupyter-link bridges the two.** The agent writes code, executes it in your notebook's kernel, and persists the outputs — while you keep JupyterLab open as your live dashboard. Changes appear in real time. You see rendered DataFrames, plots, and errors exactly as Jupyter displays them, without copy-pasting anything.

The result: **the agent codes, Jupyter renders, you supervise.** You can jump in at any point — edit a cell, re-run something, add notes — and the agent picks up where you left off. True human-AI collaboration on notebooks, where each side uses the interface it's best at.

## Install as a Skill

```bash
npx skills add rarce/jupyter-link
```

Once installed, the agent uses `npx jupyter-link@0.1.0` to run commands. No global install required.

## What it does

- Discover running Jupyter sessions and match by notebook path or name
- Read/write notebooks via Contents API (nbformat v4)
- Insert or update code cells with agent metadata
- Execute code in kernels via persistent WebSocket channels
- Collect outputs (stream, execute_result, display_data, error)
- Persist execution results and save notebooks
- **Real-time collaboration**: appear as a visible collaborator in JupyterLab when `jupyter-collaboration` is installed

## Real-Time Collaboration (RTC)

When the Jupyter server has the [`jupyter-collaboration`](https://github.com/jupyterlab/jupyter-collaboration) extension installed, jupyter-link can operate as a real-time collaborator using the Yjs CRDT protocol. This means:

- **Live visibility**: The agent appears as a named collaborator in JupyterLab (with a colored cursor), so you can see exactly when it's working.
- **Instant cell updates**: Inserted cells and outputs appear immediately in JupyterLab without needing to save — changes propagate via Y.Doc sync, not REST PUT.
- **Streaming outputs**: During code execution, outputs are pushed to the notebook in real time (every 200ms), so you see `print()` output as it happens, not only after execution finishes.
- **No-op saves**: With RTC active, `save:notebook` is a no-op — the server auto-saves Y.Doc changes to disk.

### Enabling RTC

1. Install `jupyter-collaboration` on your Jupyter server:
   ```bash
   pip install jupyter-collaboration
   ```
2. Pass `"rtc": true` (or `"rtc": "auto"`) when opening kernel channels:
   ```bash
   echo '{"path":"notebook.ipynb","rtc":true}' | npx jupyter-link@0.2.3 open:kernel-channels
   ```
   This returns a `room_ref` alongside the usual `channel_ref`.
3. Pass `room_ref` to subsequent commands (`run:cell`, `cell:insert`, `cell:update`, `cell:read`, `close:channels`) to use the RTC path.

If `jupyter-collaboration` is not installed, everything works exactly as before via the REST API. When `rtc` is `"auto"`, RTC connection failures are silently ignored and the REST path is used.

## Requirements

- Node.js 20+
- A running Jupyter Server (JupyterLab or Notebook)

## Quick Start

1. Start your Jupyter Server (JupyterLab or Notebook)
2. Tell your agent:

> Connect to my Jupyter Server at http://localhost:8888 with token `abc123`, then run the code `print("hello")` in `notebook.ipynb`

The agent will use the skill to configure the connection, open a kernel channel, execute the code, and persist the output to the notebook.

### Other things you can ask

- *"Show me the outputs of cells 4, 8 and 12 in my notebook"*
- *"Execute this data processing code in my notebook and save the results"*
- *"List all running Jupyter sessions"*
- *"Insert a new cell at the end of notebook.ipynb with this code: ..."*

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

## Standalone CLI

You can also install and use it directly without the skills framework:

```bash
npm install -g jupyter-link
echo '{}' | jupyter-link check:env
```

## License

MIT
