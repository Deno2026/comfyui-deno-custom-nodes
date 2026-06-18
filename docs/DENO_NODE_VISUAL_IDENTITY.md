# DENO ComfyUI Node Visual Identity

This guide defines the default visual direction for DENO ComfyUI nodes.

Use it before creating new nodes, redesigning frontend widgets, updating README screenshots, or reviewing UI polish.

## Reference Nodes

The preferred DENO visual direction is represented by:

- `(Deno) Resize Box`
- `(Deno) Multi Image Loader`
- `(Deno) Advanced Image Source Loader`
- `(Deno) LTX Prompt Guide`
- `(Deno) Easy Model Download Helper`
- `(Deno) Multi LoRA Loader`
- `(Deno) LTX Multi LoRA Loader`
- `(Deno) LTX Sequencer`
- `(Deno) Ideogram Director` for ambitious custom-DOM tools and flagship interaction quality

The newest RTX VFX test node should be treated as an experimental implementation, not the default visual reference.

Use `docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md` only when designing or reviewing a substantial custom frontend. Do not load that long reference for routine backend fixes or tiny UI patches.

## Core Identity

- ComfyUI-native first: keep the normal node frame, sockets, title, and standard widgets recognizable.
- DENO layer second: add one useful dark technical panel, preview, browser, summary, or control cluster only when it improves the workflow.
- Base colors: black, near-black, charcoal, dark graphite, and deep green-black surfaces.
- Accent colors: DENO green, electric lime, mint green, and soft green text.
- Depth comes from borders and subtle contrast, not heavy shadows or flashy gradients.
- Typography is compact and literal: small sans labels, strong weights for buttons/counts, no decorative copy inside the node.
- The node should feel like a practical production tool, not a marketing card inside ComfyUI.

## Ideogram Director Lessons

Ideogram Director is the current high-satisfaction DENO reference for a complex visual tool. Reuse these lessons when a node needs more than standard widgets:

- Color is state, not decoration. Reserve green for interactive, selected, ready, or primary action states. Let idle borders and passive dividers use neutral gray/white alpha so the green has meaning.
- Keep the host ComfyUI canvas first. A custom panel is a guest inside the graph; wheel, middle-click pan, resize, focus, and undo ownership must feel predictable.
- Use one strong primary action in the terminal position where the user's loop ends, such as `Generate` becoming `Regenerate`. Do not scatter equal-looking commands.
- Keep frequent controls visible and group rare controls into popups, rails, or detail panels. The layout should follow the user's workflow frequency, not backend option order.
- Previews should be honest. Use a real result image, real generated thumbnail, or clear wireframe. Avoid fake atmospheric previews that make users expect a different final output.
- Make state legible without reading docs: fixed vs random seed, selected bbox, active style, missing input, and destructive action should all look different.
- Keep destructive actions visually separated and confirm them when the action can wipe user work.
- Preserve DOM identity during interactive editing when possible. Updating a selected class is often safer than rebuilding elements on every click; rebuilding can break double-click, drag, focus, or native text undo paths.
- Use compact typography, with monospace for numeric or code-like readouts such as seed, ratio, bbox, hex colors, and JSON-adjacent values.
- If a helper loop only previews, imports, or annotates data, isolate failure so it cannot break the downstream generation path.

## Default Palette

Use these values as the starting point unless ComfyUI itself provides a better native token.

- Panel background: `rgba(3, 10, 7, 0.96)`, `rgba(4, 8, 7, 0.96)`, `rgba(3, 12, 8, 0.98)`
- Inner dark surface: `rgba(0, 0, 0, 0.92)`, `rgba(1, 6, 4, 0.95)`, `#020403`, `#050707`
- Primary accent border: `rgba(72, 255, 132, 0.42)` to `rgba(72, 255, 132, 0.95)`
- Secondary green border: `rgba(54, 110, 74, 0.9)`, `rgba(126, 255, 166, 0.34)`
- Primary text: `#dfffea`, `#d9ffe5`, `#d7ffe3`
- Accent text: `#9dffba`, `#94f7af`, `#91dca4`
- Destructive action: deep red surfaces such as `rgba(119, 26, 26, 0.95)`, used only for clear/remove/delete.

## Shapes And Layout

- Internal cards and panels usually use `8px` to `12px` radius.
- Modals may use `16px` radius.
- Action buttons use pill radius when they are compact command buttons.
- Primary buttons are green, secondary buttons are dark graphite, destructive buttons are red.
- Keep large panels visually useful: image previews, file browser grids, resize previews, status summaries, or compact instructions.
- Do not add a decorative panel if a native ComfyUI widget already communicates the state clearly.
- Put custom panels where they do not disturb backend widget order or saved `widgets_values`.

## Interaction Defaults

- Prefer native widgets for ordinary parameters.
- Use custom DOM or canvas controls only when native widgets cannot provide the expected workflow.
- Buttons must provide immediate visible state or result.
- Hidden/visible widget logic must preserve saved workflow values.
- For complex controls, verify mouse click, drag, hover/pressed state, saved workflow reload, and ComfyUI refresh behavior.

## Default Node Info Button

- Add a small DENO green circular `i` button near the top-right of DENO node headers by default.
- This button should follow the approved first mockup concept: cute, clear, compact, and ComfyUI-native.
- Use `i` as the default mark rather than an orange `?`; reserve warning colors for real warning states.
- Hover should not open a custom status tooltip. Users often pass over the node header while working,
  so update/version details should not appear until click.
- Hover may still make the `i` button feel clickable: use a pointer cursor and a subtle heavier
  stroke/text emphasis on the button itself, but do not show explanatory text until click.
- Click should open a compact DENO-style help popup with the node purpose, main modes, important options, caution notes, and README pointer.
- The popup should close when the user clicks outside it or starts canvas wheel zoom/scroll outside
  the popup. It should not stay floating awkwardly while the graph view changes.
- When the pack version checker knows a newer version is available, the same popup should keep the
  normal node description but add a compact update card above it: installed version, latest version,
  short "What changed" bullets, and GitHub release notes link.
- Keep the help button visually light so it does not fight the title, sockets, collapse state, or node action controls.
- For future DENO nodes, treat this as a standard service detail, not optional decoration.

## Human-First Control Design

- DENO nodes are human tools first and backend wrappers second. Do not expose internal enum shape just because it is easy to implement.
- Diagnostic nodes such as Preflight, Doctor, Install Helper, and Status Check should communicate their basic status directly on the node surface. Requiring users to wire output sockets and run the graph just to read basic guidance is a poor default.
- If a backend execution is unavoidable, the node should still show a visible `Run once`, `Ready`, `Missing`, or `Next step` panel before execution, with outputs treated as optional automation/logging channels.
- Match UI grouping to how users think. If the concept is four effects with four strengths, show an effect choice and a separate strength choice instead of one long combined dropdown.
- Prefer segmented or button-like controls for three to five primary modes. Keep dropdowns, sliders, and numeric widgets for secondary detail.
- Show only controls that apply to the selected mode. Hide or collapse resize options when the current effect cannot resize, and avoid showing advanced/device/debug controls as the visual center unless they are the primary workflow.
- The most frequently changed values should be the easiest to see and touch. Technical install paths, library names, and debug text belong in detail panels, logs, README, or an advanced area.
- A first-use review should ask: can a new user drop the node, understand its state, and choose the main behavior within ten seconds without unnecessary links or extra execution steps?

## README Visual Defaults

- Every released node should have an actual ComfyUI screenshot under `docs/images/`.
- Screenshots should show the real node on the ComfyUI grid background.
- Crop tightly enough that the node is readable, but leave enough context to prove it is a real frontend capture.
- README sections should pair a short practical explanation with the screenshot.
- If the UI changes, update the screenshot and README in the same release.

## What To Avoid

- Purple/blue AI gradients, generic glossy cards, or random cyberpunk styling.
- Large blocks of green background that make the node look toy-like.
- One-off colors that do not exist elsewhere in the node pack.
- Too many tiny canvas-drawn buttons when a native widget or compact DOM control would be clearer.
- Text that is clipped, compressed, low contrast, or hard to scan.
- Decorative UI that does not improve the user's actual ComfyUI workflow.
- README screenshots that are stale, cropped too tightly to understand, or not taken from the real node.

## RTX VFX Test Node Direction

When revisiting `(Deno) RTX Video Super Resolution`, align it with the established DENO node identity:

- Keep the optional NVIDIA dependency clear, but do not require a separate diagnostic node before the user can try the actual tool.
- If setup is missing, the Easy Upscale execution error and README/install helper should tell the user what to do next.
- Represent the four core effects as clear primary choices: `VSR`, `High Bitrate`, `Denoise`, and `Deblur`.
- Add a compact mode-coach line for RTX VFX so users learn when to use the selected effect without opening README.
- Keep strength/quality as a separate `Low / Medium / High / Ultra` choice.
- For resizable effects, expose three human resize choices: `Keep Ratio`, `Manual`, and `Preset Ratio`.
- `Keep Ratio` uses target megapixels, `Manual` uses width/height, and `Preset Ratio` uses ratio preset plus target megapixels.
- Show `divisible_by` alignment for resizable RTX VFX modes because downstream video, latent, encoder, and NVIDIA VFX paths need exact multiples.
- Use `32` as the RTX VFX safe default and do not expose unrestricted `1` alignment for this node; arbitrary unaligned output sizes can corrupt VFX results.
- Show `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` when the selected resize path can change aspect ratio, such as `Manual`, `Preset Ratio`, or aligned `Keep Ratio`.
- Only show resize controls that match the selected effect. `Denoise` and `Deblur` should not expose irrelevant resize choices.
- Hide implementation details such as GPU device index from the normal node surface unless a future advanced/debug mode explicitly needs them.
- Use DENO green for selected/ready states and red only for missing dependency or destructive actions.
- Keep native widgets only when they remain readable. If a native dropdown becomes a dense backend list, build a clearer frontend control while preserving saved workflow compatibility.
- Capture the redesigned node and update README before treating it as release-ready.
