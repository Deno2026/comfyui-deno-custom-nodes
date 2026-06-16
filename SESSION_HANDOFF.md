# SESSION_HANDOFF - comfyui-deno-custom-nodes

## Current Purpose

This repo is the source of the stable/beginner DENO ComfyUI custom-node channel.

Do not use it as a ComfyUI runtime, model folder, download cache, or generic agent workspace.

## Startup Read Order

1. `C:\Users\aions\.codex\AGENTS.md`
2. repo `AGENTS.md`
3. this `SESSION_HANDOFF.md`
4. for node work: `docs/NODE_WORK_INDEX.md`
5. for code/UI node changes: `docs/DENO_NODE_RETROSPECTIVE.md`
6. then only the matching node document under `docs/nodes/`

Do not read `docs/handoff_archive/` during normal startup unless deep history is explicitly needed.

## Current Paths

- Source repo: `E:\DENO-Repos\comfyui-deno-custom-nodes`
- Active ComfyUI runtime root: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install`
- Active custom node install: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
- Shared model folder: `E:\ComfyUI\ComfyUI Model\models`
- Main ComfyUI URL: `http://127.0.0.1:8188/`
- Main launch shortcut: `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`

## Documentation Map

- Node routing: `docs/NODE_WORK_INDEX.md`
- Shared node pre-flight: `docs/DENO_NODE_RETROSPECTIVE.md`
- Visual identity: `docs/DENO_NODE_VISUAL_IDENTITY.md`
- Local LLM Loader / Reviewer: `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md`
- LTX Prompt Guide: `docs/nodes/LTX_PROMPT_GUIDE.md`
- Ideogram Director: `docs/nodes/ideogram-director/README.md`
- Runtime matrix: `docs/COMFYUI_RUNTIME_MATRIX.md`
- Translator paused state: `docs/nodes/CAPTION_TRANSLATE.md`
- Random Prompt Box paused state: `docs/nodes/RANDOM_PROMPT_BOX.md`

Rule: node-specific details go into node-specific docs, not into `AGENTS.md` or this handoff.

## Release State

Current public release attempt: `0.7.38`.

Release artifacts created:

- GitHub release/tag: `v0.7.38`
- Release URL: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.38`
- Release commit/tag target: `0ca8daca6012c5662348909c4f69c450a0be9364`
- Release worktree: `E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.37-release`

Propagation state at last update on 2026-06-16:

- GitHub Actions for commit `0ca8dac`: CI success, Publish to Comfy registry success, Pages success.
- GitHub Release `v0.7.38` is public.
- Comfy Registry version `0.7.38` exists and the install endpoint points to `0.7.38`, but Registry
  still reports `NodeVersionStatusPending` with empty `status_reason`.
- CDN package: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.38/node.zip` returns 200.
- CDN package check passed: pyproject `0.7.38`, `Banner` metadata, `docs/images/deno-custom-nodes-banner.jpg`,
  Ideogram JS rev `r2026.06.16-respop-body-m`, bbox number move-handle, body-mounted resolution popup,
  Copy JSON `viewSource`, and excludes `tests/`, `tmp/`, `SESSION_HANDOFF.md`, and internal node docs.
- ComfyUI Manager `extension-node-map.json` already lists this repo with `DenoIdeogramDirector` and
  `DenoLocalLLMRefiner`.
- Heartbeat monitor `deno-0-7-38-registry-monitor` is active every 30 minutes for 0.7.38 until Registry
  becomes Active and the install endpoint/Manager map remain correct.

0.7.38 release scope:

1. `(Deno) Ideogram Director`: `Language` view lets users read/edit board descriptions in another
   language while final output stays model-ready English. Literal TEXT box values remain exact.
2. `(Deno) Ideogram Director`: tiny or overlapping bbox regions can be moved by dragging the top-left
   number badge.
3. `(Deno) Ideogram Director`: the resolution popup is a `document.body` fixed overlay so it is not
   clipped inside the node or ComfyUI Desktop canvas.
4. Registry/Manager/GitHub README: Deno Custom Nodes now ships a 21:9 banner image and `[tool.comfy]`
   `Banner` metadata.

0.7.37 remains the prior hotfix for Local LLM Loader `Seed Mode`.
0.7.36 remains the prior hotfix for Ideogram Director sizing/recreate, LTX Model Loader, LTX Prompt Guide,
and Local LLM missing saved-model / LM Studio reasoning payload behavior.

Important packaging boundary:

- `deno_translate_engine.py` remains because Ideogram Director uses it for its built-in `Translate On/Off` helper.
- `deno_caption_translate.py`, `deno_random_prompt_box.py`, `web/js/deno_random_prompt_box.js`, `tests/`, `tmp/`, internal node docs, `docs/COMFYUI_RUNTIME_MATRIX.md`, and `tools/comfyui_runtime_matrix.ps1`
  are excluded from the Registry package by `.comfyignore`.
- `node_list.json` must list public nodes only. It should include `DenoIdeogramDirector` and exclude `DenoTranslate` / `DenoRandomPromptBox`.

## Current Node Status

### Ideogram Director

Status: public `0.7.38` release created; Registry activation still pending.

Key behavior:

- Visual Ideogram 4 JSON/bbox prompt builder.
- 0.7.38 fixes:
  - `Language` replaces the old Translate On/Off surface. It opens a fullscreen language grid.
  - English is the default baseline and the popup no longer shows `Original` as a user choice.
  - Legacy `Original (as written)` saved values are normalized to English for compatibility.
  - Selecting another language translates editable description fields for the board view while final
    output stays English. Literal TEXT box `text` values are never translated.
  - The top-left bbox number badge is the primary move handle for tiny/overlapping boxes.
  - Resolution popup is now a `document.body` fixed overlay anchored to the size button.
- 0.7.36 fixes:
  - Desktop and Recreate-node recovery keep the board usable and keep Generate/Regenerate visible
  - user-enlarged nodes can still be shrunk again with the resize handle
  - right rail wheel scroll works when prompt/style/elements overflow
- 0.7.35 fixes:
  - user-enlarged nodes can be shrunk again with the resize handle
  - right rail wheel scroll works when prompt/style/elements overflow
- Incoming JSON Prompt modes:
  - `Ask Before Replacing`: empty board fills automatically; existing board asks before replacement.
  - `Always Replace`: new valid JSON replaces the board automatically.
- Invalid incoming JSON is never partially applied or passed through as text. It shows an English JSON-format warning and lets the user keep/edit the current board.
- Applying a new valid prompt clears the previous preview so stale images do not look current.
- Element rows and canvas boxes share the same edit flow.
- Built-in language helper outputs model-ready English while preserving literal TEXT box content.

Current files:

- `deno_ideogram_director.py`
- `web/js/deno_ideogram_director.js`
- `web/js/styles/`
- `deno_translate_engine.py`
- `docs/nodes/ideogram-director/`

### Local LLM Loader / Reviewer

Status: included in 0.7.37 hotfix scope.

Key behavior:

- Loader keeps UI/backend contract synchronized: no leftover widget sockets except supported inputs.
- Saved provider/model values should survive refresh. If a saved Ollama/LM Studio model is absent on
  the current PC, the frontend displays `Missing saved model: <model>` and backend validation rejects
  before any provider request.
- LM Studio `reasoning` payload is capability-aware. Thinking off sends `reasoning: "off"` only when
  the selected model reports `off` support; otherwise the field is omitted. Thinking on still sends
  `reasoning: "on"`.
- Loader `Seed Mode` updates the visible `Seed` widget after queue submit for `increment`,
  `decrement`, and `randomize`, without adding `control_after_generate` or shifting saved widget
  values.
- Prompt Only extraction remains for models that output reasoning/analysis before the final prompt.
- Reviewer graph transform and retry/seed behavior are covered by focused tests.

### LTX Model Loader / Prompt Guide

Status: included in 0.7.36 hotfix scope.

Key behavior:

- LTX Model Loader GGUF rows must not shift. Fresh and saved GGUF nodes must show `.gguf` under
  `gguf_unet`, VAE values under VAE rows, text encoders under `text_encoder`, and projection under
  `text_projection`.
- Saved external or extra-model-path GGUF values are preserved during configure/F5 before LiteGraph
  can clamp unknown combo values to defaults.
- LTX Prompt Guide keeps one 5-value canonical saved shape for positive prompt, language, frame rate,
  negative-toggle, and negative prompt. Legacy 7-value layouts migrate without losing prompt text.

### Standalone Translator

Status: paused / excluded from registration and package.

Do not register or advertise `(Deno) Translator` until the user explicitly restarts it. The shared engine remains only for Ideogram Director.

### Random Prompt Box

Status: paused / excluded from registration and package.

Do not register, advertise, or package it until the user explicitly restarts it.

## Verification Snapshot

0.7.38 release worktree:

`E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.37-release`

Verified in 0.7.38 release prep:

- `node --check` on an `.mjs` copy of `web/js/deno_ideogram_director.js`.
- `py -m py_compile deno_ideogram_director.py deno_translate_engine.py`.
- Focused tests:
  `py -m pytest tests/test_translate_engine.py tests/test_image_resize_node.py tests/test_registry_metadata.py -q`
  -> 149 passed.
- Full tests: `py -m pytest tests -q` -> 180 passed.
- `git diff --check` -> no whitespace errors; CRLF warnings only.
- Mandatory GPT-5.5 xhigh release review initially BLOCKed ASCII-only non-English output translation,
  then PASSed after Spanish/Portuguese ASCII source handling and default-English no-network behavior
  were tested.
- Runtime proof before release: Easy `8188` and Desktop `8000` both served
  `r2026.06.16-respop-body-m`, and real canvas checks confirmed the resolution popup is a
  `document.body` fixed overlay that is not clipped; selecting a size updated `width`, `height`,
  and `aspect_ratio`.
- CDN package proof after publish: zip contained pyproject `0.7.38`, `Banner` metadata, banner image,
  `r2026.06.16-respop-body-m`, bbox number move-handle, body-mounted resolution popup, Copy JSON
  `viewSource`, and excluded `tests/`, `tmp/`, `SESSION_HANDOFF.md`, and internal node docs.

0.7.37 release worktree:

`E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.37-release`

Verified in 0.7.37 release prep:

- `node --check web/js/deno_local_llm_refiner.js`
- `py -m compileall deno_local_llm_refiner.py`
- `py -m pytest tests -q` -> 172 passed
- `py -m pytest tests/test_registry_metadata.py -q` -> 13 passed
- `py -m pytest tests/test_public_workflow_migration.py -q` -> 26 passed
- `git diff --check` -> no whitespace errors; CRLF warnings only
- Runtime proof before release: Easy `8188` and Desktop `8000` served the Local LLM seed hook and
  real frontend queue-submit probes showed `increment` / `decrement` updating the visible seed.
- `/object_info/DenoLocalLLMRefiner` still exposes `seed` and `seed_mode`; no new
  `control_after_generate` widget was added.
- CDN package check after publish:
  - pyproject version `0.7.37`
  - Local LLM JS includes `applyLocalLLMAfterGenerateSeedModes`
  - excludes `tests/`, `tmp/`, `SESSION_HANDOFF.md`, and internal node docs

Mandatory GPT-5.5 xhigh release reviewer was attached for frontend/backend sync, ghost-feature, metadata, migration, and package-surface review.

Final reviewer result: PASS.

Post-0.7.37 local Ideogram WIP verification:

- `node --check` on an `.mjs` copy of `web/js/deno_ideogram_director.js` -> pass
- `py -m py_compile deno_ideogram_director.py deno_translate_engine.py` -> pass
- `py -m pytest tests/test_translate_engine.py tests/test_image_resize_node.py -q` -> 133 passed
- `git diff --check` -> no whitespace errors; CRLF warnings only
- Easy-Install runtime `8188` was idle. JS was synced without backend restart because only the frontend file changed.
- `/object_info/DenoIdeogramDirector` exposes `view_language` with the 106 target languages, defaulting to English.
- Served JS path `/extensions/deno-custom-nodes/deno_ideogram_director.js` contains `r2026.06.16-respop-body-m`.
- Real Easy-Install canvas disposable tab:
  - fresh Director opened at `850x1000`
  - top bar showed `Language`
  - fullscreen Language grid opened with the target-language cards, including `English`, `한국어`, and `日本語`
  - selecting `한국어` set `view_language=한국어`, `translate_output=English`, updated the board text through a fake translation response, and closed the modal
  - Copy JSON used the English output route
  - no DENO/Director console errors were logged; ComfyUI had unrelated startup preload errors
- Real Easy-Install canvas resolution-popup probe:
  - clicking the size chip opened `.idd-respop` as a `document.body` child with `position: fixed`
    and `z-index: 100001`
  - the popup was not inside `.idd-reswrap` or `.idd-wrap`, stayed within the viewport, and was not
    clipped by the node board
  - ratio click opened the common-size flyout inside the popup, also within the viewport
  - selecting a size set `width=672`, `height=384`, `aspect_ratio=16:9`, updated the size chip, and
    removed the body popup
  - Escape close removed the body popup
- Backend route `/deno/ideogram_director/translate_caption` returned the English/default path correctly.
- ComfyUI Desktop was launched through the Desktop dashboard. The adopted `ComfyUI` card started
  the Desktop runtime on `127.0.0.1:8000`; `/queue` was idle and the owning listener was process
  `25512` from the Desktop command line with `--base-directory C:\Users\aions\Documents\ComfyUI`.
- Desktop served JS path `/extensions/deno-custom-nodes/deno_ideogram_director.js` contains
  `r2026.06.16-respop-body-m` and `document.body.appendChild(resPop)`.
- Real Desktop runtime `8000` disposable canvas probe:
  - fresh Director opened at `850x1000`
  - clicking the size chip opened `.idd-respop` as a `document.body` child with `position: fixed`
    and `z-index: 100001`
  - the popup was not inside `.idd-reswrap` or `.idd-wrap`, stayed within the viewport, and was not
    clipped by the node board
  - ratio click opened the common-size flyout inside the popup, also within the viewport
  - selecting a size set `width=672`, `height=384`, `aspect_ratio=16:9`, updated the size chip, and
    removed the body popup
  - Desktop screenshot proof was captured from the `8000` runtime canvas. Direct Electron screenshot
    capture through Computer Use failed with `SetIsBorderRequired`, so the final visual proof used a
    disposable browser tab against the live Desktop-owned `8000` runtime.

## Next Session Checklist

1. Run `git status --short` first.
2. If continuing propagation checks, use the clean release worktree above, not the dirty source tree.
3. Keep watching Comfy Registry until `0.7.38` becomes active or flagged. Do not call public
   propagation fully complete while it is pending.
4. After Registry becomes active, verify install/update through ComfyUI Manager or a disposable runtime when practical.
5. Manager map already lists `DenoIdeogramDirector` and `DenoLocalLLMRefiner`; when Registry
   `0.7.38` becomes Active and the install endpoint still resolves to `0.7.38`, the 30-minute
   monitor can stop.
