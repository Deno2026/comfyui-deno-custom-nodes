# Changelog

Public, user-facing release notes for Deno Custom Nodes.

This file intentionally stays short. Detailed engineering notes belong in issues, pull requests, and `SESSION_HANDOFF.md`.

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
