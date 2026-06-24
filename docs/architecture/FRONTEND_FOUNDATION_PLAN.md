# DENO Frontend Foundation Plan

Status: Phase 1 Gate A PASS. No production node is migrated by this document.

## Goal

Move repeated ComfyUI frontend failure patterns into small reviewed modules only when a pilot node proves the need. Phase 2 must not create a broad unused framework.

## Phase 2A Minimum Vertical Slice

Phase 2A is limited to the first pilot's required path. The current recommended pilot remains `DenoLTXPromptGuide`, and Gate A now treats its saved-shape failure as the deterministic failing acceptance test that Phase 2A must fix.

Minimum candidate modules for that pilot:

| Module | Phase 2A status | Reason |
|---|---|---|
| `workflow_migration` | Candidate | Prompt Guide already has a known legacy 7-value to 5-value migration and needs visible restore/re-save proof. |
| `widget_state` | Candidate | Prompt Guide needs name-based widget read/write and generated `serialize:false` widget isolation. |
| `lifecycle` | Conditional | Add only if the pilot needs a shared idempotent setup/teardown wrapper instead of local wrappers. |
| `node_size` | Conditional | Add only if Prompt Guide grow/shrink behavior requires a shared manual-size helper. |
| `state_authority` | Docs/static assertion only | Keep as manifest/checklist/static assertion in Phase 2A. Do not create a runtime abstraction yet. |
| `compat` | Confirmed differences only | Add a thin shim only for host differences confirmed by installed frontend evidence. No speculative wrapper. |

Explicitly delayed until a pilot requires them:

- `dynamic_slots`
- `overlay_manager`
- `storage`
- `async_latest`
- `canvas_events`
- `geometry_audit`

## Deferred Module Catalog

This catalog names likely future modules without authorizing skeleton implementation.

| Module | Future responsibility | First allowed trigger |
|---|---|---|
| `compat/` | Isolate confirmed host differences and private/internal API access. | Installed and latest frontend evidence show a real divergence or unavoidable private API. |
| `lifecycle` | Idempotent node mount and cleanup. | Pilot has more than one setup/reconfigure/remove path to unify. |
| `state_authority` | Static declarations, owner linting, and review manifests first. | Runtime abstraction only after two migrated nodes need the same enforcement. |
| `widget_state` | Preserve widget identity and normalize hidden/layout state. | Phase 2A pilot. |
| `workflow_migration` | Pure saved-value migrations. | Phase 2A pilot. |
| `dynamic_slots` | Managed dynamic socket reconciliation. | A real dynamic-slot pilot, not Prompt Guide. |
| `node_size` | Manual-size baseline plus content-required height. | Prompt Guide only if needed; otherwise wait for a size-heavy pilot. |
| `canvas_events` | Wheel, pointer, scrollbar, and blank-area behavior. | A panel/scrollbar pilot. |
| `overlay_manager` | Body-mounted modal/popover lifecycle. | Ideogram/Local LLM/Downloader overlay pilot. |
| `storage` | Versioned namespaced localStorage with workflow precedence. | Easy Model Download Helper or Ideogram pilot. |
| `async_latest` | Request sequencing and disposal. | Route-backed async pilot. |
| `geometry_audit` | Measure off-node sockets, DOM panels, and stale hit regions. | Dynamic-slot or DOM-panel pilot. |

## Phase Gates

- Gate A: PASS. Phase 1 docs, source-contract evidence, and cards reviewed. The Prompt Guide fixture exists, is source-identical, and reproduces the known saved-shape failure deterministically.
- Gate B / Phase 2A: minimum vertical slice for one pilot with pure tests and production migration only after the failing acceptance test is fixed.
- Gate C: one production pilot migration with fresh/saved/copy-paste/queue/runtime parity and rollback plan.

## Phase 2A Entry Conditions

Phase 2A must not start until:

- `DenoLTXPromptGuide` has a current saved workflow fixture, not only a legacy fixture.
- The current fixture is source-identical and reproduces the known failure deterministically.
- Installed frontend 1.45.15 source contracts are accepted for the exact APIs used by the pilot.
- Any private/internal API needed by the pilot is either excluded or isolated in a confirmed compat adapter.
- The source/runtime served JS mismatch is resolved or the pilot uses a disposable runtime for behavior proof.

The current Prompt Guide fixture does not need to pass canonical 5-value save before Phase 2A entry. That failure is the Phase 2A target.

## Phase 2A Exit Criteria

Phase 2A acceptance requires:

- first save writes the canonical 5 values
- reload restores the exact visible values
- second save writes the canonical 5 values
- current clipboard path passes: graph.add -> configure
- vintage/template clipboard path passes: configure -> graph.add
- Queue Prompt inputs are exact
- no new console errors attributable to Prompt Guide create/save/reload/copy/paste/queue actions

Startup/runtime console errors collected before pilot actions must remain recorded separately as `startupBaselineErrors`; action-phase errors must be recorded separately as `actionPhaseErrors`.

## Migration Priority

1. `DenoLTXPromptGuide`: first candidate; fixture exists and deterministically reproduces the known canonical 5-value save failure.
2. `DenoLTXModelDownloader`: later, after storage/async/root-intent contracts are ready.
3. Small overlay/dialog nodes.
4. `DenoLocalLLMRefiner`: after storage, async, widget migration, and state-changing verification patterns are proven.
5. `DenoIdeogramDirector`: after overlay/storage/lifecycle contracts mature.
6. Director/LTX AI Studio family: read-only inventory only until product contract and provenance gates settle.

## Current Baseline Caveat

The active 8188 runtime served DENO JS that did not match this worktree during Phase 1. Gate A used a source-identical disposable runtime for Prompt Guide fixture proof and still found a blocker: visible restore and Queue Prompt passed, but saved `widgets_values` remained a 7-slot generated-widget shape instead of the canonical 5-value shape.

## Gate A Root Cause

Installed/official `LGraphNode` workflow serialization checks `widget.serialize`, not `widget.options.serialize`, and writes `widgets_values` by live `node.widgets` array index. Prompt Guide inserts generated widgets at live indices 0 and 4, so current saves write a 7-slot shape. The node's `node.widgets_values` mirror does not control `graph.serialize()`.

This is the Phase 2A implementation target, not a Gate A evidence collection failure.
