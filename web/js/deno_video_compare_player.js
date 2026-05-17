import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// (Deno) Video Compare (Player) — Registry-clean interactive A/B compare.
// The backend writes a downscaled WebP frame sequence for A and B into the
// ComfyUI temp dir; this widget plays them on a <canvas> with a virtual
// clock (rAF), so we get drag-slider / Side by Side / Difference / Toggle /
// synced playback with NO encoder, NO <video>, NO new server route — just
// the existing /view file route. Audio is added in a later phase.

const NODE_NAME = "DenoVideoComparePlayer";
const WIDGET_NAME = "deno_vcp_canvas";
const MODES = ["Slider", "Side by Side", "Difference", "Toggle"];
const HIDDEN_WIDGETS = ["mode", "split_position", "toggle_image", "swap"];
const NODE_MIN_W = 480;
const NODE_DEFAULT_H = 600;
const CACHE_BUDGET = 360;     // decoded frames kept (A+B), LRU evicted
const PRELOAD_AHEAD = 16;     // frames preloaded ahead of the playhead
const PRELOAD_BEHIND = 4;

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
.dvp .btn{background:rgba(9,15,11,.92);border:1px solid rgba(90,130,104,.6);
  color:#9dffba;padding:6px 11px;border-radius:999px;font-weight:800;
  font-size:11px;white-space:nowrap;transition:.12s}
.dvp .btn:hover{border-color:#48ff84;color:#f0fff4}
.dvp .btn.on{background:rgba(31,96,50,.92);border-color:rgba(72,255,132,.95);
  color:#f0fff4;box-shadow:0 0 12px rgba(72,255,132,.28)}
.dvp .btn.icn{padding:6px 9px;min-width:32px;text-align:center}
.dvp .btn[disabled]{opacity:.4;cursor:not-allowed}
.dvp .title{font-weight:900;font-size:13px;color:#9dffba;display:flex;
  align-items:center;gap:7px}
.dvp .title .dot{width:8px;height:8px;border-radius:50%;background:#48ff84;
  box-shadow:0 0 8px #48ff84}
.dvp .title small{font-weight:600;font-size:10px;color:#7fb893}
.dvp .modes{display:flex;gap:5px;margin-left:auto;flex-wrap:wrap}
.dvp .swap{border-color:#48ff84;color:#48ff84;font-weight:900;margin-left:6px}
.dvp .stage{position:relative;flex:1 1 auto;background:#020403;overflow:hidden;
  display:flex;align-items:center;justify-content:center;min-height:160px;
  cursor:crosshair}
.dvp.m-tgl .stage{cursor:pointer}
.dvp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.dvp .corner{position:absolute;z-index:6;top:10px;display:flex;
  align-items:center;gap:8px;pointer-events:none}
.dvp .corner.a{left:10px}.dvp .corner.b{right:10px;flex-direction:row-reverse}
.dvp .badge{width:22px;height:22px;border-radius:50%;background:#117638;
  border:1.5px solid #bfffd0;color:#effff4;font-weight:900;font-size:11px;
  line-height:19px;text-align:center}
.dvp .sinfo{font-size:10px;font-weight:800;color:#9dffba;
  background:rgba(7,16,11,.72);padding:3px 8px;border-radius:8px;white-space:nowrap}
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
.dvp .scrub{position:relative;height:20px;display:flex;align-items:center;
  cursor:pointer}
.dvp .scrub:hover .trk,.dvp .scrub:hover .fill{height:8px}
.dvp .trk{position:absolute;left:0;right:0;height:6px;border-radius:3px;
  background:rgba(72,255,132,.16);transition:height .1s}
.dvp .fill{position:absolute;height:6px;border-radius:3px;background:#48ff84;
  width:0;transition:height .1s}
.dvp .hd{position:absolute;width:14px;height:14px;border-radius:50%;
  background:#48ff84;box-shadow:0 0 8px rgba(72,255,132,.7);
  transform:translateX(-50%);border:2px solid #06100b}
.dvp .tr{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dvp .time{font-weight:800;font-variant-numeric:tabular-nums;color:#9dffba;font-size:12px}
.dvp .meta{margin-left:auto;font-size:10px;color:#7fb893;
  font-variant-numeric:tabular-nums;display:flex;gap:10px;flex-wrap:wrap}
.dvp .meta b{color:#48ff84}
.dvp .sep{width:1px;height:18px;background:rgba(72,255,132,.16)}
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
      fps: 24, frameCount: 0, duration: 0,
      sub: "", filesA: [], filesB: [], haveA: false, haveB: false,
      ar: 16 / 9, time: 0, playStartMs: 0, startTime: 0,
      cache: new Map(), useTick: 0, raf: 0, dom: null,
      scrubbing: false, draggingSplit: false, down: null,
      _fitting: false,
    };
  }
  return node.__dvp;
}

app.registerExtension({
  name: "Deno.VideoComparePlayer",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      setupNode(this);
      return r;
    };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      queueMicrotask(() => setupNode(this));
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
      if (s) s.cache?.clear?.();
      return onRemoved?.apply(this, arguments);
    };
  },
});

function setupNode(node) {
  if (!node || node.__dvpSetup) return;
  node.__dvpSetup = true;
  const st = getState(node);
  for (const n of HIDDEN_WIDGETS) hideWidget(getWidget(node, n));
  const mw = getWidget(node, "mode");
  if (mw && MODES.includes(String(mw.value))) st.mode = String(mw.value);
  const sw = getWidget(node, "split_position");
  if (sw != null) st.split = clamp(Number(sw.value), 0.02, 0.98, 0.5);
  const tw = getWidget(node, "toggle_image");
  if (tw && ["A", "B"].includes(String(tw.value))) st.tgl = String(tw.value);
  const wsw = getWidget(node, "swap");
  if (wsw != null) st.swapped = !!wsw.value;

  buildDom(node);
  if ((node.size?.[0] || 0) < NODE_MIN_W || (node.size?.[1] || 0) < NODE_DEFAULT_H) {
    node.setSize?.([Math.max(node.size?.[0] || 0, NODE_MIN_W),
                    Math.max(node.size?.[1] || 0, NODE_DEFAULT_H)]);
  }
  if (!node.__dvpResizeWrapped) {
    node.__dvpResizeWrapped = true;
    const orz = node.onResize;
    node.onResize = function () {
      const r = orz?.apply(this, arguments);
      fitNode(this);
      return r;
    };
  }
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
  top.appendChild(el("div", "title",
    `<span class="dot"></span>Video Compare <small>· canvas player</small>`));
  const modes = el("div", "modes");
  const modeBtns = {};
  for (const m of MODES) {
    const b = el("button", "btn mode" + (m === st.mode ? " on" : ""), m);
    b.onclick = () => setMode(node, m);
    modeBtns[m] = b; modes.appendChild(b);
  }
  top.appendChild(modes);
  const swapBtn = el("button", "btn swap", "⇄ Swap");
  top.appendChild(swapBtn);
  root.appendChild(top);

  const stage = el("div", "stage");
  const canvas = el("canvas");
  stage.appendChild(canvas);
  const badgeA = el("div", "badge", "A");
  const badgeB = el("div", "badge", "B");
  const sinfoA = el("div", "sinfo", "");
  const sinfoB = el("div", "sinfo", "");
  const cornerA = el("div", "corner a"); cornerA.append(badgeA, sinfoA);
  const cornerB = el("div", "corner b"); cornerB.append(badgeB, sinfoB);
  const tglBadge = el("div", "tgl", st.tgl);
  const hint = el("div", "hint", "Run the workflow to preview");
  stage.append(cornerA, cornerB, tglBadge, hint);
  root.appendChild(stage);

  const bot = el("div", "bar bot");
  const scrub = el("div", "scrub");
  scrub.title = "Progress bar — drag to seek";
  scrub.append(el("div", "trk"), el("div", "fill"), el("div", "hd"));
  bot.appendChild(scrub);
  const tr = el("div", "tr");
  const playBtn = el("button", "btn icn", "▶"); playBtn.disabled = true;
  const loopBtn = el("button", "btn icn on", "↻");
  const backBtn = el("button", "btn icn", "⏮");
  const fwdBtn = el("button", "btn icn", "⏭");
  const spdBtn = el("button", "btn", "1.0×");
  const time = el("span", "time", "00:00 / 00:00");
  const meta = el("div", "meta", "");
  tr.append(playBtn, loopBtn, backBtn, fwdBtn, spdBtn,
    el("span", "sep"), time, meta);
  bot.appendChild(tr);
  root.appendChild(bot);

  const dom = {
    root, stage, canvas, ctx: canvas.getContext("2d"),
    badgeA, badgeB, sinfoA, sinfoB, tglBadge, hint,
    scrub, fill: scrub.querySelector(".fill"), head: scrub.querySelector(".hd"),
    time, meta, playBtn, loopBtn, spdBtn, modeBtns,
  };
  st.dom = dom;

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, {
    serialize: false, hideOnZoom: false, getMinHeight: () => 340,
  });
  widget.computeSize = (w) => [Math.max(w || NODE_MIN_W, NODE_MIN_W),
    Math.max((node.size?.[1] || NODE_DEFAULT_H) - 90 - nativeWidgetsHeight(node), 300)];
  node.__dvpWidget = widget;

  wireInteractions(node, dom, { swapBtn, playBtn, loopBtn, backBtn, fwdBtn, spdBtn });
  applyMode(node);
  render(node);
}

/* ---------- frame cache (LRU) ---------- */
function frameURL(node, side, i) {
  const s = getState(node);
  const list = side === "a" ? s.filesA : s.filesB;
  const fn = list[i];
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
    const drop = s.cache.size - CACHE_BUDGET;
    for (let j = 0; j < drop; j++) {
      const [url, e] = ents[j];
      try { e.img.src = ""; } catch (er) {}
      s.cache.delete(url);
    }
  }
}

/* ---------- render ---------- */
function curIndex(node) {
  const s = getState(node);
  if (!s.frameCount) return 0;
  let i = Math.floor((s.time || 0) * s.fps);
  if (s.loop) i = ((i % s.frameCount) + s.frameCount) % s.frameCount;
  return Math.max(0, Math.min(s.frameCount - 1, i));
}
function sideEntry(node, logical) {
  // logical "A"/"B" -> physical side honoring swap
  const s = getState(node);
  const phys = s.swapped ? (logical === "A" ? "b" : "a") : (logical === "A" ? "a" : "b");
  const have = phys === "a" ? s.haveA : s.haveB;
  if (!have) return null;
  return getImg(node, phys, curIndex(node));
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
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#020403";
  ctx.fillRect(0, 0, W, H);

  if (s.frameCount > 0) {
    const idx = curIndex(node);
    preload(node, idx);
    const eA = sideEntry(node, "A");
    const eB = sideEntry(node, "B");
    const iA = eA && eA.ready ? eA.img : null;
    const iB = eB && eB.ready ? eB.img : null;
    const onlyOne = !(s.haveA && s.haveB);

    if (s.mode === "Side by Side" && !onlyOne) {
      const hw = W / 2;
      if (iA) drawFit(ctx, iA, 0, 0, hw, H);
      if (iB) drawFit(ctx, iB, hw, 0, hw, H);
      ctx.strokeStyle = "rgba(72,255,132,.5)";
      ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, H); ctx.stroke();
    } else if (s.mode === "Difference" && !onlyOne) {
      if (iA) drawFit(ctx, iA, 0, 0, W, H);
      ctx.globalCompositeOperation = "difference";
      if (iB) drawFit(ctx, iB, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    } else if (s.mode === "Toggle") {
      const show = onlyOne ? (s.haveA ? "A" : "B") : s.tgl;
      const e = sideEntry(node, show);
      if (e && e.ready) drawFit(ctx, e.img, 0, 0, W, H);
    } else { // Slider (or single side)
      if (iA) drawFit(ctx, iA, 0, 0, W, H);
      if (iB && !onlyOne) {
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

  const dur = s.duration || (s.frameCount / s.fps) || 0;
  const r = dur > 0 ? Math.min(1, (s.time || 0) / dur) : 0;
  d.fill.style.width = (r * 100) + "%";
  d.head.style.left = (r * 100) + "%";
  d.time.textContent = fmt(s.time) + " / " + fmt(dur);
}

/* ---------- playback (virtual clock) ---------- */
function durationOf(node) {
  const s = getState(node);
  return s.duration > 0 ? s.duration : (s.frameCount > 0 ? s.frameCount / s.fps : 0);
}
function startPlayback(node) {
  const s = getState(node);
  if (!s.frameCount) return;
  if (s.time >= durationOf(node) - 1e-3) s.time = 0;
  s.playing = true;
  s.startTime = s.time;
  s.playStartMs = performance.now();
  s.dom.playBtn.textContent = "❚❚";
  s.dom.playBtn.classList.add("on");
}
function pausePlayback(node) {
  const s = getState(node);
  s.playing = false;
  s.dom.playBtn.textContent = "▶";
  s.dom.playBtn.classList.remove("on");
}
function togglePlay(node) {
  getState(node).playing ? pausePlayback(node) : startPlayback(node);
}
function seekTime(node, t) {
  const s = getState(node);
  s.time = Math.max(0, Math.min(t, durationOf(node)));
  if (s.playing) { s.startTime = s.time; s.playStartMs = performance.now(); }
  render(node);
}
function stepFrame(node, dir) {
  const s = getState(node);
  pausePlayback(node);
  const i = Math.max(0, Math.min(s.frameCount - 1, curIndex(node) + dir));
  seekTime(node, (i + 0.001) / s.fps);
}
function loopOf(node) {
  const tick = () => {
    const s = node.__dvp;
    if (!s) return;
    if (!s.dom || !s.dom.root.isConnected) {
      s.raf = requestAnimationFrame(tick); return;
    }
    if (s.playing && s.frameCount > 0) {
      const dur = durationOf(node);
      const elapsed = (performance.now() - s.playStartMs) / 1000 * s.speed;
      let t = s.startTime + elapsed;
      if (t >= dur) {
        if (s.loop) { s.startTime = 0; s.playStartMs = performance.now(); t = 0; }
        else { t = dur; pausePlayback(node); }
      }
      s.time = t;
    }
    render(node);
    s.raf = requestAnimationFrame(tick);
  };
  return tick;
}

/* ---------- modes ---------- */
function setMode(node, m) {
  const s = getState(node);
  s.mode = m; setWidget(node, "mode", m);
  applyMode(node);
  if (m === "Toggle") pausePlayback(node);
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
  d.tglBadge.textContent = s.tgl;
}
function updateLabels(node) {
  const s = getState(node), d = s.dom;
  d.badgeA.textContent = s.swapped ? "B" : "A";
  d.badgeB.textContent = s.swapped ? "A" : "B";
}

/* ---------- node sizing ---------- */
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
function fitNode(node) {
  const s = getState(node), d = s.dom;
  if (!d || !s.ar || s._fitting || !node.size) return;
  const kids = d.root.children;
  const topH = kids[0] ? kids[0].offsetHeight : 38;
  const botH = kids[kids.length - 1] ? kids[kids.length - 1].offsetHeight : 62;
  const w = Math.max(Number(node.size[0]) || NODE_MIN_W, NODE_MIN_W);
  const stageW = Math.max(w - 2, 80);
  const want = Math.round(90 + nativeWidgetsHeight(node) + topH + botH + stageW / s.ar);
  if (Math.abs((Number(node.size[1]) || 0) - want) > 4) {
    s._fitting = true;
    node.setSize([w, want]);
    s._fitting = false;
    node.setDirtyCanvas?.(true, true);
  }
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
  s.duration = Number(m.duration) > 0 ? Number(m.duration)
    : (s.frameCount > 0 ? s.frameCount / metaFps : 0);
  // Effective playback fps so the exported frames and the scrub gauge end
  // together. When the preview frame count is capped (long clip) the meta
  // fps no longer matches frameCount/duration, which made the bar keep
  // moving for ~1s after the last frame — derive it from the real pair.
  s.fps = (s.duration > 0 && s.frameCount > 0)
    ? (s.frameCount / s.duration) : metaFps;
  s.cache.clear(); s.useTick = 0;
  s.time = 0; s.startTime = 0;

  const aw = m.a_src_w, ah = m.a_src_h, bw = m.b_src_w, bh = m.b_src_h;
  s.ar = (s.haveA && aw > 0 && ah > 0) ? aw / ah
       : (s.haveB && bw > 0 && bh > 0) ? bw / bh : s.ar;

  let info = "";
  if (typeof m.error === "string" && m.error) info = m.error;
  else if (!s.haveA && !s.haveB) info = "Connect video_a / video_b";
  d.hint.textContent = info || "Run the workflow to preview";
  d.hint.classList.toggle("hide", (s.haveA || s.haveB) && !m.error);

  d.sinfoA.textContent = m.a_count
    ? `${m.a_src_w}×${m.a_src_h} · ${m.a_count}f` : "";
  d.sinfoB.textContent = m.b_count
    ? `${m.b_src_w}×${m.b_src_h} · ${m.b_count}f` : "";
  d.meta.innerHTML = s.frameCount
    ? `<span><b>${s.frameCount}</b> frames</span>` +
      `<span><b>${s.fps}</b> fps preview</span>` +
      (m.output_fullres ? `<span>output: <b>full-res</b></span>` : "")
    : "";

  d.playBtn.disabled = !(s.haveA || s.haveB);
  updateLabels(node);
  d.root.classList.toggle("swp", s.swapped);

  fitNode(node);
  if (s.frameCount > 0 && s.mode !== "Toggle") startPlayback(node);
  else pausePlayback(node);
  render(node);
}

/* ---------- interactions ---------- */
function frameFrac(node, clientX) {
  const r = getState(node).dom.stage.getBoundingClientRect();
  return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
}
function wireInteractions(node, d, btns) {
  const s = getState(node);
  const stage = d.stage;

  stage.addEventListener("pointerdown", (e) => {
    if (!s.haveA && !s.haveB) return;
    e.stopPropagation();
    s.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (s.mode === "Slider" && s.haveA && s.haveB) {
      s.draggingSplit = true;
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split));
      render(node);
      stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (s.draggingSplit || s.scrubbing ||
        (s.mode === "Slider" && s.haveA && s.haveB)) e.stopPropagation();
    if (s.down && !s.down.moved &&
        Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > 6)
      s.down.moved = true;
    if (s.draggingSplit) {
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split));
      render(node);
    } else if (s.mode === "Slider" && s.haveA && s.haveB && !s.scrubbing) {
      // original feel: the divider follows the bare mouse move (no drag)
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split));
      render(node);
    }
  });
  const endPtr = (e) => {
    if (e) e.stopPropagation();
    const dn = s.down; s.down = null;
    const wasDrag = s.draggingSplit;
    s.draggingSplit = false;
    if (wasDrag) return;
    if (!(e && e.type === "pointerup" && dn && !dn.moved &&
          (performance.now() - dn.t) < 350 && (s.haveA || s.haveB))) return;
    if (s.mode === "Toggle") {
      s.tgl = s.tgl === "A" ? "B" : "A";
      setWidget(node, "toggle_image", s.tgl);
      d.tglBadge.textContent = s.tgl;
      render(node);
    } else togglePlay(node);
  };
  stage.addEventListener("pointerup", endPtr);
  stage.addEventListener("pointercancel", endPtr);

  // wheel over the node -> ComfyUI graph zoom (don't swallow it)
  d.root.addEventListener("wheel", (e) => {
    const cv = app.canvas && app.canvas.canvas;
    if (!cv) return;
    e.preventDefault();
    cv.dispatchEvent(new WheelEvent("wheel", {
      deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode,
      clientX: e.clientX, clientY: e.clientY,
      bubbles: true, cancelable: true,
    }));
  }, { passive: false });

  d.scrub.addEventListener("pointerdown", (e) => {
    if (!s.frameCount) return;
    e.stopPropagation();
    s.scrubbing = true; s._wasPlaying = s.playing;
    pausePlayback(node);
    d.scrub.setPointerCapture(e.pointerId);
    scrubTo(node, e.clientX);
  });
  d.scrub.addEventListener("pointermove", (e) => {
    if (s.scrubbing) { e.stopPropagation(); scrubTo(node, e.clientX); }
  });
  d.scrub.addEventListener("pointerup", (e) => {
    if (!s.scrubbing) return;
    e.stopPropagation();
    s.scrubbing = false;
    if (s._wasPlaying) startPlayback(node);
  });

  btns.playBtn.onclick = () => togglePlay(node);
  btns.loopBtn.onclick = () => {
    s.loop = !s.loop; btns.loopBtn.classList.toggle("on", s.loop);
  };
  btns.backBtn.onclick = () => stepFrame(node, -1);
  btns.fwdBtn.onclick = () => stepFrame(node, 1);
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
  btns.spdBtn.onclick = () => {
    s.speed = SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length];
    if (s.playing) { s.startTime = s.time; s.playStartMs = performance.now(); }
    btns.spdBtn.textContent = s.speed.toFixed(2).replace(/0$/, "") + "×";
  };
  btns.swapBtn.onclick = () => {
    if (!s.haveA || !s.haveB) return;
    s.swapped = !s.swapped;
    setWidget(node, "swap", s.swapped);
    d.root.classList.toggle("swp", s.swapped);
    updateLabels(node);
    render(node);
  };
}
function scrubTo(node, clientX) {
  const s = getState(node);
  const r = s.dom.scrub.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
  seekTime(node, ratio * durationOf(node));
}
