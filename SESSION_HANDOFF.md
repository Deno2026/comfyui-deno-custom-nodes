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

Current public Registry version before this handoff: `0.7.32` active.

0.7.33 release scope:

- Include `(Deno) Ideogram Director`.
- Include Local LLM Loader / Reviewer fixes already in this branch.
- Include LTX Prompt Guide saved-workflow migration.
- Exclude standalone `(Deno) Translator`.
- Exclude `(Deno) Random Prompt Box`.

Important packaging boundary:

- `deno_translate_engine.py` remains because Ideogram Director uses it for its built-in `Translate On/Off` helper.
- `deno_caption_translate.py`, `deno_random_prompt_box.py`, `web/js/deno_random_prompt_box.js`, `tests/`, `tmp/`, and internal node docs are excluded from the Registry package by `.comfyignore`.
- `node_list.json` must list public nodes only. It should include `DenoIdeogramDirector` and exclude `DenoTranslate` / `DenoRandomPromptBox`.

## Current Node Status

### Ideogram Director

Status: public release candidate for 0.7.33.

Key behavior:

- Visual Ideogram 4 JSON/bbox prompt builder.
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

0.7.33 release worktree:

`E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.33-release`

Verified in release prep:

- `node --check web/js/deno_ideogram_director.js`
- `node --check web/js/deno_local_llm_refiner.js`
- `node --check` on an `.mjs` copy of `web/js/deno_ltx_prompt_guide.js`
- `py -m pytest tests -q` -> 159 passed
- `git diff --check` -> no whitespace errors; CRLF warnings only
- package surface scan:
  - includes Ideogram Director files, `deno_translate_engine.py`, `node_list.json`, and public screenshot
  - excludes standalone Translator, Random Prompt Box, tests, tmp, and internal node docs
  - no `urlopen`, `.connect(`, `subprocess`, `os.system`, `powershell`, `curl`, or `wget` scanner-risk strings in packaged text files

Mandatory GPT-5.5 xhigh release reviewer was attached for frontend/backend sync, ghost-feature, metadata, migration, and package-surface review.

## Next Session Checklist

1. Run `git status --short` first.
2. If continuing 0.7.33 release, use the clean release worktree above, not the dirty source tree.
3. Confirm the reviewer result before push/release.
4. After release:
   - verify GitHub commit/tag/release and Actions
   - verify Comfy Registry version is active, not merely pending
   - verify install endpoint points to 0.7.33
   - verify Manager discovery / map state
   - update this handoff with final propagation status
