import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoRTXVFXVideoFinisher";

const MIN_WIDTH = 580;
const MIN_HEIGHT = 430;
const MIN_HEIGHT_NO_UPSCALE = 320;
const NODE_WIDGET_SIDE_MARGIN = 30;
const PANEL_MIN_WIDTH = MIN_WIDTH - NODE_WIDGET_SIDE_MARGIN;
const PANEL_HEIGHT_FULL = 318;
const PANEL_HEIGHT_NO_UPSCALE = 214;
const PANEL_BOTTOM_GAP = 10;
const NVIDIA_VSR_DOCS_URL = "https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html";

const FIRST_PASS_CHOICES = ["Off", "Denoise", "Deblur"];
const UPSCALE_PASS_CHOICES = ["Off", "VSR", "High Bitrate"];
const QUALITY_CHOICES = ["Low", "Medium", "High", "Ultra"];
const RESIZE_TYPES = ["Keep Ratio", "Manual", "Preset Ratio", "Scale", "Same Size"];
const RESIZE_METHODS = ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"];
const RESIZE_BUTTONS = [
    { value: "Keep Ratio", label: "Keep Ratio", title: "Keep the input aspect ratio and choose the target megapixels." },
    { value: "Manual", label: "Manual", title: "Type the final width and height." },
    { value: "Preset Ratio", label: "Preset Ratio", title: "Choose a ratio (16:9, 9:16, 1:1) and target megapixels." },
    { value: "Scale", label: "Scale", title: "Multiply the source size by 1x - 4x." },
];
const DIVISIBLE_BY_VALUES = ["8", "16", "32", "64", "128"];
const LOW_RAM_CHOICES = ["On", "Off"];

const BACKEND_DEFAULTS = {
    first_pass: "Deblur",
    first_quality: "Medium",
    upscale_pass: "High Bitrate",
    upscale_quality: "High",
    resize_type: "Keep Ratio",
    scale: 2,
    megapixels: 4,
    width: 3840,
    height: 2160,
    divisible_by: "32",
    ratio_preset: "16:9",
    resize_method: "Center Crop (Fill)",
    device: 0,
    low_ram_mode: "On",
    clear_cuda_cache: "Every 16 Frames",
};
const BACKEND_WIDGET_NAMES = Object.keys(BACKEND_DEFAULTS);

const COACH = {
    "Deblur|High Bitrate": "Best for clean but soft LTX frames.",
    "Deblur|VSR": "Use when the source has compression artifacts.",
    "Denoise|VSR": "Use for noisy or grainy frames.",
    "Denoise|High Bitrate": "Denoise first, then a clean detail-preserving upscale.",
    "Off|High Bitrate": "Clean source upscale with detail preservation.",
    "Off|VSR": "Compressed source upscale with artifact cleanup.",
    "Deblur|Off": "Deblur only, same size, no upscale.",
    "Denoise|Off": "Denoise only, same size, no upscale.",
    "Off|Off": "Pass-through. Pick a first pass or an upscale.",
};

app.registerExtension({
    name: "Deno.RTXVFXVideoFinisher",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupFinisherNode(this);
            return result;
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => {
                setupFinisherNode(this);
                this.__denoFinisherRefresh?.();
                this.__denoFinisherResize?.();
            });
            return result;
        };
    },
});

function setupFinisherNode(node) {
    if (!node) {
        return;
    }
    prepareBackendWidgets(node);
    ensureSingleImageOutput(node);
    ensureControlPanel(node);
    wrapComputeSize(node);
    sanitizeBackendWidgetValues(node);
    updateWidgetVisibility(node);

    if (!node.__denoFinisherReady) {
        node.__denoFinisherReady = true;
        wrapWidgetCallbacks(node, () => {
            sanitizeBackendWidgetValues(node);
            updateWidgetVisibility(node);
            syncControlPanel(node);
            resizeNodeToContent(node);
            requestNodeRedraw(node);
        });
    }

    node.__denoFinisherRefresh = () => {
        sanitizeBackendWidgetValues(node);
        ensureSingleImageOutput(node);
        updateWidgetVisibility(node);
        syncControlPanel(node);
        requestNodeRedraw(node);
    };
    node.__denoFinisherResize = () => resizeNodeToContent(node);
    node.__denoFinisherRefresh();
    node.__denoFinisherResize();
}

function ensureControlPanel(node) {
    if (node.__denoFinisherUi) {
        return;
    }
    const firstWidget = getWidget(node, "first_pass");
    const ui = buildControlPanel(node);
    const domWidget = node.addDOMWidget("rtx_finisher_controls", "deno_rtx_finisher_controls", ui.root, {
        serialize: false,
    });
    domWidget.computeSize = () => {
        ui.applySize();
        return [Math.max(Number(node.size?.[0]) || 0, MIN_WIDTH), ui.height() + PANEL_BOTTOM_GAP];
    };
    node.__denoFinisherUi = ui;

    if (Array.isArray(node.widgets)) {
        const domIndex = node.widgets.indexOf(domWidget);
        if (domIndex >= 0) {
            node.widgets.splice(domIndex, 1);
        }
        const anchorIndex = node.widgets.indexOf(firstWidget);
        if (anchorIndex >= 0) {
            node.widgets.splice(anchorIndex, 0, domWidget);
        } else {
            node.widgets.unshift(domWidget);
        }
    }
}

function sectionLabel(text) {
    const el = document.createElement("div");
    el.style.cssText = "color:#91dca4; font:800 10px sans-serif;";
    el.textContent = text;
    return el;
}

function buildControlPanel(node) {
    const root = document.createElement("div");
    root.style.cssText = `
        width:${PANEL_MIN_WIDTH}px;
        min-width:${PANEL_MIN_WIDTH}px;
        box-sizing:border-box;
        padding:12px;
        border-radius:12px;
        border:1px solid rgba(72,255,132,0.36);
        background:linear-gradient(180deg, rgba(3,12,8,0.98), rgba(1,6,4,0.96));
        color:#dfffea;
        pointer-events:auto;
        display:flex;
        flex-direction:column;
        gap:9px;
        overflow:hidden;
        font:11px sans-serif;
        margin-bottom:${PANEL_BOTTOM_GAP}px;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px;";
    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "display:flex; flex-direction:column; gap:2px; min-width:0;";
    const title = document.createElement("div");
    title.style.cssText = "font:800 14px sans-serif; color:#9dffba;";
    title.textContent = "RTX Video Finisher";
    const subtitle = document.createElement("div");
    subtitle.style.cssText = "font:10px sans-serif; color:#8fcfa4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    subtitle.textContent = "Clean pass -> upscale, frame-by-frame, low RAM.";
    titleWrap.append(title, subtitle);

    const lowRamWrap = document.createElement("label");
    lowRamWrap.style.cssText = "display:flex; align-items:center; gap:7px; color:#91dca4; font:800 10px sans-serif;";
    const lowRamLabel = document.createElement("span");
    lowRamLabel.textContent = "Low RAM";
    const lowRamSelect = makeSelect(LOW_RAM_CHOICES, 70);
    lowRamSelect.onchange = () => setBackend(node, "low_ram_mode", lowRamSelect.value);
    lowRamWrap.append(lowRamLabel, lowRamSelect);
    header.append(titleWrap, lowRamWrap);

    // First pass row
    const firstRow = document.createElement("div");
    firstRow.style.cssText = "display:flex; align-items:center; gap:8px;";
    const firstGrid = document.createElement("div");
    firstGrid.style.cssText = "display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; flex:1;";
    const firstButtons = new Map();
    for (const value of FIRST_PASS_CHOICES) {
        const button = createPillButton(value, `First pass: ${value}`, 28, 10);
        button.onclick = () => setBackend(node, "first_pass", value);
        firstButtons.set(value, button);
        firstGrid.append(button);
    }
    const firstQualitySelect = makeSelect(QUALITY_CHOICES, 84);
    firstQualitySelect.onchange = () => setBackend(node, "first_quality", firstQualitySelect.value);
    firstRow.append(firstGrid, firstQualitySelect);

    // Upscale pass row
    const upscaleRow = document.createElement("div");
    upscaleRow.style.cssText = "display:flex; align-items:center; gap:8px;";
    const upscaleGrid = document.createElement("div");
    upscaleGrid.style.cssText = "display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; flex:1;";
    const upscaleButtons = new Map();
    for (const value of UPSCALE_PASS_CHOICES) {
        const button = createPillButton(value, `Upscale: ${value}`, 28, 10);
        button.onclick = () => setBackend(node, "upscale_pass", value);
        upscaleButtons.set(value, button);
        upscaleGrid.append(button);
    }
    const upscaleQualitySelect = makeSelect(QUALITY_CHOICES, 84);
    upscaleQualitySelect.onchange = () => setBackend(node, "upscale_quality", upscaleQualitySelect.value);
    upscaleRow.append(upscaleGrid, upscaleQualitySelect);

    const coach = document.createElement("div");
    coach.style.cssText = `
        min-height:25px; box-sizing:border-box; padding:6px 8px; border-radius:9px;
        border:1px solid rgba(72,255,132,0.24); background:rgba(0,0,0,0.30);
        color:#c8f8d4; font:10px/1.25 sans-serif; white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis;
    `;

    const docsLink = document.createElement("a");
    docsLink.href = NVIDIA_VSR_DOCS_URL;
    docsLink.target = "_blank";
    docsLink.rel = "noopener noreferrer";
    docsLink.textContent = "Link : NVIDIA official docs: Video Super Resolution";
    docsLink.title = NVIDIA_VSR_DOCS_URL;
    docsLink.onclick = (event) => event.stopPropagation();
    docsLink.style.cssText = `
        min-height:20px; box-sizing:border-box; padding:4px 8px; border-radius:8px;
        border:1px solid rgba(72,255,132,0.18); background:rgba(0,0,0,0.20);
        color:#9dffba; font:800 10px/1.2 sans-serif; text-decoration:none;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;
    `;

    const resizeSection = document.createElement("div");
    resizeSection.style.cssText = "display:flex; flex-direction:column; gap:7px;";
    const resizeGrid = document.createElement("div");
    resizeGrid.style.cssText = "display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:7px;";
    const resizeButtons = new Map();
    for (const resizeMode of RESIZE_BUTTONS) {
        const button = createPillButton(resizeMode.label, resizeMode.title, 28, 10);
        button.onclick = () => setBackend(node, "resize_type", resizeMode.value);
        resizeButtons.set(resizeMode.value, button);
        resizeGrid.append(button);
    }
    resizeSection.append(sectionLabel("Resize"), resizeGrid);

    root.append(
        header,
        sectionLabel("First pass (same size)"),
        firstRow,
        sectionLabel("Upscale pass"),
        upscaleRow,
        coach,
        docsLink,
        resizeSection,
    );

    const upscaleOff = () => String(getWidget(node, "upscale_pass")?.value || "Off") === "Off";
    const panelHeight = () => (upscaleOff() ? PANEL_HEIGHT_NO_UPSCALE : PANEL_HEIGHT_FULL);
    const applySize = () => {
        const width = Math.max(
            PANEL_MIN_WIDTH,
            (Number(node.size?.[0]) || MIN_WIDTH) - NODE_WIDGET_SIDE_MARGIN
        );
        root.style.width = `${width}px`;
        root.style.minWidth = `${PANEL_MIN_WIDTH}px`;
        root.style.height = `${panelHeight()}px`;
    };

    return {
        root,
        height: panelHeight,
        applySize,
        sync: () => {
            const firstPass = String(getWidget(node, "first_pass")?.value || "Off");
            const firstQuality = String(getWidget(node, "first_quality")?.value || "Medium");
            const upscalePass = String(getWidget(node, "upscale_pass")?.value || "Off");
            const upscaleQuality = String(getWidget(node, "upscale_quality")?.value || "High");
            const resizeType = String(getWidget(node, "resize_type")?.value || "Keep Ratio");
            const lowRam = String(getWidget(node, "low_ram_mode")?.value || "On");

            lowRamSelect.value = lowRam;
            firstQualitySelect.value = QUALITY_CHOICES.includes(firstQuality) ? firstQuality : "Medium";
            upscaleQualitySelect.value = QUALITY_CHOICES.includes(upscaleQuality) ? upscaleQuality : "High";

            for (const [v, b] of firstButtons.entries()) {
                setButtonSelected(b, v === firstPass);
            }
            for (const [v, b] of upscaleButtons.entries()) {
                setButtonSelected(b, v === upscalePass);
            }
            for (const [v, b] of resizeButtons.entries()) {
                setButtonSelected(b, v === resizeType);
            }

            const firstOff = firstPass === "Off";
            const upOff = upscalePass === "Off";
            firstQualitySelect.disabled = firstOff;
            firstQualitySelect.style.opacity = firstOff ? "0.4" : "1";
            upscaleQualitySelect.disabled = upOff;
            upscaleQualitySelect.style.opacity = upOff ? "0.4" : "1";
            resizeSection.style.display = upOff ? "none" : "flex";

            coach.textContent = COACH[`${firstPass}|${upscalePass}`] || "Pick a first pass and/or an upscale.";
            applySize();
        },
    };
}

function makeSelect(values, minWidth) {
    const select = document.createElement("select");
    select.style.cssText = `
        min-width:${minWidth}px; height:27px; border-radius:8px;
        border:1px solid rgba(72,255,132,0.42); background:rgba(0,0,0,0.42);
        color:#dfffea; font:700 11px sans-serif; outline:none;
    `;
    for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
    }
    return select;
}

function createPillButton(label, title, height, fontSize) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.style.cssText = `
        height:${height}px; min-width:0; padding:0 8px; border-radius:999px;
        border:1px solid rgba(90,130,104,0.72); background:rgba(9,13,11,0.88);
        color:#c9f7d5; font:800 ${fontSize}px sans-serif; cursor:pointer;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    `;
    return button;
}

function setButtonSelected(button, selected) {
    button.style.borderColor = selected ? "rgba(72,255,132,0.95)" : "rgba(90,130,104,0.72)";
    button.style.background = selected ? "rgba(31,96,50,0.92)" : "rgba(9,13,11,0.88)";
    button.style.color = selected ? "#f0fff4" : "#c9f7d5";
    button.style.boxShadow = selected ? "0 0 0 1px rgba(72,255,132,0.18) inset" : "none";
}

function setBackend(node, name, value) {
    const widget = getWidget(node, name);
    if (widget) {
        setWidgetValue(node, widget, value, false);
    }
    sanitizeBackendWidgetValues(node);
    updateWidgetVisibility(node);
    syncControlPanel(node);
    resizeNodeToContent(node);
    requestNodeRedraw(node);
}

function syncControlPanel(node) {
    node.__denoFinisherUi?.sync?.();
}

function sanitizeBackendWidgetValues(node) {
    const check = (name, allowed) => {
        const widget = getWidget(node, name);
        if (widget && !allowed.includes(String(widget.value))) {
            setWidgetValue(node, widget, BACKEND_DEFAULTS[name], false);
        }
    };
    check("first_pass", FIRST_PASS_CHOICES);
    check("first_quality", QUALITY_CHOICES);
    check("upscale_pass", UPSCALE_PASS_CHOICES);
    check("upscale_quality", QUALITY_CHOICES);
    check("resize_type", RESIZE_TYPES);
    check("divisible_by", DIVISIBLE_BY_VALUES);
    check("resize_method", RESIZE_METHODS);
    check("low_ram_mode", LOW_RAM_CHOICES);

    clampNumberWidget(node, getWidget(node, "scale"), BACKEND_DEFAULTS.scale);
    clampNumberWidget(node, getWidget(node, "megapixels"), BACKEND_DEFAULTS.megapixels);
    clampNumberWidget(node, getWidget(node, "width"), BACKEND_DEFAULTS.width);
    clampNumberWidget(node, getWidget(node, "height"), BACKEND_DEFAULTS.height);

    const deviceWidget = getWidget(node, "device");
    if (deviceWidget) {
        setWidgetValue(node, deviceWidget, BACKEND_DEFAULTS.device, false);
    }
    const ratioPresetWidget = getWidget(node, "ratio_preset");
    if (ratioPresetWidget && !String(ratioPresetWidget.value || "").includes(":")) {
        setWidgetValue(node, ratioPresetWidget, BACKEND_DEFAULTS.ratio_preset, false);
    }
}

function updateWidgetVisibility(node) {
    const upscalePass = String(getWidget(node, "upscale_pass")?.value || "Off");
    const resizeType = String(getWidget(node, "resize_type")?.value || "Keep Ratio");
    const upOff = upscalePass === "Off";
    const sameSize = resizeType === "Same Size";

    // Panel drives these; always hide the raw widgets.
    for (const name of [
        "first_pass", "first_quality", "upscale_pass", "upscale_quality",
        "resize_type", "device", "low_ram_mode",
    ]) {
        setWidgetVisible(getWidget(node, name), false);
    }

    const resizable = !upOff && !sameSize;
    setWidgetVisible(getWidget(node, "scale"), resizable && resizeType === "Scale");
    setWidgetVisible(getWidget(node, "megapixels"), resizable && (resizeType === "Keep Ratio" || resizeType === "Preset Ratio"));
    setWidgetVisible(getWidget(node, "width"), resizable && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "height"), resizable && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "ratio_preset"), resizable && resizeType === "Preset Ratio");
    setWidgetVisible(
        getWidget(node, "resize_method"),
        resizable && (resizeType === "Manual" || resizeType === "Preset Ratio" || resizeType === "Scale"),
    );
    setWidgetVisible(getWidget(node, "divisible_by"), !upOff && !sameSize);
    // clear_cuda_cache stays visible as a native combo widget.
    setWidgetVisible(getWidget(node, "clear_cuda_cache"), true);
}

function clampNumberWidget(node, widget, fallback) {
    if (!widget) {
        return;
    }
    let value = Number(widget.value);
    const min = Number(widget.options?.min);
    const max = Number(widget.options?.max);
    if (
        !Number.isFinite(value) ||
        (Number.isFinite(min) && value < min) ||
        (Number.isFinite(max) && value > max)
    ) {
        value = fallback;
    }
    const precision = Number(widget.options?.precision);
    if (Number.isFinite(precision) && precision <= 0) {
        value = Math.round(value);
    }
    if (widget.value !== value) {
        setWidgetValue(node, widget, value, false);
    }
}

function ensureSingleImageOutput(node) {
    const current = Array.isArray(node.outputs) ? node.outputs : [];
    const imageOutput = current.find((output) => output?.name === "images" || output?.type === "IMAGE") || current[0] || {};
    node.outputs = [{
        ...imageOutput,
        name: "images",
        localized_name: imageOutput.localized_name || "images",
        type: "IMAGE",
    }];
}

function prepareBackendWidgets(node) {
    for (const name of BACKEND_WIDGET_NAMES) {
        const widget = getWidget(node, name);
        if (widget) {
            prepareWidgetVisibility(widget);
        }
    }
}

function prepareWidgetVisibility(widget) {
    if (!widget || widget.__denoFinisherVisibilityPrepared) {
        return;
    }
    widget.__denoFinisherOriginalComputeSize = widget.computeSize;
    widget.__denoFinisherOriginalType = widget.type;
    widget.__denoFinisherVisibilityPrepared = true;
}

function setWidgetVisible(widget, visible) {
    if (!widget) {
        return;
    }
    prepareWidgetVisibility(widget);
    if (visible) {
        if (widget.__denoFinisherOriginalComputeSize) {
            widget.computeSize = widget.__denoFinisherOriginalComputeSize;
        } else {
            delete widget.computeSize;
        }
        widget.type = widget.__denoFinisherOriginalType || widget.type;
        widget.hidden = false;
        return;
    }
    widget.computeSize = () => [0, -4];
    widget.hidden = true;
    widget.type = "hidden";
}

function setWidgetValue(node, widget, value, callCallback = true) {
    if (!widget) {
        return;
    }
    widget.value = value;
    if (callCallback) {
        widget.callback?.(value);
    }
    requestNodeRedraw(node);
}

function wrapWidgetCallbacks(node, refresh) {
    for (const widget of node.widgets || []) {
        if (widget.__denoFinisherWrapped) {
            continue;
        }
        const originalCallback = widget.callback;
        widget.callback = function () {
            const result = originalCallback?.apply(this, arguments);
            refresh();
            return result;
        };
        widget.__denoFinisherWrapped = true;
    }
}

function wrapComputeSize(node) {
    if (node.__denoFinisherComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_WIDTH, MIN_HEIGHT];
        const width = Array.isArray(size) && Number.isFinite(Number(size[0])) ? Number(size[0]) : MIN_WIDTH;
        const height = Array.isArray(size) && Number.isFinite(Number(size[1])) ? Number(size[1]) : MIN_HEIGHT;
        return [Math.max(width, MIN_WIDTH), height];
    };
    node.__denoFinisherComputeWrapped = true;
}

function minNodeHeight(node) {
    const upscaleOff = String(getWidget(node, "upscale_pass")?.value || "Off") === "Off";
    return upscaleOff ? MIN_HEIGHT_NO_UPSCALE : MIN_HEIGHT;
}

function resizeNodeToContent(node) {
    const minWidth = MIN_WIDTH;
    const minHeight = minNodeHeight(node);
    const computed = node.computeSize?.();
    const computedWidth = Array.isArray(computed) && Number.isFinite(Number(computed[0])) ? Number(computed[0]) : 0;
    const targetWidth = Math.max(minWidth, Number(node.size?.[0]) || 0, computedWidth);
    const computedHeight = Array.isArray(computed) && Number.isFinite(Number(computed[1])) ? Number(computed[1]) : 0;
    const targetHeight = Math.max(minHeight, computedHeight);

    if (
        Math.abs((Number(node.size?.[0]) || 0) - targetWidth) < 1
        && Math.abs((Number(node.size?.[1]) || 0) - targetHeight) < 1
    ) {
        return;
    }
    if (typeof node.setSize === "function") {
        node.setSize([targetWidth, targetHeight]);
    } else {
        node.size = [targetWidth, targetHeight];
    }
    requestNodeRedraw(node);
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function requestNodeRedraw(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}
