# Multi LoRA Loaders

Product Contract for:

- `(Deno) Multi LoRA Loader`
- `(Deno) LTX Multi LoRA Loader`

## Purpose

Provide a compact multi-slot LoRA stack that keeps normal ComfyUI model workflows and LTX video/audio workflows easy to batch, reorder, disable, and annotate.

## Required Behavior

- Saved LoRA selections must survive workflow reload even when the selected file is currently missing from `models/loras`.
- Missing saved values must not be silently replaced with `__none__`.
- Disabled slots must never block execution just because their saved LoRA file is missing.
- Slots above `active_loras` must not block execution.
- Enabled slots with a real missing LoRA must stop with a clear error that names the slot and missing file.
- The frontend row order, hidden backend widgets, and serialized `widgets_values` order must stay aligned.
- Reorder/remove/copy-style UI actions must move the saved LoRA value, strengths, trigger, description, and enabled state together.

## Validation Contract

ComfyUI validates combo inputs before node execution. Because saved LoRA values can point to a removed USB drive or another PC's model folder, these nodes must use `VALIDATE_INPUTS(..., **kwargs)` and perform their own slot-aware validation:

- validate only enabled slots within `active_loras`;
- skip disabled slots;
- skip slots outside `active_loras`;
- keep range checks for enabled slots;
- preserve backend load-time file errors for enabled missing LoRAs.

Do not fix this by clearing saved widget values. That loses user work and breaks the "plug the drive back in later" path.

## Verification Matrix

- Fresh node with present LoRA enabled: passes validation.
- Saved workflow with missing LoRA disabled: loads and runs past this node.
- Saved workflow with missing LoRA enabled: blocks with a clear slot-specific message.
- Saved workflow with missing LoRA outside `active_loras`: does not block.
- Save -> F5/reopen: missing saved values remain visible under the same rows.
- Reorder rows: colors/values/strengths/triggers/descriptions stay attached to the row data.

## Files

- `deno_multi_lora_loader.py`
- `deno_ltx_multi_lora_loader.py`
- `web/js/deno_multi_lora.js`
- `web/js/deno_ltx_multi_lora.js`
- `tests/test_image_resize_node.py`
