# DENO Visual Fold

## Product Contract

Visual Fold is a visual organization helper for ComfyUI graphs. It lets users fold selected nodes
or ComfyUI groups into a compact chip, unfold them later, rename folded groups, and align or
distribute selected nodes/groups.

It must stay visual-only:

- Do not change workflow execution logic, graph links, backend node IDs, or node outputs.
- Do not turn selected nodes into a ComfyUI subgraph.
- Preserve the folded nodes in the main graph so saved workflows remain ordinary ComfyUI workflows.
- Keep the controls discoverable through both the selection toolbar/button path and the context menu
  path.

## Current Frontend Contract

- On current ComfyUI frontends, use the extension menu API hooks
  `getCanvasMenuItems` and `getNodeMenuItems`.
- On older frontends, keep the LiteGraph menu patch fallback.
- If ComfyUI's selection toolbox DOM is hidden, disabled, or moved by Desktop/Electron builds,
  Visual Fold must still expose a small DENO fallback toolbar near the selected nodes/groups.
- Do not depend on one exact selector such as `.selection-toolbox .p-panel-content` as the only
  control path.
- Avoid duplicate menu entries when the new menu API is available.

## Desktop Pitfall

ComfyUI Desktop can use a newer frontend shell and different selection-toolbar DOM than the
portable/Easy-Install browser view. A fix that works on `8188` is not enough for Fold behavior.

Broken assumption from 2026-06-17:

> The old selection toolbar selector and legacy LiteGraph menu patch are always enough.

Correct assumption:

> Fold must work when the selection toolbar exists, when it is missing/disabled, and when Desktop
> routes menus through the new extension API.

## Selection State Pitfall

ComfyUI can briefly disagree with itself during click, F5, context-menu, and blank-canvas selection
changes. `canvas.selected_nodes`, `canvas.selectedItems`, legacy `node.selected`, and old
`selected_group` fields may not clear on the same frame.

Correct behavior:

- For current node selection, prefer `canvas.selected_nodes` when it exists.
- Use `selectedItems` only when `selected_nodes` is unavailable, and use legacy `node.selected` only
  as the last fallback for older frontends.
- For group selection, prefer `selectedItems`; do not let stale `selected_group`, `selectedGroup`,
  or `group.selected` resurrect a Fold Group action when `selectedItems` is already present.
- The fallback DENO toolbar must disappear when the current selection no longer has a valid Fold,
  Unfold, Rename, or Align action. A one-node selection must not show the floating Fold button.
- During node/group drag, ComfyUI can hide its own selection toolbar before legacy canvas drag flags
  are updated. Visual Fold must treat document-level pointer starts inside the canvas, pressed-button
  pointer moves, and current frontend states such as `canvas.isDragging` and
  `canvas.state.draggingItems` as suppression signals so the fallback Fold/Align bar does not appear
  under the pointer mid-drag.
- Pointer release handlers may also be called from non-DOM events such as `window.blur`. Any
  `contains()` target check must first guard that the target is a real DOM `Node`, and blur should
  call the release path without passing the Window event target.

## Verification Matrix

For any Visual Fold UI change, check at least:

- Easy-Install main runtime and Desktop `ComfyUI` card, or mark the missing cell `UNVERIFIED`.
- Fresh graph with two normal nodes selected: Fold button/menu appears and folds them.
- Folded chip selected: Unfold and Rename are available.
- Multi-node selection: Align button/menu appears.
- ComfyUI group selection: Fold Group and group align paths appear.
- ComfyUI group drag: Fold/Fold Group/Align floating controls stay hidden while the pointer is
  actively dragging the group, then return after the drag ends if the selection is still valid.
- Normal node drag/drop: Fold/Align controls stay hidden while the pointer is held down over the
  canvas, and stale click events during or immediately after the drag do not open the Align menu or
  run an align action.
- Focus loss / Alt+Tab style path: switching away from the ComfyUI window and back must not throw a
  `contains(window)` TypeError, and Fold/Align controls should return normally once idle.
- Selection toolbar hidden or unavailable: fallback DENO Fold bar appears and does not block canvas
  pan/zoom outside the bar.
- One normal node selected: floating Fold button does not appear.
- Blank canvas click after a multi-node selection: fallback toolbar disappears instead of floating
  in the middle of the screen.
- Context menu path: no duplicate DENO Fold entries on current ComfyUI frontends.
