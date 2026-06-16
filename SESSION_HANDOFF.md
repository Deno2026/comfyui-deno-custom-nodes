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
- Ideogram Director: `docs/nodes/ideogram-director/README.md`
- Translator paused state: `docs/nodes/CAPTION_TRANSLATE.md`
- Random Prompt Box paused state: `docs/nodes/RANDOM_PROMPT_BOX.md`

Rule: node-specific details go into node-specific docs, not into `AGENTS.md` or this handoff.

## Release State

Current public release attempt: `0.7.35`.

Release artifacts created:

- GitHub release/tag: `v0.7.35`
- Release URL: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.35`
- Release commit/tag target: `627b8123c6dc9a05cb304faec77b7c283358084e`
- Release scope: Ideogram Director interaction hotfix only.

Propagation state at last update on 2026-06-16:

- GitHub Actions for commit `627b8123`: CI success, Publish to Comfy registry success, Pages success.
- Comfy Registry previous latest `0.7.34` is `NodeVersionStatusActive`.
- Comfy Registry `0.7.35` package was published and install endpoint points to `0.7.35`, but
  Registry still reports `NodeVersionStatusPending` with empty `status_reason`.
- Top-level Registry latest remains `0.7.34` Active until `0.7.35` activation completes.
- CDN package: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.35/node.zip` returns 200.
- ComfyUI Manager map still needs the existing Ideogram Director node-list propagation path; this
  patch did not change public node IDs or node count.

0.7.35 release scope:

- Fix `(Deno) Ideogram Director` so a manually enlarged node can shrink again with the LiteGraph
  resize handle.
- Fix `(Deno) Ideogram Director` right rail wheel behavior so prompt/style/elements can scroll
  locally while the board/photo/bbox surface remains canvas-first.
- No backend input/output/socket/widget order changes.
- Exclude standalone `(Deno) Translator`.
- Exclude `(Deno) Random Prompt Box`.

Important packaging boundary:

- `deno_translate_engine.py` remains because Ideogram Director uses it for its built-in `Translate On/Off` helper.
- `deno_caption_translate.py`, `deno_random_prompt_box.py`, `web/js/deno_random_prompt_box.js`, `tests/`, `tmp/`, and internal node docs are excluded from the Registry package by `.comfyignore`.
- `node_list.json` must list public nodes only. It should include `DenoIdeogramDirector` and exclude `DenoTranslate` / `DenoRandomPromptBox`.

## Current Node Status

### Ideogram Director

Status: public `0.7.35` patch release submitted. Registry activation is pending.

Key behavior:

- Visual Ideogram 4 JSON/bbox prompt builder.
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

Status: included in 0.7.33.

Key behavior:

- Loader keeps UI/backend contract synchronized: no leftover widget sockets except supported inputs.
- Saved provider/model values should survive refresh; missing selected model should produce a clear local-LLM model-unavailable message.
- Prompt Only extraction remains for models that output reasoning/analysis before the final prompt.
- Reviewer graph transform and retry/seed behavior are covered by focused tests.

### Standalone Translator

Status: paused / excluded from registration and package.

Do not register or advertise `(Deno) Translator` until the user explicitly restarts it. The shared engine remains only for Ideogram Director.

### Random Prompt Box

Status: paused / excluded from registration and package.

Do not register, advertise, or package it until the user explicitly restarts it.

## Verification Snapshot

0.7.35 release worktree:

`E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.33-release`

Verified in 0.7.35 release prep:

- `node --check web/js/deno_ideogram_director.js`
- `py -m pytest tests -q` -> 163 passed
- `py -m pytest tests/test_registry_metadata.py -q` -> 13 passed
- `py -m pytest tests/test_public_workflow_migration.py -q` -> 22 passed
- `git diff --check` -> no whitespace errors; CRLF warnings only
- Source release worktree, dirty source checkout, and active runtime JS hash:
  `9FD48501890FC2DDEF2E03C9F578F1D3F7BD7CF0217158C2D5EF72DCB3A749AF`.
- Served active runtime JS contained `r2026.06.16-rail-scroll-h`, the right-rail wheel exception,
  and `const preserveCurrent = !iddUserResizing`.
- Real Chrome/ComfyUI proof before release: right rail wheel scrolled `scrollTop 0 -> 32` without
  canvas zoom; board wheel still zoomed canvas `1 -> 0.9090909090909091`.
- CDN package check after publish:
  - pyproject version `0.7.35`
  - JS rev `r2026.06.16-rail-scroll-h`
  - includes right-rail wheel fix and resize-shrink guard
  - excludes `tests/`, `tmp/`, standalone Translator, and Random Prompt Box

Mandatory GPT-5.5 xhigh release reviewer was attached for frontend/backend sync, ghost-feature, metadata, migration, and package-surface review.

Final reviewer result: PASS.

## Next Session Checklist

1. Run `git status --short` first.
2. If continuing propagation checks, use the clean release worktree above, not the dirty source tree.
3. Keep watching Comfy Registry until `0.7.35` becomes active or flagged. Do not call public
   propagation fully complete while it is pending.
4. After Registry becomes active, verify install/update through ComfyUI Manager or a disposable runtime when practical.
5. Keep watching the existing Manager node-list propagation until the public map lists
   `DenoIdeogramDirector`; this 0.7.35 patch did not change node IDs or node count.
