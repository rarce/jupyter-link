---
name: jupyter-link
description: Execute code in running Jupyter kernels and persist outputs to the target notebook via Jupyter Server REST API and kernel WebSocket channels. Implements discovery of sessions, cell insert/update, execution, and output mapping (nbformat v4).
compatibility: Requires Node.js 20+ and npm
allowed-tools: Bash(npx jupyter-link:*)
metadata:
  version: "0.1.0"
  author: Roberto Arce
---

## IMPORTANT: Always use the `jupyter-link` CLI via npx

**NEVER use Python, curl, or raw HTTP requests to interact with Jupyter Server.**
All operations MUST go through `npx jupyter-link@0.1.0`. Every command reads JSON from stdin and writes JSON to stdout.

## Commands Reference

### Configure connection (persistent — run once)
```bash
# Save URL and token to ~/.config/jupyter-link/config.json
echo '{"url":"http://localhost:8888","token":"your-token-here"}' | npx jupyter-link@0.1.0 config:set

# Show effective config and where each value comes from
echo '{}' | npx jupyter-link@0.1.0 config:get
```
After `config:set`, all subsequent commands use the saved config. No need to pass env vars.
Environment variables (`JUPYTER_URL`, `JUPYTER_TOKEN`) still override the config file if set.

### Check connectivity
```bash
echo '{}' | npx jupyter-link@0.1.0 check:env
```
Returns `{"ok":true|false, "sessions_ok":..., "contents_ok":...}`

### List sessions
```bash
echo '{}' | npx jupyter-link@0.1.0 list:sessions
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.1.0 list:sessions
```

### Read cells (preferred for inspection)
```bash
# Summary of all cells (index, type, source preview, has_outputs)
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.1.0 cell:read

# Read specific cells by index
echo '{"path":"notebooks/my.ipynb","cells":[4,8,10,12]}' | npx jupyter-link@0.1.0 cell:read

# Read a single cell
echo '{"path":"notebooks/my.ipynb","cell_id":4}' | npx jupyter-link@0.1.0 cell:read

# Read a range of cells (start inclusive, end exclusive)
echo '{"path":"notebooks/my.ipynb","range":[4,10]}' | npx jupyter-link@0.1.0 cell:read

# Control output truncation (default: 3000 chars per field)
echo '{"path":"notebooks/my.ipynb","cells":[4],"max_chars":5000}' | npx jupyter-link@0.1.0 cell:read
```
Returns `{"total_cells":N,"cells":[...]}` with source, outputs, execution_count, and agent metadata.
Binary outputs (images, PDFs) are replaced with size placeholders. Error tracebacks keep last 5 frames.

### Read notebook (full JSON)
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.1.0 contents:read
```

### Write notebook
```bash
echo '{"path":"notebooks/my.ipynb","nb_json":{...}}' | npx jupyter-link@0.1.0 contents:write
```

### Insert a code cell
```bash
echo '{"path":"notebooks/my.ipynb","code":"print(42)"}' | npx jupyter-link@0.1.0 cell:insert
echo '{"path":"notebooks/my.ipynb","code":"print(42)","index":0}' | npx jupyter-link@0.1.0 cell:insert
```
Returns `{"cell_id":N,"index":N}`. Defaults to appending at end.

### Update a cell
```bash
echo '{"path":"notebooks/my.ipynb","cell_id":3,"code":"x=1"}' | npx jupyter-link@0.1.0 cell:update
echo '{"path":"notebooks/my.ipynb","cell_id":3,"outputs":[...],"execution_count":5}' | npx jupyter-link@0.1.0 cell:update
```
If `cell_id` is omitted, updates the latest agent-managed cell.

### Open kernel channels (persistent WebSocket)
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.1.0 open:kernel-channels
echo '{"kernel_id":"..."}' | npx jupyter-link@0.1.0 open:kernel-channels
```
Returns `{"channel_ref":"ch-...","session_id":"..."}`. Auto-starts daemon if needed.

### Execute code on a channel
```bash
echo '{"channel_ref":"ch-...","code":"print(123)"}' | npx jupyter-link@0.1.0 execute:code
```
Returns `{"parent_msg_id":"msg-..."}`.

### Collect execution outputs
```bash
echo '{"channel_ref":"ch-...","parent_msg_id":"msg-..."}' | npx jupyter-link@0.1.0 collect:outputs
echo '{"channel_ref":"ch-...","parent_msg_id":"msg-...","timeout_s":120}' | npx jupyter-link@0.1.0 collect:outputs
```
Returns `{"outputs":[...],"execution_count":N,"status":"ok"|"error"|"timeout"}`.

### Close channels
```bash
echo '{"channel_ref":"ch-..."}' | npx jupyter-link@0.1.0 close:channels
```

### Save notebook
```bash
echo '{"path":"notebooks/my.ipynb"}' | npx jupyter-link@0.1.0 save:notebook
```

## Typical workflow

1. **Configure**: `echo '{"url":"...","token":"..."}' | npx jupyter-link@0.1.0 config:set`
2. **Check env**: `echo '{}' | npx jupyter-link@0.1.0 check:env`
3. **Open channel**: `echo '{"path":"..."}' | npx jupyter-link@0.1.0 open:kernel-channels` → get `channel_ref`
4. **Insert cell**: `echo '{"path":"...","code":"..."}' | npx jupyter-link@0.1.0 cell:insert` → get `index`
5. **Execute**: `echo '{"channel_ref":"...","code":"..."}' | npx jupyter-link@0.1.0 execute:code` → get `parent_msg_id`
6. **Collect**: `echo '{"channel_ref":"...","parent_msg_id":"..."}' | npx jupyter-link@0.1.0 collect:outputs` → get outputs
7. **Update cell**: `echo '{"path":"...","cell_id":N,"outputs":[...],"execution_count":N}' | npx jupyter-link@0.1.0 cell:update`
8. **Save**: `echo '{"path":"..."}' | npx jupyter-link@0.1.0 save:notebook`
9. **Close**: `echo '{"channel_ref":"..."}' | npx jupyter-link@0.1.0 close:channels`

## Notes

- Inserts cells at end by default. Reuses latest agent cell (`metadata.agent.role="jupyter-driver"`) when `cell_id` is omitted in update.
- Kernel errors are surfaced as `error` outputs with traceback.
- Persistent channels are managed by a daemon on `127.0.0.1:${JUPYTER_LINK_PORT:-32123}`. Auto-starts on first use.

## Canonical parameter names

| Primary        | Fallback     | Used in                    |
|----------------|--------------|----------------------------|
| `path`         | `notebook`   | All notebook commands      |
| `code`         | `source`     | insert, update, execute    |
| `channel_ref`  | `ref`        | execute, collect, close    |
| `parent_msg_id`| `parent_id`  | collect                    |
| `nb_json`      | `content`    | write                      |
