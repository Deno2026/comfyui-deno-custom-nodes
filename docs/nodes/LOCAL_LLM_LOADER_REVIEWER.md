# Local LLM Loader / Reviewer

Status: push candidate as of 2026-06-13. Public release/version bump still needs explicit approval.

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
- When multiple upstream seed widgets exist, the Reviewer seed target button cycles through available candidates.
- If no upstream seed is found, auto-rerun stops with a clear missing-seed message.

## Current Important Fixes

- LM Studio now uses native `POST /api/v1/chat` for thinking control.
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
- Fixed seed must not let ComfyUI cache-skip the Loader. The seed stabilizes the local LLM request; the node must still execute so provider swap, keep-alive, stop/unload state, and fresh external calls happen.
- `IS_CHANGED()` includes a monotonic counter so two immediate checks cannot return the same value on coarse timer resolution.
- Thinking-only responses with no final result are rejected with a clear error instead of passing an empty prompt downstream.
- Local preview scrollbars support wheel and thumb drag, with modal wheel scrolling preserved.

## Verification Matrix

Before calling this node done after a behavior change, cover the affected cells:

- Ollama normal text run.
- LM Studio normal text run.
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
- Old saved-node/widget-shift simulation when widget order or hidden fields change.
- Reviewer auto-rerun:
  - Off by default.
  - Failure increments the selected upstream seed by `+1`.
  - Auto target chooses generation seed before Local LLM seed.
  - `Seed: Auto` opens a picker. Auto only uses upstream seed widgets; manual selection can choose an upstream seed or a graph fallback seed.
  - Manual seed target changes only the selected seed.
  - Passing reviews ignore auto-rerun and reset the retry state.
  - Stops after 3 failed attempts.
- Real canvas control test for buttons, preview scrollbars, More popup, resize grow/shrink, and wheel/middle-click behavior.

## Latest Review Evidence

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
- Public release scope is not approved. Do not package these nodes into release metadata until the user explicitly approves release prep.
