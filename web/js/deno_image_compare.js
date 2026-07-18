import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoImageCompare";
const WIDGET_NAME = "deno_image_compare_canvas";
const MIN_WIDTH = 560;
const DEFAULT_NODE_HEIGHT = 520;
const IMAGE_NODE_MIN_HEIGHT = 520;
const NODE_VERTICAL_CHROME = 110;
const IMAGE_CONTROLS_HEIGHT = 150;
const PREVIEW_MIN_HEIGHT = 300;
const PREVIEW_MAX_HEIGHT = 760;
const MODES = ["Slider", "Side by Side", "Difference", "Toggle"];
const HIDDEN_WIDGETS = ["mode", "split_position", "toggle_image", "swap"];
const MANUAL_SIZE_PROP = "__denoImageCompareManualSize";

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
};

function imageDataToUrl(data) {
    return api.apiURL(`/view?filename=${encodeURIComponent(data.filename)}&type=${encodeURIComponent(data.type || "output")}&subfolder=${encodeURIComponent(data.subfolder || "")}${app.getPreviewFormatParam()}${app.getRandParam()}`);
}

app.registerExtension({
    name: "Deno.ImageCompare",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupImageCompareNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => setupImageCompareNode(this));
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
            updateSliderFromPointer(this, pos);
            return result;
        };
    },
});

function setupImageCompareNode(node) {
    if (!node || node.__denoImageCompareSettingUp) {
        return;
    }

    node.__denoImageCompareSettingUp = true;
    try {
        node.serialize_widgets = true;
        normalizeBackendWidgets(node);
        hideBackendWidgets(node);
        removeCompareOutputs(node);
        ensureCanvasWidget(node);
        wrapComputeSize(node);
        installManualResizeTracking(node);
        resizeNodeToPanel(node);
        requestNodeRedraw(node);
    } finally {
        node.__denoImageCompareSettingUp = false;
    }
}

function handleExecuted(node, output) {
    setupImageCompareNode(node);
    const meta = Array.isArray(output.compare_meta) ? output.compare_meta[0] || {} : {};
    const imageA = Array.isArray(output.a_images) && output.a_images.length ? output.a_images[0] : null;
    const imageB = Array.isArray(output.b_images) && output.b_images.length ? output.b_images[0] : null;

    node.__denoImageCompareMeta = meta;
    node.__denoImageCompareImages = {
        a: imageA ? makeImageItem("A", imageA, meta.a_width, meta.a_height, node) : null,
        b: imageB ? makeImageItem("B", imageB, meta.b_width, meta.b_height, node) : null,
    };
    setPreviewWidgetValue(node);
    resizeNodeToImage(node);
    requestNodeRedraw(node);
}

function makeImageItem(name, data, width, height, node) {
    const img = new Image();
    const descriptor = normalizeImageDescriptor(data);
    const url = descriptor ? imageDataToUrl(descriptor) : "";
    const item = {
        name,
        descriptor,
        url,
        img,
        width: Number(width) || 0,
        height: Number(height) || 0,
        loaded: false,
    };
    img.onload = () => {
        item.loaded = true;
        if (!item.width) {
            item.width = img.naturalWidth;
        }
        if (!item.height) {
            item.height = img.naturalHeight;
        }
        resizeNodeToImage(node);
        requestNodeRedraw(node);
    };
    img.src = url;
    return item;
}

function ensureCanvasWidget(node) {
    const previousWidget = node.__denoImageCompareWidget;
    const previousValue = previousWidget?.value
        || (node.widgets || []).find((widget) => widget?.name === WIDGET_NAME)?.value
        || { a: null, b: null, meta: {} };

    removeExistingCompareWidgets(node);
    const widget = new DenoImageCompareWidget(node);
    widget.storeValue(previousValue);
    node.addCustomWidget(widget);
    node.__denoImageCompareWidget = widget;
}

function removeExistingCompareWidgets(node) {
    if (!Array.isArray(node.widgets)) {
        return;
    }
    node.widgets = node.widgets.filter((widget) => {
        if (widget?.name !== WIDGET_NAME && widget?.name !== "deno_image_compare_panel") {
            return true;
        }
        widget.element?.remove?.();
        return false;
    });
}

class DenoImageCompareWidget {
    constructor(node) {
        this.name = WIDGET_NAME;
        this.type = "custom";
        this.node = node;
        this.options = { serialize: true };
        this._value = { a: null, b: null, meta: {} };
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
        const panelH = Math.max(PREVIEW_MIN_HEIGHT + IMAGE_CONTROLS_HEIGHT, widgetHeight - 16);
        this.hitAreas = {};
        this.lastBounds = { x, y: panelY, w: panelW, h: panelH };

        ctx.save();
        drawPanel(ctx, x, panelY, panelW, panelH);

        const titleY = panelY + 23;
        ctx.fillStyle = COLORS.textStrong;
        ctx.font = "900 16px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("Image Compare", x + 14, titleY);

        ctx.fillStyle = COLORS.textSoft;
        ctx.font = "10px sans-serif";
        ctx.fillText("Compare A and B with live visual modes.", x + 14, titleY + 19);

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

        const preview = {
            x: x + 12,
            y: footerY + 22,
            w: panelW - 24,
            h: Math.max(220, panelY + panelH - (footerY + 34)),
        };
        drawPreview(ctx, node, preview, pair);
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

        const mode = getMode(node);
        if (isMoveEvent && mode === "Slider") {
            return updateSliderFromPointer(node, pos);
        }

        if (!isDownEvent) {
            return false;
        }

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
            if (name === "preview" && mode === "Toggle") {
                setWidgetValue(node, "toggle_image", getToggleImage(node) === "A" ? "B" : "A");
                return true;
            }
        }
        return false;
    }
}

function drawPanel(ctx, x, y, w, h) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, COLORS.panelA);
    gradient.addColorStop(1, COLORS.panelB);
    drawRoundedRect(ctx, x, y, w, h, 12, gradient, COLORS.border, 1);
}

function drawPreview(ctx, node, rect, pair) {
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, COLORS.imageBack, COLORS.borderSoft, 1);
    const mode = getMode(node);
    const split = getSplitPosition(node);
    const activeToggle = getToggleImage(node);
    const imageA = pair.a?.loaded ? pair.a : null;
    const imageB = pair.b?.loaded ? pair.b : null;
    const aLabel = pair.aLabel || "A";
    const bLabel = pair.bLabel || "B";

    ctx.save();
    roundedClip(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    if (!imageA && !imageB) {
        drawPlaceholder(ctx, rect);
        ctx.restore();
        return;
    }

    if (mode === "Side by Side") {
        const gap = 8;
        const cellW = (rect.w - gap) * 0.5;
        const boundsA = drawFitImage(ctx, imageA, rect.x, rect.y, cellW, rect.h);
        const boundsB = drawFitImage(ctx, imageB, rect.x + cellW + gap, rect.y, cellW, rect.h);
        drawBadgeAtBounds(ctx, aLabel, boundsA, "left");
        drawBadgeAtBounds(ctx, bLabel, boundsB, "right");
        ctx.restore();
        return;
    }

    if (mode === "Difference") {
        const boundsA = drawFitImage(ctx, imageA, rect.x, rect.y, rect.w, rect.h);
        ctx.globalCompositeOperation = "difference";
        drawFitImage(ctx, imageB, rect.x, rect.y, rect.w, rect.h);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(72, 255, 132, 0.18)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        drawBadgeAtBounds(ctx, aLabel, boundsA || rect, "left");
        drawBadgeAtBounds(ctx, bLabel, boundsA || rect, "right");
        ctx.restore();
        return;
    }

    if (mode === "Toggle") {
        const image = activeToggle === aLabel ? imageA : imageB;
        const bounds = drawFitImage(ctx, image, rect.x, rect.y, rect.w, rect.h);
        drawBadgeAtBounds(ctx, activeToggle, bounds || rect, activeToggle === aLabel ? "left" : "right");
        ctx.restore();
        return;
    }

    const baseBounds = drawFitImage(ctx, imageB || imageA, rect.x, rect.y, rect.w, rect.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w * split, rect.h);
    ctx.clip();
    drawFitImage(ctx, imageA || imageB, rect.x, rect.y, rect.w, rect.h);
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
}

function hideBackendWidgets(node) {
    for (const name of HIDDEN_WIDGETS) {
        setWidgetHidden(getWidget(node, name), true);
    }
}

function wrapComputeSize(node) {
    if (node.__denoImageCompareComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_WIDTH, 380];
        const width = Math.max(Number(size[0]) || MIN_WIDTH, MIN_WIDTH);
        const minHeight = hasLoadedImage(this) ? IMAGE_NODE_MIN_HEIGHT : DEFAULT_NODE_HEIGHT;
        const height = Math.max(Number(size[1]) || 0, minHeight);
        return [width, height];
    };
    node.__denoImageCompareComputeWrapped = true;
}

function ensureProperties(node) {
    if (!node.properties) {
        node.properties = {};
    }
    return node.properties;
}

function isManualSized(node) {
    return Boolean(node?.properties?.[MANUAL_SIZE_PROP]);
}

function setManualSized(node, value) {
    const props = ensureProperties(node);
    if (value) {
        props[MANUAL_SIZE_PROP] = true;
    } else {
        delete props[MANUAL_SIZE_PROP];
    }
}

function setNodeSize(node, size) {
    if (!node.setSize) {
        return;
    }
    node.__denoImageCompareAutoSizing = true;
    node.setSize(size);
    queueMicrotask(() => {
        node.__denoImageCompareAutoSizing = false;
    });
}

function installManualResizeTracking(node) {
    if (node.__denoImageCompareResizeWrapped) {
        return;
    }
    node.__denoImageCompareResizeWrapped = true;
    const originalOnResize = node.onResize;
    node.onResize = function () {
        const result = originalOnResize?.apply(this, arguments);
        if (
            this.__denoImageCompareResizeTrackingArmed &&
            !this.__denoImageCompareAutoSizing &&
            !this.__denoImageCompareSettingUp
        ) {
            setManualSized(this, true);
        }
        return result;
    };
    queueMicrotask(() => {
        node.__denoImageCompareResizeTrackingArmed = true;
    });
}

function resizeNodeToPanel(node) {
    const width = Math.max(Number(node.size?.[0]) || MIN_WIDTH, MIN_WIDTH);
    const height = Math.max(Number(node.size?.[1]) || 0, DEFAULT_NODE_HEIGHT);
    setNodeSize(node, [width, height]);
}

function resizeNodeToImage(node) {
    if (isManualSized(node)) {
        resizeNodeToPanel(node);
        return;
    }

    const pair = getDisplayPair(node);
    const item = pair.a?.loaded ? pair.a : pair.b?.loaded ? pair.b : null;
    if (!item?.width || !item?.height) {
        resizeNodeToPanel(node);
        return;
    }

    const width = Math.max(Number(node.size?.[0]) || MIN_WIDTH, MIN_WIDTH);
    const imageAspect = item.width / item.height;
    if (!Number.isFinite(imageAspect) || imageAspect <= 0) {
        resizeNodeToPanel(node);
        return;
    }

    const previewWidth = width - 52;
    const desiredPreviewHeight = clamp(previewWidth / imageAspect, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT, 560);
    const desiredNodeHeight = Math.max(IMAGE_NODE_MIN_HEIGHT, desiredPreviewHeight + IMAGE_CONTROLS_HEIGHT + NODE_VERTICAL_CHROME);
    const currentHeight = Number(node.size?.[1]) || 0;
    if (Math.abs(currentHeight - desiredNodeHeight) > 12) {
        setNodeSize(node, [width, desiredNodeHeight]);
    } else {
        resizeNodeToPanel(node);
    }
}

function hasLoadedImage(node) {
    const pair = getDisplayPair(node);
    return Boolean(pair.a?.loaded || pair.b?.loaded);
}

function setPreviewWidgetValue(node) {
    const widget = node.__denoImageCompareWidget;
    if (!widget) {
        return;
    }
    const images = node.__denoImageCompareImages || {};
    widget.storeValue({
        a: images.a ? serializeImageItem(images.a) : null,
        b: images.b ? serializeImageItem(images.b) : null,
        meta: node.__denoImageCompareMeta || {},
    });
}

function serializeImageItem(item) {
    return {
        name: item.name,
        descriptor: item.descriptor,
        width: item.width,
        height: item.height,
    };
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
        return { a: null, b: null, meta: {} };
    }
    return {
        a: normalizeStoredImage(value.a),
        b: normalizeStoredImage(value.b),
        meta: value.meta && typeof value.meta === "object" ? value.meta : {},
    };
}

function normalizeStoredImage(item) {
    if (!item || typeof item !== "object") {
        return null;
    }
    const descriptor = normalizeImageDescriptor(item.descriptor || item);
    if (!descriptor && !item.url) {
        return null;
    }
    return {
        name: item.name === "B" ? "B" : "A",
        descriptor,
        url: item.url ? String(item.url) : "",
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
    };
}

function hydratePreviewFromWidgetValue(node, value) {
    if (!node || node.__denoImageCompareHydratingPreview) {
        return;
    }
    const stored = normalizeStoredPreviewValue(value);
    if (!stored.a && !stored.b) {
        return;
    }

    node.__denoImageCompareHydratingPreview = true;
    try {
        node.__denoImageCompareMeta = stored.meta;
        node.__denoImageCompareImages = {
            a: stored.a ? makeStoredImageItem(stored.a, node) : null,
            b: stored.b ? makeStoredImageItem(stored.b, node) : null,
        };
        requestNodeRedraw(node);
    } finally {
        node.__denoImageCompareHydratingPreview = false;
    }
}

function makeStoredImageItem(data, node) {
    const img = new Image();
    const url = data.descriptor ? imageDataToUrl(data.descriptor) : data.url;
    const item = {
        name: data.name,
        descriptor: data.descriptor || null,
        url,
        img,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        loaded: false,
    };
    img.onload = () => {
        item.loaded = true;
        if (!item.width) {
            item.width = img.naturalWidth;
        }
        if (!item.height) {
            item.height = img.naturalHeight;
        }
        resizeNodeToImage(node);
        requestNodeRedraw(node);
    };
    img.src = url;
    return item;
}

function getCanvasScale() {
    return Number(app?.canvas?.ds?.scale || app?.canvas?.scale || 1) || 1;
}

function getWidgetHeightFromNode(node, y = NODE_VERTICAL_CHROME, providedHeight = null) {
    const supplied = Number(providedHeight);
    const nodeHeight = Math.max(Number(node?.size?.[1]) || DEFAULT_NODE_HEIGHT, hasLoadedImage(node) ? IMAGE_NODE_MIN_HEIGHT : DEFAULT_NODE_HEIGHT);
    return Math.max(
        PREVIEW_MIN_HEIGHT + IMAGE_CONTROLS_HEIGHT + 16,
        Number.isFinite(supplied) && supplied > 0 ? supplied : 0,
        nodeHeight - y - 12
    );
}

function updateSliderFromPointer(node, pos) {
    if (!node || getMode(node) !== "Slider") {
        return false;
    }
    const bounds = node.__denoImageCompareWidget?.hitAreas?.preview?.bounds;
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

function getDisplayPair(node) {
    const images = node.__denoImageCompareImages || {};
    if (normalizeBoolean(getWidget(node, "swap")?.value)) {
        return { a: images.b, b: images.a, aLabel: "B", bLabel: "A" };
    }
    return { a: images.a, b: images.b, aLabel: "A", bLabel: "B" };
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
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoImageCompareOriginalType")) {
        widget.__denoImageCompareOriginalType = widget.type;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoImageCompareOriginalComputeSize")) {
        widget.__denoImageCompareOriginalComputeSize = widget.computeSize;
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

    widget.type = widget.__denoImageCompareOriginalType;
    if (widget.__denoImageCompareOriginalComputeSize) {
        widget.computeSize = widget.__denoImageCompareOriginalComputeSize;
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

function formatSize(label, item) {
    const width = item?.width || item?.img?.naturalWidth || 0;
    const height = item?.height || item?.img?.naturalHeight || 0;
    if (!width || !height) {
        return `${label} -- x --`;
    }
    return `${label} ${width} x ${height}`;
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
