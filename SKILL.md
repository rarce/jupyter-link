---
name: jupyter-link
description: Execute code in running Jupyter kernels and persist outputs to the target notebook via Jupyter Server REST API and kernel WebSocket channels. Implements discovery of sessions, cell insert/update, execution, and output mapping (nbformat v4).
compatibility: Requires Node.js 20+ and npm
allowed-tools: Bash(npx jupyter-link:*)
metadata:
  version: "0.2.1"
  author: Roberto Arce
---

## IMPORTANT: Always use the `jupyter-link` CLI via npx

**NEVER use Python, curl, or raw HTTP requests to interact with Jupyter Server.**
All operations MUST go through `npx jupyter-link@0.2.1`. Every command reads JSON from stdin and writes JSON to stdout.

## Commands Reference

### Configure connection (persistent — run once)
```bash
# Save URL and token to ~/.config/jupyter-link/config.json
echo '{"url":"http://localhost:8888","token":"your-token-here"}' | npx jupyter-link@0.2.1 config:set

# Show effective config and where each value comes from
echo '{}' | npx jupyter-link@0.2.1 config:get
```
After `config:set`, all subsequent commands use the saved config. No need to pass env vars.
Environment variables (`JUPYTER_URL`, `JUPYTER_TOKEN`) still override the config file if set.

### Check connectivity
```bash
echo '{}' | npx jupyter-link@0.2.1 check:env
```
Returns `{"ok":true|false, "sessions_ok":..., "contents_ok":...}`

### Create a notebook
```bash
# Create an empty Python3 notebook (generates nbformat v4 boilerplate)
echo '{"path":"notebooks/new.ipynb"}' | npx jupyter-link@0.2.1 contents:create

# Create with a specific kernel
echo '{"path":"notebooks/new.ipynb","kernel_name":"julia-1.9"}' | npx jupyter-link@0.2.1 contents:create
```
Returns `{"ok":true,"created":true|false,"path":"..."}`. If notebook already exists, returns `created:false` without overwriting.

### Create a session (start a kernel)
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 sessions:create
echo '{"path":"notebooks/my.ipynb","kernel_name":"python3"}' | npx jupyter-link@0.2.1 sessions:create
```
Returns the full Jupyter session object with `id`, `kernel.id`, `kernel.name`, etc. If a session already exists for the notebook, returns it without creating a duplicate.

### List sessions
```bash
echo '{}' | npx jupyter-link@0.2.1 list:sessions
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 list:sessions
```

### Read cells (preferred for inspection)
```bash
# Summary of all cells (index, type, source preview, has_outputs)
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 cell:read

# Read specific cells by index
echo '{"path":"notebooks/my.ipynb","cells":[4,8,10,12]}' | npx jupyter-link@0.2.1 cell:read

# Read a single cell
echo '{"path":"notebooks/my.ipynb","cell_id":4}' | npx jupyter-link@0.2.1 cell:read

# Read a range of cells (start inclusive, end exclusive)
echo '{"path":"notebooks/my.ipynb","range":[4,10]}' | npx jupyter-link@0.2.1 cell:read

# Control output truncation (default: 3000 chars per field)
echo '{"path":"notebooks/my.ipynb","cells":[4],"max_chars":5000}' | npx jupyter-link@0.2.1 cell:read
```
Returns `{"total_cells":N,"cells":[...]}` with source, outputs, execution_count, and agent metadata.
Binary outputs (images, PDFs) are replaced with size placeholders. Error tracebacks keep last 5 frames.

### Read notebook (full JSON)
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 contents:read
```

### Write notebook
```bash
echo '{"path":"notebooks/my.ipynb","nb_json":{...}}' | npx jupyter-link@0.2.1 contents:write
```

### Insert a code cell
```bash
echo '{"path":"notebooks/my.ipynb","code":"print(42)"}' | npx jupyter-link@0.2.1 cell:insert
echo '{"path":"notebooks/my.ipynb","code":"print(42)","index":0}' | npx jupyter-link@0.2.1 cell:insert
```
Returns `{"cell_id":N,"index":N}`. Defaults to appending at end.

### Update a cell
```bash
echo '{"path":"notebooks/my.ipynb","cell_id":3,"code":"x=1"}' | npx jupyter-link@0.2.1 cell:update
echo '{"path":"notebooks/my.ipynb","cell_id":3,"outputs":[...],"execution_count":5}' | npx jupyter-link@0.2.1 cell:update
```
If `cell_id` is omitted, updates the latest agent-managed cell.

### Open kernel channels (persistent WebSocket)
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 open:kernel-channels
echo '{"kernel_id":"..."}' | npx jupyter-link@0.2.1 open:kernel-channels
```
Returns `{"channel_ref":"ch-...","session_id":"..."}`. Auto-starts daemon if needed.
**Auto-creates session**: If no running session exists for the notebook, automatically creates one (defaults to `python3` kernel, override with `kernel_name`).

### Run cell (insert + execute + collect + update in one step)
```bash
echo '{"path":"notebooks/my.ipynb","channel_ref":"ch-...","code":"print(42)"}' | npx jupyter-link@0.2.1 run:cell
echo '{"path":"notebooks/my.ipynb","channel_ref":"ch-...","code":"import time; time.sleep(5)","timeout_s":30}' | npx jupyter-link@0.2.1 run:cell
```
Returns `{"cell_id":N,"status":"ok"|"error","execution_count":N,"outputs":[...]}`.
This is the **recommended** way to execute code — it handles the full pipeline: insert cell, execute on kernel, collect outputs, and update the cell with results.

### Execute code on a channel
```bash
echo '{"channel_ref":"ch-...","code":"print(123)"}' | npx jupyter-link@0.2.1 execute:code
```
Returns `{"parent_msg_id":"msg-..."}`.

### Collect execution outputs
```bash
echo '{"channel_ref":"ch-...","parent_msg_id":"msg-..."}' | npx jupyter-link@0.2.1 collect:outputs
echo '{"channel_ref":"ch-...","parent_msg_id":"msg-...","timeout_s":120}' | npx jupyter-link@0.2.1 collect:outputs
```
Returns `{"outputs":[...],"execution_count":N,"status":"ok"|"error"|"timeout"}`.

### Close channels
```bash
echo '{"channel_ref":"ch-..."}' | npx jupyter-link@0.2.1 close:channels
```

### Save notebook
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.2.1 save:notebook
```

## Typical workflow

### Recommended (using `run:cell`)
1. **Configure**: `echo '{"url":"...","token":"..."}' | npx jupyter-link@0.2.1 config:set`
2. **Check env**: `echo '{}' | npx jupyter-link@0.2.1 check:env`
3. **Create notebook** (if needed): `echo '{"path":"..."}' | npx jupyter-link@0.2.1 contents:create`
4. **Open channel**: `echo '{"path":"..."}' | npx jupyter-link@0.2.1 open:kernel-channels` → get `channel_ref` (auto-creates session if needed)
5. **Run cell** (repeat): `echo '{"path":"...","channel_ref":"...","code":"..."}' | npx jupyter-link@0.2.1 run:cell` → get `cell_id`, `status`, `outputs`
6. **Save**: `echo '{"path":"..."}' | npx jupyter-link@0.2.1 save:notebook`
7. **Close**: `echo '{"channel_ref":"..."}' | npx jupyter-link@0.2.1 close:channels`

### Granular (step-by-step control)
1. **Configure**: `echo '{"url":"...","token":"..."}' | npx jupyter-link@0.2.1 config:set`
2. **Check env**: `echo '{}' | npx jupyter-link@0.2.1 check:env`
3. **Create notebook** (if needed): `echo '{"path":"..."}' | npx jupyter-link@0.2.1 contents:create`
4. **Create session** (if needed): `echo '{"path":"..."}' | npx jupyter-link@0.2.1 sessions:create`
5. **Open channel**: `echo '{"path":"..."}' | npx jupyter-link@0.2.1 open:kernel-channels` → get `channel_ref`
6. **Insert cell**: `echo '{"path":"...","code":"..."}' | npx jupyter-link@0.2.1 cell:insert` → get `index`
7. **Execute**: `echo '{"channel_ref":"...","code":"..."}' | npx jupyter-link@0.2.1 execute:code` → get `parent_msg_id`
8. **Collect**: `echo '{"channel_ref":"...","parent_msg_id":"..."}' | npx jupyter-link@0.2.1 collect:outputs` → get outputs
9. **Update cell**: `echo '{"path":"...","cell_id":N,"outputs":[...],"execution_count":N}' | npx jupyter-link@0.2.1 cell:update`
10. **Save**: `echo '{"path":"..."}' | npx jupyter-link@0.2.1 save:notebook`
11. **Close**: `echo '{"channel_ref":"..."}' | npx jupyter-link@0.2.1 close:channels`

## Notes

- Inserts cells at end by default. Reuses latest agent cell (`metadata.agent.role="jupyter-driver"`) when `cell_id` is omitted in update.
- Kernel errors are surfaced as `error` outputs with traceback.
- Persistent channels are managed by a daemon on `127.0.0.1:${JUPYTER_LINK_PORT:-32123}`. Auto-starts on first use.

## Canonical parameter names

| Primary        | Fallback     | Used in                             |
|----------------|--------------|-------------------------------------|
| `path`         | `notebook`   | All notebook commands               |
| `code`         | `source`     | insert, update, execute, run:cell   |
| `channel_ref`  | `ref`        | execute, collect, close, run:cell   |
| `parent_msg_id`| `parent_id`  | collect                             |
| `nb_json`      | `content`    | write                               |
| `kernel_name`  | `kernel`     | sessions:create, contents:create, open:kernel-channels |
