import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// (Deno) Video Preview — drop-in full-resolution video preview. The backend
// encodes a real H.264 mp4 (with +faststart) into ComfyUI temp under one
// stable per-node filename; this widget just plays that file inline with a
// native <video> element. Deliberately simple: no streamed transcode and no
// advanced-preview state machine, so the inline preview stays reliable when
// the node is wired into a graph.

const NODE_NAME = "DenoVideoPreview";
const WIDGET_NAME = "deno_video_preview";
const NODE_MIN_W = 320;
// Compact starting height only. The first successful preview may fit once,
// but user-resized nodes keep their chosen size across later runs.
const NODE_DEFAULT_H = 200;
const PREVIEW_MIN_H = 120;
const NODE_VERTICAL_CHROME = 90;
const MANUAL_SIZE_PROP = "__denoVideoPreviewManualSize";

const CSS = `
.dvprev{position:absolute;inset:0;overflow:hidden;background:#000;
  font:11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.dvprev video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
.dvprev .st{position:absolute;left:0;right:0;bottom:0;padding:4px 8px;
  font-size:11px;color:#9dffba;text-align:center;cursor:pointer;
  background:rgba(5,9,6,.74)}
.dvprev .st[hidden]{display:none}
.dvprev .fs{position:absolute;right:7px;top:7px;padding:3px 9px;
  font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#bdffd2;background:rgba(5,9,6,.6);border:1px solid rgba(120,255,160,.4);
  border-radius:6px;cursor:pointer;user-select:none;opacity:.8;z-index:2}
.dvprev .fs:hover{opacity:1;background:rgba(12,32,18,.92)}
.dvprev .mi{position:absolute;left:7px;top:7px;max-width:calc(100% - 150px);
  padding:3px 8px;font:700 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#dfffea;background:rgba(5,9,6,.66);border:1px solid rgba(72,255,132,.38);
  border-radius:6px;user-select:none;pointer-events:none;opacity:.88;z-index:2;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dvprev .mi[hidden]{display:none}
`;

function ensureStyles() {
  if (document.getElementById("deno-video-preview-css")) return;
  const s = document.createElement("style");
  s.id = "deno-video-preview-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function installMiddleMouseCanvasPan(root) {
  let activePanCleanup = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;
    const canvas = app.canvas;
    if (!canvas?.ds?.offset) return;

    e.preventDefault();
    e.stopPropagation();

    let lastX = e.clientX;
    let lastY = e.clientY;
    let active = true;

    const cleanup = () => {
      if (!active) return;
      active = false;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", done, true);
      window.removeEventListener("pointercancel", done, true);
      if (activePanCleanup === cleanup) activePanCleanup = null;
    };
    const move = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const scale = canvas.ds.scale || 1;
      canvas.ds.offset[0] += (ev.clientX - lastX) / scale;
      canvas.ds.offset[1] += (ev.clientY - lastY) / scale;
      lastX = ev.clientX;
      lastY = ev.clientY;

      if (canvas.setDirty) canvas.setDirty(true, true);
      else app.graph?.setDirtyCanvas?.(true, true);
    };
    const done = (ev) => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      cleanup();
    };

    activePanCleanup?.();
    activePanCleanup = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", done, true);
    window.addEventListener("pointercancel", done, true);
  }, true);

  root.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  return () => {
    activePanCleanup?.();
    activePanCleanup = null;
  };
}

function ensureProperties(node) {
  if (!node.properties) node.properties = {};
  return node.properties;
}

function isManualSized(node) {
  return Boolean(node?.properties?.[MANUAL_SIZE_PROP]);
}

function setManualSized(node, value) {
  const props = ensureProperties(node);
  if (value) props[MANUAL_SIZE_PROP] = true;
  else delete props[MANUAL_SIZE_PROP];
}

function syncAudioMute(state) {
  if (!state?.video) return;
  state.video.muted = !(state.hasAudio && state.hovering);
}

function formatFps(value) {
  const fps = Number(value) || 0;
  if (!(fps > 0)) return "";
  const rounded = Math.round(fps * 100) / 100;
  return `${Number.isInteger(rounded) ? Math.round(rounded) : rounded}fps`;
}

function formatDuration(frameCount, fps, fallbackDuration) {
  let seconds = 0;
  if (Number(frameCount) > 0 && Number(fps) > 0) {
    seconds = Number(frameCount) / Number(fps);
  } else if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) {
    seconds = Number(fallbackDuration);
  }
  if (!(seconds > 0)) return "";
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds * 10) / 10}s`;
}

function previewInfo(meta, video) {
  const width = Number(meta?.width) || Number(video?.videoWidth) || 0;
  const height = Number(meta?.height) || Number(video?.videoHeight) || 0;
  const fps = Number(meta?.frame_rate) || 0;
  const frameCount = Number(meta?.frame_count) || 0;
  const duration = formatDuration(frameCount, fps, Number(video?.duration));
  const parts = [];
  if (width > 0 && height > 0) parts.push(`${Math.round(width)}x${Math.round(height)}`);
  const fpsText = formatFps(fps);
  if (fpsText) parts.push(fpsText);
  if (frameCount > 0) parts.push(`${Math.round(frameCount)}f`);
  if (duration) parts.push(duration);

  const detail = [];
  if (width > 0 && height > 0) detail.push(`Resolution: ${Math.round(width)}x${Math.round(height)}`);
  if (fpsText) detail.push(`FPS: ${fpsText}`);
  if (frameCount > 0) detail.push(`Frames: ${Math.round(frameCount)}`);
  if (duration) detail.push(`Duration: ${duration}`);
  detail.push(meta?.has_audio ? "Audio: yes" : "Audio: no");

  return {
    label: parts.join(" | "),
    title: detail.join("\n"),
  };
}

function updateInfoBadge(state, meta) {
  if (!state?.infoBadge) return;
  const info = previewInfo(meta || state.currentMeta, state.video);
  if (!info.label) {
    state.infoBadge.hidden = true;
    state.infoBadge.textContent = "";
    state.infoBadge.title = "";
    return;
  }
  state.infoBadge.textContent = info.label;
  state.infoBadge.title = info.title || "Video info";
  state.infoBadge.hidden = false;
}

function nativeWidgetsHeight(node) {
  const rowH = (window.LiteGraph && window.LiteGraph.NODE_WIDGET_HEIGHT) || 20;
  let height = 0;
  for (const widget of node.widgets || []) {
    if (widget === node.__dvprev?.widget || widget.name === WIDGET_NAME) continue;
    if (widget.hidden) continue;
    let widgetHeight = rowH;
    if (typeof widget.computeSize === "function") {
      const computed = widget.computeSize(node.size?.[0] || NODE_MIN_W);
      widgetHeight = computed && computed[1] > 0 ? computed[1] : 0;
    }
    if (widgetHeight > 0) height += widgetHeight + 4;
  }
  return height;
}

function desiredNodeHeightForAspect(node, aspectRatio) {
  const width = Math.max(Number(node.size?.[0]) || NODE_MIN_W, NODE_MIN_W);
  const previewWidth = Math.max(width - 20, 80);
  const previewHeight = previewWidth / aspectRatio;
  return Math.max(
    NODE_DEFAULT_H,
    Math.round(previewHeight + nativeWidgetsHeight(node) + NODE_VERTICAL_CHROME)
  );
}

function setNodeSize(node, size, state) {
  const st = state || node.__dvprev;
  if (!node.setSize) return;
  if (st) st.autoSizing = true;
  node.setSize(size);
  queueMicrotask(() => {
    if (st) st.autoSizing = false;
  });
}

function maybeFitNodeToAspect(node, aspectRatio, state) {
  const st = state || node.__dvprev;
  if (!st || !(aspectRatio > 0) || st.autoFitApplied || isManualSized(node)) {
    return;
  }
  const width = Math.max(Number(node.size?.[0]) || NODE_MIN_W, NODE_MIN_W);
  const height = desiredNodeHeightForAspect(node, aspectRatio);
  st.autoFitApplied = true;
  if (Math.abs((Number(node.size?.[1]) || 0) - height) > 6) {
    setNodeSize(node, [width, height], st);
  }
}

function installManualResizeTracking(node) {
  if (node.__dvprevResizeWrapped) return;
  node.__dvprevResizeWrapped = true;
  const originalOnResize = node.onResize;
  node.onResize = function () {
    const result = originalOnResize?.apply(this, arguments);
    const st = this.__dvprev;
    if (st?.resizeTrackingArmed && !st.autoSizing) {
      st.userSized = true;
      setManualSized(this, true);
    }
    return result;
  };
}

function buildDom(node) {
  if (node.__dvprev) return node.__dvprev;
  ensureStyles();

  const state = {
    root: null, video: null, status: null, infoBadge: null, widget: null,
    lastSrc: "", hasAudio: false, aspectRatio: 0,
    autoFitApplied: false, autoSizing: false,
    userSized: isManualSized(node), resizeTrackingArmed: false,
    hovering: false,
    currentMeta: null,
  };
  node.__dvprev = state;

  const root = document.createElement("div");
  root.className = "dvprev";

  const video = document.createElement("video");
  // No player chrome — behave like the VHS preview: a clean auto-looping
  // clip, muted by default (browsers require it for autoplay), unmuted
  // only while the pointer is over it (handlers below).
  video.controls = false;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "metadata";

  const status = document.createElement("div");
  status.className = "st";
  status.textContent = "Run to preview the encoded video.";
  status.onclick = () => {
    if (node.__dvprev?.lastSrc) window.open(node.__dvprev.lastSrc, "_blank");
  };

  const infoBadge = document.createElement("div");
  infoBadge.className = "mi";
  infoBadge.hidden = true;

  const fsBtn = document.createElement("div");
  fsBtn.className = "fs";
  fsBtn.textContent = "⛶ Full screen";
  fsBtn.title = "Full screen";
  fsBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  fsBtn.addEventListener("click", (e) => {
    e.stopPropagation();          // don't also toggle play/pause
    e.preventDefault();
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (root.requestFullscreen) {
        root.requestFullscreen();
      }
    } catch (err) { /* fullscreen blocked - ignore */ }
  });

  root.appendChild(video);
  root.appendChild(infoBadge);
  root.appendChild(status);
  root.appendChild(fsBtn);

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, {
    serialize: false,
    hideOnZoom: false,
  });
  state.root = root;
  state.video = video;
  state.status = status;
  state.infoBadge = infoBadge;
  state.widget = widget;

  // Fill the user-chosen node height, but subtract the same fixed chrome
  // allowance used by the stable video compare widget. If the subtraction is
  // too small, LiteGraph feeds widget height back into node height and grows.
  widget.computeSize = function (width) {
    const nodeHeight = Number(node.size?.[1]) || NODE_DEFAULT_H;
    return [
      Math.max(Number(width) || NODE_MIN_W, NODE_MIN_W),
      Math.max(PREVIEW_MIN_H, nodeHeight - NODE_VERTICAL_CHROME - nativeWidgetsHeight(node)),
    ];
  };

  video.addEventListener("loadedmetadata", () => {
    status.hidden = true;
    if (video.videoWidth && video.videoHeight) {
      state.aspectRatio = video.videoWidth / video.videoHeight;
      maybeFitNodeToAspect(node, state.aspectRatio, state);
      node.setDirtyCanvas?.(true, true);
    }
    updateInfoBadge(state);
    const playResult = video.play?.();
    if (playResult?.then) {
      playResult.then(() => syncAudioMute(state)).catch(() => syncAudioMute(state));
    } else {
      syncAudioMute(state);
    }
  });
  video.addEventListener("error", () => {
    status.hidden = false;
    status.textContent = "Inline preview failed. Click to open the video.";
  });

  installManualResizeTracking(node);
  queueMicrotask(() => { state.resizeTrackingArmed = true; });

  // NOTE: deliberately NO ResizeObserver. Widget height follows the node
  // height with a fixed chrome subtraction, so user resizing fills the inside
  // while avoiding the old measured observe -> setSize loop.

  // Browsers block unmuted autoplay, so the inline preview starts muted.
  // When the encoded file actually has an audio track, unmute while the
  // pointer is over the preview (mirrors the familiar VHS hover-to-hear
  // behaviour) and clear the hint once the user has heard it.
  root.addEventListener("pointerenter", () => {
    state.hovering = true;
    syncAudioMute(state);
  });
  root.addEventListener("pointerleave", () => {
    state.hovering = false;
    syncAudioMute(state);
  });

  // Click toggles play/pause (no player chrome, so this is the control).
  video.addEventListener("click", (e) => {
    e.preventDefault();
    if (video.paused) video.play?.().catch(() => {});
    else video.pause();
  });

  // The DOM widget sits above the LiteGraph <canvas> and would otherwise
  // swallow the wheel, blocking ComfyUI's zoom while the pointer is over
  // the preview. Re-dispatch the wheel to the real canvas at the same
  // screen point so canvas zoom keeps working over the node.
  root.addEventListener("wheel", (e) => {
    const cv = app.canvas?.canvas;
    if (!cv) return;
    e.preventDefault();
    cv.dispatchEvent(new WheelEvent("wheel", {
      deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
      deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY,
      bubbles: true, cancelable: true,
    }));
  }, { passive: false });
  state.panCleanup = installMiddleMouseCanvasPan(root);

  return state;
}

function handleExecuted(node, output) {
  const list = Array.isArray(output?.deno_video_preview)
    ? output.deno_video_preview
    : null;
  const meta = list && list[0];
  if (!meta || !meta.filename) return;

  const st = buildDom(node);
  st.currentMeta = meta;
  st.hasAudio = !!meta.has_audio;
  const metaWidth = Number(meta.width) || 0;
  const metaHeight = Number(meta.height) || 0;
  if (metaWidth > 0 && metaHeight > 0) {
    st.aspectRatio = metaWidth / metaHeight;
    maybeFitNodeToAspect(node, st.aspectRatio, st);
  }
  const params = new URLSearchParams({
    filename: meta.filename,
    subfolder: meta.subfolder || "",
    type: meta.type || "temp",
    // stable filename across runs -> bust the browser cache each execution
    rand: String(Date.now()),
  });
  const src = api.apiURL("/view?" + params.toString());
  st.lastSrc = src;
  delete st.status.dataset.audioHint;
  st.status.hidden = false;
  st.status.textContent = "Loading preview…";
  updateInfoBadge(st, meta);
  // Keep muted autoplay reliable while preserving the existing hover state.
  // If the pointer is already over the node when metadata finishes, audio
  // should start without requiring a leave-and-enter dance.
  st.video.muted = true;
  st.video.src = src;
  st.video.load();
}

app.registerExtension({
  name: "Deno.VideoPreview",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      const st = buildDom(this);
      if ((this.size?.[0] || 0) < NODE_MIN_W ||
          (this.size?.[1] || 0) < NODE_DEFAULT_H) {
        setNodeSize(this, [
          Math.max(this.size?.[0] || 0, NODE_MIN_W),
          Math.max(this.size?.[1] || 0, NODE_DEFAULT_H),
        ], st);
      }
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      queueMicrotask(() => buildDom(this));
      return r;
    };

    // (No onResize override: LiteGraph re-calls the calibrated computeSize
    // during its own resize, which is the single sizing controller.)

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      const r = onExecuted?.apply(this, arguments);
      try { handleExecuted(this, output || {}); } catch (e) { /* never break the graph */ }
      return r;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const s = this.__dvprev;
      s?.panCleanup?.();
      if (s) s.panCleanup = null;
      if (s?.video) {
        try { s.video.pause(); } catch (e) {}
        s.video.removeAttribute("src");
        try { s.video.load(); } catch (e) {}
      }
      return onRemoved?.apply(this, arguments);
    };
  },
});
