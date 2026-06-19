# DENO Floating Tools

## Product Contract

DENO Floating Tools is a global ComfyUI helper, not a workflow node.

Purpose:

- Give Desktop and browser users a small DENO tool handle that can sit anywhere on the ComfyUI screen.
- Keep it disabled by default so users who do not need it never see an extra floating control.
- Provide a reliable `Free ComfyUI VRAM` command that does not depend on Easy-Use, Manager, or Desktop toolbar buttons.
- Help Portable users notice when ComfyUI, the frontend package, or workflow templates are behind the
  latest stable/read-only public package metadata.

Required behavior:

- The setting lives under `Settings > DENO > Tools`.
- Default state is OFF.
- When enabled, a small DENO icon is mounted as a fixed `document.body` overlay.
- The icon can be dragged with pointer input and its viewport position is saved locally.
- The icon and opened panel must stay inside the visible viewport after resize or reload.
- Clicking the icon opens a compact DENO tools panel.
- `Free VRAM` calls ComfyUI's built-in `/free` endpoint with both `unload_models` and `free_memory`.
- If the queue is running or pending, `Free VRAM` is disabled and no unload request is sent.
- `Check Updates` reads local `/system_stats` and compares installed ComfyUI/frontend/templates
  versions against public GitHub/PyPI metadata.
- The update helper is read-only. It may show a small badge on the DENO icon when updates are
  available, but it must never install, update, restart, or open OS folders.
- The helper is primarily for Portable users. Desktop may still show status, but copy should explain
  that Desktop usually manages updates itself.
- The feature must not modify workflow JSON, node widgets, graph nodes, node positions, or saved workflow values.

Rejected paths:

- Do not depend on Easy-Use toolbar internals for VRAM cleanup.
- Do not add visible floating UI unless the user enables it.
- Do not add canvas translation to this floating tool. ComfyUI canvas text is drawn, not normal DOM
  text, so a Chrome-like translation result is not reliable enough for this compact utility.
- Do not add a separate text-input translator in the floating panel.
- Do not re-enable or publicly register the paused standalone `(Deno) Translator` node just for this helper.
- Do not add a floating-tools translation backend route unless the product direction is explicitly reopened.
- Do not add update execution. No `pip install`, `git pull`, `subprocess`, `os.startfile`, shell
  launch, or auto-restart behavior belongs in this stable Floating Tools helper.
- Do not capture canvas wheel or middle-click outside the floating icon or open panel.

Verification:

- Source JS passes `node --check`.
- Runtime install receives `web/js/deno_floating_tools.js` and the icon asset.
- Served JS contains the current marker.
- Runtime verification follows `docs/COMFYUI_RUNTIME_MATRIX.md`: Portable first, then official
  Desktop, then Easy-Install Desktop/EZi Desktop mode. Missing surfaces must be marked `UNVERIFIED`.
- In each verified runtime, the setting appears under `DENO > Tools`, default OFF.
- When enabled, the icon appears, can be dragged, opens the panel, and keeps its saved position after refresh.
- `Free VRAM` is disabled while the queue is active and sends the `/free` request only when idle.
- `Check Updates` shows current and latest values for ComfyUI, workflow templates, and frontend package.
- If any latest version is newer than the installed version, the DENO icon shows a compact update badge.
- If update checking fails or the user is offline, the panel reports the failure without blocking Free VRAM.
- No `Canvas Translate` button, `CanvasRenderingContext2D.fillText` patch, or
  `/deno/floating_tools/translate_text` route remains.
