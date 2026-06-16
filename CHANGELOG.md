# Changelog

Public, user-facing release notes for Deno Custom Nodes.

This file intentionally stays short. Detailed engineering notes belong in issues, pull requests, and `SESSION_HANDOFF.md`.

## Unreleased

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
- Put technical investigation, verification notes, and local runtime details in `SESSION_HANDOFF.md`.
