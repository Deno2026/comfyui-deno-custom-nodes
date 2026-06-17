# DENO Node Retrospective Checklist

This note is the shared pre-flight checklist for DENO ComfyUI node work. Read it before creating or changing nodes.

This is not a per-node work log. Keep node-specific contracts, provider quirks, bug transcripts, verification matrices, and current WIP in the matching document under `docs/nodes/`.

For routing, read `docs/NODE_WORK_INDEX.md`.

For visual direction, also read `docs/DENO_NODE_VISUAL_IDENTITY.md`.

## 0. Product Contract Memory Gate

- Treat the matching `docs/nodes/...` document as the node's Product Contract, not a background note.
- The Product Contract must preserve the user's intent across context compaction: purpose, core values, required behaviors, UI labels, state transitions, rejection/fallback rules, and "do not break" items.
- Before code or UI changes, read the Product Contract and implement against it. Do not rebuild behavior from memory or from the latest visible bug alone.
- If the user clarifies how a node should behave in situation A/B, what a button should mean, what must never be silently changed, or what workflow value matters most, update the node document before or alongside the code.
- If the user says the current direction is wrong and chooses another approach, treat that as a contract pivot. Update the node document first, then continue coding from the new philosophy/implementation point.
- If the Product Contract is stale, missing, or conflicts with the current request, resolve that explicitly before changing implementation files.
- A non-trivial node change is not finished if the code changed but the Product Contract still describes the old behavior.

## 1. Start From The User Outcome

- Confirm what counts as success in ComfyUI, not just what code should exist.
- Treat this document as a minimum safety net, not a closed checklist. After reading it, still reconstruct the user's exact action path and infer neighboring failure modes that are not written here.
- For every real bug report, write or hold the path in your head as user actions, for example `change value -> save -> F5 -> reopen -> run`, then verify that path directly.
- Before saying a fix is complete, check at least two plausible adjacent risks outside the written checklist when the change touches frontend state, widget order, saved workflows, runtime sync, release packaging, or user-visible data.
- If this document or an old handoff says a behavior is already safe but the user's current runtime proves otherwise, the runtime wins. Investigate beyond the document and then update the document with the broader pattern.
- Preserve existing behavior unless the user explicitly asks to remove it.
- When the user says "add and make default", do not replace old options.
- Confirm the finished node still matches the user's intended workflow, not only the implementation plan.
- Keep DENO's visual identity consistent: black plus neon green, clean ComfyUI-native controls, no random custom styling unless it improves usability.
- Use the established DENO node visual language from `docs/DENO_NODE_VISUAL_IDENTITY.md`; do not treat experimental nodes as the default style reference.

## 2. Source And Active Install Are Separate

- Main source repo: `E:\DENO-Repos\comfyui-deno-custom-nodes`.
- Active install: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`.
- ComfyUI Desktop is a separate runtime surface. Its app is usually
  `C:\Users\aions\AppData\Local\Programs\ComfyUI\Comfy Desktop.exe`, but its base path comes from
  `C:\Users\aions\AppData\Roaming\ComfyUI\config.json` and its DENO node folder may be named
  `comfyui-deno-custom-nodes` instead of `deno-custom-nodes`.
- Use `docs/COMFYUI_RUNTIME_MATRIX.md` and `tools/comfyui_runtime_matrix.ps1` before assuming which
  runtime or custom-node folder is being tested.
- Patch the source repo first.
- Copy only changed files into the active install.
- Compare file hashes before trusting ComfyUI runtime behavior.

## 3. ComfyUI Node Contract First

- Verify `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `FUNCTION`, and `CATEGORY`.
- If a node has a frontend widget, update both Python inputs and JS visibility/state logic.
- Check `/object_info/<NodeName>` after restart to confirm ComfyUI sees the expected contract.
- Public nodes must not ship with blank Info-panel rows. Each public node needs a useful
  `DESCRIPTION`, each required/optional input needs a `tooltip`, and each returned output needs a
  matching `OUTPUT_TOOLTIPS` entry. Add or update the pack-wide metadata guard test whenever a new
  public node or input/output is added.
- Do not rely on the canvas screenshot alone; check the backend contract too.
- For ComfyUI UI/runtime verification, use the fixed API-first, browser-last route:
  1. Check source/runtime file hashes and copy only changed runtime-visible files.
  2. Classify the runtime before restart: is the target port already owned by the intended runtime `ComfyUI\main.py`, are there duplicate `main.py` processes, and is the matching visible launcher shell already open?
  3. For JS/static-only edits, prefer no backend restart: hash-match runtime file, fetch the served JS marker from the same URL/port, then hard-refresh/reopen the browser tab. Restart only if the served file is stale, the extension list needs reload, or the backend contract changed.
  4. For backend/registration/dependency or `/object_info` changes, check `/queue`; if idle, stop only the identified active-runtime `main.py` and matching launcher shell, confirm the target port is released, then start once through the user's visible shortcut.
  5. Never start a new ComfyUI first and clean up afterward. Never use a broad kill that can take down unrelated test ports, Claude, Node, launchers, or other ComfyUI installs.
  6. Check `/object_info/<NodeName>` and served extension JS marker strings from the same URL/port the user is viewing.
  7. Verify behavior through tests, backend logs, `/prompt`, `/history`, and WebSocket/custom progress events before touching the browser.
  8. Use the browser only after those checks pass: refresh or reopen a disposable canvas, add/load the changed node, take one focused screenshot, check console errors, and interact only with controls that need visual proof.
  9. Do not spend time scraping `window.app`, LiteGraph node ids, or broad DOM state from the browser. If node ids or execution state matter, create a disposable API workflow with known ids or observe WebSocket events instead.
  10. If the Codex in-app Browser / Chrome plugin control channel is closed, run `tools/comfyui_cdp_probe.ps1` before asking the user for help. It uses local Chrome DevTools with a temporary profile, needs no extra install, and returns a focused screenshot plus title/body state for the target ComfyUI URL. Use `-Visible -KeepOpen` when a separate disposable Chrome window is better than touching the user's current tab.
  11. Ask the user for F5/Ctrl+R, close/reopen, or a visible side-panel setup only when the CDP fallback cannot prove the visual state or the task specifically needs hover/click interaction in the user's live browser. Do not keep looping on browser internals.

## 4. README And Visual Proof Are Part Of The Product

- A shipped node must be understandable from the GitHub README, not only from source code or text release notes.
- When a new node is complete and released, open it in the real ComfyUI frontend, capture an actual screenshot, add the image under `docs/images/`, and update the README so users can visually understand the node from the repository page.
- When a feature changes, update the README at the same time: node name, display name, inputs, outputs, buttons, install notes, limitations, optional dependencies, and screenshots if the UI changed.
- Treat README accuracy as part of release quality. A public node with stale docs or missing visuals is not finished.
- Treat ComfyUI Manager's node count, Nodes tab, and schema-based preview as public product surfaces too. The Manager preview cannot reproduce custom canvas/DOM styling exactly, so keep the schema current through `node_list.json` and `/object_info`, then use real canvas screenshots in README for the true visual look.
- The closest possible Manager preview comes from the backend schema, not the custom frontend. Keep `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `CATEGORY`, display names, `SEARCH_ALIASES`, input `description`/tooltip text, and optional `WEB_DIRECTORY/docs/<NodeID>.md` help pages in sync. Custom canvas/DOM surfaces still need real ComfyUI screenshots because Manager's preview is schema-based.
- If Manager shows an old version, a one-node count, or only `DenoResolutionSetup`, the release is not visually/discoverably complete even if ComfyUI itself can load the nodes. Refresh/update Manager data, inspect `extension-node-map.json`, and confirm the live Registry version before calling the release finished.

## 5. LiteGraph UI Pitfalls We Already Hit

- Arrow-click numeric widgets can fail when custom drawing/event handling blocks default LiteGraph behavior.
- Right-click and drag events often need explicit canvas-coordinate handling.
- Custom DOM widgets and node-top overlays can swallow ComfyUI canvas navigation. Wheel over a DENO node should still reach the ComfyUI canvas for zoom/scroll unless the user is inside an intentional local scroll area. Middle-click / wheel-click drag over non-text controls should pan the canvas or be explicitly forwarded.
- Global/capture wheel handlers must not use stale LiteGraph mouse coordinates as normal hit-test input. Convert the current event's `clientX/clientY` through the graph canvas rect first; trust `offsetX/offsetY` only when the event target/currentTarget is the canvas itself. Stale `graph_mouse` / `last_mouse` fallback can make a neighboring node's scrollbar move while the pointer is visibly over another custom node.
- Oversized blank node bodies are also interaction bugs, not harmless empty space. After hiding/collapsing widgets or replacing a larger layout with a compact summary, shrink the node to the actual visible controls or make sure the blank area cannot block ComfyUI wheel/scroll/zoom. Always test wheel over the lower empty part of the node.
- Canvas-drawn tooltips are clipped by the node/widget draw region. If helper text must extend outside the node frame, mount a `position: fixed` DOM overlay on `document.body`, clamp it to the viewport, and hide it on hover leave.
- Dynamic rows need both row-level behavior and node-level fallback context menus.
- Node size can reset if `computeSize`, `setSize`, or custom draw logic fights the user's manual resize.
- ComfyUI's node context menu `Recreate node` is its own restore path. For custom DOM nodes, test
  right-click `Recreate node` with both `Keep widget values` and `Reset widget values` when geometry,
  widget order, saved values, or generated controls changed; fresh-node and normal F5 tests can miss
  this path.
- Portable/Easy-Install and Desktop can disagree. Desktop uses a different frontend root,
  Electron shell, default port, base path, window size, and sometimes a different custom-node folder
  name. A geometry fix that passes in the browser can still collapse in Desktop. For custom DOM
  nodes, run the same click/resize/F5 path in Desktop before claiming a public hotfix is safe.
- Media preview nodes must not call `setSize` on every image/video load after the user has resized the node. Auto-fit only for a first useful default or an explicit fit command; otherwise contain/letterbox the media inside the user's chosen node box.
- Expanding/collapsing one area must not accidentally resize unrelated text areas.
- If a value should persist across workflow reloads, do not normalize it back to defaults during frontend setup.
- Old/public saved workflows can carry a different widget serialization layout than the current node (removed display widgets, added/reordered fields), so the saved `widgets_values` array length or shape may not match. When it can differ, normalize it inside a `configure()` wrap *before* LiteGraph restores values, not only in `onConfigure`/setup, or saved values drift by position and real inputs are lost. Mirror `DenoLTX23PresetLoader.getNormalizedLtxSerializedValues` (`web/js/deno_extra_nodes.js`). For `DenoLTXPromptGuide`, the saved canonical values are the real 5 controls, but runtime configure may need 7 slots because generated display widgets are already inserted; expand around generated widgets only for configure, then reapply by widget name. Always test both an old saved-layout fixture and a fresh node — public workflow fixtures live in `tests/fixtures/public_workflows/` and are guarded by `tests/test_public_workflow_migration.py`.
- Any node that exposes editable text or model selections must pass a real save survival gate: change visible values, serialize through the actual ComfyUI graph/workflow save path, reload/F5 or `graph.configure()` that exact data, and confirm every value is still under the same visible label. A node that cannot preserve prompts, negative prompts, toggles, model paths, or numeric values across Save -> F5 -> reopen is a blocker, even if backend execution tests pass.
- Raw JSON preservation is not enough. If the saved workflow still contains the correct value but the
  real canvas restores the visible control incorrectly, treat it as the same severity as data loss.
  Examples: saved `true` reopens as an off toggle, saved model text reopens under the wrong row,
  generated button labels shift hidden widgets, or a prompt appears under another label. The release
  gate is `save -> hard reload/reopen -> inspect the visible UI -> serialize again`, not just
  inspecting the first saved JSON.
- ComfyUI/LiteGraph combo restore can clamp a saved value to a default before custom setup runs when the saved value is not in the current option list, such as models from `extra_model_paths.yaml`. If the user-selected value must survive F5/reload, store the normalized saved `widgets_values` during `configure()` before LiteGraph mutates widgets, then reapply that saved array during setup before sanitizing. Do not rely on `node.widgets_values` after `configure()` as the source of truth.
- Saved Local LLM model values must be preserved without pretending they are installed on another
  PC. If a saved Ollama/LM Studio model is absent from the current detected provider list, show a
  reversible unavailable value such as `Missing saved model: <model>`, preserve the original id
  inside that display text, and reject Run/Stop/Unload before sending provider requests. If
  `Refresh Models` later returns the exact model, restore the normal model label.
- A node can pass code tests while the real canvas is visibly shifted by one row, such as a `gguf_unet` row showing a VAE file and each following row receiving the previous field's value. This is a hard verification failure. After touching widget order, hidden widgets, combo/default lists, mode tabs, or migration logic, verify the visible row-label to value-kind mapping in a fresh node and in a saved-node/migration case. Check that each row's label, displayed value, widget `name`, serialized `widgets_values` position, and backend input field still point to the same concept.

### Frontend Layout Guardrails

Use these before editing custom ComfyUI frontend JS. They are distilled from the Claude frontend audit and the Ideogram Director implementation that the user approved in real use.

- One value gets one user-editable surface. Do not keep a hidden serialized widget and add a second DOM/custom textarea for the same value unless the DOM widget is explicitly `serialize:false` and syncs one way into the real serialized widget.
- Preserve backend widget order. Create custom widgets by appending, then move them with a helper if needed. Do not insert new serialized controls before existing ones unless a migration handles old `widgets_values`.
- Hide mode-specific serialized widgets in place with a zero-height converted-widget pattern and restore the original `type` / `computeSize`. Do not remove serialized widgets just to hide a mode.
- Frontend code should find widgets by name, not hard-coded index. The Python `INPUT_TYPES.required` order is the saved contract; JS is responsible for adapting around that contract, not silently changing it.
- Avoid self-referential sizing. A widget `computeSize()` should not repeatedly derive its own height from the current node height and then force the node to resize again. Enforce minimums, preserve manual user size, and prove the node can grow and shrink.
- Custom DOM panels must be good guests inside ComfyUI. Wheel and middle-click belong to the canvas except inside an intentional local scroll region such as a modal list. Test the lower blank part of the node, not only active controls.
- When two custom nodes are side by side, wheel over one node's board/panel/popup must not scroll the other node's preview. Include this adjacency case in frontend QA for global wheel handlers.
- Setup/refresh must be idempotent. Prefix generated widgets, remove stale generated widgets before rebuilding, guard against re-entry, and tear down window listeners / observers in `onRemoved`.
- Old saved workflow migration belongs in a `configure()` wrapper before LiteGraph restores values. Only migrate exact known legacy shapes; reject shifted labels, URLs in model fields, booleans in text fields, `NaN` seeds, and stale hidden widget state before they become live runtime values.
- If the frontend fix only passes because a fresh node was created, it is not done. Also test an old saved node when input names, widget order, hidden fields, or frontend layout changed.

## 6. Dynamic Lists And Refresh Behavior

- For file lists such as LoRAs, do not trust stale widget options after ComfyUI `R` refresh.
- Fetch fresh `/object_info/<NodeName>` when opening a chooser if the list can change at runtime.
- Never wipe saved selections just because the old frontend cache does not know the value yet.
- Keep a safe fallback to existing widget options if the live refresh fails.
- For streaming local-server calls, a clean HTTP status is not proof of a valid result. If a stream ends without a final message, do not return an empty successful output. Run a diagnostic non-stream request when available, surface provider errors such as context-length overflow, and add a regression test for that empty-stream path.
- For local LLM provider options, "off" is not always a safe value to send. Some LM Studio models
  reject unsupported configuration fields even when the value disables the feature. Optional
  provider fields such as native `reasoning` should be capability-aware: send the disabled value only
  when the model reports support for it, otherwise omit the field. Tests should assert
  supported-disabled, unsupported-disabled, and enabled payloads.

## 7. Resize And Image Batch Rules

- Batch image outputs must have consistent dimensions.
- `Keep Input Ratio` should use the first input image as the batch reference unless a different rule is explicitly designed.
- Keep existing resize modes available unless the user asks to remove them.
- Alignment options should include `1` for no forced divisibility and sensible defaults such as `32`.
- Prefer Lanczos for resize quality when appropriate, but preserve user-selectable interpolation.

## 8. LTX Sequencer Rules

- Bypass must be a true pass-through: no prompt, latent, VAE, or guide mutation.
- If a parameter is wired as input, verify which value wins: connected input should be explicit and predictable.
- Strength sync means checked nodes sync together; a node with sync off keeps its own strength values.
- Insert frame and seconds widgets must clamp and display cleanly.
- Numeric display should avoid floating garbage like `0.05300000000000002`.

## 9. Loader And Downloader Rules

- Model loader nodes should mirror the official or proven node behavior internally before adding convenience UI.
- Do not invent hidden model-loading semantics when the user wants wrapper convenience.
- Downloader nodes have higher registry/security risk. Keep risky downloader behavior isolated from the main node package when needed.
- Local-server HTTP nodes have registry scanner risk too. If a node must call Ollama, LM Studio, or another user-owned local server, keep the URL guard inside the final HTTP helper, reject non-local hosts before opening any connection, test that remote URLs never reach the connection layer, and avoid broad `urlopen`/generic network helpers that look like arbitrary outbound access.
- If extra model paths exist, prefer the user's real model path over the default ComfyUI `models` folder.
- RTX/VFX nodes can conflict at the native DLL level. If another node loads NVIDIA Broadcast/NGX VFX DLLs first, `nvidia-vfx` `VideoSuperRes` can fail with `code -2` even when a Broadcast-based RTX Upscale node still works. Detect and report this separately from install, GPU, or driver failures.

## 10. Verification Routine

Run this before saying a node is done:

1. `git diff --stat` and inspect the changed files.
2. State the exact user action path being fixed, and do not mark done until that path is directly verified or explicitly reported as unverified.
3. Python compile for changed Python files.
4. `node --check` for changed JS files.
5. Existing tests, using inline test execution if `pytest` is unavailable.
6. Sync source to active install.
7. Compare hashes between source and active install.
8. Run the runtime matrix when runtime behavior matters. For custom frontend/geometry/interaction
   fixes, verify Easy-Install and ComfyUI Desktop separately when Desktop is installed. If one
   runtime is unavailable, mark that gate `UNVERIFIED`.
9. Restart ComfyUI only if required. For JS/static-only edits, prefer source/runtime hash + served JS marker + hard browser refresh. For backend/registration changes, replace the active runtime in order: inspect port/processes -> queue idle -> stop only the matching active-runtime `main.py` and BAT shell -> confirm old PID/port is gone -> launch once through the visible shortcut.
10. Confirm `/object_info` for changed nodes.
11. If frontend changed, confirm served JS contains the new behavior.
12. For public node registration/display changes, confirm `node_list.json` matches the public `NODE_CLASS_MAPPINGS` IDs and display names, then run registry metadata tests. Hidden aliases, paused WIP nodes, and compatibility-only replacements must not appear in `node_list.json`. For new or unreleased nodes, align the internal ID with the final display name before release: keep the `Deno` prefix and make the words after it match the display name words as closely as possible. Do not rename already-public internal IDs just for Manager cosmetics.
13. Before release, inspect ComfyUI Manager or its `extension-node-map.json`/Registry view for stale node counts and stale node IDs. If Manager still shows only `DenoResolutionSetup` or an old count, discovery is not complete.
14. Before public release, run or obtain a separate GPT5.5 Xhigh reviewer report for the exact release scope. This is in addition to the implementing agent's own checks.
15. The GPT5.5 Xhigh review must explicitly check frontend/backend contract sync: every backend feature has a real frontend path or an explicit compatibility-only migration/rejection path, every frontend control has a backend effect, added features work on both sides, and removed features are removed from both sides. Ghost features are release blockers.
16. Hard gate for UI/frontend work: open a disposable blank workflow in the real ComfyUI frontend and add or load the changed node. Do not use the user's active workflow unless the user explicitly allows it.
17. Actually interact with the node, not just inspect code: click every affected visible button, toggle, dropdown, popup, expander, refresh action, and More/Less control. Test resize grow and shrink when relevant.
18. Check that wheel over the node still controls ComfyUI canvas zoom/scroll and middle-click / wheel-click drag still pans the canvas unless the pointer is inside a deliberate local scroll area.
19. Run the frontend geometry gate in the screenshot: no clipped text, no overlapping widget Y positions, panels stay inside the node frame, toggles do not shift unrelated rows, resize grows and shrinks, F5/reopen does not duplicate widgets, lower blank space lets canvas wheel/middle-click work, and a short viewport or zoomed canvas still reads correctly.
19a. Run the visible restore gate for any node with saved widgets, generated buttons, hidden rows, custom DOM state, or frontend migration: change representative visible values, save, hard reload/reopen, confirm the visible UI matches the saved values, then serialize again and confirm the second save did not overwrite them. A raw JSON value that fails to reappear correctly in the UI is a blocker.
20. Hard row-mapping gate: if backend inputs, widget order, hidden fields, combo/default lists, mode tabs, or frontend migration changed, inspect the real canvas row by row. A fresh node and a saved-node/migration case must both show the correct value kind under the correct label; for example `.gguf` under GGUF, VAE files under VAE, text encoders under text encoder, and projections under text projection. Any one-slot shift is a blocker.
21. If backend inputs, widget order, hidden fields, or frontend migration changed, load or simulate an old saved-node case. Fresh-node testing alone is not enough.
22. For complex multi-part nodes, test each major function and make sure one fix did not break another feature.
23. Name the adjacent risks that were checked beyond the written checklist, or say explicitly why none applied.
24. Explain what was verified and what still requires browser-side user confirmation. If the real canvas UI gate was not completed, say so plainly and do not call the node done.

## 11. Saved Workflow Migration Gate

- Public workflows are part of the product contract. Before any public release, inspect old public workflow JSON files for every released node/workflow in scope.
- Classify each old workflow as `OK`, `Needs node replacement`, `Needs widget migration`, `Needs slot migration`, `Needs fixture test`, or `Breaking change needs approval`.
- Node ID renames should use ComfyUI node replacement metadata when possible. Do not keep old aliases as duplicate visible menu nodes unless the user explicitly wants that.
- Widget/order/input/output migrations must be narrow and reversible in spirit: preserve saved user values, repair known old shapes, and avoid broad guesses that rewrite unrelated nodes.
- Migration code must be defensive. Reject shifted labels, URLs in model-name fields, booleans in text fields, `NaN` seeds, stale hidden widgets, and old option tokens before they can become active runtime values.
- Migration can introduce new regressions. Test old saved workflows and freshly created current nodes in the same pass, then verify links, visible controls, output slots, widget values, and execution-critical defaults.
- A migration is not proven by code inspection alone. Add or update fixture tests using representative old public workflow JSON when possible.
- Do not call release ready if migration hides active controls, erases saved selections, breaks links, adds duplicate visible nodes, creates UNKNOWN nodes, or only works after manually recreating nodes without documenting that requirement.
- If compatibility cannot be preserved safely, treat the release as breaking and stop for explicit user approval.

## 12. Shared BAT Verification

- Treat BAT files shared with users as shipped executables, not helper text.
- A `NO`/cancel smoke test is not enough. Before saying a BAT is ready, run the exact distributed `.bat` through the real `YES` success path until `DONE` in a copied portable/test folder.
- Also test the cancel path after the success path so both flows are known-good.
- Test paths with spaces, and do not assume inline Python/PowerShell survives Windows BAT parsing. Watch delayed expansion, `!`, `%`, `^`, parentheses, pipes, and nested quotes.
- Prefer `DisableDelayedExpansion`; if delayed expansion is required, isolate it to the smallest possible block.
- Test every supported placement: portable root and the `ComfyUI` folder that contains `main.py`.
- Confirm embedded portable Python imports the intended copied `ComfyUI` folder. Easy-Install `_pth` files can point at `../ComfyUI`, so public instructions must tell users to copy the whole portable root and keep the inner folder name as `ComfyUI`.
- If the BAT exists in more than one user-facing location, copy the fixed file to all locations and compare hashes.
- If the BAT is attached to a GitHub Release, replacing the local file is not enough. Replace the Release asset before telling users to download it.

## 13. Discovery Metadata

- Treat search metadata as part of the public node, not optional cleanup.
- For every public node, model family, workflow, tutorial-facing feature, node rename, display-name change, or major UI contract change, update in the same release unit:
  - `node_list.json` for Manager node IDs and Nodes-tab counts.
  - `pyproject.toml` description.
  - `pyproject.toml` `keywords`.
  - README search terms.
  - localized README search terms.
  - changelog / release notes.
  - GitHub repo topics when useful.
  - Real ComfyUI canvas screenshots when the node UI changed.
  - Optional node help markdown under the frontend `WEB_DIRECTORY/docs/` path when users need in-app documentation.
- Include both exact technical names and beginner search phrases. Example: `bernini`, `bernini prompt guide`, `bernini conditioning`, `wan-2.2`, `wan2.2`, `reference video edit`, `system prompt`, `prompt guide`, `kj bernini`.
- Only release-approved nodes belong in public discovery metadata. If a WIP node is registered locally for testing, keep it out of the public release branch's `NODE_CLASS_MAPPINGS`, `node_list.json`, pyproject, README, screenshots, and packaged assets until the user approves that node for release.
- For new or unreleased nodes, treat internal node ID naming as part of discovery metadata. If the display name changes before first public release, rename the internal `Deno...` ID at the same time so Manager's Nodes tab does not permanently expose a stale development name.
- Before release, run metadata tests and search the repo for the new feature keywords.
- After publish, query Comfy Registry/Manager search for the important terms. GitHub topics can update immediately, but Registry/Manager metadata generally requires a new version publish.
- For Manager node-list visibility, verify that the generated/served `extension-node-map.json` contains every public DENO node ID expected from `node_list.json`.
- Manage ComfyUI Manager map PRs as an event-based sync step. Open or update one when public node IDs/display names are added, removed, renamed, or when the public `extension-node-map.json` is stale. Do not open a new Manager PR for every ordinary bugfix release if the node list already matches.

## 14. Deployment Routine

- Local success is not the same as public release.
- For release work, update GitHub and ComfyUI Registry together.
- Before public release, attach a separate GPT5.5 Xhigh reviewer and keep its report with the release notes or handoff evidence. The report must include frontend/backend sync and ghost-feature checks.
- README updates and node screenshots are part of the release, not optional cleanup.
- Discovery metadata updates are part of release quality: package description, keywords, README search terms, localized README search terms, release notes, and GitHub topics when useful.
- Check GitHub Actions or registry publish status after pushing.
- Confirm the live Registry latest version, install endpoint, and local Manager cache when visibility matters. Registry versions with `NodeVersionStatusPending` are not Manager-visible completion; wait for or verify an active version. A local Manager entry still showing an old version or `1 node` means the user-facing update is not complete yet.
- If registry review/cache delay is expected, state that clearly and keep follow-up monitoring separate.

## 15. Post-Release Routine

Run this after any public release before calling the release fully done:

1. Confirm GitHub commit/tag/release and GitHub Actions are on the intended version.
2. Confirm Comfy Registry marks the intended version active, not only pending.
3. Confirm the Registry install endpoint resolves to the intended version.
4. Confirm ComfyUI Manager search, Nodes tab, or generated `extension-node-map.json` sees every intended public DENO node and no paused WIP nodes.
5. Install or update through the normal beginner path, preferably ComfyUI Manager, in a clean or disposable runtime when practical.
6. Load at least one public benchmark workflow for the released scope and confirm old workflow compatibility, node surfaces, missing dependency messages, and execution-critical defaults.
7. Check GitHub-rendered README, localized README, changelog/release notes, and screenshots after publish.
8. Monitor Registry status, Manager cache, GitHub Issues/Actions, and known subscriber workflow reports for release fallout.
9. If a problem appears, classify it as cache delay, documentation fix, hotfix release, rollback, deactivate/unpublish, or breaking-change notice. Rollback, deactivate, unpublish, or replacement release needs explicit user approval.
10. Update `SESSION_HANDOFF.md` with the released version, verification evidence, pending propagation/cache checks, and follow-up owner.
