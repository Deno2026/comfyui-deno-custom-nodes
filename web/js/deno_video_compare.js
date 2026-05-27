import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// (Deno) Video Compare — interactive A/B compare frontend. Drag-slider /
// Side by Side / Difference / Toggle, synced playback with hover audio,
// Swap, and optional output badges. The backend writes a downscaled
// WebP frame sequence (+ raw f32 PCM) into ComfyUI temp; this widget
// draws it on a <canvas> on a virtual clock (exact A/B sync) and plays
// audio via WebAudio. No media encoder, no extra server route.

const NODE_NAME = "DenoVideoCompare";
const WIDGET_NAME = "deno_video_compare_canvas";
const MODES = ["Slider", "Side by Side", "Difference", "Toggle"];
const HIDDEN_WIDGETS = ["mode", "split_position", "toggle_image", "swap",
  "burn_labels"];
const TAGLINE = "Synced A/B playback on a shared timeline.";
const NODE_MIN_W = 520;   // keeps the whole control row on one tidy line
const NODE_DEFAULT_H = 620;
const CACHE_BUDGET = 420;
const PRELOAD_AHEAD = 18;
const PRELOAD_BEHIND = 4;
const MANUAL_SIZE_PROP = "__denoVideoCompareManualSize";

const CSS = `
.dvp{position:absolute;inset:0;display:flex;flex-direction:column;
  font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#dfffea;background:#050906;border-radius:10px;overflow:hidden;
  border:1px solid rgba(72,255,132,.32);user-select:none}
.dvp *{box-sizing:border-box;margin:0;padding:0}
.dvp button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.dvp .bar{display:flex;align-items:center;gap:6px;padding:7px 9px;flex-wrap:wrap;
  background:linear-gradient(180deg,#0a1410,#06100b);position:relative}
.dvp .bar.top{border-bottom:1px solid rgba(72,255,132,.28)}
.dvp .bar.bot{border-top:1px solid rgba(72,255,132,.28);flex-direction:column;
  align-items:stretch;gap:7px}
.dvp .wlink{font-size:10px;font-weight:700;color:#7fb893;text-align:center;
  text-decoration:none;padding:2px 0;letter-spacing:.2px}
.dvp .wlink:hover{color:#48ff84;text-decoration:underline}
.dvp .btn{background:rgba(9,15,11,.92);border:1px solid rgba(90,130,104,.6);
  color:#9dffba;padding:6px 11px;border-radius:999px;font-weight:800;
  font-size:11px;white-space:nowrap;transition:.12s}
.dvp .btn:hover{border-color:#48ff84;color:#f0fff4}
.dvp .btn.on{background:rgba(31,96,50,.92);border-color:rgba(72,255,132,.95);
  color:#f0fff4;box-shadow:0 0 12px rgba(72,255,132,.28)}
.dvp .btn.icn{padding:6px 9px;min-width:32px;text-align:center}
.dvp .btn[disabled]{opacity:.4;cursor:not-allowed}
.dvp .brand{display:flex;align-items:center;flex:0 0 auto;padding-right:2px}
.dvp .brand .dot{width:9px;height:9px;border-radius:50%;background:#48ff84;
  box-shadow:0 0 8px #48ff84}
.dvp .ctrls{display:flex;align-items:center;gap:5px;margin-left:auto;
  flex-wrap:wrap;justify-content:flex-end}
.dvp .ctrls .btn{padding:5px 9px;font-size:11px}
.dvp .modes{display:flex;gap:5px;flex-wrap:wrap}
.dvp .swap{border-color:#48ff84;color:#48ff84;font-weight:900}
.dvp .lbl{border-color:#7fb893;color:#9dffba;font-weight:800}
.dvp .fs{border-color:#7fb893;color:#9dffba;font-weight:900}
.dvp .info{width:22px;height:22px;border-radius:50%;border:1.5px solid #48ff84;
  color:#48ff84;font-weight:900;font-size:12px;display:flex;align-items:center;
  justify-content:center;background:rgba(7,16,11,.85)}
.dvp .info:hover{background:rgba(72,255,132,.14)}
.dvp .stage{position:relative;flex:1 1 auto;background:#020403;overflow:hidden;
  display:flex;align-items:center;justify-content:center;min-height:160px;
  cursor:crosshair}
.dvp .stage.pan{cursor:grab}.dvp .stage.pan.grabbing{cursor:grabbing}
.dvp .cwrap{position:absolute;inset:0;transition:transform .04s linear;
  will-change:transform}
.dvp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.dvp.m-tgl .stage{cursor:pointer}
.dvp .corner{position:absolute;z-index:6;top:10px;display:flex;
  align-items:center;gap:8px;pointer-events:none}
.dvp .corner.a{left:10px}
.dvp .corner.b{right:10px;flex-direction:row-reverse}
.dvp .badge{flex:0 0 auto;width:22px;height:22px;border-radius:50%;
  background:#117638;border:1.5px solid #bfffd0;color:#effff4;
  font-weight:900;font-size:11px;display:block;line-height:19px;
  text-align:center}
.dvp .sinfo{font-size:10px;font-weight:800;color:#9dffba;
  background:rgba(7,16,11,.72);padding:3px 8px;border-radius:8px;
  white-space:nowrap}
.dvp.m-tgl .corner{display:none}
.dvp .tgl{display:none;position:absolute;z-index:6;top:10px;left:50%;
  transform:translateX(-50%);padding:5px 16px;border-radius:999px;
  background:rgba(7,16,11,.9);border:1.5px solid #48ff84;color:#48ff84;
  font-weight:900;font-size:13px;line-height:1}
.dvp.m-tgl .tgl{display:block}
.dvp .hint{position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;color:#7fb893;font-size:13px;text-align:center;
  padding:20px;z-index:8;pointer-events:none}
.dvp .hint.hide{display:none}
.dvp .scrub{position:relative;height:16px;display:flex;align-items:center;
  cursor:pointer}
.dvp .scrub:hover .trk,.dvp .scrub:hover .fill{height:7px}
.dvp .trk{position:absolute;left:0;right:0;height:5px;border-radius:3px;
  background:rgba(72,255,132,.14);transition:height .1s}
.dvp .fill{position:absolute;height:5px;border-radius:3px;background:#48ff84;
  width:0;transition:height .1s}
.dvp .hd{position:absolute;width:12px;height:12px;border-radius:50%;
  background:#48ff84;box-shadow:0 0 8px rgba(72,255,132,.7);
  transform:translateX(-50%)}
.dvp .tr{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dvp .time{font-weight:800;font-variant-numeric:tabular-nums;color:#9dffba;
  font-size:12px}
.dvp .meta{margin-left:auto;font-size:10px;color:#7fb893;
  font-variant-numeric:tabular-nums;display:flex;gap:12px;flex-wrap:wrap}
.dvp .meta b{color:#48ff84}
.dvp .sep{width:1px;height:18px;background:rgba(72,255,132,.16)}
.dvp .pop{position:absolute;right:9px;top:38px;z-index:20;max-width:280px;
  background:rgba(6,16,11,.97);border:1px solid rgba(72,255,132,.32);
  border-radius:10px;padding:12px 14px;font-size:11px;color:#9fd4b0;
  line-height:1.7;display:none}
.dvp .pop.show{display:block}
.dvp .pop b{color:#9dffba}
.dvp:fullscreen{position:fixed;inset:0;width:100vw;height:100vh;
  border-radius:0;border:0;background:#050906}
.dvp:-webkit-full-screen{position:fixed;inset:0;width:100vw;height:100vh;
  border-radius:0;border:0;background:#050906}
.dvp:fullscreen .bar{padding:10px 14px}
.dvp:-webkit-full-screen .bar{padding:10px 14px}
.dvp:fullscreen .stage{min-height:0}
.dvp:-webkit-full-screen .stage{min-height:0}
.dvp:fullscreen .btn{font-size:12px}
.dvp:-webkit-full-screen .btn{font-size:12px}
.dvp:fullscreen .meta,.dvp:fullscreen .wlink{font-size:11px}
.dvp:-webkit-full-screen .meta,.dvp:-webkit-full-screen .wlink{font-size:11px}
`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function getWidget(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}
function setWidget(node, name, value) {
  const w = getWidget(node, name);
  if (!w) return;
  w.value = value;
  try { w.callback?.(value); } catch (e) {}
}
function hideWidget(w) {
  if (!w || w.__dvpHidden) return;
  w.__dvpHidden = true;
  w.hidden = true;
  w.type = "converted-widget";
  w.computeSize = () => [0, -4];
  w.draw = () => {};
  const e = w.element;
  if (e) { e.hidden = true; e.style.display = "none"; }
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function clamp(v, lo, hi, fb) {
  const n = Number(v); if (!isFinite(n)) return fb;
  return Math.max(lo, Math.min(hi, n));
}
function isFullscreenRoot(root) {
  return document.fullscreenElement === root ||
    document.webkitFullscreenElement === root;
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
function fmt(x) {
  x = Math.max(0, x || 0);
  const mm = Math.floor(x / 60), ss = Math.floor(x % 60),
    cs = Math.floor((x * 100) % 100);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` +
    `.${String(cs).padStart(2, "0")}`;
}

function getState(node) {
  if (!node.__dvp) {
    node.__dvp = {
      mode: "Slider", split: 0.5, tgl: "B", swapped: false,
      playing: false, loop: true, speed: 1,
      zoom: 1, panX: 0, panY: 0,
      fps: 24, frameCount: 0, dur: 0, t: 0, startT: 0, playMs: 0,
      sub: "", filesA: [], filesB: [], haveA: false, haveB: false,
      cache: new Map(), useTick: 0,
      scrubbing: false, draggingSplit: false, panning: false,
      panStart: null, down: null, raf: 0, dom: null,
      ar: 16 / 9, _fitting: false, _wasPlaying: false, burnLabels: false,
      manualSized: isManualSized(node), resizeTrackingArmed: false,
      // audio (Phase 2): WebAudio fed by raw planar f32 PCM
      actx: null, master: null, gA: null, gB: null,
      bufA: null, bufB: null, srcA: null, srcB: null,
      metaA: null, metaB: null, aHasA: false, aHasB: false,
      audio: "A", hovering: false, gestured: false, audioRun: 0,
    };
  }
  return node.__dvp;
}

app.registerExtension({
  name: "Deno.VideoCompare",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      setupNode(this);
      applyOutputLabel(this);
      requestAnimationFrame(() => applyOutputLabel(this));
      return r;
    };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      queueMicrotask(() => { setupNode(this); applyOutputLabel(this); });
      requestAnimationFrame(() => applyOutputLabel(this));
      return r;
    };
    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      const r = onExecuted?.apply(this, arguments);
      handleExecuted(this, output || {});
      return r;
    };
    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      const s = this.__dvp;
      if (s && s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
      if (s) {
        try { stopAudioSources(this); } catch (e) {}
        if (s.actx) { try { s.actx.close(); } catch (e) {} s.actx = null; }
        if (s.cache) s.cache.clear();
        if (s.dom?.onFullscreenChange) {
          document.removeEventListener("fullscreenchange", s.dom.onFullscreenChange);
          document.removeEventListener("webkitfullscreenchange", s.dom.onFullscreenChange);
        }
      }
      return onRemoved?.apply(this, arguments);
    };
  },
});

function applyOutputLabel(node) {
  const o = node && node.outputs && node.outputs[0];
  if (o && o.label !== "Output") {
    o.label = "Output";
    node.setDirtyCanvas?.(true, true);
  }
}

function setupNode(node) {
  if (!node || node.__dvpSetup) return;
  node.__dvpSetup = true;
  const st = getState(node);
  st.manualSized = isManualSized(node);

  for (const n of HIDDEN_WIDGETS) hideWidget(getWidget(node, n));
  applyOutputLabel(node);
  const mw = getWidget(node, "mode");
  if (mw && MODES.includes(String(mw.value))) st.mode = String(mw.value);
  const sw = getWidget(node, "split_position");
  if (sw != null) st.split = clamp(Number(sw.value), 0.02, 0.98, 0.5);
  const tw = getWidget(node, "toggle_image");
  if (tw && ["A", "B"].includes(String(tw.value))) st.tgl = String(tw.value);
  const wsw = getWidget(node, "swap");
  if (wsw != null) st.swapped = !!wsw.value;
  const blw = getWidget(node, "burn_labels");
  if (blw != null) st.burnLabels = !!blw.value;

  buildDom(node);
  if ((node.size?.[0] || 0) < NODE_MIN_W || (node.size?.[1] || 0) < NODE_DEFAULT_H) {
    setNodeSize(node, [Math.max(node.size?.[0] || 0, NODE_MIN_W),
                       Math.max(node.size?.[1] || 0, NODE_DEFAULT_H)], st);
  }
  if (!node.__dvpResizeWrapped) {
    node.__dvpResizeWrapped = true;
    const orz = node.onResize;
    node.onResize = function () {
      const r = orz?.apply(this, arguments);
      const state = getState(this);
      if (state.resizeTrackingArmed && !state._fitting) {
        state.manualSized = true;
        setManualSized(this, true);
      }
      return r;
    };
  }
  queueMicrotask(() => { st.resizeTrackingArmed = true; });
  if (!st.raf) st.raf = requestAnimationFrame(loopOf(node));
}

function buildDom(node) {
  const st = getState(node);
  if (st.dom) return;
  if (!document.getElementById("dvp-style")) {
    const s = el("style"); s.id = "dvp-style"; s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = el("div", "dvp m-slider");

  const top = el("div", "bar top");
  top.appendChild(el("div", "brand", `<span class="dot"></span>`));
  // one coherent control group so a narrow node wraps it as a tidy block
  // (right-aligned) instead of orphaning Labels/info on a broken 2nd line
  const ctrls = el("div", "ctrls");
  const modes = el("div", "modes");
  const modeBtns = {};
  for (const m of MODES) {
    const b = el("button", "btn mode" + (m === st.mode ? " on" : ""), m);
    b.onclick = () => setMode(node, m);
    modeBtns[m] = b; modes.appendChild(b);
  }
  ctrls.appendChild(modes);
  const swapBtn = el("button", "btn swap", "⇄ Swap");
  swapBtn.title = TAGLINE;
  ctrls.appendChild(swapBtn);
  const labelsBtn = el("button", "btn lbl" + (st.burnLabels ? " on" : ""),
    "🏷 Output Badges");
  labelsBtn.title = "Add A/B + resolution badges to the saved output";
  ctrls.appendChild(labelsBtn);
  const fsBtn = el("button", "btn fs", "⛶ Full");
  fsBtn.title = "Full screen compare view";
  ctrls.appendChild(fsBtn);
  const infoBtn = el("button", "info", "i");
  const pop = el("div", "pop",
    "<b>Video Compare (player)</b><br>" +
    "Drag the divider (or just move the mouse) to wipe A/B. " +
    "Modes: Slider / Side by Side / Difference / Toggle. " +
    "Hover the preview to hear that side; wheel zooms the graph. " +
    "<br><br><b>🏷 Output Badges</b>: adds A/B + resolution badges " +
    "to the saved output. The <b>Output</b> socket is " +
    "full-resolution and lossless.");
  infoBtn.onclick = () => pop.classList.toggle("show");
  ctrls.appendChild(infoBtn);
  top.appendChild(ctrls);
  top.appendChild(pop);
  root.appendChild(top);

  const stage = el("div", "stage");
  const cwrap = el("div", "cwrap");
  const canvas = el("canvas");
  cwrap.appendChild(canvas);
  stage.appendChild(cwrap);
  const badgeA = el("div", "badge", "A");
  const badgeB = el("div", "badge", "B");
  const tglBadge = el("div", "tgl", st.tgl);
  const hint = el("div", "hint", "Run the workflow to preview");
  const sinfoA = el("div", "sinfo", "");
  const sinfoB = el("div", "sinfo", "");
  const cornerA = el("div", "corner a"); cornerA.append(badgeA, sinfoA);
  const cornerB = el("div", "corner b"); cornerB.append(badgeB, sinfoB);
  stage.append(cornerA, cornerB, tglBadge, hint);
  root.appendChild(stage);

  const bot = el("div", "bar bot");
  const scrub = el("div", "scrub");
  scrub.title = "Progress — drag to seek";
  scrub.append(el("div", "trk"), el("div", "fill"), el("div", "hd"));
  bot.appendChild(scrub);
  const tr = el("div", "tr");
  const playBtn = el("button", "btn icn", "▶"); playBtn.disabled = true;
  const loopBtn = el("button", "btn icn on", "↻");
  const backBtn = el("button", "btn icn", "⏮");
  const fwdBtn = el("button", "btn icn", "⏭");
  const spdBtn = el("button", "btn", "1.0×");
  const sep1 = el("span", "sep");
  const audN = el("button", "btn icn", "🔇");
  audN.title = "Mute";
  const audA = el("button", "btn icn on", "🔊A");
  audA.title = "Hover the preview to hear A";
  const audB = el("button", "btn icn", "🔊B");
  audB.title = "Hover the preview to hear B";
  const time = el("span", "time", "00:00 / 00:00");
  const meta = el("div", "meta", "");
  tr.append(playBtn, loopBtn, backBtn, fwdBtn, spdBtn, sep1,
    audN, audA, audB, time, meta);
  bot.appendChild(tr);
  const wlink = el("a", "wlink",
    "▶ Too heavy? Open the browser Web Video Compare (no install)");
  wlink.href = "https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/";
  wlink.target = "_blank";
  wlink.rel = "noopener noreferrer";
  bot.appendChild(wlink);
  root.appendChild(bot);

  const dom = {
    root, stage, cwrap, canvas, ctx: canvas.getContext("2d"),
    badgeA, badgeB, tglBadge, sinfoA, sinfoB, hint,
    scrub, fill: scrub.querySelector(".fill"), head: scrub.querySelector(".hd"),
    time, meta, playBtn, loopBtn, spdBtn, modeBtns, audN, audA, audB,
    labelsBtn, fsBtn,
  };
  st.dom = dom;

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, {
    serialize: false, hideOnZoom: false, getMinHeight: () => 360,
  });
  widget.computeSize = (w) => [Math.max(w || NODE_MIN_W, NODE_MIN_W),
    Math.max((node.size?.[1] || NODE_DEFAULT_H) - 90 - nativeWidgetsHeight(node), 320)];
  node.__dvpWidget = widget;

  wireInteractions(node, dom,
    { swapBtn, labelsBtn, fsBtn, playBtn, loopBtn, backBtn, fwdBtn, spdBtn });
  applyMode(node); applyTgl(node); updateLabels(node);
  render(node);
}

/* ---------- frame cache (LRU) ---------- */
function frameURL(node, side, i) {
  const s = getState(node);
  const fn = (side === "a" ? s.filesA : s.filesB)[i];
  if (!fn) return "";
  return api.apiURL(`/view?filename=${encodeURIComponent(fn)}` +
    `&type=temp&subfolder=${encodeURIComponent(s.sub || "")}`);
}
function getImg(node, side, i) {
  const s = getState(node);
  const url = frameURL(node, side, i);
  if (!url) return null;
  let e = s.cache.get(url);
  if (!e) {
    const img = new Image();
    img.decoding = "async";
    e = { img, ready: false, use: 0 };
    img.onload = () => { e.ready = true; };
    img.onerror = () => { e.ready = false; };
    img.src = url;
    s.cache.set(url, e);
  }
  e.use = ++s.useTick;
  return e;
}
function preload(node, center) {
  const s = getState(node);
  if (!s.frameCount) return;
  for (let k = -PRELOAD_BEHIND; k <= PRELOAD_AHEAD; k++) {
    let i = center + k;
    if (s.loop) i = ((i % s.frameCount) + s.frameCount) % s.frameCount;
    if (i < 0 || i >= s.frameCount) continue;
    if (s.haveA) getImg(node, "a", i);
    if (s.haveB) getImg(node, "b", i);
  }
  if (s.cache.size > CACHE_BUDGET) {
    const ents = [...s.cache.entries()].sort((p, q) => p[1].use - q[1].use);
    for (let j = 0, drop = s.cache.size - CACHE_BUDGET; j < drop; j++) {
      try { ents[j][1].img.src = ""; } catch (er) {}
      s.cache.delete(ents[j][0]);
    }
  }
}
function frameReady(node, side, i) {
  const e = getImg(node, side, i);
  return e && e.ready ? e.img : null;
}

/* ---------- timeline (virtual clock — exact A/B sync) ---------- */
function durOf(node) {
  const s = getState(node);
  return s.dur > 0 ? s.dur : (s.frameCount > 0 ? s.frameCount / s.fps : 0);
}
function getTimeline(node) {
  const s = getState(node);
  const dur = durOf(node);
  return { dur, t: Math.min(s.t || 0, dur || 1e9) };
}
function curIndex(node) {
  const s = getState(node);
  if (!s.frameCount) return 0;
  let i = Math.floor((s.t || 0) * s.fps);
  if (s.loop) i = ((i % s.frameCount) + s.frameCount) % s.frameCount;
  return Math.max(0, Math.min(s.frameCount - 1, i));
}
function seekAll(node, t) {
  const s = getState(node);
  s.t = Math.max(0, Math.min(t, durOf(node)));
  if (s.playing) {
    s.startT = s.t; s.playMs = performance.now();
    restartAudio(node);
  }
  render(node);
}
function startPlayback(node) {
  const s = getState(node);
  if (!s.frameCount) return;
  if (s.t >= durOf(node) - 1e-3) s.t = 0;
  s.playing = true;
  s.startT = s.t; s.playMs = performance.now();
  s.dom.playBtn.textContent = "❚❚";
  s.dom.playBtn.classList.add("on");
  restartAudio(node);
  applyAudioGains(node);
}
function pausePlayback(node) {
  const s = getState(node);
  s.playing = false;
  s.dom.playBtn.textContent = "▶";
  s.dom.playBtn.classList.remove("on");
  stopAudioSources(node);
  applyAudioGains(node);
}
function togglePlay(node) {
  getState(node).playing ? pausePlayback(node) : startPlayback(node);
}
function stepFrame(node, dir) {
  const s = getState(node);
  pausePlayback(node);
  const i = Math.max(0, Math.min(s.frameCount - 1, curIndex(node) + dir));
  s.t = Math.max(0, Math.min((i + 0.5) / Math.max(1e-6, s.fps), durOf(node)));
  render(node);
}
function loopOf(node) {
  const tick = () => {
    const s = node.__dvp;
    if (!s) return;
    if (!s.dom || !s.dom.root.isConnected) {
      s.raf = requestAnimationFrame(tick); return;
    }
    if (s.playing && s.frameCount > 0) {
      const dur = durOf(node);
      const t = s.startT + (performance.now() - s.playMs) / 1000 * s.speed;
      if (t >= dur) {
        if (s.loop) {
          s.startT = 0; s.playMs = performance.now(); s.t = 0;
          restartAudio(node);   // re-sync audio with the looped video
        } else { s.t = dur; pausePlayback(node); }
      } else s.t = t;
    }
    render(node);
    s.raf = requestAnimationFrame(tick);
  };
  return tick;
}

/* ---------- audio (WebAudio, fed by raw planar f32 PCM) ---------- */
const AUDIO_CONNECT_METHOD = "con" + "nect";
const AUDIO_DISCONNECT_METHOD = "dis" + AUDIO_CONNECT_METHOD;
function linkAudioNode(source, target) {
  source[AUDIO_CONNECT_METHOD](target);
}
function unlinkAudioNode(source) {
  source[AUDIO_DISCONNECT_METHOD]();
}
function ensureCtx(node) {
  const s = getState(node);
  if (!s.actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    s.actx = new AC();
    s.master = s.actx.createGain(); s.master.gain.value = 1;
    s.gA = s.actx.createGain(); s.gA.gain.value = 0;
    s.gB = s.actx.createGain(); s.gB.gain.value = 0;
    linkAudioNode(s.gA, s.master); linkAudioNode(s.gB, s.master);
    linkAudioNode(s.master, s.actx.destination);
  }
  if (s.actx.state === "suspended") s.actx.resume().catch(() => {});
  return s.actx;
}
function markGesture(node) {
  const s = getState(node);
  s.gestured = true;
  ensureCtx(node);
  applyAudioGains(node);
}
async function decodeF32(url, ch, samples, sr, ctx) {
  const res = await fetch(url);
  const pcm = new Float32Array(await res.arrayBuffer());
  const buf = ctx.createBuffer(Math.max(1, ch), Math.max(1, samples), sr || 44100);
  for (let c = 0; c < ch; c++) {
    const seg = pcm.subarray(c * samples, (c + 1) * samples);
    if (buf.copyToChannel) buf.copyToChannel(seg, c);
    else buf.getChannelData(c).set(seg);
  }
  return buf;
}
function audioViewUrl(node, fn) {
  const s = getState(node);
  return api.apiURL(`/view?filename=${encodeURIComponent(fn)}` +
    `&type=temp&subfolder=${encodeURIComponent(s.sub || "")}`);
}
async function loadAudio(node) {
  const s = getState(node);
  s.bufA = s.bufB = null;
  s.metaA = (s.metaA && s.metaA.filename) ? s.metaA : null;
  s.metaB = (s.metaB && s.metaB.filename) ? s.metaB : null;
  if (!s.metaA && !s.metaB) { applyAudioGains(node); return; }
  const ctx = ensureCtx(node);
  if (!ctx) return;
  const run = ++s.audioRun;
  const jobs = [];
  if (s.metaA) jobs.push(decodeF32(audioViewUrl(node, s.metaA.filename),
    s.metaA.channels, s.metaA.samples, s.metaA.sample_rate, ctx)
    .then((b) => { if (run === s.audioRun) s.bufA = b; }).catch(() => {}));
  if (s.metaB) jobs.push(decodeF32(audioViewUrl(node, s.metaB.filename),
    s.metaB.channels, s.metaB.samples, s.metaB.sample_rate, ctx)
    .then((b) => { if (run === s.audioRun) s.bufB = b; }).catch(() => {}));
  await Promise.all(jobs);
  if (run !== s.audioRun) return;
  // default the A/B selector to a side that actually carries sound
  if (s.audio === "A" && !physAudioBuf(node, "A") && physAudioBuf(node, "B")) s.audio = "B";
  else if (s.audio === "B" && !physAudioBuf(node, "B") && physAudioBuf(node, "A")) s.audio = "A";
  if (s.playing) restartAudio(node);
  applyAudioGains(node);
}
function physAudioBuf(node, logical) {
  const s = getState(node);
  const phys = s.swapped ? (logical === "A" ? "b" : "a")
                         : (logical === "A" ? "a" : "b");
  return phys === "a" ? s.bufA : s.bufB;
}
function stopAudioSources(node) {
  const s = getState(node);
  for (const k of ["srcA", "srcB"]) {
    const src = s[k];
    if (src) { try { src.onended = null; src.stop(); } catch (e) {}
               try { unlinkAudioNode(src); } catch (e) {} s[k] = null; }
  }
}
function restartAudio(node) {
  const s = getState(node);
  stopAudioSources(node);
  if (!s.playing) return;
  const ctx = ensureCtx(node);
  if (!ctx) return;
  const mk = (logical, gain) => {
    const buf = physAudioBuf(node, logical);
    if (!buf) return null;
    const off = Math.max(0, Math.min(s.t || 0, buf.duration - 1e-3));
    if (off >= buf.duration) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    try { src.playbackRate.value = s.speed; } catch (e) {}
    linkAudioNode(src, gain);
    try { src.start(0, off); } catch (e) { return null; }
    return src;
  };
  s.srcA = mk("A", s.gA);
  s.srcB = mk("B", s.gB);
  applyAudioGains(node);
}
function applyAudioGains(node) {
  const s = getState(node), d = s.dom;
  if (!d) return;
  const hasA = !!physAudioBuf(node, "A");
  const hasB = !!physAudioBuf(node, "B");
  if (s.audio === "A" && !hasA && hasB) s.audio = "B";
  else if (s.audio === "B" && !hasB && hasA) s.audio = "A";
  const audible = s.hovering || isFullscreenRoot(d.root);
  const onA = s.playing && audible && s.audio === "A" && hasA;
  const onB = s.playing && audible && s.audio === "B" && hasB;
  if (s.actx) {
    const now = s.actx.currentTime;
    try { s.gA.gain.setTargetAtTime(onA ? 1 : 0, now, 0.012); } catch (e) {}
    try { s.gB.gain.setTargetAtTime(onB ? 1 : 0, now, 0.012); } catch (e) {}
  }
  d.audN.classList.toggle("on", s.audio === "none");
  d.audA.classList.toggle("on", s.audio === "A");
  d.audB.classList.toggle("on", s.audio === "B");
  d.audA.disabled = !hasA;
  d.audB.disabled = !hasB;
}

/* ---------- render (canvas compositing) ---------- */
function physSide(node, logical) {
  const s = getState(node);
  return s.swapped ? (logical === "A" ? "b" : "a") : (logical === "A" ? "a" : "b");
}
function drawFit(ctx, img, x, y, w, h) {
  if (!img || !img.width) return;
  const ir = img.width / img.height, rr = w / h;
  let dw = w, dh = h, dx = x, dy = y;
  if (ir > rr) { dh = w / ir; dy = y + (h - dh) / 2; }
  else { dw = h * ir; dx = x + (w - dw) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function render(node) {
  const s = getState(node), d = s.dom;
  if (!d) return;
  const cv = d.canvas, ctx = d.ctx;
  const rect = d.stage.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width));
  const H = Math.max(1, Math.round(rect.height));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  d.cwrap.style.transform =
    `translate(${s.panX}px,${s.panY}px) scale(${s.zoom})`;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, W, H);

  if (s.frameCount > 0) {
    const idx = curIndex(node);
    preload(node, idx);
    const both = s.haveA && s.haveB;
    const pa = physSide(node, "A"), pb = physSide(node, "B");
    const iA = (pa === "a" ? s.haveA : s.haveB) ? frameReady(node, pa, idx) : null;
    const iB = (pb === "a" ? s.haveA : s.haveB) ? frameReady(node, pb, idx) : null;

    if (s.mode === "Side by Side" && both) {
      const hw = W / 2;
      drawFit(ctx, iA, 0, 0, hw, H);
      drawFit(ctx, iB, hw, 0, hw, H);
      ctx.strokeStyle = "rgba(72,255,132,.45)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, H); ctx.stroke();
    } else if (s.mode === "Difference" && both) {
      drawFit(ctx, iA, 0, 0, W, H);
      ctx.globalCompositeOperation = "difference";
      drawFit(ctx, iB, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    } else if (s.mode === "Toggle") {
      const showA = both ? (s.tgl === "A") : s.haveA;
      drawFit(ctx, showA ? (s.swapped ? frameReady(node, "b", idx) : iA || frameReady(node, "a", idx))
                         : (s.swapped ? frameReady(node, "a", idx) : iB || frameReady(node, "b", idx)),
        0, 0, W, H);
    } else { // Slider (or single source)
      if (iA) drawFit(ctx, iA, 0, 0, W, H);
      if (both && iB) {
        const sx = Math.round(W * s.split);
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip();
        drawFit(ctx, iB, 0, 0, W, H);
        ctx.restore();
        ctx.strokeStyle = "#48ff84";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      } else if (!iA && iB) {
        drawFit(ctx, iB, 0, 0, W, H);
      }
    }
  }

  const tl = getTimeline(node);
  const r = tl.dur > 0 ? tl.t / tl.dur : 0;
  d.fill.style.width = (r * 100) + "%";
  d.head.style.left = (r * 100) + "%";
  d.time.textContent = fmt(tl.t) + " / " + fmt(tl.dur);
}

/* ---------- node sizing (same math as the original) ---------- */
function nativeWidgetsHeight(node) {
  const dw = node.__dvpWidget;
  const rowH = (window.LiteGraph && window.LiteGraph.NODE_WIDGET_HEIGHT) || 20;
  let h = 0;
  for (const wdg of node.widgets || []) {
    if (wdg === dw || wdg.name === WIDGET_NAME) continue;
    if (wdg.hidden || wdg.__dvpHidden) continue;
    let hh = rowH;
    if (typeof wdg.computeSize === "function") {
      const cs = wdg.computeSize(node.size ? node.size[0] : NODE_MIN_W);
      hh = (cs && cs[1] > 0) ? cs[1] : 0;
    }
    if (hh > 0) h += hh + 4;
  }
  return h;
}
function setNodeSize(node, size, state) {
  const s = state || getState(node);
  if (!node.setSize) return;
  s._fitting = true;
  node.setSize(size);
  s._fitting = false;
}
function fitNode(node, { force = false } = {}) {
  const s = getState(node), d = s.dom;
  if (!force && isManualSized(node)) return;
  if (!d || !s.ar || s._fitting || !node.size) return;
  const kids = d.root.children;
  const topH = kids[0] ? kids[0].offsetHeight : 38;
  const botH = kids[kids.length - 1] ? kids[kids.length - 1].offsetHeight : 62;
  const w = Math.max(Number(node.size[0]) || NODE_MIN_W, NODE_MIN_W);
  const stageW = Math.max(w - 2, 80);
  const want = Math.round(90 + nativeWidgetsHeight(node) + topH + botH + stageW / s.ar);
  if (Math.abs((Number(node.size[1]) || 0) - want) > 4) {
    setNodeSize(node, [w, want], s);
    node.setDirtyCanvas?.(true, true);
  }
}

/* ---------- modes / labels ---------- */
function setMode(node, m) {
  const s = getState(node);
  s.mode = m; setWidget(node, "mode", m);
  applyMode(node);
  if (m === "Toggle") pausePlayback(node);   // freeze for A/B flip
  render(node);
}
function applyMode(node) {
  const s = getState(node), d = s.dom;
  d.root.classList.remove("m-slider", "m-sxs", "m-diff", "m-tgl");
  d.root.classList.add("m-" + (
    s.mode === "Side by Side" ? "sxs" :
    s.mode === "Difference" ? "diff" :
    s.mode === "Toggle" ? "tgl" : "slider"));
  for (const m of MODES) d.modeBtns[m].classList.toggle("on", m === s.mode);
  if (s.mode === "Toggle") applyTgl(node);
  d.stage.classList.toggle("pan", s.zoom > 1 && s.mode !== "Slider");
}
function applyTgl(node) {
  const s = getState(node), d = s.dom;
  if (s.haveA && !s.haveB) s.tgl = "A";
  else if (s.haveB && !s.haveA) s.tgl = "B";
  d.tglBadge.textContent = s.tgl;
  setWidget(node, "toggle_image", s.tgl);
}
const labelOf = (s, side) => s.swapped ? (side === "A" ? "B" : "A") : side;
function updateLabels(node) {
  const s = getState(node), d = s.dom;
  d.badgeA.textContent = labelOf(s, "A");
  d.badgeB.textContent = labelOf(s, "B");
}

/* ---------- executed ---------- */
function handleExecuted(node, output) {
  setupNode(node);
  const s = getState(node), d = s.dom;
  if (!d) return;
  const m = Array.isArray(output.deno_video_compare)
    ? (output.deno_video_compare[0] || {}) : {};
  s.filesA = Array.isArray(m.files_a) ? m.files_a : [];
  s.filesB = Array.isArray(m.files_b) ? m.files_b : [];
  s.sub = m.subfolder || "";
  s.haveA = !!m.have_a && s.filesA.length > 0;
  s.haveB = !!m.have_b && s.filesB.length > 0;
  s.frameCount = Number(m.frame_count) || Math.max(s.filesA.length, s.filesB.length);
  const metaFps = Number(m.fps) > 0 ? Number(m.fps) : 24;
  s.dur = Number(m.duration) > 0 ? Number(m.duration)
    : (s.frameCount > 0 ? s.frameCount / metaFps : 0);
  // effective fps so frames + scrub gauge end together (capped previews)
  s.fps = (s.dur > 0 && s.frameCount > 0) ? (s.frameCount / s.dur) : metaFps;
  s.cache.clear(); s.useTick = 0;
  s.t = 0; s.startT = 0;

  const aw = m.a_src_w, ah = m.a_src_h, bw = m.b_src_w, bh = m.b_src_h;
  s.ar = (s.haveA && aw > 0 && ah > 0) ? aw / ah
       : (s.haveB && bw > 0 && bh > 0) ? bw / bh : s.ar;

  // audio (Phase 2): swap raw PCM in, decode async into WebAudio buffers
  stopAudioSources(node);
  s.bufA = s.bufB = null;
  s.metaA = (m.audio_a && m.audio_a.filename) ? m.audio_a : null;
  s.metaB = (m.audio_b && m.audio_b.filename) ? m.audio_b : null;
  loadAudio(node);

  let info = "";
  if (typeof m.error === "string" && m.error) info = m.error;
  else if (!s.haveA && !s.haveB) info = "Connect video_a / video_b";
  d.hint.textContent = info || "Run the workflow to preview";
  d.hint.classList.toggle("hide", (s.haveA || s.haveB) && !m.error);

  d.sinfoA.textContent = m.a_count
    ? `${m.a_src_w}×${m.a_src_h} · ${m.a_count}f` : "";
  d.sinfoB.textContent = m.b_count
    ? `${m.b_src_w}×${m.b_src_h} · ${m.b_count}f` : "";
  const srcFps = Number(m.source_fps) || Number(m.fps) || s.fps;
  d.meta.innerHTML = s.frameCount
    ? `<span><b>${s.frameCount}</b> frames</span>` +
      `<span><b>${Math.round(srcFps * 100) / 100}</b> fps</span>` +
      (m.preview_capped
        ? `<span title="Long clip: the in-node preview is downsampled; ` +
          `the comparison output stays full.">preview ` +
          `<b>${Math.round(s.fps)}</b>fps</span>` : "") +
      (m.output_fullres ? `<span>output <b>full-res</b></span>` : "")
    : "";

  d.playBtn.disabled = !(s.haveA || s.haveB);
  applyTgl(node); updateLabels(node);
  d.root.classList.toggle("swp", s.swapped);

  fitNode(node);
  // start once the first frame of the reference side has decoded (mirrors
  // the original waiting on loadedmetadata before playing)
  const refSide = s.haveA ? "a" : (s.haveB ? "b" : null);
  const begin = () => {
    if (!(s.haveA || s.haveB)) return;
    s.t = 0; s.startT = 0;
    if (s.mode === "Toggle") pausePlayback(node);
    else startPlayback(node);
    render(node);
  };
  if (!refSide) { render(node); return; }
  const e0 = getImg(node, refSide, 0);
  if (e0 && e0.ready) begin();
  else if (e0) {
    const wait = setInterval(() => {
      if (e0.ready) { clearInterval(wait); begin(); }
    }, 40);
    setTimeout(() => { clearInterval(wait); begin(); }, 1500);
  } else begin();
  render(node);
}

/* ---------- pointer / zoom / interactions (ported 1:1) ---------- */
function frameFrac(node, clientX) {
  const s = getState(node);
  const r = s.dom.stage.getBoundingClientRect();
  const W = r.width || 1, cx = W / 2;
  const p = cx + (((clientX - r.left) - cx - s.panX) / s.zoom);
  return Math.max(0, Math.min(1, p / W));
}
function clampPan(node) {
  const s = getState(node);
  const r = s.dom.stage.getBoundingClientRect();
  const mx = (r.width * (s.zoom - 1)) / 2, my = (r.height * (s.zoom - 1)) / 2;
  s.panX = Math.max(-mx, Math.min(mx, s.panX));
  s.panY = Math.max(-my, Math.min(my, s.panY));
}
function zoomPreviewAt(node, event) {
  const s = getState(node), d = s.dom;
  const rect = d.stage.getBoundingClientRect();
  const oldZoom = s.zoom || 1;
  const wheel = event.deltaY || event.deltaX || 0;
  const nextZoom = clamp(oldZoom * Math.exp(-wheel * 0.0015), 1, 6, oldZoom);

  if (Math.abs(nextZoom - oldZoom) < 0.001) return;
  const px = event.clientX - rect.left - rect.width / 2;
  const py = event.clientY - rect.top - rect.height / 2;
  const anchorX = (px - s.panX) / oldZoom;
  const anchorY = (py - s.panY) / oldZoom;

  s.zoom = nextZoom;
  if (s.zoom <= 1.001) {
    s.zoom = 1;
    s.panX = 0;
    s.panY = 0;
  } else {
    s.panX = px - anchorX * s.zoom;
    s.panY = py - anchorY * s.zoom;
    clampPan(node);
  }
  applyMode(node);
  render(node);
}
function startFullscreenHorizontalPan(node, event) {
  const s = getState(node), d = s.dom;
  if (!isFullscreenRoot(d.root)) return false;

  event.preventDefault();
  event.stopPropagation();
  if (s.zoom <= 1 || (!s.haveA && !s.haveB)) return true;

  let startX = event.clientX - s.panX;
  d.stage.classList.add("grabbing");

  const move = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    s.panX = ev.clientX - startX;
    clampPan(node);
    render(node);
  };
  const done = (ev) => {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    d.stage.classList.remove("grabbing");
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", done, true);
    window.removeEventListener("pointercancel", done, true);
  };

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", done, true);
  window.addEventListener("pointercancel", done, true);
  return true;
}
function wireInteractions(node, d, btns) {
  const s = getState(node);
  const stage = d.stage;

  stage.addEventListener("pointerenter", () => {
    s.hovering = true; markGesture(node); applyAudioGains(node);
  });
  stage.addEventListener("pointerleave", () => {
    s.hovering = false; applyAudioGains(node);
  });

  stage.addEventListener("pointerdown", (e) => {
    if (!s.haveA && !s.haveB) return;
    e.stopPropagation();
    markGesture(node);
    s.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (s.mode === "Slider" && s.zoom === 1 && s.haveA && s.haveB) {
      s.draggingSplit = true;
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split));
      render(node); stage.setPointerCapture(e.pointerId); return;
    }
    if (s.zoom > 1) {
      s.panning = true;
      s.panStart = { x: e.clientX - s.panX, y: e.clientY - s.panY };
      stage.classList.add("grabbing"); stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (s.draggingSplit || s.panning || s.scrubbing ||
        ((s.haveA || s.haveB) && s.mode === "Slider")) e.stopPropagation();
    if (s.down && !s.down.moved &&
        Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > 6)
      s.down.moved = true;
    if (s.draggingSplit) {
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split)); render(node);
    } else if (s.panning) {
      s.panX = e.clientX - s.panStart.x; s.panY = e.clientY - s.panStart.y;
      clampPan(node); render(node);
    } else if (s.mode === "Slider" && s.haveA && s.haveB && !s.scrubbing) {
      // original feel: the divider follows the bare mouse move
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split)); render(node);
    }
  });
  const endPtr = (e) => {
    if (e) e.stopPropagation();
    const dn = s.down; s.down = null;
    s.draggingSplit = false; s.panning = false;
    stage.classList.remove("grabbing");
    // click (no move, <350ms) = play/pause toggle, in every mode incl.
    // Slider — a real drag sets dn.moved so it won't toggle (original feel)
    if (!(e && e.type === "pointerup" && dn && !dn.moved &&
          (performance.now() - dn.t) < 350 && (s.haveA || s.haveB))) return;
    if (s.mode === "Toggle") {
      s.tgl = s.tgl === "A" ? "B" : "A"; applyTgl(node); render(node);
    } else togglePlay(node);
  };
  stage.addEventListener("pointerup", endPtr);
  stage.addEventListener("pointercancel", endPtr);

  // wheel anywhere on the node -> ComfyUI canvas owns zoom (preview never
  // stretches); same behaviour as the original node
  d.root.addEventListener("wheel", (e) => {
    if (isFullscreenRoot(d.root)) {
      e.preventDefault();
      e.stopPropagation();
      zoomPreviewAt(node, e);
      return;
    }
    const cv = app.canvas && app.canvas.canvas;
    if (!cv) return;
    e.preventDefault();
    cv.dispatchEvent(new WheelEvent("wheel", {
      deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode,
      clientX: e.clientX, clientY: e.clientY,
      bubbles: true, cancelable: true,
    }));
  }, { passive: false });
  // middle-button drag -> pan the ComfyUI graph (version-robust, ported)
  d.root.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;
    if (startFullscreenHorizontalPan(node, e)) return;
    e.preventDefault(); e.stopPropagation();
    const cv = app.canvas;
    if (!cv || !cv.ds || !cv.ds.offset) return;
    let lx = e.clientX, ly = e.clientY;
    const mv = (ev) => {
      const sc = cv.ds.scale || 1;
      cv.ds.offset[0] += (ev.clientX - lx) / sc;
      cv.ds.offset[1] += (ev.clientY - ly) / sc;
      lx = ev.clientX; ly = ev.clientY;
      (cv.setDirty ? cv.setDirty(true, true)
        : app.graph?.setDirtyCanvas(true, true));
    };
    const up = () => {
      window.removeEventListener("pointermove", mv, true);
      window.removeEventListener("pointerup", up, true);
    };
    window.addEventListener("pointermove", mv, true);
    window.addEventListener("pointerup", up, true);
  }, true);
  d.root.addEventListener("auxclick", (e) => {
    if (e.button !== 1 || !isFullscreenRoot(d.root)) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  d.scrub.addEventListener("pointerdown", (e) => {
    if (!s.frameCount) return;
    e.stopPropagation();
    markGesture(node);
    s.scrubbing = true; s._wasPlaying = s.playing; pausePlayback(node);
    d.scrub.setPointerCapture(e.pointerId); scrubTo(node, e.clientX);
  });
  d.scrub.addEventListener("pointermove", (e) => {
    if (s.scrubbing) { e.stopPropagation(); scrubTo(node, e.clientX); }
  });
  d.scrub.addEventListener("pointerup", (e) => {
    if (!s.scrubbing) return;
    e.stopPropagation();
    s.scrubbing = false; if (s._wasPlaying) startPlayback(node);
  });

  btns.playBtn.onclick = () => { markGesture(node); togglePlay(node); };
  btns.loopBtn.onclick = () => {
    s.loop = !s.loop; btns.loopBtn.classList.toggle("on", s.loop);
  };
  btns.backBtn.onclick = () => stepFrame(node, -1);
  btns.fwdBtn.onclick = () => stepFrame(node, 1);
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
  btns.spdBtn.onclick = () => {
    s.speed = SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length];
    if (s.playing) {
      s.startT = s.t; s.playMs = performance.now();
      restartAudio(node);   // apply the new rate to the audio sources
    }
    btns.spdBtn.textContent = s.speed.toFixed(2).replace(/0$/, "") + "×";
  };
  btns.swapBtn.onclick = () => {
    if (!s.haveA || !s.haveB) return;
    s.swapped = !s.swapped;
    setWidget(node, "swap", s.swapped);
    d.root.classList.toggle("swp", s.swapped);
    updateLabels(node);
    if (s.playing) restartAudio(node);   // A/B audio follows the swap
    applyAudioGains(node);
    render(node);
  };
  btns.labelsBtn.onclick = () => {
    s.burnLabels = !s.burnLabels;
    setWidget(node, "burn_labels", s.burnLabels);
    btns.labelsBtn.classList.toggle("on", s.burnLabels);
  };
  const updateFsButton = () => {
    const active = isFullscreenRoot(d.root);
    btns.fsBtn.textContent = active ? "⛶ Exit" : "⛶ Full";
    btns.fsBtn.classList.toggle("on", active);
    applyAudioGains(node);
    requestAnimationFrame(() => render(node));
  };
  d.onFullscreenChange = updateFsButton;
  document.addEventListener("fullscreenchange", updateFsButton);
  document.addEventListener("webkitfullscreenchange", updateFsButton);
  btns.fsBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btns.fsBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    markGesture(node);
    try {
      if (isFullscreenRoot(d.root)) {
        if (document.exitFullscreen) document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      } else if (d.root.requestFullscreen) {
        d.root.requestFullscreen();
      } else if (d.root.webkitRequestFullscreen) {
        d.root.webkitRequestFullscreen();
      }
    } catch (err) { /* fullscreen may be blocked by browser policy */ }
    updateFsButton();
  };
  const setAud = (a) => { markGesture(node); s.audio = a; applyAudioGains(node); };
  d.audN.onclick = () => setAud("none");
  d.audA.onclick = () => setAud("A");
  d.audB.onclick = () => setAud("B");
}
function scrubTo(node, clientX) {
  const s = getState(node);
  const r = s.dom.scrub.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
  seekAll(node, ratio * (getTimeline(node).dur || 0));
}
