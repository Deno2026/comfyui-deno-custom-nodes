# Local LLM Loader / Reviewer

Status: included in public 0.7.32 Active and pending 0.7.33. Future public version bumps,
hotfixes, or registry/Manager changes still need explicit user approval.

Read this document when working on:

- `(Deno) Local LLM Loader`
- `(Deno) Local LLM Reviewer`
- `(Deno) Prompt Text`
- `deno_local_llm_refiner.py`
- `web/js/deno_local_llm_refiner.js`
- `tests/test_local_llm_reviewer_graph_transform.py`
- Local Ollama / LM Studio execution, thinking, stop/unload, memory policy, reviewer graph transforms, or preview UI.

## Purpose

The Loader calls a local Ollama or LM Studio model from ComfyUI to rewrite, expand, or review prompt text. It can attach one IMAGE input for vision-capable local models.

The Reviewer gates IMAGE/AUDIO passthrough using review text. AUDIO is not reviewed by the Loader itself; it is gated together with the review result so users can connect audio-capable text generation nodes into the review text path.

The Reviewer is the differentiator: it lets a user review generated media, pass it, approve the current result once, or rerun the path before review.

## Current Contract

- Loader provider scope is Ollama + LM Studio only.
- Do not reintroduce Custom Local Server, vLLM, generic OpenAI-compatible, or remote-provider UI paths unless the user explicitly reverses direction.
- Hidden legacy fields may remain only to prevent saved workflow widget-order breakage.
- `DenoLocalLLMRefiner` output socket is `result` only.
- Loader's canonical prompt input is backend `prompt`. Users can type in the in-node Prompt textarea or connect a STRING/STRING list into the visible `prompt` socket; both paths feed the same backend input, not two separate prompt systems.
- Do not expose widget controls as visible left-side sockets. `provider`, model rows, system prompt, thinking, seed, memory, and VRAM policy are internal node controls. The normal Loader input sockets are `image` and `prompt`.
- Old saved `user_prompt` sockets migrate to `prompt`. Converted Provider/Model/Seed/VRAM widget sockets must be removed rather than kept as live ghost controls.
- Thinking is shown in node preview/popup UI, not as a workflow output socket.
- Optional media input is IMAGE only.
- Loader has separate `Stop LLM` and `Unload LLM`.
- `Unload LLM` is blocked while generation is active.
- `Keep loaded` means one warm local LLM slot, not stacked Ollama + LM Studio residency.
- Switching provider/model in Keep loaded mode must unload the previous warm provider/model before calling the new one.
- User-facing VRAM label is `Unload ComfyUI Models Setting`.
- VRAM options:
  - `Auto: unload only before first LLM call`
  - `Always unload before each LLM call`
  - `Never unload before LLM call`
- Old saved values `Auto`, `Always free`, and `Never free` must normalize to the current labels.
- Reviewer auto-rerun on failure is optional and off by default.
- Reviewer auto-rerun is capped at 3 attempts.
- Before each auto-rerun, Reviewer increments one upstream seed widget by `+1`.
- `Seed: Auto` should prefer generation/sampler seed widgets over the Local LLM Loader's own seed.
- The Reviewer seed target button opens a picker. Auto only uses upstream seed widgets; explicit manual selection can use an upstream seed or graph fallback seed.
- If a manually selected seed target disappears, auto-rerun stops with a clear selected-seed missing message instead of falling back to a different seed.
- If no upstream seed is found, auto-rerun stops with a clear missing-seed message.

## Current Important Fixes

- LM Studio now uses native `POST /api/v1/chat` for thinking control.
- LM Studio reasoning control is capability-aware. Some LM Studio models reject even
  `reasoning: "off"` with HTTP 400 because they do not expose a reasoning configuration. When
  `Thinking` is off, send `reasoning: "off"` only for models whose `/api/v1/models` capabilities
  include `off`; otherwise omit the field. When `Thinking` is on, send `reasoning: "on"`, and keep
  raw/debug metadata safe with a default `"off"` value.
- LM Studio IMAGE input uses native parts:
  - `{"type":"text","content":...}`
  - `{"type":"image","data_url":...}`
- Shifted saved widget values such as `System Prompt`, `Unload LLM`, booleans, numbers, URLs, and removed-provider tokens must not become active model names.
- Ollama unload uses `POST /api/generate`; no HTTP 405.
- LM Studio already-unloaded state is a no-op success, not a `model_not_found` button error.
- Keep loaded provider switching unloads the previous warm provider/model.
- Keep loaded must treat local server aliases such as `localhost` and `127.0.0.1` as the same local LLM slot. Do not unload the same Ollama model just because the warm marker used a different localhost spelling.
- Keep loaded state must be checked against the real provider, not only internal node memory.
- Ollama Keep loaded streaming calls refresh keep-alive after the run with `POST /api/chat`, `messages: []`, `stream: false`, and the selected `keep_alive`. Do not use `/api/generate` for this keep-alive refresh after image/thinking chat calls; it can switch Ollama runners and cause an avoidable VRAM unload/reload cycle.
- On this PC, `C:\Users\aions\Documents\Comfy-Ollama-Guard` can unload Ollama while ComfyUI is busy. If `unload_ollama_on_busy` is true, a long Local LLM Loader run can be unloaded by the external guard even when the node is set to `Keep loaded`; the node then reloads Ollama afterward to honor Keep. Check `logs\guard.log` before treating this as a Loader Keep bug.
- LM Studio native streaming can return HTTP 200 with only `chat.start` and no final text when the prompt exceeds the loaded model context. Do not treat that as success. The Loader must run a non-stream diagnostic request and raise a clear context-length error instead of returning an empty result.
- Fixed / increment / decrement seed modes use a stable ComfyUI cache key. If provider, model, prompts, seed, image, memory policy, and VRAM policy are unchanged, the Loader should not call the local LLM again.
- `randomize` seed mode uses a fresh cache key for each run. Prompt/model/seed/image/memory/VRAM changes must still invalidate the cache and rerun the Loader.
- Loader `Seed Mode` must also behave like ComfyUI's after-generate seed control. On queue submit, `increment`, `decrement`, and `randomize` update the visible Loader `Seed` widget for the next queued run without adding a separate serialized `control_after_generate` widget or shifting the 13 saved Loader widget slots. Backend `_seed_for_index` still offsets batched prompt-list items inside one execution.
- Thinking-only responses with no final result are rejected with a clear error instead of passing an empty prompt downstream.
- Saved LM Studio/Ollama model selections must survive workflow reload even when the live model list returns the default model first. Configure-time normalization moves the saved model value before default choices and strips old serialized button/control values so saved 12B-style selections do not fall back to e4b. First queue submit after reload must not require pressing `Refresh Models` to restore the saved provider/model/system prompt/seed/prompt slots.
- Saved model preservation must not pretend the model exists on every PC. If a saved Ollama/LM
  Studio model is not in the current detected model choices, the visible combo value should read
  `Missing saved model: <model>` and the node preview should explain that the model is unavailable
  on this PC. The original model id must stay recoverable from the display value so an old workflow
  can move back to a PC where the model exists. `Refresh Models` should restore the normal model
  name only after the local server reports that exact model. Run, Stop LLM, and Unload LLM must
  reject the missing-display value before sending any Ollama/LM Studio request.
- Local preview scrollbars support wheel and thumb drag, with modal wheel scrolling preserved.
- Local preview wheel hit-testing must use the current event's real `clientX/clientY` first. Do not
  let stale LiteGraph `graph_mouse` / `last_mouse` coordinates scroll the Loader preview while the
  pointer is over a neighboring custom node such as Ideogram Director.
- Loader Prompt is now an in-node textarea under the System Prompt button. Manual node resize grows/shrinks the Prompt textarea, not the Result preview.
- Loader Result preview stays compact and opens its full text through its own `More` button.
- Reviewer button tooltips are DOM overlays mounted on `document.body`, not canvas-drawn text, so they can extend outside the node frame without clipping. Canvas pointermove also performs Reviewer button hit-testing so tooltip display does not depend only on LiteGraph custom-widget hover callbacks.
- System Prompt popup has a softer modal theme and browser-local presets. The built-in `Reviewer JSON` preset asks the LLM to return `verdict`, `reason`, `matched`, and `issues`; the backend gate already reads JSON `verdict`/`reason`. User presets are stored in browser `localStorage`; the workflow still saves only the real `system_prompt` widget value.
- System Prompt popup also includes a built-in `Prompt Only` preset for prompt generation. Some LM Studio/Ollama reasoning-capable models can write analysis text in the normal message body even when reasoning/thinking is off. The preset asks the model to return one line starting with `DENO_FINAL_PROMPT:`, and the backend passes only the text after that prefix downstream. Legacy `<final_prompt>...</final_prompt>` and full `FINAL_PROMPT_START`/`FINAL_PROMPT_END` prompts are still supported for saved workflows. If the system prompt requires a final prompt block but the model does not return it, the Loader fails clearly instead of passing raw analysis/garbage text into the workflow.
- Loader frontend execution-error handling must be strict to the Loader node. Downstream errors from Ideogram Director's Incoming Prompt / invalid JSON gate must stay on the Director and must not appear in the Loader Result panel just because there is only one Loader on the graph.
- Reviewer remains compatible with old one-word review text: `OK`, `PASS`, `APPROVE`, `APPROVED` pass; `FAIL`, `REJECT`, `BAD` block. JSON is optional and mainly adds a readable reason.
- Reviewer has a `How to use` button that opens a DOM modal explaining wiring, recommended Loader system prompt, button meanings, auto retry, seed target, and audio gating.
- Registry scanner hardening: Local LLM HTTP calls must stay visibly local-only. The backend must reject non-local URLs before opening a connection, route JSON and streaming calls through the same local URL parser, and avoid generic `urllib.request.urlopen`-style helpers that look like arbitrary outbound networking. This does not guarantee future Registry scanners will ignore all local LLM networking, but it removes the exact ambiguous call pattern that flagged `0.7.29` / `0.7.30`.

## Verification Matrix

Before calling this node done after a behavior change, cover the affected cells:

- Ollama normal text run.
- LM Studio normal text run.
- LM Studio over-context prompt:
  - Short prompt still returns real text.
  - Too-long prompt fails with a clear context-length message instead of an empty successful output.
- IMAGE input path if image support was touched.
- Thinking off and on for supported models.
- Stop while generation is active.
- Unload after generation.
- Normal run after unload.
- Keep loaded repeated run on the same provider/model.
- Keep loaded with external guard present:
  - If VRAM drops during a long Ollama run, check `Comfy-Ollama-Guard\logs\guard.log` for `ComfyUI busy detected` and `ollama model unloaded`.
  - Either pause/configure the guard for Local LLM Loader tests, or expect the node to reload Ollama after the guard unload.
- Keep loaded provider switch:
  - Ollama -> LM Studio
  - LM Studio -> Ollama
- VRAM policy:
  - Auto skips unload when the selected provider model is already loaded.
  - Always unloads before each LLM call.
  - Never does not unload ComfyUI models.
- Loader cache behavior:
  - Fixed seed with unchanged inputs should reuse the cached output instead of calling the local LLM again.
  - Changing prompt/model/seed/image/memory policy/VRAM policy should rerun.
  - Randomize seed mode should rerun even if visible text is unchanged.
  - Seed Mode `increment` should change the visible Loader seed by `+1` after a real queue submit, and the next queue should use the changed seed/cache key.
  - Seed Mode changes must not create a visible or serialized extra `control_after_generate` widget, duplicate `seed_mode`, or shift saved provider/model/system prompt/seed/prompt values by one slot.
- Old saved-node/widget-shift simulation when widget order or hidden fields change.
- Reviewer auto-rerun:
  - Off by default.
  - Failure increments the selected upstream seed by `+1`.
  - Auto target chooses generation seed before Local LLM seed.
  - `Seed: Auto` opens a picker. Auto only uses upstream seed widgets; manual selection can choose an upstream seed or a graph fallback seed.
  - Manual seed target changes only the selected seed.
  - Missing manual seed target stops instead of falling back to another seed.
  - Passing reviews ignore auto-rerun and reset the retry state.
  - Stops after 3 failed attempts.
  - Regenerate submit mode wins over stale Pass widget values.
  - `How to use` opens outside the canvas frame, scrolls locally, and does not change serialized workflow values.
- Real canvas control test for buttons, preview scrollbars, More popup, resize grow/shrink, and wheel/middle-click behavior.
- Adjacent-node wheel leak test:
  - Put Local LLM Loader next to Ideogram Director.
  - Make the Loader preview scrollable.
  - Wheel over the Ideogram board and over the Ideogram popup.
  - Loader preview scroll state must not change.
- Loader prompt UI:
  - System Prompt button appears below the compact preview area.
  - System Prompt popup can load the built-in `Reviewer JSON` preset, save/delete browser-local user presets, and save the edited text back into the single `system_prompt` backend widget.
  - Prompt textarea appears under System Prompt.
  - Dragging the node taller grows the Prompt textarea.
  - Result uses `More` for full text instead of taking all extra node height.
  - Old `user_prompt` sockets migrate to visible `prompt`. Converted Provider/Model/Seed/VRAM COMBO sockets disappear after setup/refresh. `prompt` remains the only supported STRING input socket and feeds the same backend value as the in-node textarea.

## Latest Review Evidence

2026-06-13 reviewer state matrix hardening:

- Added harness coverage for cross-state Reviewer combinations:
  - Retry Off + failed review -> no seed change.
  - Retry On + passed review -> no rerun, retry count reset.
  - Retry On + failed review -> selected seed increments once.
  - Busy auto-rerun -> no duplicate seed increment.
  - 3 failed attempts -> blocked message, no fourth seed increment.
  - Manual graph fallback seed -> only selected seed changes.
  - Missing manual seed target -> stops with selected-seed message and does not fall back.
  - Auto with no upstream seed -> stops with upstream-seed message.
  - Regenerate submit mode wins over stale Pass widget values.
- Verification passed:
  - `node --check web/js/deno_local_llm_refiner.js`
  - `py -m pytest tests/test_local_llm_reviewer_graph_transform.py -q`
  - `py -m pytest tests/test_image_resize_node.py -q -k "local_llm or ai_review_gate or prompt_text or node_registration"`
  - `py -m pytest tests -q` -> `127 passed`
- Runtime JS synced to the active ComfyUI install and SHA256 matched.
- ComfyUI restarted through `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`; queue idle, one 8188 listener.
- Served JS contained `Auto retry could not find the selected seed target.`, `applyReviewerSubmitModes`, and `maybeAutoRetryReviewer`.
- Real canvas representative check passed:
  - `Seed` opened `Retry Seed Target`.
  - Auto restored the visible button to `Seed: Auto`.
  - DENO-related browser console errors: 0.

2026-06-13 seed picker refinement:

- `Seed: Auto` now opens a visible `Retry Seed Target` picker instead of cycling hidden candidates.
- Auto target remains limited to upstream seed widgets. Graph fallback seed widgets are listed for explicit manual selection only.
- Passing reviews ignore auto-rerun and reset retry state; failed reviews can retry up to 3 times.
- Verification passed:
  - `node --check web/js/deno_local_llm_refiner.js`
  - `py -m pytest tests/test_local_llm_reviewer_graph_transform.py -q`
  - `py -m pytest tests/test_image_resize_node.py -q -k "local_llm or ai_review_gate or prompt_text or node_registration"`
  - `py -m pytest tests -q` -> `127 passed`
  - `git diff --check` -> no whitespace errors, line-ending warnings only.
- Runtime JS synced to active ComfyUI install and SHA256 matched.
- ComfyUI restarted through `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`; queue idle, one 8188 listener.
- Served JS contained `Retry Seed Target`, `Auto: nearest upstream seed`, `Graph fallback`, and `collectReviewerSelectableSeedCandidates`.
- Real canvas check passed:
  - `Seed: Auto` opened the picker.
  - Graph fallback selection changed the button label to `Seed: #1 seed`.
  - Auto selection restored the button to `Seed: Auto`.
  - DENO-related browser console errors: 0.

2026-06-13 auto-rerun feature review:

- Backup created before editing:
  `E:\DENO-Share\agent-backups\comfyui-deno-custom-nodes\local-llm-reviewer-auto-rerun-20260613-144651`.
- Full local test suite passed: `127 passed`.
- Frontend syntax check passed for `web/js/deno_local_llm_refiner.js`.
- `git diff --check` found no whitespace errors.
- Active runtime JS was synced and SHA256 matched.
- ComfyUI was restarted through `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`.
- `/object_info/DenoAIReviewGate`, `/object_info/DenoLocalLLMRefiner`, and `/object_info/DenoPromptText` returned real node entries.
- Served JS contained `Retry x3 On`, `Seed: Auto`, `maybeAutoRetryReviewer`, and `incrementReviewerRetrySeed`.
- Real canvas check passed:
  - Reviewer showed `Retry x3 Off` and `Seed: Auto`.
  - Clicking Retry toggled to `Retry x3 On`.
  - Clicking Seed showed `Seed target: Auto` when no upstream seed candidate was connected.
  - Retry was restored to Off after the check.
  - No DENO Local LLM browser console errors were reported.

2026-06-13 push-candidate review:

- Full local test suite passed: `127 passed`.
- Python compile passed for `deno_local_llm_refiner.py` and `__init__.py`.
- Frontend syntax check passed for `web/js/deno_local_llm_refiner.js`.
- `git diff --check` found no whitespace errors.
- Source/runtime hashes matched for `deno_local_llm_refiner.py`, `web/js/deno_local_llm_refiner.js`, and `__init__.py`.
- Active ComfyUI queue was idle.
- Served JS from `http://127.0.0.1:8188/extensions/deno-custom-nodes/deno_local_llm_refiner.js` contained the Loader, Reviewer, VRAM label, Stop LLM, and Unload LLM markers.
- `/object_info/DenoLocalLLMRefiner`, `/object_info/DenoAIReviewGate`, and `/object_info/DenoPromptText` returned real node entries.
- `/object_info/DenoRandomPromptBox` returned `{}` and source/runtime registration files do not register it.
- Real ComfyUI queue run passed:
  - workflow: `DenoPromptText -> DenoLocalLLMRefiner -> DenoAIReviewGate`
  - provider: LM Studio
  - model: `google/gemma-4-12b`
  - thinking: off
  - model memory: Keep loaded
  - VRAM policy: `Never unload before LLM call`
  - Loader output: `OK`
  - Reviewer result: `passed=true`, `verdict=OK`

## Earlier Real Runtime Evidence

Latest verified runtime path:

- Active runtime: `E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install`
- Active URL: `http://127.0.0.1:8188/`
- Source/runtime `deno_local_llm_refiner.py` SHA256 matched after sync.
- ComfyUI restarted through `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`.
- Local LLM / Reviewer pytest subset passed: 92 tests.
- Source/runtime hashes matched for `deno_local_llm_refiner.py`, `web/js/deno_local_llm_refiner.js`, and `__init__.py`.
- ComfyUI restarted through `C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk`; `/object_info/DenoLocalLLMRefiner`, `/object_info/DenoAIReviewGate`, and `/object_info/DenoPromptText` returned successfully.
- Real ComfyUI short run passed:
  - provider: Ollama
  - model: `qwen3.6:35b-a3b`
  - thinking: on
  - model memory: Keep loaded
  - VRAM policy: Auto
  - result: `네, keep-loaded 테스트는 정상입니다.`
  - `/api/ps` immediately and after 5 seconds kept `qwen3.6:35b-a3b` loaded.
- Real runtime investigation found that long Ollama runs can still drop and reload when the external `Comfy-Ollama-Guard` sees ComfyUI queue busy. Confirmed matching guard log lines at `2026-06-09T14:10:47`, `14:15:12`, and `14:20:27`, each followed by `ollama model unloaded: qwen3.6:35b-a3b`.

## Pending UX / Docs Work

- Revisit Reviewer button labels with the user before changing them.
- Right-side ComfyUI Info panel still needs beginner-friendly per-input descriptions.
- For any future release, keep frontend/backend feature sync, saved workflow migration, provider matrix
  verification, and Manager metadata checks as hard gates.
