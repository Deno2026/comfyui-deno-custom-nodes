# DENO Node Retrospective Checklist

This note is the pre-flight checklist for DENO ComfyUI node work. Read it before creating or changing nodes.

## 1. Start From The User Outcome

- Confirm what counts as success in ComfyUI, not just what code should exist.
- Preserve existing behavior unless the user explicitly asks to remove it.
- When the user says "add and make default", do not replace old options.
- Keep DENO's visual identity consistent: black plus neon green, clean ComfyUI-native controls, no random custom styling unless it improves usability.

## 2. Source And Active Install Are Separate

- Main source repo: `.disabled/deno-custom-nodes@nightly/comfyui-deno-custom-nodes`.
- Active install: `custom_nodes/deno-custom-nodes`.
- Patch the source repo first.
- Copy only changed files into the active install.
- Compare file hashes before trusting ComfyUI runtime behavior.

## 3. ComfyUI Node Contract First

- Verify `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `FUNCTION`, and `CATEGORY`.
- If a node has a frontend widget, update both Python inputs and JS visibility/state logic.
- Check `/object_info/<NodeName>` after restart to confirm ComfyUI sees the expected contract.
- Do not rely on the canvas screenshot alone; check the backend contract too.

## 4. LiteGraph UI Pitfalls We Already Hit

- Arrow-click numeric widgets can fail when custom drawing/event handling blocks default LiteGraph behavior.
- Right-click and drag events often need explicit canvas-coordinate handling.
- Dynamic rows need both row-level behavior and node-level fallback context menus.
- Node size can reset if `computeSize`, `setSize`, or custom draw logic fights the user's manual resize.
- Expanding/collapsing one area must not accidentally resize unrelated text areas.
- If a value should persist across workflow reloads, do not normalize it back to defaults during frontend setup.

## 5. Dynamic Lists And Refresh Behavior

- For file lists such as LoRAs, do not trust stale widget options after ComfyUI `R` refresh.
- Fetch fresh `/object_info/<NodeName>` when opening a chooser if the list can change at runtime.
- Never wipe saved selections just because the old frontend cache does not know the value yet.
- Keep a safe fallback to existing widget options if the live refresh fails.

## 6. Resize And Image Batch Rules

- Batch image outputs must have consistent dimensions.
- `Keep Input Ratio` should use the first input image as the batch reference unless a different rule is explicitly designed.
- Keep existing resize modes available unless the user asks to remove them.
- Alignment options should include `1` for no forced divisibility and sensible defaults such as `32`.
- Prefer Lanczos for resize quality when appropriate, but preserve user-selectable interpolation.

## 7. LTX Sequencer Rules

- Bypass must be a true pass-through: no prompt, latent, VAE, or guide mutation.
- If a parameter is wired as input, verify which value wins: connected input should be explicit and predictable.
- Strength sync means checked nodes sync together; a node with sync off keeps its own strength values.
- Insert frame and seconds widgets must clamp and display cleanly.
- Numeric display should avoid floating garbage like `0.05300000000000002`.

## 8. Loader And Downloader Rules

- Model loader nodes should mirror the official or proven node behavior internally before adding convenience UI.
- Do not invent hidden model-loading semantics when the user wants wrapper convenience.
- Downloader nodes have higher registry/security risk. Keep risky downloader behavior isolated from the main node package when needed.
- If extra model paths exist, prefer the user's real model path over the default ComfyUI `models` folder.

## 9. Verification Routine

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
10. Explain what was verified and what still requires browser-side user confirmation.

## 10. Deployment Routine

- Local success is not the same as public release.
- For release work, update GitHub and ComfyUI Registry together.
- Check GitHub Actions or registry publish status after pushing.
- If registry review/cache delay is expected, state that clearly and keep follow-up monitoring separate.

