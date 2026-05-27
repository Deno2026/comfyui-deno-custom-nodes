# DENO Node Retrospective Checklist

This note is the pre-flight checklist for DENO ComfyUI node work. Read it before creating or changing nodes.

For visual direction, also read `docs/DENO_NODE_VISUAL_IDENTITY.md`.

## 1. Start From The User Outcome

- Confirm what counts as success in ComfyUI, not just what code should exist.
- Preserve existing behavior unless the user explicitly asks to remove it.
- When the user says "add and make default", do not replace old options.
- Confirm the finished node still matches the user's intended workflow, not only the implementation plan.
- Keep DENO's visual identity consistent: black plus neon green, clean ComfyUI-native controls, no random custom styling unless it improves usability.
- Use the established DENO node visual language from `docs/DENO_NODE_VISUAL_IDENTITY.md`; do not treat experimental nodes as the default style reference.

## 2. Source And Active Install Are Separate

- Main source repo: `E:\DENO-Repos\comfyui-deno-custom-nodes`.
- Legacy copied source location: `D:\Codex\DENO\comfyui-deno-custom-nodes`.
- Legacy Easy Install copied source location: `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\.disabled\deno-custom-nodes@nightly\comfyui-deno-custom-nodes`.
- Active install: `D:\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes\deno-custom-nodes`.
- Patch the source repo first.
- Copy only changed files into the active install.
- Compare file hashes before trusting ComfyUI runtime behavior.

## 3. ComfyUI Node Contract First

- Verify `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `FUNCTION`, and `CATEGORY`.
- If a node has a frontend widget, update both Python inputs and JS visibility/state logic.
- Check `/object_info/<NodeName>` after restart to confirm ComfyUI sees the expected contract.
- Do not rely on the canvas screenshot alone; check the backend contract too.

## 4. README And Visual Proof Are Part Of The Product

- A shipped node must be understandable from the GitHub README, not only from source code or text release notes.
- When a new node is complete and released, open it in the real ComfyUI frontend, capture an actual screenshot, add the image under `docs/images/`, and update the README so users can visually understand the node from the repository page.
- When a feature changes, update the README at the same time: node name, display name, inputs, outputs, buttons, install notes, limitations, optional dependencies, and screenshots if the UI changed.
- Treat README accuracy as part of release quality. A public node with stale docs or missing visuals is not finished.

## 5. LiteGraph UI Pitfalls We Already Hit

- Arrow-click numeric widgets can fail when custom drawing/event handling blocks default LiteGraph behavior.
- Right-click and drag events often need explicit canvas-coordinate handling.
- Custom DOM widgets and node-top overlays can swallow ComfyUI canvas navigation. Wheel over a DENO node should still reach the ComfyUI canvas for zoom/scroll unless the user is inside an intentional local scroll area. Middle-click / wheel-click drag over non-text controls should pan the canvas or be explicitly forwarded.
- Dynamic rows need both row-level behavior and node-level fallback context menus.
- Node size can reset if `computeSize`, `setSize`, or custom draw logic fights the user's manual resize.
- Media preview nodes must not call `setSize` on every image/video load after the user has resized the node. Auto-fit only for a first useful default or an explicit fit command; otherwise contain/letterbox the media inside the user's chosen node box.
- Expanding/collapsing one area must not accidentally resize unrelated text areas.
- If a value should persist across workflow reloads, do not normalize it back to defaults during frontend setup.

## 6. Dynamic Lists And Refresh Behavior

- For file lists such as LoRAs, do not trust stale widget options after ComfyUI `R` refresh.
- Fetch fresh `/object_info/<NodeName>` when opening a chooser if the list can change at runtime.
- Never wipe saved selections just because the old frontend cache does not know the value yet.
- Keep a safe fallback to existing widget options if the live refresh fails.

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
- If extra model paths exist, prefer the user's real model path over the default ComfyUI `models` folder.
- RTX/VFX nodes can conflict at the native DLL level. If another node loads NVIDIA Broadcast/NGX VFX DLLs first, `nvidia-vfx` `VideoSuperRes` can fail with `code -2` even when a Broadcast-based RTX Upscale node still works. Detect and report this separately from install, GPU, or driver failures.

## 10. Verification Routine

Run this before saying a node is done:

1. `git diff --stat` and inspect the changed files.
2. Python compile for changed Python files.
3. `node --check` for changed JS files.
4. Existing tests, using inline test execution if `pytest` is unavailable.
5. Sync source to active install.
6. Compare hashes between source and active install.
7. Restart ComfyUI.
8. Confirm `/object_info` for changed nodes.
9. If frontend changed, confirm served JS contains the new behavior.
10. Open the node in the real ComfyUI frontend when the change affects UI or user interaction.
11. Check that wheel over the node still controls ComfyUI canvas zoom/scroll and middle-click / wheel-click drag still pans the canvas unless the pointer is inside a deliberate local scroll area.
12. Check for clipped text, broken layout, awkward sizing, unreadable labels, asymmetric UI, and buttons/toggles/dropdowns that do not respond.
13. For complex multi-part nodes, test each major function and make sure one fix did not break another feature.
14. Explain what was verified and what still requires browser-side user confirmation.

## 11. Deployment Routine

- Local success is not the same as public release.
- For release work, update GitHub and ComfyUI Registry together.
- README updates and node screenshots are part of the release, not optional cleanup.
- Check GitHub Actions or registry publish status after pushing.
- Confirm the live Registry latest version, install endpoint, and local Manager cache when visibility matters.
- If registry review/cache delay is expected, state that clearly and keep follow-up monitoring separate.
