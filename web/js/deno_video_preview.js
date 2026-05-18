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
// Compact starting height only; after the first run loadedmetadata snaps
// the node to the exact video aspect (no leftover empty area).
const NODE_DEFAULT_H = 200;

const CSS = `
.dvprev{position:absolute;inset:0;overflow:hidden;background:#000;
  font:11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.dvprev video{position:absolute;inset:0;width:100%;height:100%;display:block;
  background:#000;object-fit:cover}
.dvprev .st{position:absolute;left:0;right:0;bottom:0;padding:4px 8px;
  font-size:11px;color:#9dffba;text-align:center;cursor:pointer;
  background:rgba(5,9,6,.74)}
.dvprev .st[hidden]{display:none}
`;

function ensureStyles() {
  if (document.getElementById("deno-video-preview-css")) return;
  const s = document.createElement("style");
  s.id = "deno-video-preview-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function buildDom(node) {
  if (node.__dvprev) return node.__dvprev;
  ensureStyles();

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

  root.appendChild(video);
  root.appendChild(status);

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, {
    serialize: false,
    hideOnZoom: false,
  });
  // VHS-style fit: the widget height is locked to the video aspect at the
  // current node width, so the <video> (absolute inset:0) fills it edge to
  // edge with no letterbox margins, and it stays in sync whenever the node
  // is resized (LiteGraph re-calls computeSize during resize).
  widget.computeSize = function (width) {
    if (this.aspectRatio) {
      // Use the width LiteGraph actually allots to the widget (not a
      // node.size guess) so the box is exactly the video aspect — the
      // video then fills it with no side/bottom margins.
      let h = width / this.aspectRatio;
      if (!(h > 0)) h = 0;
      return [width, h];
    }
    return [width, 80];
  };

  video.addEventListener("loadedmetadata", () => {
    if (state.hasAudio && video.muted) {
      status.textContent = "🔊 Hover the preview to hear audio";
      status.dataset.audioHint = "1";
      status.hidden = false;
    } else {
      status.hidden = true;
    }
    if (video.videoWidth && video.videoHeight) {
      widget.aspectRatio = video.videoWidth / video.videoHeight;
      node.setDirtyCanvas?.(true, true);
      node.setSize?.(node.computeSize());
    }
    video.play?.().catch(() => {});
  });
  video.addEventListener("error", () => {
    status.hidden = false;
    status.textContent = "Inline preview failed. Click to open the video.";
  });

  const state = { root, video, status, widget, lastSrc: "", hasAudio: false };
  node.__dvprev = state;

  // Browsers block unmuted autoplay, so the inline preview starts muted.
  // When the encoded file actually has an audio track, unmute while the
  // pointer is over the preview (mirrors the familiar VHS hover-to-hear
  // behaviour) and clear the hint once the user has heard it.
  video.addEventListener("pointerenter", () => {
    if (state.hasAudio) {
      video.muted = false;
      if (status.dataset.audioHint) {
        status.hidden = true;
        delete status.dataset.audioHint;
      }
    }
  });
  video.addEventListener("pointerleave", () => {
    video.muted = true;
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

  return state;
}

function handleExecuted(node, output) {
  const list = Array.isArray(output?.deno_video_preview)
    ? output.deno_video_preview
    : null;
  const meta = list && list[0];
  if (!meta || !meta.filename) return;

  const st = buildDom(node);
  st.hasAudio = !!meta.has_audio;
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
  // each run re-mutes so muted-autoplay keeps working; hover re-unmutes
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
      buildDom(this);
      if ((this.size?.[0] || 0) < NODE_MIN_W ||
          (this.size?.[1] || 0) < NODE_DEFAULT_H) {
        this.setSize?.([
          Math.max(this.size?.[0] || 0, NODE_MIN_W),
          Math.max(this.size?.[1] || 0, NODE_DEFAULT_H),
        ]);
      }
      return r;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      queueMicrotask(() => buildDom(this));
      return r;
    };

    // Lock node height to the video aspect on resize, so dragging the
    // node only scales the clip (no empty space appears below it).
    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function (size) {
      const r = onResize?.apply(this, arguments);
      const ar = this.__dvprev?.widget?.aspectRatio;
      if (ar) {
        const fit = this.computeSize();
        if (size) size[1] = fit[1];
        if (this.size) this.size[1] = fit[1];
      }
      return r;
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      const r = onExecuted?.apply(this, arguments);
      try { handleExecuted(this, output || {}); } catch (e) { /* never break the graph */ }
      return r;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const s = this.__dvprev;
      if (s?.video) {
        try { s.video.pause(); } catch (e) {}
        s.video.removeAttribute("src");
        try { s.video.load(); } catch (e) {}
      }
      return onRemoved?.apply(this, arguments);
    };
  },
});
