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
const FLOAT_BUTTON_LABEL = "Fold";
const FLOAT_UNFOLD_LABEL = "Unfold";

let tooltipEl = null;
let foldButtonEl = null;
let overlayTimer = null;
let visualStyleInstalled = false;

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
  if (fallback && !result.includes(fallback)) {
    result.push(fallback);
  }
  return Array.from(new Set(result)).filter(Boolean);
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

function baseMeta(node, groupId, index, count, anchorId, baseX, baseY) {
  return {
    version: 1,
    groupId,
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
  if (meta.index === 0) {
    node.size = [CHIP_W, CHIP_H];
    if (!preserveAnchorPos) {
      node.pos = [...basePos];
    }
    node.title = `Folded · ${meta.count}  ›`;
    node.color = "#178947";
    node.bgcolor = "#07180f";
    node._collapsed_width = CHIP_W;
    return;
  }

  node.size = [HIDDEN_W, HIDDEN_H];
  node.pos = [...basePos];
  node.title = HIDDEN_TITLE;
  node.color = "#07180f";
  node.bgcolor = "#07180f";
  node._collapsed_width = CHIP_W;
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
    <div style="margin-bottom:6px; color:#65ff98;">Folded nodes · ${titles.length}</div>
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
  syncFoldedMotion();
  updateHoverTooltip(event);
}

function setupMouseTracking() {
  const element = app.canvas?.canvas;
  if (!element || element.__denoVisualFoldMouseBound) return;

  element.addEventListener("mousemove", handleCanvasMove, { passive: true });
  element.addEventListener("pointermove", syncFoldedMotion, { passive: true });
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

function selectedBounds(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const node of nodes) {
    const x = Number(node.pos?.[0] || 0);
    const y = Number(node.pos?.[1] || 0);
    const w = Number(node.size?.[0] || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX)) {
    return null;
  }
  return { minX, minY, maxX };
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
  }, 140);
}

function addFoldMenuOptions(node, options) {
  if (!node || !Array.isArray(options)) return;

  const meta = foldMeta(node);
  if (meta) {
    if (!hasMenuItem(options, UNFOLD_LABEL)) {
      options.unshift({
        content: UNFOLD_LABEL,
        callback: () => unfoldGroup(node),
      });
    }
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
      return result;
    }

    if (Array.isArray(result)) {
      addFoldMenuOptions(this, result);
      return result;
    }

    const created = [];
    addFoldMenuOptions(this, created);
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
        addSelectedMenuOptions(options);
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
        addFoldMenuOptions(node || this.node_over || this.node_dragged, options);
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
