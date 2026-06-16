# LTX Prompt Guide

Product contract for `(Deno) LTX Prompt Guide`.

## Purpose

- Combine LTX prompt text, negative prompt text, language, and frame-rate conditioning in one beginner-friendly node.
- Keep the dialogue-duration summary and negative prompt toggle as helper UI only. The visible prompt text fields are the source of truth.

## Do Not Break

- Saved positive prompt, negative prompt, language, frame rate, and negative-toggle state must survive Save -> F5 -> reopen.
- Public legacy workflows may store the old 7-value layout:
  `["", positive_prompt, language, frame_rate, "", show_negative_prompt, negative_prompt]`.
- Current workflows may store the compact 5-value layout:
  `[positive_prompt, language, frame_rate, show_negative_prompt, negative_prompt]`.
- Generated helper widgets must be `serialize:false` and must never become the canonical saved prompt value.
- During `configure()`, saved core values must be preserved before LiteGraph restores widgets, expanded around generated display widgets only when needed, and reapplied by widget name after setup.

## Verification

- Fresh node: change positive prompt, language, frame rate, open negative prompt, change negative prompt, serialize, reload, and confirm all values remain under the same labels.
- Legacy saved node: load a 7-value public fixture and confirm positive/negative text are not shifted or blanked.
- Compact saved node: load a 5-value saved shape and confirm it expands correctly in the runtime UI.
- Re-save after reload and confirm the saved data still contains the edited prompt text.
