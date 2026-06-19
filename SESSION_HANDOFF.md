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
- LTX Model Download Helper: `docs/nodes/LTX_MODEL_DOWNLOADER.md`
- LTX Prompt Guide: `docs/nodes/LTX_PROMPT_GUIDE.md`
- Ideogram Director: `docs/nodes/ideogram-director/README.md`
- Visual Fold: `docs/nodes/VISUAL_FOLD.md`
- Runtime matrix: `docs/COMFYUI_RUNTIME_MATRIX.md`
- Translator paused state: `docs/nodes/CAPTION_TRANSLATE.md`
- Random Prompt Box paused state: `docs/nodes/RANDOM_PROMPT_BOX.md`

Rule: node-specific details go into node-specific docs, not into `AGENTS.md` or this handoff.

## Release State

Current public release: `0.7.49`.

0.7.49 hotfix scope for GitHub #31 / ComfyUI EZi Desktop startup reports:

- Root cause: `(Deno) Easy Model Download Helper` computed install status while ComfyUI was
  still answering `/object_info`. EZi Desktop waits on `/object_info` before showing its UI, and
  large, linked, external, or offline model folders could make the startup look hung even though the
  backend printed the normal server URL.
- Local fix: `DenoLTXModelDownloader.INPUT_TYPES()` no longer counts installed files, and the normal
  helper status route no longer deep-recursive scans model folders by default.
- Deep recursive filename search remains as an explicit internal opt-in path only. Normal startup,
  node creation, `/object_info`, and `Refresh Check` use direct configured paths plus registered
  ComfyUI model-folder aliases.
- Added `docs/nodes/LTX_MODEL_DOWNLOADER.md` and routed `deno_ltx_model_downloader.py` work through
  `docs/NODE_WORK_INDEX.md` so this startup contract is preserved.

0.7.49 verification before public push:

- `python -m py_compile deno_ltx_model_downloader.py`
- Targeted helper regression tests: `7 passed`.
- `python -m pytest tests/test_image_resize_node.py -q` -> `124 passed`.
- `python -m pytest tests/test_registry_metadata.py -q` -> `13 passed`.
- `python -m pytest tests/test_public_workflow_migration.py -q` -> `30 passed`.
- Full test suite after version bump: `211 passed`.
- `git diff --check` and final `git diff --cached --check` passed; only normal CRLF warnings before
  staging.
- Mandatory independent GPT-5.5 xhigh release reviewer `019edced-7f1f-7d12-90ee-128d15000447`
  returned `PASS WITH NOTES`; no blocker remained.
- Source `deno_ltx_model_downloader.py` was copied into the active Easy-Install runtime and
  hash-matched.
- Active `8188` was restarted through the EZi-style wrapper path. Final runtime shape:
  `pythonw.exe ... ComfyUI-EZi.py` plus `python_embeded\python.exe -X utf8=1 ... runpy main.py`.
- Runtime API proof on `http://127.0.0.1:8188/`:
  - `/object_info/DenoLTXModelDownloader` returned OK in about `201 ms`.
  - Full `/object_info` returned OK in about `1400 ms`.
  - `POST /deno/ltx_model_downloader/check` returned OK with 6 files and 2 roots.
  - `/queue` was idle.

Public release state:

- Release commit/tag target: `e210f8912079e4b4b9d6490998607a1a00335b9b` / `v0.7.49`
- GitHub release: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.49`
- GitHub Actions CI, Pages, and Publish to Comfy registry succeeded on 2026-06-18 UTC.
- CDN zip exists and returned `200 application/zip`:
  `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.49/node.zip`
- CDN package check passed:
  - `pyproject.toml` version `0.7.49`
  - `deno_ltx_model_downloader.py` includes `allow_deep_scan: bool = False` and the guarded deep
    scan marker.
  - `node_list.json` has 19 public nodes and includes `DenoLTXModelDownloader`.
  - no `tests/`, `docs/nodes/`, or `SESSION_HANDOFF.md` are packaged.
- Registry versions endpoint and install endpoint both resolve to `0.7.49`, with
  `NodeVersionStatusActive` checked on 2026-06-19.
- Manager `extension-node-map.json` still lists this repo with `DenoIdeogramDirector` and
  `DenoLocalLLMRefiner`.
- CDN package still returns `200 application/zip`.
- The same-thread heartbeat monitor `deno-0-7-49-registry-monitor` was stopped after propagation
  completed.

Next action:

- No public propagation work remains for `0.7.49`.
- For new user reports after `0.7.49`, first verify the installed package version, actual running
  ComfyUI path, served JS, and browser/Desktop cache. Reports that still show old Ideogram labels
  such as `Translate On` or `Layout Presets` are likely stale install/cache/runtime-path cases.
- Optional user-facing note for issue #31: the helper no longer deep-searches arbitrary nested model
  folders by default; users with deeply nested custom packs should set the exact target subfolder.

0.7.48 scope:

- DENO node `i` info/update popup opens update details only on click, not hover.
- The yellow update icon/badge has its own pointer hover hitbox and subtle emphasis, so LiteGraph's
  top-right resize cursor no longer takes over that area.
- The DENO info popup closes when the user clicks or wheels outside it. Wheel inside the popup keeps
  the popup open for normal reading.
- The update card keeps the release-notes link and normal node description, but removes rollback
  guide UI/copy.
- Ideogram Director's fullscreen Language picker now closes with Escape consistently with the
  visible `Esc to close` hint.

0.7.48 verification before public push:

- Full test suite passed: `209 passed`.
- Registry metadata tests passed: `13 passed`.
- `node --check` passed for edited frontend JS.
- `git diff --check` passed with only Windows LF-to-CRLF warnings.
- Mandatory independent release reviewer PASS WITH NOTES; no blocking issue remained.
- After PC reboot, active Desktop `8000` and Easy-Install `8188` were both reachable and queue-idle.
- Source files were hash-matched into both active runtimes:
  `pyproject.toml`, `web/js/deno_node_help.js`, and `web/js/deno_ideogram_director.js`.
- Both active runtimes served the new markers:
  `handleOutsideHelpPointerDown`, `handleOutsideHelpWheel`, no `Rollback guide`,
  `r2026.06.19-language-esc-a`, and `closeLanguageKey`.

Public release state:

- Release commit/tag target: `f9aa8bb8c90ca304f08ca3abfab46a58f12b29c1` / `v0.7.48`
- GitHub release: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.48`
- GitHub Actions CI, Pages, and Publish to Comfy registry succeeded on 2026-06-18 UTC.
- CDN zip exists and returned `200 application/zip`:
  `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.48/node.zip`
- Registry versions endpoint and install endpoint both resolve to `0.7.48`, currently
  `NodeVersionStatusPending` with empty `status_reason`.
- 30-minute same-thread heartbeat monitor is active:
  `deno-0-7-48-registry-monitor`.

Next action:

- Wait until Registry `0.7.48` becomes Active and the install endpoint still resolves to `0.7.48`.
- After Active, verify Manager map still lists this repo with `DenoIdeogramDirector` and
  `DenoLocalLLMRefiner`, then stop the 30-minute monitor.

0.7.47 hotfix scope for the two GitHub bug reports:

- GitHub #30 Local LLM Loader / Reviewer validation regression:
  - Root cause: `DenoLocalLLMRefiner.INPUT_IS_LIST = True` can pass list-wrapped combo values into
    `VALIDATE_INPUTS`, such as `seed_mode=["randomize"]`.
  - Local fix: `deno_resolution_common.validate_combo_choice()` now validates list/nested-list
    combo values item by item instead of stringifying the raw list.
  - Coverage: valid list-wrapped current/legacy Local LLM values pass; invalid list-wrapped values
    still fail clearly.
- GitHub #29 Visual Fold drag regression:
  - Root cause: during node/group drag, ComfyUI can hide its native selection toolbar before older
    LiteGraph drag flags are updated, letting the DENO fallback Fold/Align controls appear under
    the pointer.
  - Local fix: `web/js/deno_visual_fold.js` suppresses Fold/Rename/Align while a pointer is held
    over the canvas, while pressed-button pointer moves occur, and while newer frontend drag states
    such as `canvas.isDragging` / `canvas.state.draggingItems` are active.
  - Click handlers now re-check suppression before opening menus or running align actions.

Hotfix verification already completed:

- `node --check web/js/deno_visual_fold.js`
- `python -m py_compile deno_resolution_common.py deno_local_llm_refiner.py`
- Targeted tests for Local LLM validation and Visual Fold metadata passed.
- Wider related tests passed: `35 passed, 87 deselected` for Local LLM validation subset;
  `13 passed` for registry metadata.
- Full test suite passed: `209 passed`.
- `git diff --check` passed with only Windows LF-to-CRLF warnings.
- Source changes were synced into both active runtimes:
  - Easy-Install `8188`
  - Desktop `ComfyUI` card runtime `8000`
- Runtime `pyproject.toml` files were also synced from source so both active runtimes report
  version `0.7.46`.
- Runtime proof:
  - Both `8188` and `8000` queues reachable.
  - Both expose `/object_info/DenoLocalLLMRefiner`.
  - Both serve Visual Fold JS with the new drag-suppression markers.
  - After GPT Pro BLOCK review, Visual Fold also guards `isSelectionActionTarget()` with a DOM
    `Node` check and uses a blur wrapper so `window.blur` cannot call `contains(window)`.
  - Both runtime installs accept `seed_mode=["randomize"]` and nested list values, while rejecting
    invalid list values.
- Desktop app was restarted through its own `Restart ComfyUI` UI button after a direct test
  backend was removed. Final listener is the Desktop app-managed `8000` backend.
  - Real Desktop canvas drag-hold screenshot showed no DENO Fold/Align fallback controls during
    group drag; ComfyUI's native selection toolbar appears after release, which is normal.
  - Desktop focus-loss path was checked by moving focus away from the Desktop window and back; the
    canvas returned to an idle state with Fold Group available and no visible broken/stuck state.
- GPT Pro external review package rev2 prepared and sent through Telegram at:
  `artifacts/gpt-pro-review/deno-custom-nodes-0.7.47-hotfix-gpt-pro-review-rev2.zip`.
  It includes changed files, related source context, `git_diff.patch`, validation summary,
  subagent findings, issue context, manifest, Desktop drag screenshots, and focus-loss evidence.
  GPT Pro returned `PASS WITH NOTES`; the only mandatory note was `pyproject.toml` version `0.7.47`,
  which is now applied.

Public release state:

- Release commit/tag target: `2e1bd364c5162ba592ab021233fbc37bd31dc06f` / `v0.7.47`
- GitHub release: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.47`
- GitHub Actions CI, Pages, and Publish to Comfy registry succeeded on 2026-06-18.
- CDN zip exists: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.47/node.zip`
- CDN package was checked:
  - `pyproject.toml` version `0.7.47`
  - `node_list.json` has 19 public nodes
  - no `tests/` or `artifacts/` folder included
- Initial Comfy Registry status: `NodeVersionStatusPending` with empty `status_reason`; install
  endpoint resolves to `0.7.47` Pending.
- Manager `extension-node-map.json` lists this repo with 19 nodes including
  `DenoIdeogramDirector` and `DenoLocalLLMRefiner`.
- Active monitor: `deno-0-7-47-registry-monitor`, heartbeat every 30 minutes in this thread.

Pending:

- Wait until Registry `0.7.47` becomes Active and the install endpoint still resolves to `0.7.47`.
- After Active, sync the active local Easy-Install and Desktop runtimes from the released package
  when queues are idle, then verify local `pyproject.toml`, `/object_info`, served JS markers, and
  queue idle on both runtime surfaces.

Previous public release attempt: `0.7.46`.

0.7.46 release scope:

- New lesson added to `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`, and local skill
  `C:\Users\aions\.codex\skills\deno-comfyui-node-maker\SKILL.md`: ComfyUI can reject stale COMBO
  values before a node function runs, even when the value is disabled, hidden, out of active range, or
  ignored later by backend code.
- The pre-release checklist now requires a missing-saved-combo gate: simulate a saved combo value
  absent from the current option list and check enabled/active, disabled/off, hidden, and outside
  `active_*` states separately.
- Parallel read-only audits were collected and closed:
  - PASS with test-gap notes: Multi LoRA, LTX Multi LoRA, LTX23 Preset Loader.
  - PASS for Local LLM dynamic missing model handling and Ideogram import/language combos.
  - RISK fixed locally: Local LLM fixed legacy combos, AI Review Gate mode, LTX Prompt Guide language,
    Bernini task/negative preset, Ideogram style mode, Video Compare hidden mode/toggle, Resize Box /
    Multi Image / Advanced Image / RTX VFX ratio presets.
- Local code now adds narrow `VALIDATE_INPUTS` coverage for those stale combo paths and uses
  `validate_active_ratio_preset()` for ratio-based nodes so inactive/hidden stale ratios pass, while
  active `Preset Ratio` stale values fail clearly.

0.7.46 verification evidence before public release:

  - Python compile of changed backend files passed.
  - Full test suite passed: `208 passed`.
  - Registry metadata tests passed: `13 passed`.
  - Local LLM reviewer graph transform test passed: `1 passed`.
  - `git diff --check` passed, with only Windows LF-to-CRLF warnings.
  - Skill validator passed: `Skill is valid!`.
- Independent release reviewer for 0.7.46: `019edafb-9889-7d12-9989-8214968e8b22`.
  Initial review BLOCKED an overbroad `VALIDATE_INPUTS` patch that bypassed active combo validation.
  The release was fixed with explicit active combo validation and re-reviewed as PASS.
- Final pre-release checks after the reviewer BLOCK fix:
  - Full test suite passed: `209 passed`.
  - Registry metadata + Local LLM reviewer graph transform subset passed: `14 passed`.
  - `git diff --check` passed, with only Windows LF-to-CRLF warnings.
- Runtime canvas verification is not required for the 0.7.46 code itself because this release only
  changes backend pre-execution validation and docs. If any frontend file changes before release,
  rerun the normal Easy-Install + Desktop canvas gates.
- Public release completed:
  - Release commit/tag target: `7477e0a` / `v0.7.46`
  - GitHub release: `https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag/v0.7.46`
  - GitHub Actions CI, Pages, and Publish to Comfy registry succeeded on 2026-06-18.
  - CDN zip exists: `https://cdn.comfy.org/deno2026/deno-custom-nodes/0.7.46/node.zip`
  - CDN package was checked: `pyproject.toml` version `0.7.46`, `node_list.json` has 19 public
    nodes, and tests/tmp/SESSION_HANDOFF/AGENTS/.codex-remote-attachments were excluded.
  - Initial Comfy Registry status: `NodeVersionStatusPending`; install endpoint resolves to
    `0.7.46` Pending. `0.7.45` was Active at first check.
  - Manager `extension-node-map.json` lists this repo with 19 nodes including
    `DenoIdeogramDirector`, `DenoLocalLLMRefiner`, `DenoResolutionSetup`, and `DenoVideoCompare`.
  - 30-minute propagation monitor was updated from the old 0.7.45 check to watch `0.7.46`.
- Pending: wait until Registry `0.7.46` becomes Active and the install endpoint still resolves to
  `0.7.46`, then sync local Easy-Install and Desktop runtimes from the released package when queues
  are idle.

Untracked local-only artifacts not staged for release:

- `.codex-remote-attachments/` user screenshots
- `tmp/` test artifacts

Previous public release context: `0.7.45`.

0.7.45 release scope:

- `(Deno) Multi LoRA Loader` and `(Deno) LTX Multi LoRA Loader`: disabled saved LoRA slots no longer
  block ComfyUI validation when the saved file is missing from a removed external drive/USB.
- Enabled missing LoRA slots still stop with a clear slot-specific error.
- `(Deno) Resize Box`: no production code change; added regression coverage for Keep Input Ratio
  landscape tensor orientation after a subscriber report.
- Added `docs/nodes/MULTI_LORA_LOADERS.md` as the product contract and routed LoRA loader work
  through `docs/NODE_WORK_INDEX.md`.
- Added `.codex-remote-attachments/` to `.comfyignore` so user-provided screenshot attachments can
  never enter the Registry package.

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
2. Treat public `0.7.49` propagation as complete unless a live Registry/Manager check later proves
   otherwise.
3. If a user reports EZi/Desktop startup failure, verify whether they are actually on `0.7.49`.
   Older installs can still hit the pre-0.7.49 model-folder startup scan.
4. If a user reports Ideogram Director showing `Translate On` or `Layout Presets`, treat it as a
   stale install/cache/runtime-path signal first. Current `0.7.49` package uses `Language` and
   `Layouts`.
5. Local active Easy-Install runtime may lag behind public release state; check runtime
   `pyproject.toml`, `/object_info`, and served JS before using it as evidence.
