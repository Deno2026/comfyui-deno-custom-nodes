# Ideogram Director

Status: public 0.7.33 release candidate. Registry propagation is still pending as of the
2026-06-15 cleanup; do not call the public rollout complete until Comfy Registry marks
0.7.33 Active and ComfyUI Manager discovery includes `DenoIdeogramDirector`.

Read this folder only when the task is about Ideogram 4 JSON captions, bbox composition, KJ Prompt Builder analysis, or the proposed `(Deno) Ideogram Director`.

## Documents

- `SPEC.md`: current clean-room DENO build spec and intended contract.
- `KJ_BUILDER_UX_RESEARCH.md`: KJ Prompt Builder research and UX analysis. Do not copy KJ GPL code into this repo.
- `FEATURE_DRAFT.md`: active feature sketch and next implementation direction.
- `style_presets.json`: style preset data for the integrated preset gallery.

## Boundary

The intended DENO direction is clean-room implementation from public Ideogram 4 behavior and schema knowledge, not a KJ code fork.

Current local implementation files:

- `deno_ideogram_director.py`
- `web/js/deno_ideogram_director.js`

Ideogram Director is in the 0.7.33 public release candidate scope. Keep standalone Translator
and Random Prompt Box out of the public release surface unless the user explicitly restarts and
approves those nodes separately.

## Current State (2026-06-16)

- JS rev marker: `IDD_REV = "r2026.06.18-resolution-import-a"` in `web/js/deno_ideogram_director.js` (check the served
  JS for this string after a sync; the user needs Ctrl+Shift+R to pick up a new rev).
- Resolution popup hardening (0.7.38, 2026-06-16): the resolution control
  popup is a `document.body` fixed overlay anchored to the top-bar size button. Do not mount it back
  inside `resWrap` or the node/board DOM, because Desktop/Easy-Install can clip or swallow it inside
  the custom node canvas area. Escape/outside click closes it; node removal removes the body popup
  and viewport listeners.
- Resolution import hardening (0.7.43, 2026-06-18): imported `aspect_ratio` values that are large
  pixel pairs are treated as exact target sizes only when they map to a common generation ratio such
  as `4:5`, `16:9`, or `≈16:9`. Arbitrary source-image sizes from image-analysis LLMs, for example
  `1712:880`, must not silently overwrite the user's current resolution. When a resolution is
  accepted, the saved megapixel budget must be refreshed from the committed `width × height` so the
  first popup open shows a consistent preview, MP field, and preset grid. Existing saved workflows
  with mismatched `caption_data.mp` are also normalized from their saved `width × height` on hydrate.
- Language follow-up (0.7.38, 2026-06-16): the top-bar button is simply
  `Language` and opens a fullscreen grid selector instead of a long dropdown. English is the default
  baseline and `Original` is not shown as a choice. Legacy `Original (as written)` saved values are
  normalized to English for compatibility. Selecting another language translates editable description
  fields for the board view while final output stays English. Literal TEXT box `text` values are never
  translated, so signs/logos/poster words stay exact.
- Translation fallback follow-up (local, 2026-06-17): Google remains the default online translation
  engine. If the Language helper cannot reach Google, the node must show a concise recovery popup
  rather than silently failing. The popup states that Google Translate can be blocked or rate-limited
  by the user's network/region and that this is not a DENO node error. It then lets the user choose
  and save `MyMemory`, `LibreTranslate`, or `LibreTranslate Custom URL`, and retries the same board
  translation with the selected engine. The selected engine is a saved hidden widget shared by both
  the editor-view translation and the final English output conversion. Generate and Copy JSON both
  preflight the final English conversion; if every engine fails or the user cancels, generation/copy
  stops instead of silently passing a non-English prompt downstream. Literal TEXT box words remain
  protected in every engine path.
- Top-bar compact-label follow-up (local, 2026-06-17): the layout gallery launcher displays
  `Layouts` in the top bar, while the tooltip and gallery title still say Layout presets. The button
  must stay single-line with nowrap/ellipsis rules, because the Language button and seed controls can
  otherwise squeeze `Layout Presets` into an ugly two-line button at normal node widths.
- Elements/history/refresh follow-up (0.7.40, 2026-06-17): the right rail's Elements list is shown
  visually front-to-back while the official caption output keeps the existing `boxes.map(...)`
  order. Dragging an element row shows a horizontal insertion line before drop, and auto editor
  colors are stored per box (`uiColor`) so reordering does not repaint the boxes. The bottom bar
  includes visible undo/redo buttons (`↶` / `↷`) that call the node-owned board history.
  The top-bar `↻` language refresh button retranslates the current editable board through the saved
  translation engine/fallback flow, useful after loading a layout or pasted JSON while a non-English
  view language is selected. Legacy TEXT captions where the literal rendered word is only in `desc`
  must be preserved during board-view translation.
- Refresh-button restore polish (local 2026-06-17, not public-released yet): after Chrome/F5 reload
  and loading a saved workflow, the top-bar `↻` language refresh button could initially render as a
  narrow vertical bar next to the Language button. Root cause: the compact top bar allows children to
  shrink, while saved-workflow restore can run the first fit pass before ComfyUI has given the DOM its
  final width. Clicking the button later forced a second fit pass, so the button recovered. Local rev
  `r2026.06.17-refresh-reflow-c` gives the refresh button a fixed flex basis and reruns the top-bar
  fit pass after restore/size stabilization. Before release, verify: saved Director workflow ->
  browser refresh/F5 -> load workflow -> inspect the `↻` button before any interaction on both
  Easy-Install and Desktop.
- Desktop regression report (2026-06-16): user reproduced a `0.7.35` Desktop-only collapse where
  clicking the wrong region can leave the Director with only the narrow right rail visible and a
  huge blank body. Portable/Easy-Install verification is not enough for this class of bug. Before
  the next Director hotfix, reproduce on ComfyUI Desktop (`127.0.0.1:8000`, Desktop frontend root)
  and rerun the full Desktop gate in `docs/COMFYUI_RUNTIME_MATRIX.md`.
- Desktop width hardening (2026-06-16, local, not public-released yet): rev
  `desktop-width-i` keeps `.idd-wrap` at `width:100%` / `max-width:100%`, applies the same sizing
  inline during DOM creation, and gives `.idd-board` a `320px` flex basis with `260px` min-width.
  This prevents Desktop/Electron DOM widget layout from shrinking the board to a rail-only strip.
  During verification, ensure old backup copies are not left inside Desktop `custom_nodes`; ComfyUI
  imports folders such as `*.disabled-codex-*`.
- Context-menu Recreate hardening (2026-06-16, local, not public-released yet): the trigger is
  ComfyUI's node right-click menu `Recreate node` (`Keep widget values` / `Reset widget values`),
  not the Director's own Generate/Regenerate button. Desktop can rebuild the node with a tiny
  temporary `node.size` while the Director's current `idd_size_rev` property is still present. Rev
  `recreate-size-j` treats a marked size below the Director minimum as invalid and restores the
  user-approved default `850x1000`, then runs the top-bar fit pass so `Generate` / `Regenerate`
  stays visible instead of clipping at the right edge.
- Bbox drag-handle follow-up (0.7.38, 2026-06-16): when boxes are tiny or
  overlapping, the top-left number badge is the primary move handle. It sits above the enlarged
  resize-handle hit area and starts `move` directly, so users can drag from the number label while
  edge/corner handles remain available for resizing.
- Bbox ergonomics follow-up (local, 2026-06-18): the stage-edge clamp is intentional. A bbox should
  stop naturally at the generation canvas boundary instead of being dragged outside the board. The
  old floating pixel-size tooltip is intentionally disabled because a stale-looking readout distracts
  during move/resize; if size feedback returns later, it must update live and not cover small boxes.
  Ctrl/Cmd+drag must duplicate while moving. Keyboard Ctrl+Z/Ctrl+Y is intentionally not claimed by
  the Director because ComfyUI already owns graph-level undo/redo; use the visible bottom `↶` / `↷`
  buttons for board-only undo/redo.
- Sizing hotfix (2026-06-16): a user report that Ideogram Director can shrink to about half height
  after interaction was confirmed as a real `computeSize()` contract risk. Normal synthetic clicks
  stayed stable, but a Comfy/LiteGraph fit path equivalent to
  `node.setSize([node.size[0], node.computeSize()[1]])` reproduced the collapse. The current guard
  makes `computeSize()` preserve the current/saved node box, including LiteGraph's array-like
  `node.size`. The saved configured size participates only during initial restore, then clears so
  user-chosen smaller/larger sizes continue to win after resize.
- Resize-shrink follow-up (2026-06-16, local, not public-released yet): the first sizing guard also
  made LiteGraph treat the user's enlarged node box as the resize minimum, so mouse-dragging the
  bottom-right handle could grow the Director but not shrink it again. Rev
  `resize-shrink-preserve-g` separates the automatic fit protection from active user resizing: while
  the resize handle is being dragged, `computeSize()` no longer uses the current enlarged box as the
  minimum; after the drag ends, automatic fit paths still preserve the user's chosen size.
- Right rail wheel follow-up (2026-06-16, local, not public-released yet): the board/photo/bbox
  surface remains canvas-first for wheel zoom and middle-click pan, but the right rail is now an
  intentional local scroll area. Wheel over `.idd-rail` scrolls the prompt/style/elements panel when
  many bbox rows or fields overflow, without changing the graph zoom behind it.
- Galleries open **full-screen** (wave 4, 2026-06-13): the "Presets…" / "Layout presets…" buttons
  mount the gallery as a body overlay (`idd-gal-fs`, fixed inset:0, 8-col style / 6-col layout grid;
  Escape / outside-click / Close to dismiss). Wheel over the open gallery scrolls the gallery and
  does not zoom the canvas behind it.
- Gallery header (wave 4c) has three zones: **title left · Photo/Art/My tabs centered & enlarged ·
  count + "Save current as preset" + "Close" together top-right** (the bottom action row is gone).
  Saving a style as "My preset" now **captures the current board result image** (`bimg`, a
  same-origin `/view` image → drawn to a canvas → 192×240 webp dataURL stored as `p.thumb` in
  localStorage) and shows it as the card thumbnail; with no result yet it falls back to the lettered
  tile. Layout saves are unchanged (composition only).
- Library size (2026-06-13, wave 4): **219 style presets** (`IDD_STYLES`, 92 photo + 127 art; **211
  with real webp thumbs + 8 lettered-tile fallbacks**) across ~30
  categories, and **100 layout presets** (`IDD_LAYOUTS`, **97 with real example-photo thumbs + 3
  wireframe fallbacks**) across 8 categories (composition/social/video/marketing/print/presentation/
  infographic/document). The remaining 11 fallbacks are a hard checkpoint refusal (the model renders
  its "Image blocked by safety filter" card at every seed and after rewording — mostly vehicles and a
  few scene types); they stay as clean lettered/wireframe fallbacks. BOTH galleries have category chips + search + scroll. **Layout presets
  inject DRAFT prompt text**: clicking a built-in layout fills summary + background + box desc/text
  (a ready-to-edit scene), not just empty boxes; user-saved layouts also capture the current
  summary/background. Catalogs: `tmp/hook50/style_catalog{,2,3}.json` (styles),
  `tmp/hook50/layout_catalog{,3}.json` (layouts); generators `gen_style_library.py` /
  `gen_layout_lib.py` (queue|convert|tojs, `IDD_CATALOG` env points the style generator at a
  catalog, `IDD_SEED_OFFSET` env re-rolls a seed; layout generator merges layout_catalog + _catalog3).
  `tmp/hook50/patch_js.py` surgically replaces IDD_LAYOUTS and appends styles into IDD_STYLES.
  Workflow for scale: append catalog → big batch queue → ONE vision-QA pass (`mega-lib-qa` workflow)
  → rebake fails with a seed offset → delete persistent fails (style→letter tile, layout→wireframe)
  → patch JS → sync → headless verify. Safety filter (people/portrait styles) is the main loss
  source; ~67-73% first-pass good, ~85-90% after one rebake round.
- Sockets/widgets: all UI widgets `socketless`; `import_json` is `forceInput` and declared LAST;
  old-save layouts are migrated in a `configure` wrap plus a frontend `sanitizeWidgets` recovery.
- Incoming JSON Prompt live-sync: a wired JSON is FNV-1a signed identically in py `_import_sig` and js
  `fnv1a`. Default `Ask Before Replacing` fills an empty board automatically, then asks before a connected
  prompt replaces an existing board; `Always Replace` always applies new valid JSON prompts automatically. The old
  saved values `Ask before replacing board`, `Use only when board is empty`, `Ignore input prompt`,
  old `Review First`, and the ambiguous WIP-era `Auto Replace` normalize to `Ask Before Replacing`.
  Only the explicit current label `Always Replace` or explicit old `Replace board automatically`
  enables automatic replacement. Runtime LLM values reach the frontend
  only via `build()`'s `ui.idd_import` echo on the `executed` event. `applyImportedCaption` remains
  the single authoritative sync path (absent fields are cleared). The frontend re-checks the visible
  board and Incoming JSON Prompt mode before any overwrite.
  `caption_data.importSig` is authoritative on the backend: if the same wired JSON already seeded the
  editor, was intentionally kept, or was intentionally cleared, the same JSON will not refill or pass
  through just because the visible board is empty. The frontend uses the same sig guard so stale
  pending prompts disappear without doing real work.
  Rev `generate-prompt-guard-a` also treats saved `caption_data.boxes` as board content on the frontend.
  This prevents a global ComfyUI Run / backend `idd_import` echo from seeing a temporarily empty
  frontend `boxes` array and overwriting an already-authored board without the Ask dialog.
  While an incoming prompt choice is pending, downstream image/result events no longer clear the
  Ask dialog or repaint the board image; the user must choose `Apply and Replace` or
  `Keep Current Board` first.
  The Director's own `Generate` / `Regenerate` button and the global ComfyUI `Run` button both
  preflight the currently connected upstream JSON before queueing. If the board already has content
  and a different valid JSON is connected, the button shows `Apply and Replace` / `Keep Current Board`
  and does not queue until the user chooses. This protects manual style/bbox edits from being
  overwritten by a stale LLM source when the user simply wants to regenerate the current board.
  Applying a new valid JSON prompt also clears the previous generated result preview immediately;
  `Keep Current Board` preserves the existing preview, but `Apply and Replace` / `Always Replace`
  starts the next scene with only the new boxes/layout visible until the new result arrives.
  Pending imports are a real execution gate in `Ask Before Replacing` only after the visible board already has
  content: the backend sends `deno-ideogram-director-pending` to the matching node and raises a clear
  error before downstream sampler nodes run. The user chooses `Apply and Replace` or
  `Keep Current Board`; the frontend saves that decision and immediately queues the workflow again so the
  downstream sampler continues without a second manual Generate click.
  Rev `incoming-prompt-b` also fixes the real LLM compact-JSON path and fragile event matching:
  `prompt/bg/elements` and similar aliases are normalized into the official
  `high_level_description/compositional_deconstruction.elements` schema on both backend and frontend,
  reversed bbox coordinates are ordered before display/output, and `node` / `node_id` /
  `display_node` event ids all route to the same Director instance. This is the guard for the bug
  where an upstream LLM result looked connected but no bbox labels appeared on the board.
  If `import_json` is connected/non-empty but cannot be parsed as valid JSON, the backend raises a
  clear English JSON-format message before downstream sampler/output nodes run. The frontend renders
  a Director-local red banner with `Check the JSON prompt.` and asks the user to regenerate
  the upstream LLM output. Invalid JSON is never used as plain text and is never partially applied.
  If the current board has content, `Keep Current Board` records only the rejected JSON signature so
  the same bad input stops blocking and the node can generate from the current board.
  If the user changes an upstream node such as Local LLM Loader after an invalid JSON warning
  (for example enabling Thinking or changing seed/model), the stale warning is released and the next
  Run is allowed to reach the upstream node so it can regenerate a new JSON prompt.
- Caption contract: emits the caption_verifier shape, single-line minified; `aspect_ratio` is
  stripped from the final caption by default on BOTH output paths (matches official
  `magic_prompt.py`); `include_aspect_ratio` toggle (default off) preserves it; bboxes are never
  stripped. JSON parse is lenient on both sides (raw → ```fence → first/last brace span), then
  wired captions are normalized to the official schema before board sync or prompt output.
- Frontend feature set: Verdant Pro theme; per-box color via inline `--bc`; custom color picker
  (SV field + hue bar + HEX/RGB/HSL readouts + copy chips + Delete/Save in ONE popover); staged
  resolution popup (/16 FORCED, ratio-locked drag-resize, free megapixel input, Apply commits,
  preferred classic dims e.g. 2.08MP → 1920×1088); result-image dimmer in the board view cluster
  beside the eye toggle;
  user-approved fresh-node default size `850×1000` (from saved `ideogram-director.json`;
  right rail visible at first open, still manually resizable);
  bbox visibility toggle
  (B key); fullscreen; **seed pill with an explicit two-segment switch `[Fixed | Random]`**
  (active segment filled — green Fixed / amber Random — number dims when Random; rev `-j`);
  visible board undo/redo buttons (`↶` / `↷`) instead of claiming ComfyUI's Ctrl+Z/Y; board/photo/bbox
  wheel and middle-click are canvas-first (ComfyUI zoom/pan), while the right rail and gallery lists
  keep local wheel scroll; Language can translate the editable board view while Copy JSON copies
  the OFFICIAL caption in the configured output language.
  **Paste JSON opens a dialog** (rev `-h`): the user Ctrl+V's the caption into a textarea then clicks
  Paste (Ctrl+Enter also applies; garbage → inline error, board untouched) — more reliable than reading
  the clipboard directly. Accepts official captions (fenced too) and the internal board format.
- Top bar (rev `incoming-json-keep-board-a`): **"Layouts" button** · spacer ·
  Incoming JSON Prompt status (`Ask Before Replacing`, `Always Replace`, `Prompt Needs Review`, or `JSON Needs Review`) · resolution
  chip · Language · seed switch · Generate. Apply/Keep controls live inside the board
  notice only, not duplicated in the top bar.
  The duplicate internal node title and `Caption✓` text are intentionally removed because the ComfyUI
  node title already names the node and the seed controls must remain visible at the default size.
  The old status dot is not mounted; Style stays above Elements in the right rail so Photo/Art remains
  visible at the compact default size. Elements list rows mirror the canvas boxes: click selects and
  double-click opens the same element editor as double-clicking the bbox on the board.
  Pre-marker saved nodes with stale heights are reset once to the 850×1000 default; after saving
  with `idd_size_rev=size-2026.06.14-stable-a`, user-resized dimensions are preserved.
- Preset galleries (expanded 2026-06-12, JS rev `r2026.06.12-b`): two ORTHOGONAL axes. STYLE gallery
  (Presets… button in the Style section) = Photo/Art/My tabs + a **category chip row + search box +
  scrollable grid** (built for a large library). Built-ins are **45 looks** in `IDD_STYLES` (each
  has `cat` for the chip filter); clicking a card sets style_mode + the style fields (+palette for
  user presets) and never touches boxes/ratio. The chip row is DATA-DRIVEN (derived from the
  distinct `cat` values present) so adding a preset with a new `cat` makes a new chip appear with no
  UI change. LAYOUT gallery (bottom bar) = 10 built-in cards that now show a **real generated
  example photo** per layout (`web/js/styles/layouts/<key>.webp`, full composition at true ratio;
  falls back to the wireframe miniature if the image is missing or for user-saved layouts); clicking
  sets ratio (via dimsFor at the current megapixel budget) + replaces the starter boxes and never
  touches style. "My presets" live in localStorage (`denoIdd.stylePresets` / `denoIdd.layoutPresets`)
  — browser-local, no files, no Registry-sensitive APIs; delete is arm("Delete?")→confirm.
  Style thumbnails are bundled webp at `web/js/styles/<key>.webp` (256×320), resolved via
  `new URL(".", import.meta.url)` because the install folder name varies — a missing file degrades to
  a lettered placeholder card (2 styles, `bw_fine_art` + `flat_vector`, ship as placeholders because
  the Ideogram4 safety filter persistently blocked their thumbnail; the presets themselves work).
  NOTE: import.meta means `node --check` must run on a `.mjs` COPY of the file. The STYLE gallery grid
  is now an intentional scroll area (`.idd-gal-scroll`) — the node's capture-phase wheel forwarder
  has explicit exceptions only for real local controls (`.idd-rail`, `.idd-gal-scroll`,
  `.idd-importlist`, text inputs/selects), so wheel scrolls those controls while the board/photo/bbox
  surface stays canvas-first everywhere else. One apply = one undo step.
- Clear Board is a real editor reset, not just `boxes=[]`: it clears boxes, summary/background,
  style mode/fields/palette, result preview state, and serializes the current wired `import_json`
  signature so the same connected JSON does not auto-refill the board after F5/R. A changed/new
  import JSON may still refresh the editor unless `import_mode` rules say otherwise.
- Preset generation harness (reusable, catalog-driven): `tmp/hook50/style_catalog.json` is the source
  of truth (key/name/mode/cat/apply + gen subject+background); `tmp/hook50/gen_style_library.py`
  `queue|convert|tojs` renders thumbnails, webp-bundles (9% edge crop), and emits IDD_STYLES JS.
  Layouts: `tmp/hook50/gen_layout_thumbs.py`. Adding more presets = append catalog entries → queue →
  QA → convert → paste `tojs` output into `IDD_STYLES`. Generation lessons (see
  [[ideogram-director-ux-decisions]]): concrete in-style backgrounds (no negations), neutral
  subjects, and the safety filter is seed-stochastic — re-roll a blocked thumbnail, and if it keeps
  blocking after a few tries, delete its webp so it falls back to the clean lettered tile.
- Verification: headless Playwright suites under `tmp/ideogram-director/*.cjs` (live-sync E2E,
  copy/paste, undo ownership, resolution popup, picker, ergonomics, migration, corrupt-save
  recovery — all passing; `verify_a` `resultPainted` is a known placeholder failure, not a
  regression). Rev `connected-prompt-f/g` adds focused backend regression coverage for compact LLM JSON
  and a disposable Chrome/CDP canvas proof at
  `tmp/ideogram-director/compact_json_sync_verify.cjs`: compact JSON connected from `DenoPromptText`
  auto-fills an empty `Ask Before Replacing` board, shows the replacement gate once the board has content,
  `Apply and Replace` creates visible bbox labels, `Keep Current Board` records the ignored input
  signature, `Always Replace` applies without a manual gate,
  graphToPrompt serializes the applied box, and invalid JSON shows a blocking regenerate warning
  with a current-board keep path that never uses the bad JSON text.
  `tmp/ideogram-director/input_prompt_interaction_verify.cjs` adds real mouse-event clicks,
  the two-choice Incoming JSON Prompt popup, pending/invalid/final screenshots, automatic continue-after-choice
  queueing, invalid-input keep-current verification, and the regression where clicking the real
  `.idd-regen` button and the global `app.queuePrompt()` path after an upstream JSON change must show
  Apply/Keep without queueing or overwriting the current board/style first. Real-canvas use throughout
  the session. `tmp/ideogram-director/repro_shrink_interactions.cjs` is the 2026-06-16 sizing
  regression proof: it clicks/opens/draws through the Director, forces the old compute-size fit
  collapse path, and verifies `shrinks: []`; manual 850x720 shrink and 900x1100 grow are preserved.
  Note
  `tmp/` is disposable by repo policy — promote any suite worth keeping before cleanup.

## Next Reminders

- Add an Ideogram-specific Local LLM system prompt preset that can emit official JSON captions and, when requested, a valid `style_description`.
- Real-canvas user QA of the preset galleries (open both, apply, save/delete a MY preset) — the
  headless suite passed but the user click-through is the completion gate.
- Sync docs and tests with the integrated node state before any release gate.
- Thumbnail regeneration notes (if a style thumb ever needs re-baking): use
  `tmp/hook50/gen_style_thumbs.py`; NEVER write negations in the caption ("no checkered pattern"
  made the model DRAW checkerboards) — specify a CONCRETE in-style background instead; glamour
  subject wording trips the safety filter; webp conversion center-crops 9% per edge to kill thin
  print-matte borders.
- Standalone `(Deno) Translator` is paused and excluded from registration. The Director's built-in
  language control is a fullscreen `Language` grid, not a long dropdown. Source language is
  detected automatically. Users can read and edit the board in Korean or another native language;
  the final prompt output is English for the sampler. Only
  editable description fields are translated. TEXT boxes keep the exact typed words so signs, logos,
  headlines, and poster text are not translated accidentally.
- Style quality pass (2026-06-14): art presets that were pulling outputs toward photo/realistic,
  overly dark, or weak pixel/wireframe looks were reworded in both `IDD_STYLES` and
  `tmp/hook50/style_catalog*.json`. Keep future art presets medium-clear but avoid self-defeating
  terms such as `photoreal`, `octane`, `subsurface`, `soft realistic skin`, `chiaroscuro`, and
  `tenebrism` unless the dark/realistic behavior is truly intentional.
