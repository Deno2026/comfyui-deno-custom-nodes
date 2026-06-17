# DENO Custom Nodes Working Notes

This repo is for DENO ComfyUI custom node source work.

Do not use this repo as a general agent workspace, runtime folder, model cache, download cache, or ComfyUI install folder.

## Channel Role

This repo is the stable/beginner DENO custom-node channel. Keep it focused on nodes that are stable enough for normal ComfyUI Manager/Registry users.

Scanner-sensitive, approval-heavy, manual-only, or experimental advanced node groups belong in `E:\DENO-Repos\comfyui-deno-custom-nodes-advanced` as a separate long-term channel. Do not merge them back into this stable repo by default, even after they pass Advanced review or approval. Stable integration requires a new explicit user decision and a separate stable release scope.

Official ComfyUI review for those nodes should be handled from the Advanced repo/package unless the user explicitly scopes a stable-channel migration.

## Startup Read Order

For every new session in this repo:

1. Read `C:\Users\aions\.codex\AGENTS.md`.
2. Read this repo `AGENTS.md`.
3. Read `SESSION_HANDOFF.md` for current dirty/WIP scope.
4. If creating or editing a ComfyUI node, read `docs/NODE_WORK_INDEX.md`.
5. If code/UI changes are involved, read `docs/DENO_NODE_RETROSPECTIVE.md`.
6. Then read only the matching node-specific document under `docs/nodes/`.

Do not read archive handoffs or old design notes during normal startup unless the current task explicitly needs deep history.

## Documentation Routing

Do not keep accumulating detailed per-node history in `AGENTS.md`.

- `AGENTS.md`: repo-level routing, safety, runtime, and release rules only.
- `SESSION_HANDOFF.md`: compact current status and next actions only.
- `docs/NODE_WORK_INDEX.md`: tells the next session which node document to read.
- `docs/DENO_NODE_RETROSPECTIVE.md`: shared pre-flight checklist and repeated mistakes.
- `docs/nodes/<node>.md`: current contract, WIP notes, pitfalls, and verification matrix for one node.
- `docs/handoff_archive/`: old history only.
- `tmp/` or `scratch/`: temporary code/artifacts only, not durable docs.

When the user says to remember a node-specific detail, put it in that node's document, not in this file. Put only cross-node rules here.

Before implementation, route the work through `docs/NODE_WORK_INDEX.md`.

- Match the task or intended touched files against the trigger table in `docs/NODE_WORK_INDEX.md`.
- Read the common checklist and only the matched node-specific document before editing.
- If the user changes scope mid-session, rerun the routing step before touching new files.
- If no route exists for a new active node, add a short node document or an index entry before the implementation grows.
- Optional deep frontend references are opt-in only. Do not load them during routine backend fixes or tiny UI copy changes.

## Parallel Agent Policy

The user explicitly approved active parallel-agent use for this repo.

- For complex ComfyUI node work, especially frontend/backend contract changes, release prep, workflow compatibility, runtime behavior, or repeated regressions, use parallel agents proactively for bounded sidecar tasks.
- Good delegation targets: log/history analysis, UI/UX screenshot review, test-case matrix review, release/package surface review, external/codebase research, and saved-workflow compatibility audit.
- Keep the main agent responsible for final design judgment, file integration, runtime sync, ComfyUI restart, final canvas verification, git actions, and release decisions.
- Do not let multiple agents edit the same file at the same time. If a worker edits code, give it a disjoint file scope and review its changes before integration.
- For small obvious fixes, direct work is fine, but if the bug touches both frontend and backend or the user reports repeated mismatch, attach at least one parallel reviewer unless there is a clear reason not to.
- Parallel-agent work is not complete until the main agent has collected every spawned agent's final result, recorded the usable findings or file changes in the turn notes/handoff, and closed agents that no longer need to stay open. Before any final user report, explicitly check for unresolved spawned agents. Context compaction is not an excuse for losing delegated results; after compaction, recover known agent IDs/results from the summary or state files before declaring completion.

## Runtime Paths

- Source repo: `E:\DENO-Repos\comfyui-deno-custom-nodes`
- Active ComfyUI runtime root: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install`
- Active custom node install: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`
- Shared model folder: `E:\ComfyUI\ComfyUI Model\models`
- Main ComfyUI URL: `http://127.0.0.1:8188/`
- Main launch shortcut: `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`

Patch source first, then sync changed runtime-visible files into the active install. Do not assume source-only edits are visible in ComfyUI.

## Runtime Restart Rules

Do not restart ComfyUI as a blind off/on reflex. First classify the current runtime state, then only replace it when replacement is actually needed.

1. Check whether `http://127.0.0.1:8188/` is already served by the active Easy Install runtime.
   - Inspect the listener owner for port `8188`.
   - Match the owner process command line to `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install` and `ComfyUI\main.py`.
   - Count matching `main.py` and SageAttention BAT `cmd.exe` shells before doing anything.
2. If the correct runtime is already running and the change is JS/static-only, copy the changed file, verify the source/runtime hash, fetch the served JS marker, and hard-refresh/reopen the browser tab. Do not kill and relaunch unless the served file is stale, the extension list requires a restart, or the node contract changed.
3. If Python registration, backend code, dependencies, `/object_info`, or node contract changed, a restart is required.
4. Before any required restart, check `http://127.0.0.1:8188/queue`.
5. If a queue is running or pending, do not kill it silently. Report that restart is blocked by the active queue.
6. If idle, stop only the identified active-runtime `main.py` process and its matching SageAttention BAT shell. Do not broadly kill unrelated ComfyUI, test-port, Claude, Node, or launcher processes.
7. After stopping, confirm port `8188` is free or that the old PID is gone before launching.
8. Start through the visible desktop shortcut only.
9. Never start hidden/background ComfyUI processes.
10. Never launch first and clean later. Never leave stacked ComfyUI backends behind.
11. After launch or no-restart refresh, verify the final state: one intended active runtime, `/object_info/<NodeName>`, served JS markers when relevant, queue idle, and the real canvas for UI work.

Docs-only and tests-only edits do not require a runtime restart.

## ComfyUI Node Work

Before node code/UI changes, read `docs/DENO_NODE_RETROSPECTIVE.md` and the matching node document from `docs/NODE_WORK_INDEX.md`.

Common requirements:

- Preserve saved workflow compatibility unless the user explicitly approves a breaking change.
- Avoid developer/internal labels in user-facing UI.
- Reuse the established DENO visual lineage and `docs/DENO_NODE_VISUAL_IDENTITY.md` for visual work.
- For frontend changes, `/object_info`, served JS, and unit tests are not enough. Verify in the real ComfyUI canvas.
- Hard gate for public node Info metadata: every public node in `node_list.json` must expose a useful
  node `DESCRIPTION`, every required/optional input must have a ComfyUI `tooltip`, and every output
  in `RETURN_TYPES` must have matching `OUTPUT_TOOLTIPS`. The shared DENO version/update notice must
  be visible through the DENO info button path. Missing Info-panel descriptions are a release blocker.
- Hard gate for saved visible state: it is a blocker if the workflow JSON contains the correct value
  but the real canvas reopens with the visible control, row, toggle, model, prompt, or numeric value
  wrong. Saved data and visible UI restoration must match after `Ctrl+S -> Ctrl+Shift+R/F5 -> reopen`.
  Do not call a node compatible just because the raw JSON still contains the value.
- Use API-first, browser-last verification for ComfyUI UI work. First verify source/runtime hashes, `/queue`, `/object_info`, served JS markers, backend logs, and `/prompt` or WebSocket events. Use the browser only for final fresh-canvas visual/interaction proof, screenshot, and console errors. Do not waste time scraping LiteGraph internals from the browser when the same fact can be checked through ComfyUI APIs or tests.
- During Codex UI verification, treat the current ComfyUI browser canvas as disposable when the user has saved anything important and `/queue` is idle. Codex may reload, close/reopen, or clear/recreate a test canvas to force fresh frontend JS and clean node state. This never means deleting saved workflow files.
- If the Codex in-app Browser / Chrome plugin control channel is closed, do not stop at "browser unavailable" or repeatedly ask the user to refresh. First use the local Chrome DevTools fallback `tools/comfyui_cdp_probe.ps1` for a headless ComfyUI screenshot and DOM/title check. If a separate disposable browser is useful, run the same helper with `-Visible -KeepOpen` to open an isolated Chrome window instead of touching the user's current tab. Ask the user to open or refresh the in-app browser only when real hover/click checks must happen in the user's live side panel.
- Test resize grow and shrink, blank-area wheel/middle-click behavior, popups, buttons, dropdowns, and old saved-node/widget-order cases when relevant.
- If a state-changing verification unloads/stops/clears external state, prove the next normal workflow works or restore/report the state.

## ComfyUI Updates

When the user asks to update ComfyUI and all custom nodes, use the user's standard automatic flow first:

1. Run the existing ComfyUI update BAT/launcher flow.
2. Use ComfyUI Manager's full custom-node update/update-all flow.

Manual git/pip surgery is fallback/debug work only when the standard updater fails or local changes must be protected.

## Release Rules

No GitHub push, public version bump, Comfy Registry publish, GitHub Release, downloader exposure, or deactivation without explicit user approval.

Hard release gate: every node/workflow touched by a public release must have saved-workflow migration compatibility checked before release. Public release is not a quick final step. Treat it as a compatibility audit.

- Before any public release, attach a separate GPT5.5 Xhigh reviewer for release inspection. Do not replace this with the implementing agent's self-review.
- The GPT5.5 Xhigh review must include the existing release checks plus a strict frontend/backend contract sync review.
- Ghost features are not allowed. If a feature exists in backend code, it must have a working frontend path or be an explicit compatibility-only migration/rejection path. If a feature is added, frontend and backend must work together in the same release unit. If a feature is removed, remove it from both frontend and backend in the same release unit.
- Check whether old public workflow JSON files still load with the current node IDs, widget order, input names, output names, hidden fields, and saved values.
- Check both raw saved values and visible restored values. A saved `true` that reopens as an off
  toggle, a saved model that reopens as another row/default, or a saved prompt that appears under the
  wrong label is a release blocker even if the JSON still contains the original data.
- If a node ID changed, use ComfyUI node replacement metadata where possible instead of exposing duplicate legacy menu nodes.
- If only widget/input/output structure changed, add narrow frontend/backend migration and normalization rather than silently dropping old values.
- Migration code can create new bugs. Any migration change must be tested against both old saved workflows and freshly created current nodes.
- Do not release if migration hides active controls, shifts widget values, breaks links, creates duplicate visible nodes, wipes saved selections, or lets old UI labels become active runtime values.
- If compatibility cannot be preserved, stop and get explicit user approval for a breaking release.

Before any release prep:

- Confirm exact release scope.
- Exclude paused/WIP nodes unless explicitly approved.
- Run or obtain the separate GPT5.5 Xhigh reviewer report for the release scope, including frontend/backend sync and ghost-feature checks.
- Include public workflow fixture/migration checks for every released node or workflow in scope.
- Sync `node_list.json`, `pyproject.toml`, README/search terms, localized README pages, changelog/release notes, and screenshots when public node surface changes.
- Treat ComfyUI Manager and Registry visibility as release surfaces, not an afterthought. Every public node creation, rename, removal, display-name change, or major UI contract change must update `node_list.json`, `pyproject.toml`, README/search terms, localized README pages, changelog/release notes, and real-canvas screenshots in the same release unit.
- ComfyUI Manager map PRs are event-based, not required for every patch version. Submit or update a Manager map PR when the public node list changes, node IDs/display names change, nodes are removed, or the public Manager map is stale. For ordinary bugfix/version-bump releases, verify the map but do not create noisy PRs if it already matches.
- Before release completion, verify that Manager/Registry discovery has moved past stale data: the Registry version is active, not merely pending; the Manager Nodes tab or `extension-node-map.json` lists every intended public DENO node; and it no longer shows only `DenoResolutionSetup` or an old node count.
- WIP/paused nodes may exist in a local development branch or active runtime for testing, but they must not appear in the public release branch's `NODE_CLASS_MAPPINGS`, `node_list.json`, pyproject keywords/description, README, screenshots, packaged assets, or Manager/Registry metadata unless explicitly approved for that release.
- Run tests and registry metadata checks.
- Verify public README screenshots are current real ComfyUI canvas screenshots.

After any public release:

- Verify the pushed commit/tag/release and GitHub Actions status.
- Verify the Comfy Registry version is active, not merely pending, and that the install endpoint resolves to the intended version.
- Verify ComfyUI Manager discovery after cache/index refresh: search finds the pack, the Nodes tab or `extension-node-map.json` lists every intended public DENO node, and the node count is not stale.
- Install or update through the normal beginner path, preferably ComfyUI Manager, in a clean or disposable runtime when practical. Do not rely only on the source repo or the developer runtime.
- Load at least one public benchmark workflow for the released scope and confirm old workflow compatibility, missing dependency messages, node surfaces, and runtime execution-critical defaults.
- Check public README/changelog/release notes/screenshots render correctly from GitHub, not only from local Markdown.
- Monitor user-facing failure surfaces after release: Registry status, Manager cache, GitHub Issues/Actions, and known subscriber workflow reports.
- If a release problem is found, classify it as cache delay, documentation fix, hotfix release, rollback, deactivate/unpublish, or breaking-change notice. Rollback, deactivate, unpublish, or replacement release still requires explicit user approval.
- Update `SESSION_HANDOFF.md` with the released version, verification evidence, pending propagation/cache checks, and any follow-up owner. Do not leave the next session guessing whether public propagation finished.

## Current Active Node Docs

- Local LLM Loader / Reviewer: `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md`
- Ideogram Director: `docs/nodes/ideogram-director/README.md`
- Random Prompt Box paused state: `docs/nodes/RANDOM_PROMPT_BOX.md`
