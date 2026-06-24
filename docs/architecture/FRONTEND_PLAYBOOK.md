# DENO Frontend Playbook

Status: Phase 1 Gate A PASS architecture draft.

## Read Path

For frontend work, read these in order:

1. `docs/architecture/FRONTEND_PLAYBOOK.md`
2. `docs/architecture/cards/<node>.yaml`
3. `docs/architecture/STATE_AUTHORITY_RULES.md`
4. `docs/architecture/VERIFICATION_GATES.md`

If a node has a separate product contract under `docs/nodes/`, read that before implementation as well.

## UI Kinds

- `native_widget`: normal ComfyUI widgets plus small custom draw helpers.
- `bounded_panel`: one compact canvas or DOM panel inside the node.
- `companion_workspace`: larger DOM board/sidebar/modal workspace.
- `read_only_inventory`: architecture inventory for work that must not be edited in the current phase.

## State Rules

Workflow widgets own execution inputs. Versioned JSON widgets own complex documents. Official node geometry is owned by ComfyUI serialization `pos`, `size`, and `flags`. DENO `node.properties` owns only namespaced UI preferences and migration markers. localStorage owns reusable preferences/libraries only. Backend responses own derived readiness/status only.

Backend effective result and explicit user intent must be displayed as separate concepts. For example, a backend may report an effective root, but the workflow still owns the user's explicit root intent.

## Lifecycle Matrix

Every non-trivial frontend card must cover:

- fresh create
- workflow load: graph.add -> configure
- current clipboard: graph.add -> configure
- vintage/template clipboard: configure -> graph.add
- legacy migration
- clone/duplicate
- connection/widget change
- save/reload/re-save
- queue prompt
- remove/recreate

## Dynamic UI

Dynamic slot rules apply only to DENO-owned real dynamic slots behind a reviewed adapter. Backend-declared/static inputs are not removed just because they are hidden. Visual, layout, interaction, and serialization must align, but hiding/removal must follow the host contract.

## Size

Use:

```text
rendered_height = max(required_content_height, user_manual_min_height)
```

Official position, size, and collapsed state come from ComfyUI `pos`, `size`, and `flags`. DENO may store only additional namespaced preferences.

## Async

Use latest-wins gates. Ignore stale responses and responses after node removal. Never promote a backend-derived response into workflow intent without a user action.

## Storage

Namespace and version every browser storage key. Corrupt JSON must recover. Workflow state wins over localStorage for active selections.

## Verification

Use fresh, current saved, legacy saved, current clipboard, vintage/template clipboard, Queue Prompt, resize, wheel/middle-click, console/network, source/served hash, and declared runtime matrix. Mark missing surfaces as `UNVERIFIED`; do not fold them into a pass.

Console evidence must separate startup/runtime baseline noise from pilot action failures. Preserve pre-action errors as `startupBaselineErrors`, then record Prompt Guide create/save/reload/copy/paste/queue errors as `actionPhaseErrors`. The hard gate is no new pilot-attributable `actionPhaseErrors`.
