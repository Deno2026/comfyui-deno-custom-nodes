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
- Visual Fold: `docs/nodes/VISUAL_FOLD.md`
- Runtime matrix: `docs/COMFYUI_RUNTIME_MATRIX.md`
- Translator paused state: `docs/nodes/CAPTION_TRANSLATE.md`
- Random Prompt Box paused state: `docs/nodes/RANDOM_PROMPT_BOX.md`

Rule: node-specific details go into node-specific docs, not into `AGENTS.md` or this handoff.

## Release State

Current public release attempt: `0.7.44`.

0.7.44 release scope:

- Ideogram Director bbox ergonomics hotfix after Reddit/GitHub feedback and PR #28 review.
- PR #28 was not merged as-is because it regressed the 0.7.43 resolution-import guard. Only the
  useful intent was adapted.
- Tiny/overlapping bbox editing is easier because the top-left number badge has a larger move hit
  target.
- The stale live pixel-size tooltip is disabled so it no longer covers the board or displays frozen
  dimensions during drags.
- `Ctrl/Cmd`+drag copy is hardened so pressing the modifier before or during a move duplicates the
  selected box.
- Ideogram Director no longer captures global `Ctrl+Z` / `Ctrl+Y`; ComfyUI keeps graph undo/redo,
  and board-only undo/redo stays on the visible `↶` / `↷` buttons.

0.7.44 verification evidence:

- User manually confirmed the bbox behavior works before deploy approval.
- Source/runtime JS marker: `r2026.06.18-bbox-ergonomics-b`.
- Static checks: `node --check` on `web/js/deno_ideogram_director.js`, `git diff --check`.
- Full test suite: `python -m pytest -q` -> `201 passed`.
- Independent release reviewer `019ed8f8-8216-74d0-8d27-99facbbec5e7` returned PASS for public
  release and was closed.

Previous public release context: `0.7.43`.

0.7.43 release worktree:

- `E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.43-release`
- Branch: `Codex/deno-0.7.43-release`
- Release commit: `ea23875784f30e767b893571f8083daa1ef4861d`
- GitHub release/tag: `v0.7.43`
- Release URL: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.43`
- Status at this handoff update: public push/tag/release complete; GitHub Actions CI, Pages, and
  Publish to Comfy Registry succeeded. Comfy Registry is still `NodeVersionStatusPending` with empty
  `status_reason`; install endpoint already resolves to `0.7.43`.

0.7.43 release scope:

- Multi LoRA and LTX Multi LoRA preserve saved LoRA selections when the saved LoRA is not present in
  the current dropdown list. Legacy public LTX 45-value saves and current 57-value saves are covered.
- RTX VFX Easy Upscale preserves saved `device` instead of resetting it during frontend setup.
- Local LLM Reviewer / AI Review Gate preserves hidden `reviewer_state` for approve-once snapshots.
- Visual Fold hides Fold/Fold Group/Align floating controls while nodes or groups are actively dragged.
- Ideogram Director ignores arbitrary image-analysis pixel pairs such as `1712:880` as output-size
  imports, while existing saved custom sizes normalize their megapixel display on first popup open.

0.7.43 verification evidence:

- Static checks: changed frontend JS files passed `node --check`.
- Test suite: `python -m pytest -q -p no:cacheprovider tests/test_registry_metadata.py tests/test_public_workflow_migration.py tests/test_image_resize_node.py tests/test_local_llm_reviewer_graph_transform.py tests/test_translate_engine.py` -> `197 passed`.
- Runtime sync: changed JS copied to Easy-Install `8188` and Desktop `8000`; served JS markers checked
  from `/extensions/deno-custom-nodes/<file>.js` on both runtimes.
- Runtime LoRA saved-value gate: on both `8188` and `8000`, `DenoLTXMultiLoraLoader` legacy 45-value
  save restored `Missing/LTX_legacy_saved.safetensors`, expanded to 57 values, and kept the missing
  option in the combo. `DenoMultiLoraLoader` legacy 33-value save restored
  `Missing/Generic_legacy_saved.safetensors`, expanded to 49 values, and kept the missing option.
- Runtime Ideogram resolution gate: on both `8188` and `8000`, saved `1712×880` with stale
  `caption_data.mp=1` opened the size popup as `1712 × 880 | custom | 1.51 MP | ÷16`; importing
  arbitrary `aspect_ratio: "1712:880"` into a fresh node left the current `1024×1024` output size.
- Runtime Visual Fold gate: on both `8188` and `8000`, two selected nodes showed Fold/Align before
  drag, hid the controls during synthetic active drag, and restored controls after pointer release.
- Runtime RTX/Reviewer gate: on both `8188` and `8000`, RTX `device=3` survived setup, and
  `DenoAIReviewGate` hidden `reviewer_state` survived setup as a hidden/converted widget.
- Independent release reviewer `019ed6d2-4029-7cc0-b0cc-c059aefa1bc5` initially blocked on missing
  runtime proof; the listed runtime gates above were added afterward and the agent was closed.

After public release:

- Done: GitHub commit/tag/release and Actions were verified.
- Done: CDN zip contains pyproject `0.7.43`, Ideogram `r2026.06.18-resolution-import-a`, Visual Fold
  drag-suppression markers, Multi LoRA/LTX Multi LoRA legacy saved-value markers, and excludes
  `tests/`, `tmp/`, `SESSION_HANDOFF.md`, `AGENTS.md`, and internal docs.
- Pending: monitor Comfy Registry until `0.7.43` is Active and the install endpoint continues to
  resolve to `0.7.43`.
- Done: ComfyUI Manager map lists this repo with `DenoIdeogramDirector` and `DenoLocalLLMRefiner`.
- Active monitor: `deno-0-7-43-registry-monitor`, heartbeat every 30 minutes in this thread.

Previous public release context: `0.7.42`.

Release artifacts created:

- GitHub release/tag: `v0.7.42`
- Release URL: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.42`
- Release commit/tag target: `0510ad277066f08e25b9015e0a891eb19a6adad9`
- Release worktree: `E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.39-release-main`

0.7.42 release scope:

- Scope: Visual Fold stale-selection/floating-toolbar fix, Local LLM Loader `Thinking` save/F5
  restore and live `More` popups, Ideogram Director language-refresh button reflow, Bernini Prompt
  Guide / RTX VFX Video Finisher saved-workflow migration hardening, and release metadata/tests.

Propagation state at last update on 2026-06-17:

- GitHub Actions for commit `0510ad2`: CI success, Publish to Comfy registry success, Pages success.
- Comfy Registry version `0.7.42` exists and the install endpoint points to `0.7.42`, but Registry
  still reports `NodeVersionStatusPending` with empty `status_reason`.
- CDN package: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.42/node.zip` returns 200.
- CDN package check passed: pyproject `0.7.42`, Visual Fold stale-selection markers, Local LLM live
  popup markers, Ideogram `r2026.06.17-refresh-reflow-c`, Bernini save/reload marker, RTX finisher
  save/reload marker, and excludes `tests/`, `tmp/`, `SESSION_HANDOFF.md`, `AGENTS.md`, and internal
  node docs.
- ComfyUI Manager `extension-node-map.json` lists this repo with `DenoIdeogramDirector` and
  `DenoLocalLLMRefiner`; current map entry has 19 public nodes.
- Heartbeat monitor `deno-0-7-42-registry-monitor` should run every 30 minutes until Registry becomes
  Active and the install endpoint/Manager map remain correct.

Runtime verification:

- Local release worktree verification passed: changed JS `node --check`, `py -m pytest tests -q`
  -> 197 passed, `git diff --check` whitespace check, strengthened Registry metadata/package tests,
  and mandatory independent GPT-5.5 xhigh release reviewer PASS.
- Easy-Install `8188` Visual Fold Playwright canvas check passed for two selected nodes -> Fold
  visible, one selected node with stale `node.selected` -> Fold hidden, blank selection with stale
  `node.selected` -> Fold hidden, and stale group object -> Fold Group hidden.
- Desktop live-canvas exact Visual Fold follow-up remains `UNVERIFIED` because `8000` was not
  running during the release check. Reviewer also marked actual model-stream Local LLM popup update
  and some real-canvas Save/F5 second-serialization cells as `UNVERIFIED`; tests cover the regression
  shapes, but user-final Desktop/canvas spot checks are still useful.

Important packaging boundary:

- `deno_translate_engine.py` remains because Ideogram Director uses it for its built-in `Translate On/Off` helper.
- `deno_caption_translate.py`, `deno_random_prompt_box.py`, `web/js/deno_random_prompt_box.js`, `tests/`, `tmp/`, internal node docs, `docs/COMFYUI_RUNTIME_MATRIX.md`, and `tools/comfyui_runtime_matrix.ps1`
  are excluded from the Registry package by `.comfyignore`.
- `node_list.json` must list public nodes only. It should include `DenoIdeogramDirector` and exclude `DenoTranslate` / `DenoRandomPromptBox`.

## Current Node Status

### Ideogram Director

Status: public `0.7.42` release created; Registry activation still pending.

Key behavior:

- Visual Ideogram 4 JSON/bbox prompt builder.
- 0.7.42 polish, reported 2026-06-17: saved workflow + Chrome/F5 reload could render the
  top-bar `↻` language refresh button as a narrow vertical bar until it was clicked once. Local rev
  `r2026.06.17-refresh-reflow-c` fixes the likely cause by giving the refresh button a fixed flex
  basis and rerunning the top-bar fit pass after restore/size stabilization.
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

0.7.44 local runtime state:

- Bbox ergonomics follow-up lives in release worktree
  `E:\DENO-Share\agent-worktrees\comfyui-deno-custom-nodes-0.7.43-release`.
- Director board history should stay node-owned through the visible bottom `↶` / `↷` buttons.
  Do not capture global `Ctrl+Z` / `Ctrl+Y`; ComfyUI owns graph-level undo/redo and capturing it can
  make the whole canvas feel like it flickers or resets.
- Current local marker: `r2026.06.18-bbox-ergonomics-b`; source JS was synced to Easy-Install `8188`
  and Desktop `8000` with matching hashes and served marker checks. Browser tabs still need
  `Ctrl+Shift+R` to pick up the new static file.

### Local LLM Loader / Reviewer

Status: included in public `0.7.42`; Registry activation still pending.

Key behavior:

- 0.7.42 polish, reported 2026-06-17: the `Thinking` / `Result` `More` popup used to show
  only the text that existed when the popup opened. Local JS now binds the popup to the node state so
  it updates live during streaming/status changes, while preserving manual scroll position unless the
  popup is already near the bottom.
- 0.7.42 bugfix, reported 2026-06-17: a saved workflow could contain `Thinking=true` in
  JSON but reopen with visible `Thinking Off` after `Ctrl+S -> Ctrl+Shift+R/F5`. Root cause: current
  Ollama layouts can serialize generated button labels before hidden LM Studio/legacy rows, while
  the normalizer only handled the later button position. JS now detects both button-run positions,
  and the focused test includes the user's 18-slot saved-value shape.
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

### Saved Workflow Restore Audit

Status: public `0.7.42` safety work; Registry activation still pending.

Critical rule learned 2026-06-17:

- A saved raw JSON value is not enough. If the real ComfyUI canvas reopens that value under the wrong
  visible row, toggle, model, prompt, or numeric control, it is a blocker and can become user data loss
  on the next save.
- This rule is now documented in repo `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, the Local LLM
  node document, and the local `deno-comfyui-node-maker` skill.

Parallel audit results:

- Released in 0.7.42: `DenoLocalLLMRefiner` normalizes the user's 18-slot current Ollama saved layout where
  generated button labels appear before hidden LM Studio rows, so `Thinking=true` does not reopen as
  visible off.
- Released in 0.7.42: `DenoBerniniPromptGuide` now normalizes legacy 8-slot public workflow values with
  generated display-widget blanks into the 6 real widget values, then syncs back to the compact saved
  shape.
- Released in 0.7.42: `DenoRTXVFXVideoFinisher` now syncs repaired legacy leading-blank 13-slot public
  workflow values back to the current 12 real widget values.
- Still needs future real-canvas Save/F5 audit: `DenoRTXVFXEasyUpscale`,
  `DenoMultiLoraLoader`, `DenoLTXMultiLoraLoader`, `DenoAdvancedImageSourceLoader`, and the current
  `DenoIdeogramDirector`/`DenoLocalLLMRefiner` local UI changes. These were flagged as structural
  risk or insufficient fixture coverage, not all as confirmed live bugs.
- Parallel-agent handoff rule added 2026-06-17: before a final user report, collect every spawned
  agent result, record usable findings or changed paths, and close agents that are no longer needed.
  If context compaction happens mid-task, the resumed agent must recover known agent IDs/results from
  the summary or state before claiming completion.

Focused tests added/updated:

- `tests/test_local_llm_reviewer_graph_transform.py`: user-style 18-slot Local LLM layout with
  `Thinking=true`.
- `tests/test_public_workflow_migration.py`: Bernini legacy 8-slot migration and RTX 2-pass
  leading-blank repair.

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
2. If continuing propagation checks, use the clean release worktree above or the source repo, but
   verify which branch/path is active before editing.
3. Keep watching Comfy Registry until `0.7.43` becomes active or flagged. Do not call public
   propagation fully complete while it is pending.
4. After Registry becomes active, verify install/update through ComfyUI Manager or a disposable runtime when practical.
5. Manager map already lists `DenoIdeogramDirector` and `DenoLocalLLMRefiner`; when Registry
   `0.7.43` becomes Active and the install endpoint still resolves to `0.7.43`, the 30-minute
   monitor can stop.
