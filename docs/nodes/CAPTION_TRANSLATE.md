# Translator

Status: **paused / excluded from registration (2026-06-15).**

The standalone `(Deno) Translator` node is deferred. Keep `DenoTranslate` and any standalone wrapper
out of `__init__.py`, `node_list.json`, pyproject/README release surfaces, and packaged files until
the user explicitly restarts this feature. `deno_translate_engine.py` stays available because
Ideogram Director's built-in `Translate On/Off` output helper uses it.

Read this document when touching `deno_caption_translate.py` or caption/plain-text translation
behavior.

## Contract

- Class `DenoTranslate`, display name `(Deno) Translator`, category `Deno/Text`.
- Files: `deno_translate_engine.py` (shared engine) + `deno_caption_translate.py` (ComfyUI wrapper).
- Required widgets: `enable_online_translation` (BOOLEAN, default False), `source_lang`
  (`자동 감지` + 106 autonym labels), `target_lang` (106 autonym labels, default `English`),
  `translate_text_fields` (BOOLEAN, default False).
- Optional input: `text` (STRING, `forceInput`, declared LAST — same socket rule as the Director;
  see `docs/nodes/ideogram-director/` socket notes).
- Returns `(text, status)`. `status` is a human-readable result/failure summary.
- `IS_CHANGED` hashes all inputs, so identical inputs are served from ComfyUI's cache.

## Behavior

- Input is parsed leniently like the Director: raw JSON → ```json fenced block → first `{` .. last
  `}` span. A dict means "caption mode"; anything else is translated as plain text.
- Caption mode translates ONLY human-language fields: `high_level_description`,
  `style_description` strings, `compositional_deconstruction.background`, and each element `desc`.
  Keys, bbox numbers, types, and color hex codes are preserved byte-for-byte. Output is
  single-line minified.
- Element `text` is the literal word/phrase that should be drawn into the image, for example a
  logo, sign, headline, or poster word. It stays untranslated unless `translate_text_fields` is on
  — per the official caption spec. This protects workflows where the scene is described in Korean
  but the rendered TEXT must remain English.
- Online translation is opt-in. When `enable_online_translation` is off, the node makes no network
  request and returns the input unchanged.
- Engine: Google's free web endpoint (`translate.googleapis.com`, `client=gtx`) via stdlib
  networking only — no installable dependency that can fail for end users. Per-string results are
  cached in-process with a bounded cache.
- Engine policy is Google-only by user decision; do not add an LLM provider here (wire the
  existing Local LLM Refiner in the workflow instead).
- On ANY failure (offline, blocked endpoint, response shape change) the input passes through
  UNCHANGED and `status` says so — the workflow never breaks.

## Pitfalls

- The gtx endpoint throttles rapid bursts. Calls are paced (≥0.15s apart) and retried 3 times with
  backoff. Do not remove the pacing; intermittent `HTTPError`s return without it.
- `target_lang=en` skips strings that are already pure ASCII to avoid pointless round-trips.

## Typical placements

- `Director.prompt -> Translator -> CLIPTextEncode` is optional for advanced/manual workflows. For
  normal Ideogram Director use, prefer the built-in English Prompt button instead.
- `LLM JSON -> Translator -> Director.import_json` can translate an imported caption before it enters
  the board.
- In Ideogram Director itself, the built-in translation control is not a general output-language
  selector. It is an English-prompt helper: users can write the board in Korean or another native
  language, then output model-ready English for the sampler. The board stays in the user's language,
  and TEXT boxes keep the exact typed words so logos, signs, headlines, and poster text are not
  localized accidentally.

## Verification state (2026-06-15)

- Standalone node registration is intentionally removed.
- Engine-level tests may remain useful for Ideogram Director's built-in translation path.
- If this node is restarted, re-check registration, `/object_info/DenoTranslate`, saved workflow
  compatibility, public package scan, and beginner-facing copy before release.
