# ComfyUI Runtime Matrix

This repo must treat ComfyUI Portable/Easy-Install and ComfyUI Desktop as separate
runtime surfaces. Passing in one runtime is not proof that custom frontend nodes are
safe in the other.

## Known Local Runtimes

| Runtime | Launch | Default URL | Base path | DENO node install |
|---|---|---|---|---|
| Easy-Install main | `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk` | `http://127.0.0.1:8188/` | `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install` | `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes` |
| Easy-Install test | manual/test BAT when explicitly needed | usually `http://127.0.0.1:8199/` | `E:\ComfyUI\ComfyUI-Easy-Install - TEST\ComfyUI-Easy-Install` | verify before use |
| ComfyUI Desktop dashboard | `C:\Users\aions\Desktop\Comfy Desktop.lnk` | card-dependent; the adopted `ComfyUI` card uses `http://127.0.0.1:8000/` | read cards from `C:\Users\aions\AppData\Roaming\Comfy Desktop\installations.json` | detect per card; this PC's adopted `ComfyUI` card currently uses `C:\Users\aions\Documents\ComfyUI\custom_nodes\deno-custom-nodes` |

Desktop details are discovered from:

- App executable: `C:\Users\aions\AppData\Local\Programs\ComfyUI\Comfy Desktop.exe`
- Dashboard/install list: `C:\Users\aions\AppData\Roaming\Comfy Desktop\installations.json`
- Legacy/base config: `C:\Users\aions\AppData\Roaming\ComfyUI\config.json`
- User data: `C:\Users\aions\AppData\Roaming\ComfyUI`
- Main log: `C:\Users\aions\AppData\Roaming\ComfyUI\logs`
- Recent Desktop builds open a dashboard first. Do not expect `Comfy Desktop.lnk` to immediately
  open port `8000`; select or launch the target card first, then verify the backend process.
- Adopted/Desktop card command lines commonly include
  `--base-directory C:\Users\aions\Documents\ComfyUI`, `--listen 127.0.0.1`, and `--port 8000`.

Do not assume the custom node folder name. Registry/Git installs may be named
`deno-custom-nodes` or `comfyui-deno-custom-nodes`; detect the package by `pyproject.toml`
where possible.

## When Dual Runtime Verification Is Required

Verify both Easy-Install and Desktop when any of these are true:

- The user reports a Desktop-only or Portable-vs-Desktop mismatch.
- A public hotfix/release touches a custom frontend node.
- The change touches node size, `computeSize`, `setSize`, fold/collapse behavior, DOM widgets,
  LiteGraph pointer handling, wheel/middle-click forwarding, scroll areas, overlays, popups,
  text clipping, or fullscreen/viewport behavior.
- The release is meant for beginner users through ComfyUI Manager/Registry.
- The bug appears after "clicking the wrong place", F5/reload, Manager update, or loading an old
  saved workflow.

If Desktop is unavailable or not installed for the current test, record the Desktop gate as
`UNVERIFIED`, not as passed.

## Required Evidence Per Runtime

For every runtime in scope, record:

1. Runtime URL and owning process command line.
2. DENO custom-node install path and package version.
3. `/queue` state before restart or destructive UI verification.
4. `/object_info/<NodeID>` for the changed node.
5. Served JS marker for the changed frontend file.
6. Fresh-node canvas screenshot after hard refresh.
7. Saved-workflow or old-widget case when widget order, migration, or public workflow compatibility
   is involved.
8. The exact user action path, such as `add node -> click top bar/board/rail -> resize grow -> resize shrink -> F5 -> reload workflow`.
9. Console/page errors.

## Desktop-Specific Pitfalls

- Desktop uses a different frontend root from the portable web UI:
  `web_custom_versions\desktop_app`.
- Desktop commonly runs on port `8000`, not `8188`.
- Desktop base path and user/workflow folders are under `C:\Users\aions\Documents\ComfyUI`.
- Electron window size, zoom, title bar/toolbar overlay, and Desktop frontend CSS can expose
  geometry bugs that do not show in the browser or Easy-Install runtime.
- F5/reload behavior may differ because the Electron shell owns the window.
- Desktop can install the same Registry package under a different folder name.
- Do not leave backup or disabled copies inside `custom_nodes`. ComfyUI can still import folders
  named like `*.disabled-codex-*`; move backups outside `custom_nodes` before verification.

## Ideogram Director Desktop Gate

For `(Deno) Ideogram Director`, every size/interaction hotfix must include:

- Fresh node at default size.
- Load at least one public/saved workflow with many bbox elements.
- Click each known sensitive region: node title/top bar, Layout Presets, Incoming JSON Prompt,
  resolution chip, seed switch, Generate, empty board area, bbox body, bbox handles, right rail,
  bottom buttons, and blank lower node body if present.
- Confirm no interaction collapses the board/body to a narrow rail or half-height panel.
- Resize larger, then smaller with the real LiteGraph bottom-right handle.
- Wheel over the board still controls canvas zoom/pan; wheel over the right rail scrolls only the rail.
- F5/reload or reopen keeps the chosen node size and does not duplicate/hide custom widgets.

The screenshot symptom from 2026-06-16, where Desktop `0.7.35` could leave only the right rail
visible while the board area collapsed into a huge blank body, is the regression pattern to reproduce
before the next Director hotfix. The defensive fix is to keep the Director DOM widget root at
`width:100%` / `max-width:100%` and give the board a nonzero flex basis/min-width so Electron
layout cannot shrink the board to a rail-only strip.
