import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// (Deno) Video Compare — synced A/B video preview.
// Backend encodes each input to ONE temp mp4; this widget plays them with
// two native <video> elements (codec-decoded, light even at 4K) instead of
// loading a full PNG sequence. UX matches the standalone web tool:
// Slider / Side by Side / Difference / Toggle, shared timeline with
// rate-based sync (no seek glitches), synced zoom/pan, no-reload swap.

const NODE_NAME = "DenoVideoCompare";
const WIDGET_NAME = "deno_video_compare_canvas";
const MODES = ["Slider", "Side by Side", "Difference", "Toggle"];
const HIDDEN_WIDGETS = ["mode", "split_position", "toggle_image", "swap", "fps"];
const TAGLINE = "Synced A/B playback on a shared timeline.";
const NODE_MIN_W = 480;
const NODE_DEFAULT_H = 620;

const CSS = `
.dvc{position:absolute;inset:0;display:flex;flex-direction:column;
  font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#dfffea;background:#050906;border-radius:10px;overflow:hidden;
  border:1px solid rgba(72,255,132,.32);user-select:none}
.dvc *{box-sizing:border-box;margin:0;padding:0}
.dvc button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
.dvc .bar{display:flex;align-items:center;gap:6px;padding:7px 9px;flex-wrap:wrap;
  background:linear-gradient(180deg,#0a1410,#06100b);position:relative}
.dvc .bar.top{border-bottom:1px solid rgba(72,255,132,.28)}
.dvc .bar.bot{border-top:1px solid rgba(72,255,132,.28);flex-direction:column;
  align-items:stretch;gap:7px}
.dvc .btn{background:rgba(9,15,11,.92);border:1px solid rgba(90,130,104,.6);
  color:#9dffba;padding:6px 11px;border-radius:999px;font-weight:800;
  font-size:11px;white-space:nowrap;transition:.12s}
.dvc .btn:hover{border-color:#48ff84;color:#f0fff4}
.dvc .btn.on{background:rgba(31,96,50,.92);border-color:rgba(72,255,132,.95);
  color:#f0fff4;box-shadow:0 0 12px rgba(72,255,132,.28)}
.dvc .btn.icn{padding:6px 9px;min-width:32px;text-align:center}
.dvc .btn[disabled]{opacity:.4;cursor:not-allowed}
.dvc .title{font-weight:900;font-size:13px;color:#9dffba;display:flex;
  align-items:center;gap:7px}
.dvc .title .dot{width:8px;height:8px;border-radius:50%;background:#48ff84;
  box-shadow:0 0 8px #48ff84}
.dvc .title small{font-weight:600;font-size:10px;color:#7fb893}
.dvc .modes{display:flex;gap:5px;margin-left:auto;flex-wrap:wrap}
.dvc .swap{border-color:#48ff84;color:#48ff84;font-weight:900;margin-left:6px}
.dvc .info{width:22px;height:22px;border-radius:50%;border:1.5px solid #48ff84;
  color:#48ff84;font-weight:900;font-size:12px;display:flex;align-items:center;
  justify-content:center;background:rgba(7,16,11,.85)}
.dvc .info:hover{background:rgba(72,255,132,.14)}
.dvc .stage{position:relative;flex:1 1 auto;background:#020403;overflow:hidden;
  display:flex;align-items:center;justify-content:center;min-height:160px;
  cursor:crosshair}
.dvc .stage.pan{cursor:grab}.dvc .stage.pan.grabbing{cursor:grabbing}
.dvc .frame{position:relative;width:100%;height:100%;
  transition:transform .04s linear;will-change:transform}
.dvc video{position:absolute;inset:0;width:100%;height:100%;
  object-fit:contain;background:#000;pointer-events:none}
.dvc .vB{z-index:1}.dvc .vA{z-index:2}
.dvc.m-slider .vA{clip-path:inset(0 calc((1 - var(--sp)) * 100%) 0 0)}
.dvc.m-slider.swp .vA{clip-path:none;z-index:1}
.dvc.m-slider.swp .vB{clip-path:inset(0 calc((1 - var(--sp)) * 100%) 0 0);z-index:2}
.dvc.m-sxs .vA{width:50%;left:0}.dvc.m-sxs .vB{width:50%;left:50%}
.dvc.m-sxs.swp .vA{left:50%}.dvc.m-sxs.swp .vB{left:0}
.dvc.m-diff .vA{mix-blend-mode:difference}
.dvc.m-tgl.sa .vB{opacity:0}.dvc.m-tgl.sb .vA{opacity:0}
.dvc.m-tgl .stage{cursor:pointer}
.dvc .divider{position:absolute;top:0;bottom:0;left:calc(var(--sp) * 100%);
  width:2px;background:#48ff84;box-shadow:0 0 8px rgba(72,255,132,.7);
  z-index:5;transform:translateX(-1px);display:none;pointer-events:none}
.dvc.m-slider .divider{display:block}
.dvc .corner{position:absolute;z-index:6;top:10px;display:flex;
  align-items:center;gap:8px;pointer-events:none}
.dvc .corner.a{left:10px}
.dvc .corner.b{right:10px;flex-direction:row-reverse}
.dvc .badge{flex:0 0 auto;width:22px;height:22px;border-radius:50%;
  background:#117638;border:1.5px solid #bfffd0;color:#effff4;
  font-weight:900;font-size:11px;display:block;line-height:19px;
  text-align:center}
.dvc .sinfo{font-size:10px;font-weight:800;color:#9dffba;
  background:rgba(7,16,11,.72);padding:3px 8px;border-radius:8px;
  white-space:nowrap}
.dvc.m-tgl .corner{display:none}
.dvc .tgl{display:none;position:absolute;z-index:6;top:10px;left:50%;
  transform:translateX(-50%);padding:5px 16px;border-radius:999px;
  background:rgba(7,16,11,.9);border:1.5px solid #48ff84;color:#48ff84;
  font-weight:900;font-size:13px;line-height:1}
.dvc.m-tgl .tgl{display:block}
.dvc .hint{position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;color:#7fb893;font-size:13px;text-align:center;
  padding:20px;z-index:8;pointer-events:none}
.dvc .hint.hide{display:none}
.dvc .scrub{position:relative;height:14px;display:flex;align-items:center;
  cursor:pointer}
.dvc .trk{position:absolute;left:0;right:0;height:5px;border-radius:3px;
  background:rgba(72,255,132,.14)}
.dvc .fill{position:absolute;height:5px;border-radius:3px;background:#48ff84;width:0}
.dvc .hd{position:absolute;width:12px;height:12px;border-radius:50%;
  background:#48ff84;box-shadow:0 0 8px rgba(72,255,132,.7);transform:translateX(-50%)}
.dvc .tr{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dvc .time{font-weight:800;font-variant-numeric:tabular-nums;color:#9dffba;
  font-size:12px}
.dvc .meta{margin-left:auto;font-size:10px;color:#7fb893;
  font-variant-numeric:tabular-nums;display:flex;gap:12px;flex-wrap:wrap}
.dvc .meta b{color:#48ff84}
.dvc .sep{width:1px;height:18px;background:rgba(72,255,132,.16)}
.dvc .zl{font-weight:800;color:#9dffba;font-size:11px;min-width:40px;
  text-align:center;font-variant-numeric:tabular-nums}
.dvc .pop{position:absolute;right:9px;top:38px;z-index:20;max-width:280px;
  background:rgba(6,16,11,.97);border:1px solid rgba(72,255,132,.32);
  border-radius:10px;padding:12px 14px;font-size:11px;color:#9fd4b0;
  line-height:1.7;display:none}
.dvc .pop.show{display:block}
.dvc .pop b{color:#9dffba}
`;

function viewUrl(d) {
  if (!d || !d.filename) return "";
  const sub = encodeURIComponent(d.subfolder || "");
  return api.apiURL(
    `/view?filename=${encodeURIComponent(d.filename)}` +
    `&type=${d.type || "temp"}&subfolder=${sub}&dvc=${Date.now()}`);
}

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
  if (!w || w.__dvcHidden) return;
  w.__dvcHidden = true;
  w.hidden = true;
  w.type = "converted-widget";
  w.computeSize = () => [0, -4];
  w.draw = () => {};
  const e = w.element;
  if (e) { e.hidden = true; e.style.display = "none"; }
}

function getState(node) {
  if (!node.__dvc) {
    node.__dvc = {
      mode: "Slider", split: 0.5, tgl: "B", swapped: false,
      playing: false, loop: true, speed: 1, audio: "A",
      zoom: 1, panX: 0, panY: 0,
      haveA: false, haveB: false, scrubbing: false,
      draggingSplit: false, panning: false, panStart: null,
      down: null, starting: false, raf: 0, dom: null,
      gestured: false, aHasAudio: false, bHasAudio: false,
      hovering: false, ar: 16 / 9, _fitting: false,
    };
  }
  return node.__dvc;
}

app.registerExtension({
  name: "Deno.VideoCompare",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      setupVideoCompareNode(this);
      return r;
    };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      queueMicrotask(() => setupVideoCompareNode(this));
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
      stopPlayback(this);
      const v = this.__dvc?.dom;
      if (v) { try { v.vidA.src = ""; v.vidB.src = ""; } catch (e) {} }
      return onRemoved?.apply(this, arguments);
    };
  },
});

function setupVideoCompareNode(node) {
  if (!node || node.__dvcSetup) return;
  node.__dvcSetup = true;
  const st = getState(node);

  for (const n of HIDDEN_WIDGETS) hideWidget(getWidget(node, n));
  // subtle point: the IMAGE output only means something in SbS/Diff
  const out = node.outputs && node.outputs[0];
  if (out) out.label = "Output Images SBS/Diff";
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
  if (!node.__dvcResizeWrapped) {
    node.__dvcResizeWrapped = true;
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
  if (!document.getElementById("dvc-style")) {
    const s = el("style"); s.id = "dvc-style"; s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = el("div", "dvc m-slider");

  const top = el("div", "bar top");
  top.appendChild(el("div", "title",
    `<span class="dot"></span>Video Compare <small>· synced A/B</small>`));
  const modes = el("div", "modes");
  const modeBtns = {};
  for (const m of MODES) {
    const b = el("button", "btn mode" + (m === st.mode ? " on" : ""), m);
    b.onclick = () => setMode(node, m);
    modeBtns[m] = b; modes.appendChild(b);
  }
  top.appendChild(modes);
  const swapBtn = el("button", "btn swap", "⇄ Swap");
  swapBtn.title = TAGLINE;
  top.appendChild(swapBtn);
  root.appendChild(top);

  const stage = el("div", "stage");
  const frame = el("div", "frame");
  const vidB = el("video"); vidB.className = "vB";
  const vidA = el("video"); vidA.className = "vA";
  for (const v of [vidB, vidA]) {
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.loop = false;
  }
  frame.appendChild(vidB); frame.appendChild(vidA);
  const divider = el("div", "divider");
  frame.appendChild(divider);
  stage.appendChild(frame);
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
  scrub.append(el("div", "trk"), el("div", "fill"), el("div", "hd"));
  const fill = scrub.querySelector(".fill");
  const head = scrub.querySelector(".hd");
  bot.appendChild(scrub);
  const tr = el("div", "tr");
  const playBtn = el("button", "btn icn", "▶"); playBtn.disabled = true;
  const loopBtn = el("button", "btn icn on", "↻");
  const backBtn = el("button", "btn icn", "⏮");
  const fwdBtn = el("button", "btn icn", "⏭");
  const spdBtn = el("button", "btn", "1.0×");
  const sep1 = el("span", "sep");
  const audN = el("button", "btn icn", "🔇");
  const audA = el("button", "btn icn on", "🔊A");
  const audB = el("button", "btn icn", "🔊B");
  const time = el("span", "time", "00:00 / 00:00");
  const meta = el("div", "meta", "");
  tr.append(playBtn, loopBtn, backBtn, fwdBtn, spdBtn, sep1,
    audN, audA, audB, time, meta);
  bot.appendChild(tr);
  root.appendChild(bot);

  const dom = {
    root, stage, frame, vidA, vidB, divider, badgeA, badgeB, tglBadge,
    sinfoA, sinfoB, hint, fill, head, scrub, time, meta, playBtn,
    loopBtn, spdBtn, modeBtns, audN, audA, audB,
  };
  st.dom = dom;

  const widget = node.addDOMWidget(WIDGET_NAME, "div", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => 360,
  });
  // Restored 2c2b7bc: fitNode is the real height authority (runs every
  // resize); this just tracks it. Runaway is prevented by always having
  // s.ar set (default below) so fitNode never no-ops on an empty node.
  widget.computeSize = (w) => [Math.max(w || NODE_MIN_W, NODE_MIN_W),
                               Math.max((node.size?.[1] || NODE_DEFAULT_H) - 90, 320)];
  node.__dvcWidget = widget;

  wireInteractions(node, dom, {
    swapBtn, playBtn, loopBtn, backBtn, fwdBtn, spdBtn,
    audN, audA, audB,
  });
  applyMode(node); applyTgl(node); updateLabels(node); applyAudio(node);
  render(node);
}

/* ---------- timeline / sync (rate-based, no seek glitch) ---------- */
function master(node) {
  const s = getState(node), d = s.dom;
  return s.haveA ? d.vidA : d.vidB;
}
function follower(node) {
  const s = getState(node), d = s.dom;
  return s.haveA ? (s.haveB ? d.vidB : null) : null;
}
function getTimeline(node) {
  const m = master(node);
  const dur = (m && m.duration && isFinite(m.duration)) ? m.duration : 0;
  const t = m ? Math.min(m.currentTime || 0, dur || 1e9) : 0;
  return { dur, t };
}
function syncFollower(node, force) {
  const o = follower(node); if (!o) return;
  const m = master(node);
  const tgt = Math.min(m.currentTime || 0, o.duration || (m.currentTime || 0));
  const diff = o.currentTime - tgt;
  const A = Math.abs(diff);
  const s = getState(node);
  if (force || A > 0.5) {
    try { o.currentTime = tgt; } catch (e) {}
    o.playbackRate = s.speed; return;
  }
  if (!s.playing) {
    try { o.currentTime = tgt; } catch (e) {}   // pause -> exact snap
    o.playbackRate = s.speed; return;
  }
  if (A > 0.18) { try { o.currentTime = tgt; } catch (e) {} o.playbackRate = s.speed; return; }
  if (A < 0.004) o.playbackRate = s.speed;
  else { const k = Math.min(0.6, A * 8); o.playbackRate = s.speed * (diff > 0 ? 1 - k : 1 + k); }
}
// Frame-exact alignment on pause. A single seek can settle late (async
// decode) so we re-pin the follower once its 'seeked' fires, while still
// paused — fixes the "stopped on a desynced frame" case.
function snapPaused(node) {
  const s = getState(node), m = master(node), o = follower(node);
  if (!m) return;
  const t = m.currentTime || 0;
  try { m.currentTime = t; } catch (e) {}
  if (!o) return;
  o.playbackRate = s.speed;
  const tgt = Math.min(t, o.duration || t);
  try { o.currentTime = tgt; } catch (e) {}
  const re = () => {
    o.removeEventListener("seeked", re);
    if (s.playing) return;
    const t2 = Math.min(m.currentTime || 0, o.duration || (m.currentTime || 0));
    if (Math.abs(o.currentTime - t2) > 0.012) {
      try { o.currentTime = t2; } catch (e) {}
    }
  };
  o.addEventListener("seeked", re, { once: true });
}
function seekAll(node, t) {
  const m = master(node); if (!m) return;
  m.currentTime = Math.max(0, Math.min(t, m.duration || 0));
  syncFollower(node, true); render(node);
}
function startPlayback(node) {
  const s = getState(node);
  if (!s.haveA && !s.haveB) return;
  s.playing = true; s.dom.playBtn.textContent = "❚❚"; s.dom.playBtn.classList.add("on");
  const m = master(node), o = follower(node);
  if (m.ended || m.currentTime >= (m.duration - 0.05)) {
    m.currentTime = 0; if (o) { try { o.currentTime = 0; } catch (e) {} }
  }
  m.playbackRate = s.speed;
  if (!o) { m.play().catch(() => {}); return; }
  const tgt = m.currentTime;
  const needSeek = Math.abs(o.currentTime - tgt) > 0.008;
  if (needSeek) { try { o.currentTime = tgt; } catch (e) {} }
  o.playbackRate = s.speed;
  s.starting = true;
  const go = () => {
    if (!s.starting) return;
    s.starting = false;
    o.removeEventListener("seeked", go); o.removeEventListener("canplay", go);
    if (!s.playing) return;
    o.play().catch(() => {}); m.play().catch(() => {});
  };
  if (!needSeek && o.readyState >= 2) go();
  else {
    o.addEventListener("seeked", go); o.addEventListener("canplay", go);
    setTimeout(go, 220);
  }
}
function stopPlayback(node) {
  const s = node.__dvc; if (!s) return;
  s.playing = false; s.starting = false;
  if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  const d = s.dom;
  if (d) {
    try { d.vidA.pause(); d.vidB.pause(); } catch (e) {}
    if (d.playBtn) { d.playBtn.textContent = "▶"; d.playBtn.classList.remove("on"); }
  }
}
function pausePlayback(node) {
  const s = getState(node);
  s.playing = false; s.starting = false;
  s.dom.playBtn.textContent = "▶"; s.dom.playBtn.classList.remove("on");
  try { s.dom.vidA.pause(); s.dom.vidB.pause(); } catch (e) {}
  snapPaused(node);
}
function togglePlay(node) {
  getState(node).playing ? pausePlayback(node) : startPlayback(node);
}
function loopOf(node) {
  const tick = () => {
    const s = node.__dvc;
    if (!s) return;
    if (!s.dom || !s.dom.root.isConnected) { s.raf = requestAnimationFrame(tick); return; }
    const m = master(node);
    if (m && (s.haveA || s.haveB)) {
      if (s.playing && !s.starting) {
        const o = follower(node);
        if (o) { if (o.paused) o.play().catch(() => {}); syncFollower(node, false); }
        if (m.duration && m.currentTime >= m.duration - 0.03) {
          if (s.loop) seekAll(node, 0); else pausePlayback(node);
        }
      }
      render(node);
    }
    s.raf = requestAnimationFrame(tick);
  };
  return tick;
}

/* ---------- render ---------- */
function render(node) {
  const s = getState(node), d = s.dom; if (!d) return;
  const tl = getTimeline(node);
  const r = tl.dur > 0 ? tl.t / tl.dur : 0;
  d.fill.style.width = (r * 100) + "%";
  d.head.style.left = (r * 100) + "%";
  d.time.textContent = fmt(tl.t) + " / " + fmt(tl.dur);
  d.root.style.setProperty("--sp", s.split);
  d.frame.style.transform =
    `translate(${s.panX}px,${s.panY}px) scale(${s.zoom})`;
}
function fmt(x) {
  x = Math.max(0, x || 0);
  const mm = Math.floor(x / 60), ss = Math.floor(x % 60),
    cs = Math.floor((x * 100) % 100);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` +
    `.${String(cs).padStart(2, "0")}`;
}
// Size the node so the preview area matches the clip aspect (no black
// bars); resizing width keeps the ratio so the video scales with it.
function fitNode(node) {
  const s = getState(node), d = s.dom;
  if (!d || !s.ar || s._fitting || !node.size) return;
  const kids = d.root.children;
  const topH = kids[0] ? kids[0].offsetHeight : 38;
  const botH = kids[kids.length - 1] ? kids[kids.length - 1].offsetHeight : 62;
  const w = Math.max(Number(node.size[0]) || NODE_MIN_W, NODE_MIN_W);
  const stageW = Math.max(w - 2, 80);
  const want = Math.round(90 + topH + botH + stageW / s.ar);
  if (Math.abs((Number(node.size[1]) || 0) - want) > 4) {
    s._fitting = true;
    node.setSize([w, want]);
    s._fitting = false;
    node.setDirtyCanvas?.(true, true);
  }
}

/* ---------- modes / labels ---------- */
function setMode(node, m) {
  const s = getState(node);
  s.mode = m; setWidget(node, "mode", m);
  applyMode(node); render(node);
}
function applyMode(node) {
  const s = getState(node), d = s.dom;
  d.root.classList.remove("m-slider", "m-sxs", "m-diff", "m-tgl", "sa", "sb");
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
  d.root.classList.toggle("sa", s.tgl === "A");
  d.root.classList.toggle("sb", s.tgl === "B");
  d.tglBadge.textContent = s.tgl;
  setWidget(node, "toggle_image", s.tgl);
}
const labelOf = (s, side) => s.swapped ? (side === "A" ? "B" : "A") : side;
function updateLabels(node) {
  const s = getState(node), d = s.dom;
  d.badgeA.textContent = labelOf(s, "A");
  d.badgeB.textContent = labelOf(s, "B");
}
function applyAudio(node) {
  const s = getState(node), d = s.dom;
  const aOk = s.haveA && s.aHasAudio, bOk = s.haveB && s.bHasAudio;
  // browsers block audible autoplay until a user gesture
  // sound follows the mouse: audible only while hovering the preview
  d.vidA.muted = !(s.hovering && aOk && s.audio === "A");
  d.vidB.muted = !(s.hovering && bOk && s.audio === "B");
  d.audA.disabled = !aOk;
  d.audB.disabled = !bOk;
  d.audN.classList.toggle("on", s.audio === "none");
  d.audA.classList.toggle("on", s.audio === "A");
  d.audB.classList.toggle("on", s.audio === "B");
}
function markGesture(node) {
  const s = getState(node);
  if (s.gestured) return;
  s.gestured = true;
  applyAudio(node);
}

/* ---------- executed: feed mp4 urls ---------- */
function handleExecuted(node, output) {
  setupVideoCompareNode(node);
  const s = getState(node), d = s.dom; if (!d) return;
  const a = Array.isArray(output.a_video) ? output.a_video[0] : null;
  const b = Array.isArray(output.b_video) ? output.b_video[0] : null;
  const meta = Array.isArray(output.compare_meta) ? output.compare_meta[0] || {} : {};
  s.haveA = !!(a && a.filename);
  s.haveB = !!(b && b.filename);
  s.aHasAudio = !!meta.a_has_audio;
  s.bHasAudio = !!meta.b_has_audio;
  // default the audio toggle to whichever side actually carries sound
  if (s.audio === "A" && !(s.haveA && s.aHasAudio) && (s.haveB && s.bHasAudio)) s.audio = "B";
  else if (s.audio === "B" && !(s.haveB && s.bHasAudio) && (s.haveA && s.aHasAudio)) s.audio = "A";
  const aw = meta.a_width, ah = meta.a_height, bw = meta.b_width, bh = meta.b_height;
  s.ar = (s.haveA && aw > 0 && ah > 0) ? aw / ah
       : (s.haveB && bw > 0 && bh > 0) ? bw / bh : s.ar;
  d.vidA.src = s.haveA ? viewUrl(a) : "";
  d.vidB.src = s.haveB ? viewUrl(b) : "";
  if (s.haveA) d.vidA.load();
  if (s.haveB) d.vidB.load();

  let info = "";
  if (meta.error === "ffmpeg_not_found")
    info = "ffmpeg를 찾을 수 없습니다 (VideoHelperSuite 설치 권장)";
  else if (typeof meta.error === "string" && meta.error)
    info = "인코딩 실패: " + meta.error;
  else if (!s.haveA && !s.haveB) info = "video_a / video_b 를 연결하세요";
  d.hint.textContent = info || "Run the workflow to preview";
  d.hint.classList.toggle("hide", (s.haveA || s.haveB) && !meta.error);

  const aAud = meta.a_has_audio ? "🔊" : "🔇";
  const bAud = meta.b_has_audio ? "🔊" : "🔇";
  // per-side info grouped at the top corners next to the A/B badges
  d.sinfoA.textContent = meta.a_count
    ? `${meta.a_width}×${meta.a_height} · ${meta.a_count}f · ${aAud}` : "";
  d.sinfoB.textContent = meta.b_count
    ? `${meta.b_width}×${meta.b_height} · ${meta.b_count}f · ${bAud}` : "";
  if (d.meta) d.meta.innerHTML = "";
  d.audA.title = "A 사운드 (" + (meta.a_audio || "?") + ")";
  d.audB.title = "B 사운드 (" + (meta.b_audio || "?") + ")";

  d.playBtn.disabled = !(s.haveA || s.haveB);
  applyTgl(node); updateLabels(node); applyAudio(node);
  s.starting = false;
  const begin = () => { seekAll(node, 0); if (s.haveA || s.haveB) startPlayback(node); };
  const ref = s.haveA ? d.vidA : d.vidB;
  if (ref && ref.readyState >= 1) begin();
  else if (ref) ref.addEventListener("loadedmetadata", begin, { once: true });
  fitNode(node);
  render(node);
}

/* ---------- pointer / zoom / interactions ---------- */
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
function setZoom(node, z, cx, cy) {
  const s = getState(node), old = s.zoom;
  s.zoom = Math.max(1, Math.min(8, z));
  if (s.zoom === 1) { s.panX = 0; s.panY = 0; }
  else if (cx != null) {
    const r = s.dom.stage.getBoundingClientRect();
    const ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    const k = s.zoom / old;
    s.panX = (s.panX - ox) * k + ox; s.panY = (s.panY - oy) * k + oy;
    clampPan(node);
  }
  s.dom.zl.textContent = Math.round(s.zoom * 100) + "%";
  s.dom.stage.classList.toggle("pan", s.zoom > 1 && s.mode !== "Slider");
  render(node);
}
function wireInteractions(node, d, btns) {
  const s = getState(node);
  const stage = d.stage;

  stage.addEventListener("pointerdown", (e) => {
    if (!s.haveA && !s.haveB) return;
    e.stopPropagation();
    markGesture(node);
    s.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (s.mode === "Slider" && s.zoom === 1) {
      s.draggingSplit = true; s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split));
      render(node); stage.setPointerCapture(e.pointerId); return;
    }
    if (s.zoom > 1) {
      s.panning = true; s.panStart = { x: e.clientX - s.panX, y: e.clientY - s.panY };
      stage.classList.add("grabbing"); stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (s.draggingSplit || s.panning || s.scrubbing ||
        ((s.haveA || s.haveB) && s.mode === "Slider")) e.stopPropagation();
    if (s.down && !s.down.moved &&
      Math.hypot(e.clientX - s.down.x, e.clientY - s.down.y) > 6) s.down.moved = true;
    if (s.draggingSplit) {
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split)); render(node);
    } else if (s.panning) {
      s.panX = e.clientX - s.panStart.x; s.panY = e.clientY - s.panStart.y;
      clampPan(node); render(node);
    } else if (s.mode === "Slider" && s.haveA && s.haveB && !s.scrubbing) {
      s.split = frameFrac(node, e.clientX);
      setWidget(node, "split_position", round3(s.split)); render(node);
    }
  });
  const endPtr = (e) => {
    if (e) e.stopPropagation();
    const dn = s.down; s.down = null;
    s.draggingSplit = false; s.panning = false;
    stage.classList.remove("grabbing");
    if (!(e && e.type === "pointerup" && dn && !dn.moved &&
      (performance.now() - dn.t) < 350 && (s.haveA || s.haveB))) return;
    if (s.mode === "Toggle") {
      s.tgl = s.tgl === "A" ? "B" : "A"; applyTgl(node);
    } else togglePlay(node);
  };
  stage.addEventListener("pointerup", endPtr);
  stage.addEventListener("pointercancel", endPtr);
  // Forward wheel anywhere on the node (preview AND the green bars) to
  // ComfyUI's canvas so it owns zoom (the DOM overlay would otherwise
  // swallow it; the canvas is a separate element so removing the
  // listener is not enough).
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
  // Middle-button (wheel click) drag -> pan the ComfyUI canvas directly
  // via its DragAndScale offset (synthetic events don't drive LiteGraph
  // reliably; this is version-robust). Capture phase so it pre-empts
  // the stage handler's stopPropagation.
  d.root.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;
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
  // sound follows the mouse: enter preview -> play sound, leave -> mute
  stage.addEventListener("pointerenter", () => {
    s.hovering = true; applyAudio(node);
  });
  stage.addEventListener("pointerleave", () => {
    s.hovering = false; applyAudio(node);
  });

  d.scrub.addEventListener("pointerdown", (e) => {
    if (!s.haveA && !s.haveB) return;
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
    d.vidA.playbackRate = s.speed; d.vidB.playbackRate = s.speed;
    btns.spdBtn.textContent = s.speed.toFixed(2).replace(/0$/, "") + "×";
  };
  const setAud = (a) => { markGesture(node); s.audio = a; applyAudio(node); };
  btns.audN.onclick = () => setAud("none");
  btns.audA.onclick = () => setAud("A");
  btns.audB.onclick = () => setAud("B");
  btns.swapBtn.onclick = () => {
    if (!s.haveA || !s.haveB) return;
    s.swapped = !s.swapped;
    setWidget(node, "swap", s.swapped);
    d.root.classList.toggle("swp", s.swapped);
    updateLabels(node); render(node);
  };

  d.vidA.addEventListener("ended", () => { if (s.loop && s.haveA) seekAll(node, 0); });
  d.vidB.addEventListener("ended", () => { if (s.loop && !s.haveA) seekAll(node, 0); });
}
function scrubTo(node, clientX) {
  const s = getState(node);
  const r = s.dom.scrub.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  const tl = getTimeline(node);
  seekAll(node, ratio * (tl.dur || 0));
}
function stepFrame(node, dir) {
  pausePlayback(node);
  const m = master(node); if (!m) return;
  seekAll(node, (m.currentTime || 0) + dir / 30);
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function clamp(v, lo, hi, fb) {
  const n = Number(v); if (!isFinite(n)) return fb;
  return Math.max(lo, Math.min(hi, n));
}
