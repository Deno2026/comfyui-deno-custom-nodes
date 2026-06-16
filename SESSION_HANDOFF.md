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

Current public release attempt: `0.7.37`.

Release artifacts created:

- GitHub release/tag: `v0.7.37`
- Release URL: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.37`
- Release commit/tag target: `3fff79f3d248755b368db83e8e9826172f884828`
- Release worktree: `E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.37-release`

Propagation state at last update on 2026-06-16:

- GitHub Actions for commit `3fff79f`: CI success, Publish to Comfy registry success, Pages success.
- GitHub Release `v0.7.37` is public.
- Comfy Registry version `0.7.37` exists and the install endpoint points to `0.7.37`, but Registry
  still reports `NodeVersionStatusPending` with empty `status_reason`.
- CDN package: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.37/node.zip` returns 200.
- CDN package check passed: pyproject `0.7.37`, Local LLM frontend seed hook
  `applyLocalLLMAfterGenerateSeedModes`, includes the released node files, and excludes `tests/`,
  `tmp/`, `SESSION_HANDOFF.md`, and internal node docs.
- ComfyUI Manager map already lists this repo with `DenoIdeogramDirector` and `DenoLocalLLMRefiner`.
- Heartbeat monitor `deno-0-7-37-registry-monitor` is active every 30 minutes for 0.7.37.
  Its TOML has runtime fields restored manually after `automation_update`; the checker still notes
  the current Desktop thread id is not present in `state_5.sqlite`.

0.7.37 release scope:

1. `(Deno) Local LLM Loader`: `Seed Mode` now updates the visible `Seed` widget after queue submit
   for `increment`, `decrement`, and `randomize`, without adding a serialized
   `control_after_generate` widget or shifting saved workflow widget slots.
2. Backend seed-mode normalization accepts legacy `random` as `randomize`.

0.7.36 remains the prior hotfix for Ideogram Director, LTX Model Loader, LTX Prompt Guide, and Local
LLM missing saved-model / LM Studio reasoning payload behavior.

Important packaging boundary:

- `deno_translate_engine.py` remains because Ideogram Director uses it for its built-in `Translate On/Off` helper.
- `deno_caption_translate.py`, `deno_random_prompt_box.py`, `web/js/deno_random_prompt_box.js`, `tests/`, `tmp/`, internal node docs, `docs/COMFYUI_RUNTIME_MATRIX.md`, and `tools/comfyui_runtime_matrix.ps1`
  are excluded from the Registry package by `.comfyignore`.
- `node_list.json` must list public nodes only. It should include `DenoIdeogramDirector` and exclude `DenoTranslate` / `DenoRandomPromptBox`.

## Current Node Status

### Ideogram Director

Status: public fixes included since `0.7.36`; current package `0.7.37` is pending Registry activation.

Key behavior:

- Visual Ideogram 4 JSON/bbox prompt builder.
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
- Built-in translation helper outputs model-ready English while preserving literal TEXT box content.

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

## Next Session Checklist

1. Run `git status --short` first.
2. If continuing propagation checks, use the clean release worktree above, not the dirty source tree.
3. Keep watching Comfy Registry until `0.7.37` becomes active or flagged. Do not call public
   propagation fully complete while it is pending.
4. After Registry becomes active, verify install/update through ComfyUI Manager or a disposable runtime when practical.
5. Manager map already lists `DenoIdeogramDirector` and `DenoLocalLLMRefiner`; when Registry
   `0.7.37` becomes Active and the install endpoint still resolves to `0.7.37`, the 30-minute
   monitor can stop.
