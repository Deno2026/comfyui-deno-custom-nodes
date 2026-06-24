# DENO Frontend State Authority Rules

Status: Phase 1 Gate A PASS draft. This is an architecture rule document only; no production node is migrated by this file.

## Purpose

Every user-visible or execution-affecting value must have one canonical owner. A fallback, cache, backend-derived result, or effective computed value may assist the UI, but it must not silently become the user's saved intent.

## State Classes

| State class | Canonical owner | Persistence | Notes |
|---|---|---|---|
| Execution input | Workflow widget or workflow document field | Workflow JSON | Values sent to Queue Prompt. Preserve by widget/input name and schema, not by visual row position alone. |
| Complex editor document | Versioned JSON widget | Workflow JSON | Use for boards, timelines, preset documents, and multi-field editors. |
| Official node geometry | ComfyUI node serialization `pos`, `size`, `flags` | Workflow JSON | This owns position, width, height, collapsed state, and other host-recognized geometry. |
| DENO UI preference | DENO-namespaced `node.properties` key | Workflow JSON | Only preferences that are not official geometry and not execution inputs, such as selected tab, scroll memory, panel mode, or migration marker. |
| Shared library preference | Namespaced localStorage | Browser profile | Preset library or recent-list cache only. Workflow active selection wins. |
| Explicit user intent | Workflow widget, versioned document widget, or deliberate user action | Workflow JSON | The user's chosen preset/root/model/prompt/mode. This must stay separate from effective computed results. |
| Backend-derived effective result | Backend response | Runtime only unless explicitly accepted by the user | Status, readiness, effective root, detected model list, selected backend fallback. Display it separately from explicit intent. |
| Request generation | Frontend runtime | Runtime only | Sequence token or AbortController. Not serialized. |
| Temporary DOM/canvas state | Frontend runtime | Runtime only | Drag state, hover, open overlay, wheel capture. Must teardown. |

## Precedence

1. Saved workflow values are read before any default, backend result, or storage merge.
2. Existing widget values are preserved by widget/input name, not by current row position alone.
3. Official ComfyUI geometry is restored from `pos`, `size`, and `flags`; DENO code must not claim generic width/height ownership through `node.properties`.
4. DENO `node.properties` may restore DENO-namespaced UI preferences only after execution values and official geometry are restored.
5. localStorage may merge reusable libraries, but must not select the active preset/model/root for a saved workflow.
6. Backend responses may display effective state, but cannot replace explicit user intent unless the user clicked a control that changes intent.
7. Async responses are accepted only if they belong to the latest request for that node scope.

## Clone, Copy, And Peer Sync

Peer sync and clone paths must use allowlists. Copy executable values such as prompt text, mode, count, timing, and accepted preset documents. Do not copy manual layout locks, transient request ids, runtime catalog maps, open overlays, stale route responses, or per-node teardown handles.

Copy/paste must follow the observed host order for the exact path being exercised. Do not describe the vintage/template path as the universal official copy/paste path.

Required path names:

- workflow load: graph.add -> configure
- current clipboard: graph.add -> configure
- vintage/template clipboard: configure -> graph.add

A node must survive configure-before-add and add-before-configure paths when the pilot claims those paths, then reconcile after graph add without losing saved values.

## Dynamic Topology

Dynamic topology rules apply only to DENO-owned real dynamic slots that a reviewed adapter explicitly owns. They must not be generalized to every backend-declared/static input.

DENO-owned dynamic rows require matching layers:

- Visual row
- Layout size
- Interactive hit/socket geometry
- Serialization and prompt payload

Backend-declared/static inputs are not removed merely because a row is hidden or visually collapsed. Visual, layout, interaction, and serialization must align, but the host contract decides whether a control is hidden in place, converted, removed, or represented as a compatibility row.

Direct `node.inputs`, `node.widgets`, `node.widgets_values`, and `target_slot` mutation is allowed only inside a reviewed foundation adapter with fixtures. Product nodes should call the adapter and provide node-specific fixture cases instead of owning raw topology surgery.

## Async Requests

Each node with backend routes needs latest-wins behavior:

- Assign a request token before calling `fetch`.
- Ignore stale responses.
- Ignore responses after node removal.
- Do not write backend-derived defaults into user-owned workflow widgets.
- Show errors separately from saved intent.

## Migration Owner

The node architecture card owns the workflow schema version and migration matrix. A migration is incomplete until it proves:

- Legacy raw values normalize to the current schema.
- Visible restored values match the raw values.
- Re-save produces the canonical current shape.
- Queue Prompt sends the expected `output[nodeId].inputs`.

## Serialization Authority

For installed/official `LGraphNode` workflow serialization, the host checks `widget.serialize`, not `widget.options.serialize`, and writes `widgets_values` by live `node.widgets` array index. A product node's `node.widgets_values` mirror is not sufficient authority for `graph.serialize()`.

For Prompt Guide specifically, generated presentation widgets at live indices 0 and 4 make current saves write a 7-slot shape. The Phase 2A adapter must make canonical serialization explicit instead of assuming generated widget metadata will be ignored.

## Stop Conditions

Stop implementation and report if a value has two canonical owners, if localStorage overrides workflow state, if official geometry and DENO layout memory disagree, if a hidden compatibility field can become an active execution value, or if a backend-derived effective value is being stored as explicit intent.
