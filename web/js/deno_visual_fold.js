import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "Deno.VisualFold";
const META_KEY = "__denoVisualFold";
const CHIP_W = 164;
const CHIP_H = 28;
const HIDDEN_W = 2;
const HIDDEN_H = 2;
const HIDDEN_TITLE = "\u200b";
const HOVER_MAX_ITEMS = 12;
const FOLD_LABEL = "Deno: Fold Selected";
const UNFOLD_LABEL = "Deno: Unfold Group";
const RENAME_LABEL = "Deno: Rename Fold Group";
const FLOAT_BUTTON_LABEL = "Fold";
const FLOAT_UNFOLD_LABEL = "Unfold";
const FLOAT_RENAME_LABEL = "Rename";
const FLOAT_ALIGN_LABEL = "Align";
const ALIGN_MENU_PREFIX = "Deno: Align";
const CHIP_MAX_W = 260;
const LABEL_MAX_LENGTH = 34;

let tooltipEl = null;
let foldButtonEl = null;
let renameButtonEl = null;
let alignButtonEl = null;
let alignMenuEl = null;
let renameDialogEl = null;
let overlayTimer = null;
let visualStyleInstalled = false;
let lastCanvasPointerEvent = null;

function appGraph() {
  return app.canvas?.graph || null;
}

function dirty() {
  appGraph()?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

function graphNodes() {
  return appGraph()?._nodes || [];
}

function nodeById(id) {
  const graph = appGraph();
  return graph?.getNodeById?.(Number(id)) || graph?.getNodeById?.(id);
}

function selectedNodes(fallback) {
  const result = [];
  const raw = app.canvas?.selected_nodes;
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const node = typeof item === "object" ? item : nodeById(item);
        if (node) result.push(node);
      }
    } else {
      for (const [key, value] of Object.entries(raw)) {
        const node = value && typeof value === "object" ? value : nodeById(key);
        if (node) result.push(node);
      }
    }
  }
  for (const node of graphNodes()) {
    if (node?.selected) result.push(node);
  }
  if (fallback && !result.includes(fallback)) {
    result.push(fallback);
  }
  return Array.from(new Set(result)).filter(Boolean);
}

function selectedAlignNodes(fallback) {
  return selectedNodes(fallback).filter((node) => node && !foldMeta(node) && node.pos && typeof node.pos === "object");
}

function foldMeta(node) {
  return node?.properties?.[META_KEY] || null;
}

function isHiddenFoldMember(node) {
  const meta = foldMeta(node);
  return !!meta && meta.index !== 0;
}

function graphIndex(node) {
  const list = graphNodes();
  const index = list.indexOf(node);
  return index < 0 ? 0 : index;
}

function pickAnchor(nodes) {
  const sorted = [...nodes].sort((a, b) => graphIndex(a) - graphIndex(b));
  return sorted[sorted.length - 1] || nodes[0];
}

function bounds(nodes) {
  let x = Infinity;
  let y = Infinity;
  for (const node of nodes) {
    x = Math.min(x, Number(node.pos?.[0] || 0));
    y = Math.min(y, Number(node.pos?.[1] || 0));
  }
  return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}

function storeOwnValue(owner, key) {
  return {
    has: Object.prototype.hasOwnProperty.call(owner, key),
    value: owner[key],
  };
}

function restoreOwnValue(owner, key, saved) {
  if (!saved) return;
  if (saved.has) owner[key] = saved.value;
  else delete owner[key];
}

function normalizeFoldLabel(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX_LENGTH);
}

function foldDisplayLabel(meta) {
  return normalizeFoldLabel(meta?.label) || "Folded";
}

function foldedChipWidth(meta) {
  const label = foldDisplayLabel(meta);
  const estimated = 82 + label.length * 8 + String(meta?.count ?? "").length * 8;
  return Math.min(CHIP_MAX_W, Math.max(CHIP_W, estimated));
}

function baseMeta(node, groupId, index, count, anchorId, baseX, baseY) {
  return {
    version: 1,
    groupId,
    label: "",
    index,
    count,
    anchorId,
    basePos: [baseX, baseY],
    pos: [...(node.pos || [0, 0])],
    size: [...(node.size || [CHIP_W, CHIP_H])],
    title: node.title,
    collapsed: !!node.flags?.collapsed,
    color: storeOwnValue(node, "color"),
    bgcolor: storeOwnValue(node, "bgcolor"),
    collapsedWidth: storeOwnValue(node, "_collapsed_width"),
  };
}

function applyFoldLook(node, meta, visualBasePos = null, preserveAnchorPos = false) {
  node.flags = node.flags || {};
  node.flags.collapsed = true;
  const basePos = visualBasePos || meta.basePos;
  const chipWidth = foldedChipWidth(meta);
  if (meta.index === 0) {
    node.size = [chipWidth, CHIP_H];
    if (!preserveAnchorPos) {
      node.pos = [...basePos];
    }
    node.title = `${foldDisplayLabel(meta)} · ${meta.count}  ›`;
    node.color = "#178947";
    node.bgcolor = "#07180f";
    node._collapsed_width = chipWidth;
    return;
  }

  node.size = [HIDDEN_W, HIDDEN_H];
  node.pos = [...basePos];
  node.title = HIDDEN_TITLE;
  node.color = "#07180f";
  node.bgcolor = "#07180f";
  node._collapsed_width = chipWidth;
}

function selectOnly(node) {
  const canvas = app.canvas;
  if (!canvas || !node) return;

  for (const item of graphNodes()) {
    item.selected = item === node;
  }
  canvas.selected_nodes = { [node.id]: node };
}

function canvasPrototype() {
  if (typeof LGraphCanvas !== "undefined" && LGraphCanvas?.prototype) {
    return LGraphCanvas.prototype;
  }
  return app.canvas?.constructor?.prototype || null;
}

function foldNodes(nodes) {
  const clean = nodes.filter((node) => node && !foldMeta(node));
  if (!clean.length) return;

  const anchor = pickAnchor(clean);
  const ordered = [anchor, ...clean.filter((node) => node !== anchor)];
  const [baseX, baseY] = bounds(clean);
  const groupId = `deno-fold-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  ordered.forEach((node, index) => {
    node.properties = node.properties || {};
    const meta = baseMeta(node, groupId, index, ordered.length, anchor.id, baseX, baseY);
    node.properties[META_KEY] = meta;
    applyFoldLook(node, meta);
  });
  selectOnly(anchor);
  dirty();
}

function groupFor(node) {
  const meta = foldMeta(node);
  if (!meta?.groupId) return [];
  return graphNodes().filter((candidate) => foldMeta(candidate)?.groupId === meta.groupId);
}

function unfoldGroup(node) {
  const group = groupFor(node);
  if (!group.length) return;

  const anchorMeta = group.find((candidate) => foldMeta(candidate)?.index === 0)?.properties?.[META_KEY]
    || foldMeta(group[0]);
  const currentAnchor = group.find((candidate) => candidate.id === anchorMeta?.anchorId)
    || group.find((candidate) => foldMeta(candidate)?.index === 0)
    || group[0];
  const dx = Number(currentAnchor?.pos?.[0] || 0) - Number(anchorMeta?.basePos?.[0] || 0);
  const dy = Number(currentAnchor?.pos?.[1] || 0) - Number(anchorMeta?.basePos?.[1] || 0);

  for (const item of group) {
    const meta = foldMeta(item);
    if (!meta) continue;
    item.pos = [
      Number(meta.pos?.[0] || 0) + dx,
      Number(meta.pos?.[1] || 0) + dy,
    ];
    item.size = [...(meta.size || item.size || [140, 80])];
    item.title = meta.title;
    item.flags = item.flags || {};
    item.flags.collapsed = !!meta.collapsed;
    restoreOwnValue(item, "color", meta.color);
    restoreOwnValue(item, "bgcolor", meta.bgcolor);
    restoreOwnValue(item, "_collapsed_width", meta.collapsedWidth);
    delete item.properties[META_KEY];
  }
  dirty();
}

function renameFoldGroup(node) {
  const group = groupFor(node);
  if (!group.length) return;

  const anchor = group.find((candidate) => foldMeta(candidate)?.index === 0) || node;
  const current = foldDisplayLabel(foldMeta(anchor));
  const initial = current === "Folded" ? "" : current;
  showRenameDialog(initial, (value) => {
    const label = normalizeFoldLabel(value);
    for (const item of group) {
      const meta = foldMeta(item);
      if (meta) meta.label = label;
    }
    refreshFoldedLooks();
    dirty();
  });
}

function closeRenameDialog() {
  if (!renameDialogEl) return;
  renameDialogEl.remove();
  renameDialogEl = null;
}

function showRenameDialog(initialValue, onSubmit) {
  if (typeof document === "undefined") return;
  closeRenameDialog();
  ensureVisualStyle();

  renameDialogEl = document.createElement("div");
  renameDialogEl.className = "deno-visual-rename-overlay";
  renameDialogEl.innerHTML = `
    <div class="deno-visual-rename-dialog" role="dialog" aria-modal="true" aria-label="Rename folded group">
      <div class="deno-visual-rename-title">Rename Fold Group</div>
      <div class="deno-visual-rename-help">Use a short label. Leave empty to show Folded.</div>
      <input class="deno-visual-rename-input" type="text" maxlength="${LABEL_MAX_LENGTH}" autocomplete="off" />
      <div class="deno-visual-rename-actions">
        <button type="button" class="deno-visual-rename-cancel">Cancel</button>
        <button type="button" class="deno-visual-rename-save">Save</button>
      </div>
    </div>
  `;

  const dialog = renameDialogEl.querySelector(".deno-visual-rename-dialog");
  const input = renameDialogEl.querySelector(".deno-visual-rename-input");
  const save = renameDialogEl.querySelector(".deno-visual-rename-save");
  const cancel = renameDialogEl.querySelector(".deno-visual-rename-cancel");
  input.value = normalizeFoldLabel(initialValue);

  const submit = () => {
    const value = input.value;
    closeRenameDialog();
    onSubmit?.(value);
  };
  const cancelDialog = () => closeRenameDialog();

  renameDialogEl.addEventListener("pointerdown", (event) => {
    if (!dialog.contains(event.target)) cancelDialog();
  });
  dialog.addEventListener("pointerdown", (event) => event.stopPropagation());
  save.addEventListener("click", submit);
  cancel.addEventListener("click", cancelDialog);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelDialog();
    }
  });

  document.body.appendChild(renameDialogEl);
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function ensureVisualStyle() {
  if (visualStyleInstalled || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    body.deno-visual-fold-hovering .p-tooltip,
    body.deno-visual-fold-hovering [data-pc-name="tooltip"],
    body.deno-visual-fold-hovering .node-tooltip,
    body.deno-visual-fold-hovering .litegraph-tooltip,
    body.deno-visual-fold-hovering .comfy-tooltip {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }

    .deno-visual-fold-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      min-width: 54px;
      padding: 0 12px;
      border: 1px solid rgba(82, 255, 145, 0.86);
      border-radius: 8px;
      background: rgba(6, 18, 10, 0.96);
      color: #dfffe8;
      cursor: pointer;
      font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
      white-space: nowrap;
    }

    .deno-visual-fold-button:hover {
      background: rgba(27, 118, 62, 0.98);
      border-color: rgba(110, 255, 165, 0.96);
      color: #ffffff;
    }

    .deno-visual-align-menu {
      position: fixed;
      z-index: 10001;
      display: none;
      width: 216px;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 8px;
      border: 1px solid rgba(82, 255, 145, 0.82);
      border-radius: 10px;
      background: rgba(4, 13, 8, 0.98);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.46), 0 0 0 1px rgba(82, 255, 145, 0.10) inset;
    }

    .deno-visual-align-item {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      min-height: 30px;
      padding: 0 9px;
      border: 1px solid rgba(90, 130, 104, 0.72);
      border-radius: 8px;
      background: rgba(9, 13, 11, 0.92);
      color: #dfffe8;
      cursor: pointer;
      font: 700 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      white-space: nowrap;
    }

    .deno-visual-align-item:hover {
      background: rgba(27, 118, 62, 0.98);
      border-color: rgba(110, 255, 165, 0.96);
      color: #ffffff;
    }

    .deno-visual-align-item:disabled {
      opacity: 0.42;
      cursor: default;
      background: rgba(9, 13, 11, 0.72);
      border-color: rgba(90, 130, 104, 0.38);
      color: #8aa093;
    }

    .deno-visual-align-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      color: #74ff9f;
      font: 900 13px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    .deno-visual-rename-overlay {
      position: fixed;
      inset: 0;
      z-index: 10020;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0, 0, 0, 0.26);
    }

    .deno-visual-rename-dialog {
      width: min(420px, calc(100vw - 36px));
      box-sizing: border-box;
      padding: 16px;
      border: 1px solid rgba(82, 255, 145, 0.86);
      border-radius: 12px;
      background: rgba(5, 15, 9, 0.98);
      box-shadow: 0 20px 54px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(82, 255, 145, 0.12) inset;
      color: #dfffe8;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .deno-visual-rename-title {
      color: #86ffad;
      font: 900 15px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin-bottom: 5px;
    }

    .deno-visual-rename-help {
      color: #9cd9ad;
      font: 700 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin-bottom: 12px;
    }

    .deno-visual-rename-input {
      width: 100%;
      height: 34px;
      box-sizing: border-box;
      border: 1px solid rgba(82, 255, 145, 0.6);
      border-radius: 8px;
      outline: none;
      background: rgba(2, 8, 5, 0.96);
      color: #ffffff;
      padding: 0 10px;
      font: 800 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .deno-visual-rename-input:focus {
      border-color: rgba(120, 255, 170, 0.96);
      box-shadow: 0 0 0 2px rgba(72, 255, 132, 0.18);
    }

    .deno-visual-rename-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }

    .deno-visual-rename-actions button {
      min-width: 74px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(82, 255, 145, 0.72);
      cursor: pointer;
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .deno-visual-rename-cancel {
      background: rgba(9, 13, 11, 0.92);
      color: #c9f7d5;
    }

    .deno-visual-rename-save {
      background: rgba(31, 120, 62, 0.98);
      color: #ffffff;
    }
  `;
  document.head?.appendChild(style);
  visualStyleInstalled = true;
}

function ensureTooltip() {
  if (tooltipEl || typeof document === "undefined") return tooltipEl;
  ensureVisualStyle();
  tooltipEl = document.createElement("div");
  tooltipEl.className = "deno-visual-fold-tooltip";
  tooltipEl.style.cssText = `
    position: fixed;
    z-index: 10000;
    display: none;
    min-width: 180px;
    max-width: 320px;
    padding: 10px 12px;
    border: 1px solid rgba(82, 255, 145, 0.85);
    border-radius: 10px;
    background: rgba(4, 13, 8, 0.96);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(82, 255, 145, 0.12) inset;
    color: #dfffe8;
    font: 600 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: none;
    white-space: normal;
  `;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = "none";
  document.body?.classList?.remove("deno-visual-fold-hovering");
}

function canvasEventToGraph(event) {
  const canvas = app.canvas;
  const element = canvas?.canvas;
  if (!canvas || !element) return null;

  if (typeof canvas.convertEventToCanvasOffset === "function") {
    return canvas.convertEventToCanvasOffset(event);
  }

  const rect = element.getBoundingClientRect();
  const scale = Number(canvas.ds?.scale || 1);
  const offset = canvas.ds?.offset || [0, 0];
  return [
    (event.clientX - rect.left) / scale - Number(offset[0] || 0),
    (event.clientY - rect.top) / scale - Number(offset[1] || 0),
  ];
}

function graphToClient(x, y) {
  const canvas = app.canvas;
  const element = canvas?.canvas;
  if (!canvas || !element) return null;

  const rect = element.getBoundingClientRect();
  if (typeof canvas.ds?.convertOffsetToCanvas === "function") {
    const point = canvas.ds.convertOffsetToCanvas([Number(x || 0), Number(y || 0)]);
    return [rect.left + point[0], rect.top + point[1]];
  }

  const scale = Number(canvas.ds?.scale || 1);
  const offset = canvas.ds?.offset || [0, 0];
  return [
    rect.left + (Number(x || 0) + Number(offset[0] || 0)) * scale,
    rect.top + (Number(y || 0) + Number(offset[1] || 0)) * scale,
  ];
}

function foldedAnchorAt(x, y) {
  return graphNodes().find((node) => {
    const meta = foldMeta(node);
    if (meta?.index !== 0) return false;
    const nx = Number(node.pos?.[0] || 0);
    const ny = Number(node.pos?.[1] || 0);
    const nw = Number(node.size?.[0] || CHIP_W);
    const nh = Number(node.size?.[1] || CHIP_H);
    const titlePad = Number(typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TITLE_HEIGHT || 30 : 30);
    return x >= nx && x <= nx + nw && y >= ny - titlePad && y <= ny + nh;
  });
}

function foldedAnchorAtClient(clientX, clientY) {
  return graphNodes().find((node) => {
    const meta = foldMeta(node);
    if (meta?.index !== 0) return false;
    const pos = node.pos || [0, 0];
    const size = node.size || [CHIP_W, CHIP_H];
    const topLeft = graphToClient(pos[0], pos[1]);
    const bottomRight = graphToClient(Number(pos[0] || 0) + Number(size[0] || CHIP_W), Number(pos[1] || 0) + Number(size[1] || CHIP_H));
    if (!topLeft || !bottomRight) return false;
    return clientX >= topLeft[0]
      && clientX <= bottomRight[0]
      && clientY >= topLeft[1]
      && clientY <= bottomRight[1];
  });
}

function foldedAnchorFromEvent(event) {
  const point = canvasEventToGraph(event);
  if (!point) return null;
  return foldedAnchorAt(point[0], point[1]);
}

function foldedAnchorFromCanvas(canvas) {
  const target = canvas || app.canvas;
  const hoverNode = target?.node_over || target?.node_dragged;
  if (foldMeta(hoverNode)) {
    return foldMeta(hoverNode)?.index === 0
      ? hoverNode
      : groupFor(hoverNode).find((node) => foldMeta(node)?.index === 0) || hoverNode;
  }

  const graphMouse = target?.graph_mouse || app.canvas?.graph_mouse;
  if (Array.isArray(graphMouse)) {
    const anchor = foldedAnchorAt(graphMouse[0], graphMouse[1]);
    if (anchor) return anchor;
  }

  if (lastCanvasPointerEvent) {
    const anchor = foldedAnchorFromEvent(lastCanvasPointerEvent)
      || foldedAnchorAtClient(lastCanvasPointerEvent.clientX, lastCanvasPointerEvent.clientY);
    if (anchor) return anchor;
  }

  return null;
}

function foldedTitles(node) {
  return groupFor(node)
    .sort((a, b) => Number(foldMeta(a)?.index || 0) - Number(foldMeta(b)?.index || 0))
    .map((item) => {
      const meta = foldMeta(item);
      return meta?.title || item.title || item.type || `Node ${item.id}`;
    });
}

function updateHoverTooltip(event) {
  const anchor = foldedAnchorFromEvent(event);
  if (!anchor) {
    hideTooltip();
    return;
  }

  const titles = foldedTitles(anchor);
  const tooltip = ensureTooltip();
  if (!tooltip) return;

  const rows = titles.slice(0, HOVER_MAX_ITEMS).map((title) => `<div style="margin-top:4px; color:#c7fbd1;">${escapeHtml(title)}</div>`);
  const more = titles.length > HOVER_MAX_ITEMS
    ? `<div style="margin-top:6px; color:#8feaa8;">+ ${titles.length - HOVER_MAX_ITEMS} more</div>`
    : "";
  tooltip.innerHTML = `
    <div style="margin-bottom:6px; color:#65ff98;">${escapeHtml(foldDisplayLabel(foldMeta(anchor)))} nodes · ${titles.length}</div>
    ${rows.join("")}
    ${more}
  `;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.style.display = "block";
  document.body?.classList?.add("deno-visual-fold-hovering");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncFoldedMotion() {
  refreshFoldedLooks();
}

function handleCanvasMove(event) {
  lastCanvasPointerEvent = event;
  syncFoldedMotion();
  updateHoverTooltip(event);
}

function rememberCanvasPointer(event) {
  lastCanvasPointerEvent = event;
}

function setupMouseTracking() {
  const element = app.canvas?.canvas;
  if (!element || element.__denoVisualFoldMouseBound) return;

  element.addEventListener("mousemove", handleCanvasMove, { passive: true });
  element.addEventListener("pointermove", syncFoldedMotion, { passive: true });
  element.addEventListener("pointerdown", rememberCanvasPointer, { passive: true });
  element.addEventListener("contextmenu", rememberCanvasPointer, { passive: true });
  element.addEventListener("mouseleave", hideTooltip, { passive: true });
  element.__denoVisualFoldMouseBound = true;
}

function ensureFoldButton() {
  if (foldButtonEl || typeof document === "undefined") return foldButtonEl;
  ensureVisualStyle();
  foldButtonEl = document.createElement("button");
  foldButtonEl.type = "button";
  foldButtonEl.className = "deno-visual-fold-button";
  foldButtonEl.textContent = FLOAT_BUTTON_LABEL;
  foldButtonEl.title = "Fold selected nodes";
  foldButtonEl.setAttribute("aria-label", "Deno Fold Selected Nodes");
  foldButtonEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  foldButtonEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const folded = selectedNodes().find((node) => foldMeta(node));
    if (folded) {
      unfoldGroup(folded);
      updateFoldButton();
      return;
    }

    const clean = selectedNodes().filter((node) => !foldMeta(node));
    if (clean.length > 1) {
      foldNodes(clean);
      updateFoldButton();
    }
  });
  return foldButtonEl;
}

function ensureRenameButton() {
  if (renameButtonEl || typeof document === "undefined") return renameButtonEl;
  ensureVisualStyle();
  renameButtonEl = document.createElement("button");
  renameButtonEl.type = "button";
  renameButtonEl.className = "deno-visual-fold-button deno-visual-rename-button";
  renameButtonEl.textContent = FLOAT_RENAME_LABEL;
  renameButtonEl.title = "Rename this folded group";
  renameButtonEl.setAttribute("aria-label", "Deno Rename Fold Group");
  renameButtonEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  renameButtonEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const folded = selectedNodes().find((node) => foldMeta(node))
      || foldedAnchorFromCanvas(app.canvas);
    if (folded) {
      renameFoldGroup(folded);
      updateFoldButton();
      updateRenameButton();
    }
  });
  return renameButtonEl;
}

function nodeSize(node) {
  if (node?.flags?.collapsed) {
    const collapsedWidth = Number(node._collapsed_width || node.size?.[0] || CHIP_W);
    const collapsedHeight = Number(typeof LiteGraph !== "undefined" ? LiteGraph.NODE_TITLE_HEIGHT || CHIP_H : CHIP_H);
    return [
      Math.max(0, collapsedWidth),
      Math.max(0, collapsedHeight),
    ];
  }
  const raw = node?.size || [];
  return [
    Math.max(0, Number(raw[0] || 0)),
    Math.max(0, Number(raw[1] || 0)),
  ];
}

function moveNode(node, x, y) {
  if (!node) return;
  node.pos = node.pos || [0, 0];
  if (Number.isFinite(x)) node.pos[0] = x;
  if (Number.isFinite(y)) node.pos[1] = y;
}

function alignSelectedNodes(action) {
  const nodes = selectedAlignNodes();
  if (nodes.length < 2) return;

  const box = selectedBounds(nodes);
  if (!box) return;

  for (const node of nodes) {
    const [w, h] = nodeSize(node);
    if (action === "left") moveNode(node, box.minX, null);
    else if (action === "right") moveNode(node, box.maxX - w, null);
    else if (action === "top") moveNode(node, null, box.minY);
    else if (action === "bottom") moveNode(node, null, box.maxY - h);
  }
  dirty();
}

function distributeSelectedNodes(axis) {
  const nodes = selectedAlignNodes();
  if (nodes.length < 3) return;

  const box = selectedBounds(nodes);
  if (!box) return;

  const isHorizontal = axis === "horizontal";
  const sorted = [...nodes].sort((a, b) => {
    const av = Number(a.pos?.[isHorizontal ? 0 : 1] || 0);
    const bv = Number(b.pos?.[isHorizontal ? 0 : 1] || 0);
    return av - bv;
  });
  const start = isHorizontal ? box.minX : box.minY;
  const end = isHorizontal ? box.maxX : box.maxY;
  const total = sorted.reduce((sum, node) => {
    const size = nodeSize(node);
    return sum + size[isHorizontal ? 0 : 1];
  }, 0);
  const gap = Math.max(0, (end - start - total) / (sorted.length - 1));

  let cursor = start;
  for (const node of sorted) {
    const size = nodeSize(node);
    if (isHorizontal) moveNode(node, cursor, null);
    else moveNode(node, null, cursor);
    cursor += size[isHorizontal ? 0 : 1] + gap;
  }
  dirty();
}

function runAlignAction(action) {
  hideAlignMenu();
  if (action === "horizontal") distributeSelectedNodes("horizontal");
  else if (action === "vertical") distributeSelectedNodes("vertical");
  else alignSelectedNodes(action);
  updateFoldButton();
  updateAlignButton();
}

function ensureAlignMenu() {
  if (alignMenuEl || typeof document === "undefined") return alignMenuEl;
  ensureVisualStyle();
  alignMenuEl = document.createElement("div");
  alignMenuEl.className = "deno-visual-align-menu";
  alignMenuEl.setAttribute("role", "menu");

  const items = [
    ["left", "|<", "Left", "Align Left"],
    ["right", ">|", "Right", "Align Right"],
    ["top", "^", "Top", "Align Top"],
    ["bottom", "v", "Bottom", "Align Bottom"],
    ["horizontal", "<->", "Space H", "Distribute Horizontal"],
    ["vertical", "^v", "Space V", "Distribute Vertical"],
  ];
  for (const [action, icon, label, title] of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deno-visual-align-item";
    button.title = title;
    button.dataset.action = action;
    button.setAttribute("role", "menuitem");
    button.innerHTML = `<span class="deno-visual-align-icon">${escapeHtml(icon)}</span><span>${escapeHtml(label)}</span>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runAlignAction(action);
    });
    alignMenuEl.appendChild(button);
  }

  document.body.appendChild(alignMenuEl);
  document.addEventListener("pointerdown", (event) => {
    if (!alignMenuEl || alignMenuEl.style.display === "none") return;
    if (alignMenuEl.contains(event.target) || alignButtonEl?.contains(event.target)) return;
    hideAlignMenu();
  }, true);
  window.addEventListener("resize", hideAlignMenu, { passive: true });
  return alignMenuEl;
}

function hideAlignMenu() {
  if (alignMenuEl) {
    alignMenuEl.style.display = "none";
  }
}

function showAlignMenu() {
  const menu = ensureAlignMenu();
  if (!menu || !alignButtonEl) return;

  const rect = alignButtonEl.getBoundingClientRect();
  const canDistribute = selectedAlignNodes().length >= 3;
  for (const button of menu.querySelectorAll(".deno-visual-align-item")) {
    const isDistribution = button.dataset.action === "horizontal" || button.dataset.action === "vertical";
    button.disabled = isDistribution && !canDistribute;
  }
  menu.style.display = "grid";
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - menuRect.width - 8),
  );
  const top = Math.min(
    rect.bottom + 8,
    Math.max(8, window.innerHeight - menuRect.height - 8),
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function toggleAlignMenu() {
  if (alignMenuEl?.style.display === "grid") hideAlignMenu();
  else showAlignMenu();
}

function ensureAlignButton() {
  if (alignButtonEl || typeof document === "undefined") return alignButtonEl;
  ensureVisualStyle();
  alignButtonEl = document.createElement("button");
  alignButtonEl.type = "button";
  alignButtonEl.className = "deno-visual-fold-button deno-visual-align-button";
  alignButtonEl.textContent = FLOAT_ALIGN_LABEL;
  alignButtonEl.title = "Align or distribute selected nodes";
  alignButtonEl.setAttribute("aria-label", "Deno Align Selected Nodes");
  alignButtonEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  alignButtonEl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleAlignMenu();
  });
  return alignButtonEl;
}

function selectedBounds(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const x = Number(node.pos?.[0] || 0);
    const y = Number(node.pos?.[1] || 0);
    const [w, h] = nodeSize(node);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function selectionToolbarContent() {
  if (typeof document === "undefined") return null;
  return document.querySelector(".selection-toolbox .p-panel-content");
}

function detachFoldButton() {
  if (foldButtonEl?.parentElement) {
    foldButtonEl.parentElement.removeChild(foldButtonEl);
  }
}

function detachRenameButton() {
  if (renameButtonEl?.parentElement) {
    renameButtonEl.parentElement.removeChild(renameButtonEl);
  }
}

function detachAlignButton() {
  hideAlignMenu();
  if (alignButtonEl?.parentElement) {
    alignButtonEl.parentElement.removeChild(alignButtonEl);
  }
}

function attachFoldButtonToToolbar(button) {
  const toolbar = selectionToolbarContent();
  if (!toolbar) {
    detachFoldButton();
    return false;
  }

  if (button.parentElement !== toolbar) {
    const more = toolbar.querySelector('[aria-label="More Options"]');
    if (more) toolbar.insertBefore(button, more);
    else toolbar.appendChild(button);
  }
  return true;
}

function attachAlignButtonToToolbar(button) {
  const toolbar = selectionToolbarContent();
  if (!toolbar) {
    detachAlignButton();
    return false;
  }

  if (button.parentElement !== toolbar) {
    const reference = foldButtonEl?.parentElement === toolbar
      ? foldButtonEl.nextSibling
      : toolbar.querySelector('[aria-label="More Options"]');
    toolbar.insertBefore(button, reference || null);
  }
  return true;
}

function attachRenameButtonToToolbar(button) {
  const toolbar = selectionToolbarContent();
  if (!toolbar) {
    detachRenameButton();
    return false;
  }

  if (button.parentElement !== toolbar) {
    const reference = foldButtonEl?.parentElement === toolbar
      ? foldButtonEl.nextSibling
      : toolbar.querySelector('[aria-label="More Options"]');
    toolbar.insertBefore(button, reference || null);
  }
  return true;
}

function updateFoldButton() {
  const button = ensureFoldButton();
  if (!button) return;

  const selected = selectedNodes();
  const folded = selected.find((node) => foldMeta(node));
  const clean = selected.filter((node) => !foldMeta(node));
  const actionNodes = folded ? [folded] : clean;
  const action = folded ? FLOAT_UNFOLD_LABEL : FLOAT_BUTTON_LABEL;

  if ((!folded && clean.length < 2) || !actionNodes.length) {
    detachFoldButton();
    return;
  }

  if (!selectedBounds(actionNodes) || !attachFoldButtonToToolbar(button)) {
    detachFoldButton();
    return;
  }

  button.textContent = !folded && clean.length > 9 ? `Fold ${clean.length}` : action;
  button.title = folded ? "Unfold this group" : "Fold selected nodes";
  button.setAttribute("aria-label", folded ? "Deno Unfold Group" : "Deno Fold Selected Nodes");
}

function updateRenameButton() {
  const button = ensureRenameButton();
  if (!button) return;

  const folded = selectedNodes().find((node) => foldMeta(node));
  if (!folded || !selectedBounds([folded]) || !attachRenameButtonToToolbar(button)) {
    detachRenameButton();
    return;
  }

  button.textContent = FLOAT_RENAME_LABEL;
  button.title = "Rename this folded group";
}

function updateAlignButton() {
  const button = ensureAlignButton();
  if (!button) return;

  const clean = selectedAlignNodes();
  if (clean.length < 2) {
    detachAlignButton();
    return;
  }

  if (!selectedBounds(clean) || !attachAlignButtonToToolbar(button)) {
    detachAlignButton();
    return;
  }
}

function refreshFoldedLooks() {
  const anchors = graphNodes().filter((node) => foldMeta(node)?.index === 0);
  for (const anchor of anchors) {
    const anchorMeta = foldMeta(anchor);
    if (!anchorMeta) continue;
    const visualBasePos = [...(anchor.pos || anchorMeta.basePos || [0, 0])];
    applyFoldLook(anchor, anchorMeta, visualBasePos, true);

    for (const item of groupFor(anchor)) {
      const meta = foldMeta(item);
      if (!meta || meta.index === 0) continue;
      applyFoldLook(item, meta, visualBasePos, false);
    }
  }
}

function setupOverlayLoop() {
  setupMouseTracking();
  if (overlayTimer) return;
  overlayTimer = setInterval(() => {
    setupMouseTracking();
    refreshFoldedLooks();
    updateFoldButton();
    updateRenameButton();
    updateAlignButton();
  }, 140);
}

function addFoldMenuOptions(node, options) {
  if (!node || !Array.isArray(options)) return;

  const meta = foldMeta(node);
  if (meta) {
    const items = [];
    if (!hasMenuItem(options, RENAME_LABEL)) {
      items.push({
        content: RENAME_LABEL,
        callback: () => renameFoldGroup(node),
      });
    }
    if (!hasMenuItem(options, UNFOLD_LABEL)) {
      items.push({
        content: UNFOLD_LABEL,
        callback: () => unfoldGroup(node),
      });
    }
    if (items.length) options.unshift(...items);
    return;
  }

  const selected = selectedNodes(node).filter((item) => !foldMeta(item));
  if (selected.length && !hasMenuItem(options, FOLD_LABEL)) {
    options.unshift({
      content: selected.length > 1 ? `${FOLD_LABEL} (${selected.length})` : FOLD_LABEL,
      callback: () => foldNodes(selected),
    });
  }
}

function addAlignMenuOptions(options, fallbackNode = null) {
  if (!Array.isArray(options)) return;

  const selected = selectedAlignNodes(fallbackNode);
  if (selected.length < 2 || hasMenuItem(options, ALIGN_MENU_PREFIX)) return;

  const items = [
    {
      content: `${ALIGN_MENU_PREFIX} Left`,
      callback: () => alignSelectedNodes("left"),
    },
    {
      content: `${ALIGN_MENU_PREFIX} Right`,
      callback: () => alignSelectedNodes("right"),
    },
    {
      content: `${ALIGN_MENU_PREFIX} Top`,
      callback: () => alignSelectedNodes("top"),
    },
    {
      content: `${ALIGN_MENU_PREFIX} Bottom`,
      callback: () => alignSelectedNodes("bottom"),
    },
  ];
  if (selected.length >= 3) {
    items.push(
      {
        content: `${ALIGN_MENU_PREFIX} Space Horizontal`,
        callback: () => distributeSelectedNodes("horizontal"),
      },
      {
        content: `${ALIGN_MENU_PREFIX} Space Vertical`,
        callback: () => distributeSelectedNodes("vertical"),
      },
    );
  }
  options.unshift(...items, null);
}

function hasMenuItem(options, label) {
  return options.some((item) => {
    const content = item && typeof item === "object" ? item.content : null;
    return typeof content === "string" && content.startsWith(label);
  });
}

function addSelectedMenuOptions(options) {
  const selected = selectedNodes();
  const folded = selected.find((node) => foldMeta(node));
  const clean = selected.filter((node) => !foldMeta(node));

  const items = [];
  if (folded && !hasMenuItem(options, RENAME_LABEL)) {
    items.push({
      content: RENAME_LABEL,
      callback: () => renameFoldGroup(folded),
    });
  }
  if (folded && !hasMenuItem(options, UNFOLD_LABEL)) {
    items.push({
      content: UNFOLD_LABEL,
      callback: () => unfoldGroup(folded),
    });
  }
  if (clean.length && !hasMenuItem(options, FOLD_LABEL)) {
    items.push({
      content: clean.length > 1 ? `${FOLD_LABEL} (${clean.length})` : FOLD_LABEL,
      callback: () => foldNodes(clean),
    });
  }

  if (items.length) {
    options.unshift(...items, null);
  }
}

function patchMenuTarget(target) {
  if (!target || target.__denoVisualFoldMenuPatched) return;
  const original = target.getExtraMenuOptions;
  target.getExtraMenuOptions = function (_canvas, options) {
    const result = original?.apply(this, arguments);

    if (Array.isArray(options)) {
      addFoldMenuOptions(this, options);
      addAlignMenuOptions(options, this);
      return result;
    }

    if (Array.isArray(result)) {
      addFoldMenuOptions(this, result);
      addAlignMenuOptions(result, this);
      return result;
    }

    const created = [];
    addFoldMenuOptions(this, created);
    addAlignMenuOptions(created, this);
    if (created.length) return created;
    return result;
  };
  target.__denoVisualFoldMenuPatched = true;
}

function patchCanvasMenu() {
  const target = canvasPrototype();
  if (!target) return false;

  if (!target.__denoVisualFoldCanvasMenuPatched) {
    const original = target.getCanvasMenuOptions;
    target.getCanvasMenuOptions = function () {
      const options = original?.apply(this, arguments) || [];
      if (Array.isArray(options)) {
        const foldedAnchor = foldedAnchorFromCanvas(this);
        if (foldedAnchor) addFoldMenuOptions(foldedAnchor, options);
        addSelectedMenuOptions(options);
        addAlignMenuOptions(options);
      }
      return options;
    };
    target.__denoVisualFoldCanvasMenuPatched = true;
  }

  if (!target.__denoVisualFoldNodeMenuPatched && typeof target.getNodeMenuOptions === "function") {
    const original = target.getNodeMenuOptions;
    target.getNodeMenuOptions = function (node) {
      const options = original?.apply(this, arguments) || [];
      if (Array.isArray(options)) {
        const targetNode = node || this.node_over || this.node_dragged || foldedAnchorFromCanvas(this);
        addFoldMenuOptions(targetNode, options);
        addAlignMenuOptions(options, targetNode);
      }
      return options;
    };
    target.__denoVisualFoldNodeMenuPatched = true;
  }

  return true;
}

function patchNodeDrawing() {
  const target = canvasPrototype();
  if (!target) return false;
  if (target.__denoVisualFoldDrawPatched || typeof target.drawNode !== "function") return true;

  const original = target.drawNode;
  target.drawNode = function (node) {
    if (isHiddenFoldMember(node)) return;
    return original.apply(this, arguments);
  };
  target.__denoVisualFoldDrawPatched = true;
  return true;
}

function patchMotionSync() {
  const target = canvasPrototype();
  if (!target) return false;
  if (target.__denoVisualFoldMotionPatched) return true;

  const original = target.processMouseMove;
  if (typeof original === "function") {
    target.processMouseMove = function () {
      const result = original.apply(this, arguments);
      syncFoldedMotion();
      return result;
    };
  }
  target.__denoVisualFoldMotionPatched = true;
  return true;
}

function patchExistingNodes() {
  for (const node of graphNodes()) {
    patchMenuTarget(node);
  }
}

function installLatePatches(attempt = 0) {
  const patchedCanvas = patchCanvasMenu();
  const patchedDrawing = patchNodeDrawing();
  const patchedMotion = patchMotionSync();
  patchExistingNodes();
  setupOverlayLoop();
  if ((!patchedCanvas || !patchedDrawing || !patchedMotion || attempt < 8) && attempt < 20) {
    setTimeout(() => installLatePatches(attempt + 1), 250);
  }
}

app.registerExtension({
  name: EXTENSION_NAME,
  setup() {
    installLatePatches();
  },
  async beforeRegisterNodeDef(nodeType) {
    patchMenuTarget(nodeType?.prototype);
  },
  nodeCreated(node) {
    patchMenuTarget(node);
  },
});
