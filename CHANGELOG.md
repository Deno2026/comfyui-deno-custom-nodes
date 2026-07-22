# Changelog

Public, user-facing release notes for Deno Custom Nodes.

This file intentionally stays short. Detailed engineering notes belong in private/local handoff notes, not the public changelog.

## Unreleased

## 0.7.71 - 2026-07-22

- Fixed `(Deno) LTX Sequencer` growing to its full 50-slot height after a workflow reload, workflow-tab switch, or browser-tab restore when the node had been manually resized, and made already-affected saved workflows recover their compact size automatically the next time they load.

## 0.7.70 - 2026-07-19

- Changed DENO Floating Tools so its `NEW` badge and version row track ComfyUI Stable only, without checking or displaying separate frontend and workflow-template package versions.

## 0.7.69 - 2026-07-18

- Preserved saved workflows that used the retired video-only LTX tiled sampler by mapping them through ComfyUI's native node replacement flow while keeping current LTX AV sampler defaults, validation, outputs, and visible controls unchanged.
- Fixed Local LLM cleanup and control races so failed or stopped runs still release an owned model once, late Refresh responses cannot overwrite a newer run, Stop and Unload requests finish safely, and negative reviewer verdicts are not mistaken for approval.
- Fixed workflow-scoped Local LLM Reviewer snapshots, and hardened Video Preview file replacement and cleanup so parallel or saved previews do not overwrite or remove each other's state.
- Fixed Video Compare batch alignment, fully disabled RTX two-pass passthrough, and exact LTX Sequencer no-op handling without changing results for already aligned or enabled workflows.
- Hardened saved LoRA values, Bernini choices, Ideogram save paths, update/help caches, preview file replacement, and canvas cleanup so invalid or stale state fails clearly without changing normal controls or outputs.

## 0.7.68 - 2026-07-18

- Fixed `(Deno) Ideogram Director` result-image restoration, panel cleanup, reroute backdrop lookup, queue preflight handling, and targeted pending-import events without changing normal generation settings or outputs.
- Fixed `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer` workflow isolation, progress routing, queue-time seed updates, popup ownership, prompt preservation, and scheme-less local server URL restoration.
- Fixed multi-image, advanced image-source, and video-preview handling so active source failures stop clearly, unchanged local files avoid repeated full validation, folder changes invalidate correctly, and temporary previews from different workflows no longer collide.
- Fixed Multi LoRA and LTX Multi LoRA legacy saved boolean values so disabled slots remain disabled without changing current widget order or normal loading behavior.
- Fixed Resize Box disconnected size reporting and Multi Image Loader-to-Sequencer reroute notifications while preserving the existing preview drag feel and Sequencer polling behavior.
- Corrected Local Model Downloader documentation to match its existing registered-root lookup behavior.

## 0.7.67 - 2026-07-03

- Fixed `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer` saved-workflow handling so provider URLs, prompts, thinking state, and reviewer state stay in the correct saved slots after workflow save, reload, copy, and provider changes.
- Kept Local LLM server access local-first by default while allowing advanced users to opt in to a specific trusted LAN server with `DENO_LOCAL_LLM_ALLOWED_HOSTS=LAN-IP:port`.
- Improved `(Deno) LTX High resolution Tiled Sampler` guide and mask conditioning stability with stricter spatial conditioning checks, clearer guide token-count mismatch errors, and pixel-mask crop validation.

## 0.7.66 - 2026-07-01

- Fixed DENO Floating Tools Error Help so large ComfyUI failures keep the browser responsive, the report is prepared only when the user opens it, and the error icon returns to normal after the next confirmed idle run.

## 0.7.65 - 2026-06-30

- Added `Error Help` to DENO Floating Tools. When a ComfyUI run fails, the helper highlights the DENO icon and opens a GPT/Gemini-ready report window with workflow, Python environment, package, GPU, custom-node, log, and traceback details. Sensitive tokens, cookies, passwords, private keys, and URL credentials are redacted before copy.
- Improved `(Deno) Ideogram Director` with optional width, height, and megapixel inputs, plus a Generate target selector for running one intended output branch while keeping the default all-output behavior.
- Improved `(Deno) Local LLM Loader` state handling for copy/paste and saved workflows, and raised image attachment detail for local vision models while keeping uploads bounded.
- Improved `(Deno) LTX High resolution Tiled Sampler` guide-aware handling and in-app docs for LTX AV guide workflows.

## 0.7.64 - 2026-06-27

- Restored release CI compatibility for environments that expose a lightweight torch stub without tensor operations, keeping the 0.7.63 Floating Tools and final LTX AV tiled node changes intact.

## 0.7.63 - 2026-06-27

- Improved DENO Floating Tools update checks so the panel refreshes live installed versions from the running ComfyUI instead of showing stale cached values after external updates.
- Replaced the old video-only LTX tiled sampler registration with `(Deno) LTX AV Step-Fused Tiled Sampler`, which uses the full audio latent as video context while keeping audio frozen.
- Kept `(Deno) LTX Tiled Spatial Upscaler` as the tiled high-resolution upscaler and changed the final LTX tiled nodes to `2 x 2` fresh defaults with extra memory cleanup enabled.

## 0.7.62 - 2026-06-24

- Fixed `(Deno) Local LLM Loader` so the Thinking and Result preview panels stay inside the node instead of stretching across nearby nodes.

## 0.7.61 - 2026-06-24

- Fixed `(Deno) Multi Image Loader` so running with no selected images now stops with a clear error instead of producing a placeholder output.
- Stabilized `(Deno) LTX Sequencer` dynamic timing rows so compact layouts, saved workflows, linked high-index rows, copy/paste, and manual node resizing restore more reliably.

## 0.7.60 - 2026-06-23

- Fixed Easy Model Download Helper model-root detection for ComfyUI setups with more than one registered model folder.
- Selecting a model root now changes the displayed/copy target path without hiding files that ComfyUI can already find through another registered model path.
- Kept model discovery limited to ComfyUI-registered model paths instead of probing nearby folders.

## 0.7.59 - 2026-06-23

- Added `[BETA] (Deno) LTX Tiled Spatial Upscaler` for tiled video-latent spatial upscale experiments in high-resolution LTX workflows.
- Added `[BETA] (Deno) LTX Step-Fused Tiled Sampler` for video-only tiled second-pass sampler experiments.
- Improved the Visual Fold toolbar buttons so Fold and Align appear as readable DENO badges with hover descriptions while staying inside ComfyUI's native selection toolbar.

## 0.7.58 - 2026-06-23

- Smoothed Visual Fold and Align integration with ComfyUI's multi-selection toolbar so the DENO buttons appear with the native toolbar and stay stable while native menus are open.

## 0.7.57 - 2026-06-22

- Fixed Ideogram Director Regenerate so a connected JSON prompt no longer overwrites manual box and description edits when the same prompt was already applied.

## 0.7.56 - 2026-06-22

- Fixed Visual Fold on Desktop so folded nodes with DOM text widgets no longer leave prompt boxes visible under the folded chip.

## 0.7.55 - 2026-06-22

- Fixed Visual Fold and Align so their toolbar integration no longer blocks ComfyUI's own multi-selection floating controls.

## 0.7.54 - 2026-06-21

- Fixed Ideogram Director bbox editing so drawing, moving, and resizing boxes keeps responding inside the node on more ComfyUI browser/runtime setups.
- Fixed Ideogram Director's board preview so changing output resolution updates the canvas shape immediately even when a generated image is already shown.

## 0.7.53 - 2026-06-21

- Added a Local LLM Loader Tip popup that shows how to chain LLM nodes for prompt generation, review, branching, and final cleanup.
- Fixed the Tip button drawing so it does not affect ComfyUI's normal widget text alignment.

## 0.7.52 - 2026-06-20

- Polished DENO Floating Tools update display: the update badge now stays inside the icon area, the icon stays still, and the panel uses shorter English update copy.

## 0.7.51 - 2026-06-20

- Improved Ideogram Director's Elements panel: crowded region lists can be widened, rows show the actual element text, and double-click editing is easier when boxes overlap.
- Made Copy JSON more reliable by adding fallback copy paths and a manual copy dialog when the browser blocks clipboard access.
- Cleaned the public GitHub surface so internal DENO operating notes stay local-only while user-facing docs remain public.

## 0.7.50 - 2026-06-19

- Added optional DENO Floating Tools, a small draggable helper that can free ComfyUI VRAM and show read-only Portable update status when enabled.
- Documented the new three-surface verification baseline: Portable ComfyUI first, then official Desktop, then Easy-Install/EZi Desktop mode.

## 0.7.49 - 2026-06-19

- Fixed ComfyUI EZi/Desktop startup hangs caused by Easy Model Download Helper checking model folders while ComfyUI was still loading its node list.

## 0.7.48 - 2026-06-19

- Improved the DENO node info button: update details now open only on click, the popup closes when users click or wheel outside it, and the update card shows short release-note bullets without extra rollback clutter.
- Fixed Ideogram Director's fullscreen Language picker so Escape closes it consistently, matching the on-screen `Esc to close` hint.

## 0.7.47 - 2026-06-19

- Fixed Local LLM Loader validation for queued/list-wrapped saved combo values, so current and legacy seed, memory, and ComfyUI model-unload settings validate correctly before execution.
- Improved Visual Fold drag handling so Fold/Rename/Align controls stay hidden while nodes or groups are being dragged, and focus changes such as Alt+Tab cannot leave the controls stuck hidden.

## 0.7.46 - 2026-06-18

- Hardened saved-workflow compatibility for stale combo values across prompt guides, Local LLM nodes, Ideogram Director, resize/image utilities, video compare, and RTX VFX helpers.
- Disabled, hidden, off, or inactive saved options from missing drives or older workflows no longer block ComfyUI before the node can ignore them. Active missing options still stop with a clearer field-specific message.

## 0.7.45 - 2026-06-18

- Fixed Multi LoRA and LTX Multi LoRA saved-workflow validation so disabled LoRA slots no longer block execution when their saved file is on a removed external drive or USB. Enabled missing LoRAs still stop with a clear slot-specific message.
- Added Resize Box regression coverage for Keep Input Ratio so landscape source tensors keep the expected orientation.

## 0.7.44 - 2026-06-18

- Improved Ideogram Director bbox editing ergonomics: tiny boxes are easier to drag from the number badge, stale pixel-size popups no longer cover the board, and board undo/redo stays on the visible `↶` / `↷` buttons without taking over ComfyUI's graph undo.

## 0.7.43 - 2026-06-18

- Preserved saved LoRA selections in Multi LoRA and LTX Multi LoRA workflows even when a saved LoRA file is missing from the current PC's dropdown list.
- Preserved saved RTX VFX Easy Upscale device selection instead of resetting it during frontend setup.
- Preserved Local LLM Reviewer approve-once review state across Save, F5, and reopen.
- Hid Visual Fold floating controls while nodes or groups are actively being dragged, so the Fold button no longer appears mid-drag.
- Hardened Ideogram Director resolution handling so arbitrary image-analysis sizes such as `1712:880` do not silently replace the user's current output size, and restored saved custom sizes show a consistent megapixel value when the size popup opens.

## 0.7.42 - 2026-06-17

- Fixed Visual Fold selection handling so stale ComfyUI selection flags no longer leave Fold controls floating after a blank-canvas click or a one-node selection.
- Improved Local LLM Loader saved-workflow restore so the visible `Thinking` toggle survives Save, F5, and reopen for current Ollama layouts.
- Updated Local LLM Loader `Thinking` and `Result` `More` popups so they keep following live streaming text while open without forcing the scroll position when the user is reading older text.
- Polished Ideogram Director's language refresh button so saved workflows reopen with the button at its normal width instead of a narrow vertical mark.
- Hardened saved-workflow migration for Bernini Prompt Guide and RTX VFX Video Finisher so legacy generated-widget layouts preserve the user's visible values.

## 0.7.41 - 2026-06-17

- Added pack-wide ComfyUI Info panel descriptions for all public Deno nodes, including input and output explanations.
- Improved the Deno node info button so it shows the installed pack version, checks Comfy Registry, and marks available updates with a yellow `i` plus a small `!` badge.

## 0.7.40 - 2026-06-17

- Improved Ideogram Director Elements ordering: the right-side list now reads visually front-to-back, shows a green insertion line while reordering, and keeps each box's editor color attached to that box after reordering.
- Added Ideogram Director board undo/redo buttons beside Copy/Paste/Clear for users who prefer visible controls over Ctrl+Z/Ctrl+Y.
- Added an Ideogram Director language refresh button so the current board can be translated again after loading a layout or pasted JSON. It reuses the saved translation engine and fallback dialog.
- Protected legacy TEXT boxes whose literal rendered word is stored only in `desc` during board-view translation.

## 0.7.39 - 2026-06-17

- Improved Ideogram Director language translation recovery: if Google is blocked or unreachable, the node now explains the network/region issue, lets users switch to MyMemory, LibreTranslate, or a custom LibreTranslate server, and stops Generate/Copy JSON instead of silently passing a non-English prompt downstream.
- Kept Ideogram Director TEXT box words protected during translated editing and final English output conversion.
- Shortened the Ideogram Director top-bar layout button to `Layouts` so it stays readable at normal node widths.

## 0.7.38 - 2026-06-16

- Added a Deno Custom Nodes banner for the ComfyUI Manager and Registry listing.
- Added Ideogram Director `Language` view so board descriptions can be read and edited in another language while final output stays model-ready English.
- Improved tiny or overlapping Ideogram Director bbox editing by making the number badge a reliable drag handle.
- Fixed Ideogram Director's resolution popup so it opens as a viewport overlay instead of being clipped inside the node.

## 0.7.37 - 2026-06-16

- Fixed Local LLM Loader `Seed Mode` so `increment`, `decrement`, and `randomize` update the visible seed after each queued run without shifting saved workflow widget values.

## 0.7.36 - 2026-06-16

- Fixed Ideogram Director's Desktop/Recreate-node sizing path so the editor recovers to a usable board instead of collapsing into a narrow rail or clipping Generate.
- Fixed LTX Model Loader GGUF rows so saved and fresh nodes keep the correct model/VAE/text-encoder mapping and preserve external model paths across refresh.
- Fixed LTX Prompt Guide so saved positive and negative prompt text survives Save, F5, and workflow reopen.
- Fixed Local LLM Loader so missing saved Ollama/LM Studio models are shown as unavailable on other PCs, and LM Studio reasoning payloads now respect each model's supported options.

## 0.7.35 - 2026-06-16

- Fixed Ideogram Director so a manually enlarged node can be shrunk again with the ComfyUI resize handle.
- Restored mouse-wheel scrolling inside Ideogram Director's right prompt/style/elements panel while keeping the board canvas-first.

## 0.7.34 - 2026-06-16

- Fixed Ideogram Director so ComfyUI resize/fit interactions no longer collapse the board to about half height.
- Preserved user-resized Ideogram Director node sizes while keeping saved workflows compatible.

## 0.7.33 - 2026-06-15

- Added Ideogram Director, a visual Ideogram 4 JSON/bbox prompt builder with editable boxes, layout presets, style presets, and model-ready prompt output.
- Improved Ideogram Director's connected JSON prompt flow so existing boards ask before replacement, invalid JSON is rejected clearly, and current-board edits can continue safely.
- Kept the standalone Translator and Random Prompt Box out of the public release while preserving Ideogram Director's built-in Translate On/Off helper.
- Hardened public workflow migration checks for older DENO workflow files.

## 0.7.32 - 2026-06-14

- Added Prompt Only final prompt extraction for Local LLM Loader, so Ollama and LM Studio models that add analysis text can pass only the final prompt downstream.
- Models that cannot follow the Prompt Only format now stop with a clear error instead of sending analysis text into the workflow.

## 0.7.31 - 2026-06-14

- Hardened Local LLM Loader's local Ollama / LM Studio HTTP path so non-local URLs are rejected before any connection is opened.

## 0.7.30 - 2026-06-13

- Fixed release test compatibility for the Local LLM Loader and Reviewer package validation.

## 0.7.29 - 2026-06-13

- Added Local LLM Loader for local Ollama and LM Studio prompt workflows, with separate Stop LLM and Unload LLM controls.
- Added Local LLM Reviewer for gating IMAGE and AUDIO save paths from review text, including one-shot approval and reviewer-side rerun controls.

## 0.7.28 - 2026-06-03

- Improved ComfyUI Manager, Comfy Registry, and GitHub discovery metadata for Bernini Prompt Guide, Bernini conditioning helpers, Wan2.2, reference video edit, and prompt guide searches.
- Updated the Bernini preview backend update BAT to avoid Windows delayed-expansion parsing failures during the real update path.

## 0.7.27 - 2026-06-03

- Added Bernini Prompt Guide for KJ-style Bernini prompt prefixes, readable System Prompt mode labels, automatic reference-image prompt hints, a collapsible negative prompt section, and Wan2.2 negative preset autofill.
- Added a Bernini preview backend update BAT for test portable ComfyUI folders while the upstream Bernini backend is still a draft PR.

## 0.7.26 - 2026-06-01

- LTX Model Loader keeps saved model selections during ComfyUI refresh instead of falling back to `__none__`.
- Multi Image Loader now stops with a clear error when selected images are missing or unreadable, and refreshes correctly when selected image files change.

## 0.7.25 - 2026-05-31

- Easy Model Download Helper no longer appears twice in the node list; older workflow IDs are handled as a migration instead.
- Added the public LTX 2.3 8GB VRAM workflow as a compatibility baseline for future DENO node updates.

## 0.7.24 - 2026-05-31

- Older workflows that still contain the previous LTX 8GB download helper node now open normally instead of showing an UNKNOWN missing-node box.

## 0.7.23 - 2026-05-30

- LTX Model Loader now restores older workflow dropdown values correctly and prevents hidden inactive model fields from blocking Checkpoint, KJ, or GGUF runs.

## 0.7.22 - 2026-05-27

- Video Preview shows a compact current-video info badge with resolution, FPS, frame count, and duration.
- LTX Model Loader model dropdowns now hide recommended files that are not actually installed and avoid auto-selecting unrelated models.

## 0.7.21 - 2026-05-27

- Video Preview, Video Compare, and Image Compare preserve user-resized node sizes instead of repeatedly snapping back to media auto-fit.
- Video Preview keeps hover-to-hear audio active when a new preview finishes loading under the cursor.

## 0.7.20 - 2026-05-26

- RTX VFX node panels keep ComfyUI canvas wheel and middle-click navigation available.
- Visual Fold no longer shows Fold Group from stale group selection while normal nodes are selected.

## 0.7.19 - 2026-05-26

- Video Compare output naming polish.
- RTX VFX upscale sizing now supports exact video sizes without forced 32px rounding.
- Public changelog and release-note workflow added.

<details>
<summary>Previous Public Highlights</summary>

### 0.7.18 - 2026-05-24

- Multi Image Loader path-copy reliability update.
- LTX checkpoint-style loader UI compatibility update.

### 0.7.17 - 2026-05-22

- Added DENO Visual Fold workflow cleanup tools.
- Added the generic Multi LoRA Loader.
- Added LoRA row ordering controls.

### 0.7.10 - 2026-05

- Added RTX VFX helper and installer flow polish.

</details>

## Release Note Style

- Keep each public entry short and outcome-focused.
- Prefer what users can see or benefit from.
- Avoid file-level or implementation-level detail here.
- Put technical investigation, verification notes, and local runtime details in private/local handoff notes.
