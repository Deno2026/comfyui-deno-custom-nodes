# Random Prompt Box

Status: **paused / excluded from registration (2026-06-15).**

The node was explored locally, but the user decided to defer it again before the 0.7.33 public
release. Keep it out of `__init__.py`, `node_list.json`, `pyproject.toml`, README, packaged assets,
and the source `_OPTIONAL_NODES` mapping until the user explicitly restarts this node. Public
exclusion is guarded by `tests/test_registry_metadata.py` (`DenoRandomPromptBox` must be absent from
`node_list`) and `tests/test_public_workflow_migration.py`.

The frontend was rebuilt from scratch on 2026-06-15 in the Ideogram Director "Verdant Pro" design
language (the previous Codex draft UI was discarded by user instruction). Backend was reshaped to a
single JSON state widget at the same time.

Files:

- `deno_random_prompt_box.py`
- `web/js/deno_random_prompt_box.js` (JS rev `r2026.06.15-claude-a`)

## Purpose

Folder-free wildcard box. Replaces the friction of hand-editing `.txt` wildcard files inside the
ComfyUI folder. Three pillars:

1. **Roll** — each run randomly picks one tag per enabled category row.
2. **Hold** — lock a row to a fixed value while the others keep rolling.
3. **Presets** — save a named category (title + tag pool) to a reusable library and load it in any
   workflow, with JSON export/import for backup/sharing.

## Backend contract (`deno_random_prompt_box.py`)

- `class DenoRandomPromptBox`, `FUNCTION="build"`, `CATEGORY="Deno/Prompt"`.
- `INPUT_TYPES.required = { "box_data": ("STRING", {"default":"", "multiline":True}) }` — a single
  serialized state widget. The frontend hides it and writes the whole board into it as JSON:
  `{"version":4,"rows":[{"title","enabled","locked","locked_tag","tags":[...],"color"}]}`.
- `RETURN_TYPES=("STRING","STRING","STRING")`, `RETURN_NAMES=("result","details","data")`.
  - `result` — comma-joined picks (the prompt string).
  - `details` — human breakdown `"Title: tag [locked]"` per line.
  - `data` — pretty JSON `{version,result,details,prompts:[{title,tag,locked}]}` for downstream
    local-LLM refinement.
- `IS_CHANGED = time.time_ns()` → re-rolls every queue (random node). No seed widget (by design;
  hold covers reproducibility of chosen rows, image metadata records the final prompt).
- Roll semantics: skip disabled rows and empty pools; locked row → `locked_tag` (or first tag if
  blank); else `random.choice(tags)`. Tag parsing is tolerant (comma/newline, trim, de-dup); bad or
  empty `box_data` yields empty outputs, never raises.

## Frontend contract (`web/js/deno_random_prompt_box.js`)

Single `addDOMWidget` DIV panel (not a `<canvas>`), Verdant Pro tokens from
`docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md`. The `box_data` widget is hidden in place
(`computeSize→[0,-4]`, element `display:none`) but stays serialized so the board saves with the
workflow.

- **Top bar:** status dot · title · `Presets` library launcher · spacer · `i` info button.
- **Body (`.rpb-scroll`):** category rows + `+ Add Category`. Each row = pill toggle (on/off,
  color-is-state) · color dot (AUTO_COLORS identity) · title · monospace pool preview · `🔒` hold
  toggle · armed `✕` delete. Row body click → detail editor; right-click → LiteGraph context menu
  (enable/disable, edit, hold, move up/down, duplicate, remove).
- **Detail editor (modal):** preset bar (`Load preset ▾` / `Save as preset`) → Title → Tags pool
  textarea → Hold (fix one tag, `🎲 Pick`). Staged commit: nothing changes until `Apply`.
- **Preset library (modal, body-mounted):** list of saved presets (name + monospace count + chip
  preview); per-row `Add as row` / `Load to row` / `Rename` / armed `Delete`; footer
  `Export JSON` (download) / `Import JSON` (merge).
- **Bottom bar:** category/active count readout · armed `Clear All`.
- **Canvas passthrough:** wheel zoom forwarded to the ComfyUI canvas except inside an overflowing
  `.rpb-scroll`; middle-click pans via `ds.offset` directly. Modals close on Esc/outside-click and
  detach their key handlers; floaters tracked and removed in `onRemoved`.

## Preset storage model (flag-safe)

- **Board (current rows) = saved in the workflow** via the serialized `box_data` widget (user's
  first-choice "in the workflow itself").
- **Reusable library = browser `localStorage` key `deno_rpb.presets_v1`** (`[{name, tags:[...]}]`) +
  JSON Export/Import. Cross-workflow reuse cannot live in one workflow, so a separate store is
  needed.
- **Registry-flag safety:** localStorage + browser download/upload do **zero** Python file I/O and
  zero network → no scanner surface. This matches already-shipped nodes that passed the Comfy
  Registry scan (LTX downloader `deno_ltx_model_downloader_presets_v1`, Local LLM
  `SYSTEM_PROMPT_PRESET_STORAGE_KEY`). A Python file-on-disk store is deliberately NOT used in v1; if
  added at release time, re-run the scan and write under `ComfyUI/user/`, never the package folder.

## Local registration

Source `__init__.py` `_OPTIONAL_NODES` does **not** register this node (keeps `main`/release clean).
For canvas testing, register only in the active install copy's `__init__.py`, or on an isolated
feature branch — never merge/push that registration to `main` without explicit approval.

## Verification matrix

- Verified (2026-06-15): `py_compile`; `node --check` (mjs copy); backend roll smoke
  (`tmp/rpb_smoke.py` — random row varies, locked row fixed, disabled/empty excluded, tolerant
  parse); public-surface guards green (`test_registry_metadata`, `test_public_workflow_migration`,
  `test_documentation_routing` — 39 passed).
- Pending (real-canvas gate, DeON completion criterion): add node to a disposable workflow → add/
  toggle/hold/delete/right-click-reorder rows → detail editor save-as-preset → library
  add-as-row / load-to-row / rename / delete / export / import → queue run produces per-pool random
  + locked-fixed `result` → F5/reopen survives board (workflow) and library (localStorage) → wheel
  over node lower blank + modals reaches canvas zoom, list scrolls internally → node grows and
  shrinks.
