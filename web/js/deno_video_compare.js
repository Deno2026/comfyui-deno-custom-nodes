import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoVideoCompare";
const WIDGET_NAME = "deno_video_compare_canvas";
const MIN_WIDTH = 560;
const DEFAULT_NODE_HEIGHT = 560;
const VIDEO_NODE_MIN_HEIGHT = 560;
const NODE_VERTICAL_CHROME = 110;
const VIDEO_CONTROLS_HEIGHT = 200;
const PREVIEW_MIN_HEIGHT = 300;
const PREVIEW_MAX_HEIGHT = 760;
const MODES = ["Slider", "Side by Side", "Difference", "Toggle"];
const HIDDEN_WIDGETS = ["mode", "split_position", "toggle_image", "swap", "fps"];

const COLORS = {
    panelA: "rgba(3, 12, 8, 0.99)",
    panelB: "rgba(1, 6, 4, 0.97)",
    border: "rgba(72, 255, 132, 0.50)",
    borderSoft: "rgba(72, 255, 132, 0.24)",
    text: "#dfffea",
    textStrong: "#9dffba",
    textSoft: "#8fcfa4",
    active: "rgba(31, 96, 50, 0.94)",
    inactive: "rgba(9, 13, 11, 0.92)",
    imageBack: "#050906",
    track: "rgba(72, 255, 132, 0.16)",
    trackFill: "rgba(72, 255, 132, 0.70)",
};

function imageDataToUrl(data) {
    return api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`);
}

app.registerExtension({
    name: "Deno.VideoCompare",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupVideoCompareNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => setupVideoCompareNode(this));
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            const result = onExecuted?.apply(this, arguments);
            handleExecuted(this, output || {});
            return result;
        };

        const onMouseMove = nodeType.prototype.onMouseMove;
        nodeType.prototype.onMouseMove = function (event, pos, canvas) {
            const result = onMouseMove?.apply(this, arguments);
            handlePointerMove(this, pos);
            return result;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            stopPlayback(this);
            return onRemoved?.apply(this, arguments);
        };
    },
});

function getState(node) {
    if (!node.__denoVC) {
        node.__denoVC = {
            a: [],
            b: [],
            meta: {},
            playing: false,
            loop: true,
            time: 0,
            lastTick: 0,
            rafId: 0,
            scrubbing: false,
        };
    }
    return node.__denoVC;
}

function setupVideoCompareNode(node) {
    if (!node || node.__denoVCSettingUp) {
        return;
    }

    node.__denoVCSettingUp = true;
    try {
        node.serialize_widgets = true;
        getState(node);
        normalizeBackendWidgets(node);
        hideBackendWidgets(node);
        removeCompareOutputs(node);
        ensureCanvasWidget(node);
        wrapComputeSize(node);
        resizeNodeToPanel(node);
        requestNodeRedraw(node);
    } finally {
        node.__denoVCSettingUp = false;
    }
}

function handleExecuted(node, output) {
    setupVideoCompareNode(node);
    const state = getState(node);
    const meta = Array.isArray(output.compare_meta) ? output.compare_meta[0] || {} : {};
    const aFrames = Array.isArray(output.a_frames) ? output.a_frames : [];
    const bFrames = Array.isArray(output.b_frames) ? output.b_frames : [];

    state.meta = meta;
    state.a = aFrames.map((data) => makeFrameItem(data, node));
    state.b = bFrames.map((data) => makeFrameItem(data, node));
    state.time = 0;
    state.playing = true;
    setPreviewWidgetValue(node);
    resizeNodeToImage(node);
    startPlayback(node);
    requestNodeRedraw(node);
}

function makeFrameItem(data, node) {
    const img = new Image();
    const descriptor = normalizeImageDescriptor(data);
    const url = descriptor ? imageDataToUrl(descriptor) : "";
    const item = { descriptor, url, img, loaded: false };
    img.onload = () => {
        item.loaded = true;
        requestNodeRedraw(node);
    };
    img.src = url;
    return item;
}

function makeStoredFrameItem(descriptor, node) {
    const img = new Image();
    const url = descriptor ? imageDataToUrl(descriptor) : "";
    const item = { descriptor, url, img, loaded: false };
    img.onload = () => {
        item.loaded = true;
        requestNodeRedraw(node);
    };
    img.src = url;
    return item;
}

function ensureCanvasWidget(node) {
    const previousWidget = node.__denoVCWidget;
    const previousValue = previousWidget?.value
        || (node.widgets || []).find((widget) => widget?.name === WIDGET_NAME)?.value
        || { a: [], b: [], meta: {} };

    removeExistingCompareWidgets(node);
    const widget = new DenoVideoCompareWidget(node);
    widget.storeValue(previousValue);
    node.addCustomWidget(widget);
    node.__denoVCWidget = widget;
}

function removeExistingCompareWidgets(node) {
    if (!Array.isArray(node.widgets)) {
        return;
    }
    node.widgets = node.widgets.filter((widget) => {
        if (widget?.name !== WIDGET_NAME && widget?.name !== "deno_video_compare_panel") {
            return true;
        }
        widget.element?.remove?.();
        return false;
    });
}

class DenoVideoCompareWidget {
    constructor(node) {
        this.name = WIDGET_NAME;
        this.type = "custom";
        this.node = node;
        this.options = { serialize: true };
        this._value = { a: [], b: [], meta: {} };
        this.hitAreas = {};
        this.lastBounds = null;
    }

    get value() {
        return this._value;
    }

    set value(value) {
        this._value = normalizeStoredPreviewValue(value);
        hydratePreviewFromWidgetValue(this.node, this._value);
    }

    storeValue(value) {
        this._value = normalizeStoredPreviewValue(value);
    }

    serializeValue() {
        return this._value;
    }

    computeSize(width) {
        return [Math.max(Number(width) || MIN_WIDTH, MIN_WIDTH), getWidgetHeightFromNode(this.node, NODE_VERTICAL_CHROME)];
    }

    draw(ctx, node, width, y, height) {
        const x = 14;
        const panelY = y + 8;
        const panelW = Math.max(width - 28, MIN_WIDTH - 28);
        const widgetHeight = getWidgetHeightFromNode(node, y, height);
        const panelH = Math.max(PREVIEW_MIN_HEIGHT + VIDEO_CONTROLS_HEIGHT, widgetHeight - 16);
        this.hitAreas = {};
        this.lastBounds = { x, y: panelY, w: panelW, h: panelH };

        ctx.save();
        drawPanel(ctx, x, panelY, panelW, panelH);

        const titleY = panelY + 23;
        ctx.fillStyle = COLORS.textStrong;
        ctx.font = "900 16px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Video Compare", x + 14, titleY);

        ctx.fillStyle = COLORS.textSoft;
        ctx.font = "10px sans-serif";
        ctx.fillText("Synced A/B playback on a shared timeline.", x + 14, titleY + 19);

        const mode = getMode(node);
        drawButton(ctx, "status", mode, x + panelW - 98, panelY + 13, 84, 28, true, this.hitAreas);

        const buttonY = panelY + 64;
        const buttonGap = 8;
        const buttonW = (panelW - 28 - buttonGap * 3) / 4;
        for (let i = 0; i < MODES.length; i++) {
            const modeName = MODES[i];
            drawButton(ctx, `mode:${modeName}`, modeName, x + 14 + i * (buttonW + buttonGap), buttonY, buttonW, 32, mode === modeName, this.hitAreas);
        }

        const footerY = buttonY + 52;
        const pair = getDisplayPair(node);
        drawMetaText(ctx, formatSize(pair.aLabel, pair.a), x + 14, footerY, "left");
        drawButton(ctx, "swap", "Swap", x + panelW * 0.5 - 44, footerY - 16, 88, 30, normalizeBoolean(getWidget(node, "swap")?.value), this.hitAreas);
        drawMetaText(ctx, formatSize(pair.bLabel, pair.b), x + panelW - 14, footerY, "right");

        const timeline = getTimeline(node);
        const transportY = footerY + 20;
        const state = getState(node);
        drawButton(ctx, "play", state.playing ? "Pause" : "Play", x + 14, transportY, 78, 28, state.playing, this.hitAreas);
        drawButton(ctx, "loop", "Loop", x + 98, transportY, 64, 28, state.loop, this.hitAreas);
        drawButton(ctx, "fps_down", "-", x + 170, transportY, 26, 28, false, this.hitAreas);
        ctx.fillStyle = COLORS.textStrong;
        ctx.font = "800 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${formatFps(timeline.fps)} fps`, x + 170 + 26 + 28, transportY + 14);
        drawButton(ctx, "fps_up", "+", x + 170 + 26 + 56 + 4, transportY, 26, 28, false, this.hitAreas);
        drawMetaText(
            ctx,
            `${formatTime(timeline.time)} / ${formatTime(timeline.duration)}`,
            x + panelW - 14,
            transportY + 14,
            "right",
        );

        const scrubY = transportY + 38;
        const scrubX = x + 14;
        const scrubW = panelW - 28;
        drawScrub(ctx, scrubX, scrubY, scrubW, timeline);
        this.hitAreas.scrub = { bounds: [scrubX, scrubY - 6, scrubW, 18] };

        const preview = {
            x: x + 12,
            y: scrubY + 22,
            w: panelW - 24,
            h: Math.max(220, panelY + panelH - (scrubY + 34)),
        };
        drawPreview(ctx, node, preview, pair, timeline);
        this.hitAreas.preview = { bounds: [preview.x, preview.y, preview.w, preview.h] };

        ctx.restore();
    }

    mouse(event, pos, node) {
        const isMoveEvent = event.type === "pointermove" || event.type === "mousemove";
        const isDownEvent = event.type === "pointerdown" || event.type === "mousedown" || event.type === "click";
        const isUpEvent = event.type === "pointerup" || event.type === "mouseup";
        if (!isMoveEvent && !isDownEvent && !isUpEvent) {
            return false;
        }

        const state = getState(node);
        if (isUpEvent) {
            state.scrubbing = false;
            return false;
        }

        if (isMoveEvent) {
            if (state.scrubbing) {
                updateScrubFromPointer(node, pos);
                return true;
            }
            return handlePointerMove(node, pos);
        }

        const mode = getMode(node);
        for (const [name, area] of Object.entries(this.hitAreas)) {
            if (!isInside(pos, area.bounds)) {
                continue;
            }

            if (name.startsWith("mode:")) {
                setWidgetValue(node, "mode", name.slice(5));
                return true;
            }
            if (name === "swap") {
                setWidgetValue(node, "swap", !normalizeBoolean(getWidget(node, "swap")?.value));
                return true;
            }
            if (name === "play") {
                togglePlayback(node);
                return true;
            }
            if (name === "loop") {
                state.loop = !state.loop;
                requestNodeRedraw(node);
                return true;
            }
            if (name === "fps_down") {
                stepFps(node, -1);
                return true;
            }
            if (name === "fps_up") {
                stepFps(node, 1);
                return true;
            }
            if (name === "scrub") {
                state.scrubbing = true;
                updateScrubFromPointer(node, pos);
                return true;
            }
            if (name === "preview" && mode === "Toggle") {
                setWidgetValue(node, "toggle_image", getToggleImage(node) === "A" ? "B" : "A");
                return true;
            }
        }
        return false;
    }
}

function getTimeline(node) {
    const state = getState(node);
    const meta = state.meta || {};
    const fps = clamp(Number(getWidget(node, "fps")?.value), 1, 240, 24);
    const aCount = state.a.length || Number(meta.a_count) || 0;
    const bCount = state.b.length || Number(meta.b_count) || 0;
    const refCount = aCount > 0 ? aCount : bCount;
    const duration = refCount > 0 ? refCount / fps : 0;
    const time = duration > 0 ? clamp(state.time, 0, duration, 0) : 0;
    return { fps, aCount, bCount, refCount, duration, time };
}

function frameIndexFor(timeline, count) {
    if (count <= 0) {
        return -1;
    }
    if (timeline.duration <= 0) {
        return 0;
    }
    const ratio = timeline.time / timeline.duration;
    return clamp(Math.floor(ratio * count), 0, count - 1, 0);
}

function pickFrame(frames, index) {
    if (!Array.isArray(frames) || frames.length <= 0 || index < 0) {
        return null;
    }
    const item = frames[Math.min(index, frames.length - 1)];
    if (item?.loaded) {
        return item;
    }
    for (let i = Math.min(index, frames.length - 1); i >= 0; i--) {
        if (frames[i]?.loaded) {
            return frames[i];
        }
    }
    return null;
}

function startPlayback(node) {
    const state = getState(node);
    if (state.rafId) {
        return;
    }
    state.lastTick = performance.now();
    const tick = () => {
        state.rafId = 0;
        if (!node.graph) {
            return;
        }
        const now = performance.now();
        const dt = Math.max(0, (now - state.lastTick) / 1000);
        state.lastTick = now;

        const timeline = getTimeline(node);
        if (state.playing && timeline.duration > 0) {
            let next = state.time + dt;
            if (next >= timeline.duration) {
                if (state.loop) {
                    next = next % timeline.duration;
                } else {
                    next = timeline.duration;
                    state.playing = false;
                }
            }
            state.time = next;
            requestNodeRedraw(node);
        }

        if (state.playing) {
            state.rafId = requestAnimationFrame(tick);
        }
    };
    state.rafId = requestAnimationFrame(tick);
}

function stopPlayback(node) {
    const state = node.__denoVC;
    if (state?.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
    }
}

function togglePlayback(node) {
    const state = getState(node);
    const timeline = getTimeline(node);
    state.playing = !state.playing;
    if (state.playing) {
        if (timeline.duration > 0 && state.time >= timeline.duration) {
            state.time = 0;
        }
        startPlayback(node);
    } else {
        stopPlayback(node);
    }
    requestNodeRedraw(node);
}

function stepFps(node, direction) {
    const widget = getWidget(node, "fps");
    if (!widget) {
        return;
    }
    const next = clamp(Math.round(Number(widget.value) || 24) + direction, 1, 240, 24);
    setWidgetValue(node, "fps", next);
}

function updateScrubFromPointer(node, pos) {
    const bounds = node.__denoVCWidget?.hitAreas?.scrub?.bounds;
    if (!bounds) {
        return false;
    }
    const timeline = getTimeline(node);
    if (timeline.duration <= 0) {
        return false;
    }
    const state = getState(node);
    const ratio = clamp((pos[0] - bounds[0]) / bounds[2], 0, 1, 0);
    state.time = ratio * timeline.duration;
    requestNodeRedraw(node);
    return true;
}

function handlePointerMove(node, pos) {
    if (!node || getMode(node) !== "Slider") {
        return false;
    }
    const bounds = node.__denoVCWidget?.hitAreas?.preview?.bounds;
    if (!isInside(pos, bounds)) {
        return false;
    }
    const value = clamp((pos[0] - bounds[0]) / bounds[2], 0.02, 0.98, 0.5);
    const rounded = Math.round(value * 1000) / 1000;
    if (Number(getWidget(node, "split_position")?.value) !== rounded) {
        setWidgetValue(node, "split_position", rounded);
    }
    return true;
}

function drawPanel(ctx, x, y, w, h) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, COLORS.panelA);
    gradient.addColorStop(1, COLORS.panelB);
    drawRoundedRect(ctx, x, y, w, h, 12, gradient, COLORS.border, 1);
}

function drawScrub(ctx, x, y, w, timeline) {
    drawRoundedRect(ctx, x, y, w, 6, 3, COLORS.track, null, 0);
    const ratio = timeline.duration > 0 ? clamp(timeline.time / timeline.duration, 0, 1, 0) : 0;
    if (ratio > 0) {
        drawRoundedRect(ctx, x, y, Math.max(6, w * ratio), 6, 3, COLORS.trackFill, null, 0);
    }
    const handleX = x + w * ratio;
    ctx.beginPath();
    ctx.arc(handleX, y + 3, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#48ff84";
    ctx.fill();
}

function drawPreview(ctx, node, rect, pair, timeline) {
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, COLORS.imageBack, COLORS.borderSoft, 1);
    const mode = getMode(node);
    const split = getSplitPosition(node);
    const activeToggle = getToggleImage(node);
    const aFrame = pickFrame(pair.a, frameIndexFor(timeline, pair.a.length));
    const bFrame = pickFrame(pair.b, frameIndexFor(timeline, pair.b.length));
    const aLabel = pair.aLabel || "A";
    const bLabel = pair.bLabel || "B";

    ctx.save();
    roundedClip(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    if (!aFrame && !bFrame) {
        drawPlaceholder(ctx, rect);
        ctx.restore();
        return;
    }

    if (mode === "Side by Side") {
        const gap = 8;
        const cellW = (rect.w - gap) * 0.5;
        const boundsA = drawFitImage(ctx, aFrame, rect.x, rect.y, cellW, rect.h);
        const boundsB = drawFitImage(ctx, bFrame, rect.x + cellW + gap, rect.y, cellW, rect.h);
        drawBadgeAtBounds(ctx, aLabel, boundsA, "left");
        drawBadgeAtBounds(ctx, bLabel, boundsB, "right");
        ctx.restore();
        return;
    }

    if (mode === "Difference") {
        const boundsA = drawFitImage(ctx, aFrame, rect.x, rect.y, rect.w, rect.h);
        ctx.globalCompositeOperation = "difference";
        drawFitImage(ctx, bFrame, rect.x, rect.y, rect.w, rect.h);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(72, 255, 132, 0.18)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        drawBadgeAtBounds(ctx, aLabel, boundsA || rect, "left");
        drawBadgeAtBounds(ctx, bLabel, boundsA || rect, "right");
        ctx.restore();
        return;
    }

    if (mode === "Toggle") {
        const frame = activeToggle === aLabel ? aFrame : bFrame;
        const bounds = drawFitImage(ctx, frame, rect.x, rect.y, rect.w, rect.h);
        drawBadgeAtBounds(ctx, activeToggle, bounds || rect, activeToggle === aLabel ? "left" : "right");
        ctx.restore();
        return;
    }

    const baseBounds = drawFitImage(ctx, bFrame || aFrame, rect.x, rect.y, rect.w, rect.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w * split, rect.h);
    ctx.clip();
    drawFitImage(ctx, aFrame || bFrame, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    const lineX = rect.x + rect.w * split;
    ctx.strokeStyle = "#48ff84";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(72, 255, 132, 0.55)";
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(lineX, rect.y);
    ctx.lineTo(lineX, rect.y + rect.h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawBadgeAtBounds(ctx, aLabel, baseBounds || rect, "left");
    drawBadgeAtBounds(ctx, bLabel, baseBounds || rect, "right");
    ctx.restore();
}

function drawFitImage(ctx, item, x, y, w, h) {
    if (!item?.img?.naturalWidth || !item?.img?.naturalHeight) {
        return null;
    }

    const img = item.img;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = w / h;
    let drawW;
    let drawH;
    if (imageAspect > boxAspect) {
        drawW = w;
        drawH = w / imageAspect;
    } else {
        drawH = h;
        drawW = h * imageAspect;
    }
    const drawX = x + (w - drawW) * 0.5;
    const drawY = y + (h - drawH) * 0.5;
    drawLowZoomFallback(ctx, drawX, drawY, drawW, drawH);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    return { x: drawX, y: drawY, w: drawW, h: drawH };
}

function drawLowZoomFallback(ctx, x, y, w, h) {
    const scale = getCanvasScale();
    if (scale >= 0.08 || w * scale >= 18 || h * scale >= 18) {
        return;
    }

    ctx.fillStyle = "rgba(72, 255, 132, 0.18)";
    ctx.fillRect(x, y, w, h);
}

function drawPlaceholder(ctx, rect) {
    ctx.fillStyle = "#6aa978";
    ctx.font = "800 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Run workflow to preview", rect.x + rect.w * 0.5, rect.y + rect.h * 0.5);
}

function drawBadge(ctx, text, centerX, centerY) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if ("filter" in ctx) {
        ctx.filter = "none";
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#117638";
    ctx.strokeStyle = "#bfffd0";
    ctx.lineWidth = 1.25;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#effff4";
    ctx.font = "900 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, centerX, centerY + 0.5);
    ctx.restore();
}

function drawBadgeAtBounds(ctx, text, bounds, side) {
    if (!bounds) {
        return;
    }
    const inset = 12;
    const centerX = side === "right" ? bounds.x + bounds.w - inset : bounds.x + inset;
    const centerY = bounds.y + inset;
    drawBadge(ctx, text, centerX, centerY);
}

function drawMetaText(ctx, text, x, y, align) {
    ctx.fillStyle = COLORS.textStrong;
    ctx.font = "800 11px sans-serif";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
}

function drawButton(ctx, id, label, x, y, w, h, selected, hitAreas) {
    drawRoundedRect(ctx, x, y, w, h, h * 0.5, selected ? COLORS.active : COLORS.inactive, selected ? "rgba(72, 255, 132, 0.95)" : "rgba(90, 130, 104, 0.72)", 1);
    ctx.fillStyle = selected ? "#f0fff4" : "#c9f7d5";
    ctx.font = "900 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitString(ctx, label, w - 14), x + w * 0.5, y + h * 0.5 + 0.5);
    hitAreas[id] = { bounds: [x, y, w, h] };
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle, lineWidth) {
    ctx.save();
    ctx.beginPath();
    roundedPath(ctx, x, y, w, h, r);
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle && lineWidth) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
    ctx.restore();
}

function roundedClip(ctx, x, y, w, h, r) {
    ctx.beginPath();
    roundedPath(ctx, x, y, w, h, r);
    ctx.clip();
}

function roundedPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
}

function fitString(ctx, text, maxWidth) {
    const value = String(text);
    if (ctx.measureText(value).width <= maxWidth) {
        return value;
    }
    let fitted = value;
    while (fitted.length > 1 && ctx.measureText(`${fitted}...`).width > maxWidth) {
        fitted = fitted.slice(0, -1);
    }
    return `${fitted}...`;
}

function removeCompareOutputs(node) {
    const outputs = Array.isArray(node.outputs) ? node.outputs : [];
    for (let i = outputs.length - 1; i >= 0; i--) {
        node.disconnectOutput?.(i);
    }
    node.outputs = [];
}

function normalizeBackendWidgets(node) {
    const mode = getWidget(node, "mode");
    if (mode && !MODES.includes(String(mode.value))) {
        mode.value = "Slider";
    }

    const split = getWidget(node, "split_position");
    if (split) {
        split.value = clamp(Number(split.value), 0.02, 0.98, 0.5);
    }

    const toggle = getWidget(node, "toggle_image");
    if (toggle && !["A", "B"].includes(String(toggle.value))) {
        toggle.value = "B";
    }

    const swap = getWidget(node, "swap");
    if (swap) {
        swap.value = normalizeBoolean(swap.value);
    }

    const fps = getWidget(node, "fps");
    if (fps) {
        fps.value = clamp(Number(fps.value), 1, 240, 24);
    }
}

function hideBackendWidgets(node) {
    for (const name of HIDDEN_WIDGETS) {
        setWidgetHidden(getWidget(node, name), true);
    }
}

function wrapComputeSize(node) {
    if (node.__denoVCComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_WIDTH, 380];
        const width = Math.max(Number(size[0]) || MIN_WIDTH, MIN_WIDTH);
        const minHeight = hasLoadedFrame(this) ? VIDEO_NODE_MIN_HEIGHT : DEFAULT_NODE_HEIGHT;
        const height = Math.max(Number(size[1]) || 0, minHeight);
        return [width, height];
    };
    node.__denoVCComputeWrapped = true;
}

function resizeNodeToPanel(node) {
    const width = Math.max(Number(node.size?.[0]) || MIN_WIDTH, MIN_WIDTH);
    const height = Math.max(Number(node.size?.[1]) || 0, DEFAULT_NODE_HEIGHT);
    node.setSize?.([width, height]);
}

function resizeNodeToImage(node) {
    const state = getState(node);
    const meta = state.meta || {};
    const aspectW = Number(meta.a_width) || Number(meta.b_width) || 0;
    const aspectH = Number(meta.a_height) || Number(meta.b_height) || 0;
    if (!aspectW || !aspectH) {
        resizeNodeToPanel(node);
        return;
    }

    const width = Math.max(Number(node.size?.[0]) || MIN_WIDTH, MIN_WIDTH);
    const imageAspect = aspectW / aspectH;
    if (!Number.isFinite(imageAspect) || imageAspect <= 0) {
        resizeNodeToPanel(node);
        return;
    }

    const previewWidth = width - 52;
    const desiredPreviewHeight = clamp(previewWidth / imageAspect, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT, 560);
    const desiredNodeHeight = Math.max(VIDEO_NODE_MIN_HEIGHT, desiredPreviewHeight + VIDEO_CONTROLS_HEIGHT + NODE_VERTICAL_CHROME);
    const currentHeight = Number(node.size?.[1]) || 0;
    if (Math.abs(currentHeight - desiredNodeHeight) > 12) {
        node.setSize?.([width, desiredNodeHeight]);
    } else {
        resizeNodeToPanel(node);
    }
}

function hasLoadedFrame(node) {
    const state = node.__denoVC;
    if (!state) {
        return false;
    }
    return state.a.some((item) => item?.loaded) || state.b.some((item) => item?.loaded);
}

function setPreviewWidgetValue(node) {
    const widget = node.__denoVCWidget;
    if (!widget) {
        return;
    }
    const state = getState(node);
    widget.storeValue({
        a: state.a.map((item) => item.descriptor).filter(Boolean),
        b: state.b.map((item) => item.descriptor).filter(Boolean),
        meta: state.meta || {},
    });
}

function normalizeImageDescriptor(data) {
    if (!data || typeof data !== "object" || !data.filename) {
        return null;
    }
    return {
        filename: String(data.filename),
        type: String(data.type || "temp"),
        subfolder: String(data.subfolder || ""),
    };
}

function normalizeStoredPreviewValue(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { a: [], b: [], meta: {} };
    }
    return {
        a: Array.isArray(value.a) ? value.a.map(normalizeImageDescriptor).filter(Boolean) : [],
        b: Array.isArray(value.b) ? value.b.map(normalizeImageDescriptor).filter(Boolean) : [],
        meta: value.meta && typeof value.meta === "object" ? value.meta : {},
    };
}

function hydratePreviewFromWidgetValue(node, value) {
    if (!node || node.__denoVCHydrating) {
        return;
    }
    const stored = normalizeStoredPreviewValue(value);
    if (!stored.a.length && !stored.b.length) {
        return;
    }

    node.__denoVCHydrating = true;
    try {
        const state = getState(node);
        state.meta = stored.meta;
        state.a = stored.a.map((descriptor) => makeStoredFrameItem(descriptor, node));
        state.b = stored.b.map((descriptor) => makeStoredFrameItem(descriptor, node));
        state.time = 0;
        state.playing = false;
        requestNodeRedraw(node);
    } finally {
        node.__denoVCHydrating = false;
    }
}

function getCanvasScale() {
    return Number(app?.canvas?.ds?.scale || app?.canvas?.scale || 1) || 1;
}

function getWidgetHeightFromNode(node, y = NODE_VERTICAL_CHROME, providedHeight = null) {
    const supplied = Number(providedHeight);
    const nodeHeight = Math.max(Number(node?.size?.[1]) || DEFAULT_NODE_HEIGHT, hasLoadedFrame(node) ? VIDEO_NODE_MIN_HEIGHT : DEFAULT_NODE_HEIGHT);
    return Math.max(
        PREVIEW_MIN_HEIGHT + VIDEO_CONTROLS_HEIGHT + 16,
        Number.isFinite(supplied) && supplied > 0 ? supplied : 0,
        nodeHeight - y - 12
    );
}

function getDisplayPair(node) {
    const state = getState(node);
    if (normalizeBoolean(getWidget(node, "swap")?.value)) {
        return { a: state.b, b: state.a, aLabel: "B", bLabel: "A" };
    }
    return { a: state.a, b: state.b, aLabel: "A", bLabel: "B" };
}

function getMode(node) {
    const mode = String(getWidget(node, "mode")?.value || "Slider");
    return MODES.includes(mode) ? mode : "Slider";
}

function getSplitPosition(node) {
    return clamp(Number(getWidget(node, "split_position")?.value), 0.02, 0.98, 0.5);
}

function getToggleImage(node) {
    const value = String(getWidget(node, "toggle_image")?.value || "B");
    return value === "A" ? "A" : "B";
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoVCOriginalType")) {
        widget.__denoVCOriginalType = widget.type;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoVCOriginalComputeSize")) {
        widget.__denoVCOriginalComputeSize = widget.computeSize;
    }

    widget.hidden = hidden;
    if (hidden) {
        widget.type = "converted-widget";
        widget.computeSize = () => [0, -4];
        if (widget.element) {
            widget.element.style.display = "none";
        }
        return;
    }

    widget.type = widget.__denoVCOriginalType;
    if (widget.__denoVCOriginalComputeSize) {
        widget.computeSize = widget.__denoVCOriginalComputeSize;
    } else {
        delete widget.computeSize;
    }
    if (widget.element) {
        widget.element.style.display = "";
    }
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function setWidgetValue(node, name, value) {
    const widget = getWidget(node, name);
    if (!widget) {
        return;
    }
    widget.value = value;
    widget.callback?.(value);
    requestNodeRedraw(node);
}

function requestNodeRedraw(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function formatSize(label, frames) {
    const item = Array.isArray(frames) ? frames.find((frame) => frame?.img?.naturalWidth) : null;
    const width = item?.img?.naturalWidth || 0;
    const height = item?.img?.naturalHeight || 0;
    const count = Array.isArray(frames) ? frames.length : 0;
    if (!width || !height) {
        return `${label} -- x -- (${count}f)`;
    }
    return `${label} ${width} x ${height} (${count}f)`;
}

function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const mm = Math.floor(value / 60);
    const ss = Math.floor(value % 60);
    const cs = Math.floor((value * 100) % 100);
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatFps(fps) {
    const value = Number(fps) || 0;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isInside(pos, bounds) {
    if (!bounds) {
        return false;
    }
    return pos[0] >= bounds[0] && pos[0] <= bounds[0] + bounds[2] && pos[1] >= bounds[1] && pos[1] <= bounds[1] + bounds[3];
}

function clamp(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function normalizeBoolean(value) {
    if (typeof value === "string") {
        return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}
