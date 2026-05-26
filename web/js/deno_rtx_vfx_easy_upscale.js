import { app } from "../../scripts/app.js";

const EASY_NODE_NAME = "DenoRTXVFXEasyUpscale";

const MIN_EASY_WIDTH = 560;
const MIN_EASY_HEIGHT = 370;
const MIN_EASY_SAME_SIZE_HEIGHT = 310;
const NODE_WIDGET_SIDE_MARGIN = 30;
const PANEL_MIN_WIDTH = MIN_EASY_WIDTH - NODE_WIDGET_SIDE_MARGIN;
const PANEL_HEIGHT_RESIZABLE = 240;
const PANEL_HEIGHT_SAME_SIZE = 188;
const INSTALL_GUIDE_CLOSED_EXTRA_HEIGHT = 34;
const PANEL_BOTTOM_GAP = 10;
const NVIDIA_VSR_DOCS_URL = "https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html";
const RTX_VFX_INSTALL_GUIDE_URL = "https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/";
const RTX_VFX_INSTALL_STEPS = [
    "DENO RTX VFX manual install",
    "",
    "1. Close every ComfyUI window first.",
    "2. Click the How to install button in the node.",
    "3. Follow the visual web install guide step by step.",
    "4. Download the ZIP from that guide page.",
    "5. Open ComfyUI\\custom_nodes\\deno-custom-nodes\\tools.",
    "6. Move install_rtx_vfx_bat.zip into that tools folder.",
    "7. Right-click the ZIP inside tools and choose Extract All.",
    "8. Double-click install_rtx_vfx.bat from the extracted installer files inside tools.",
    "9. If it asks Install RTX VFX here?, type Y only if the shown Windows path is inside the ComfyUI app you just closed. If it looks wrong, type N and stop.",
    "10. Wait for INSTALL COMPLETE.",
    "11. Start ComfyUI again.",
    "12. Run (Deno) RTX Video Super Resolution.",
].join("\n");

const EFFECTS = ["VSR", "High Bitrate", "Denoise", "Deblur"];
const EFFECT_LABELS = {
    VSR: "Video SR",
    "High Bitrate": "High Bitrate",
    Denoise: "Denoise",
    Deblur: "Deblur",
};
const QUALITIES = ["Low", "Medium", "High", "Ultra"];
const SAME_SIZE_EFFECTS = new Set(["Denoise", "Deblur"]);
const RESIZE_TYPES = ["Scale", "Keep Ratio", "Manual", "Preset Ratio", "Same Size"];
const RESIZE_METHODS = ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"];
const RESIZE_BUTTONS = [
    {
        value: "Scale",
        label: "Scale",
        title: "Multiply the source size by 1x - 4x.",
    },
    {
        value: "Keep Ratio",
        label: "Keep Ratio",
        title: "Keep the input aspect ratio and choose the target megapixels.",
    },
    {
        value: "Manual",
        label: "Manual",
        title: "Type the final width and height.",
    },
    {
        value: "Preset Ratio",
        label: "Preset Ratio",
        title: "Choose a ratio such as 16:9, 9:16, or 1:1 and choose the target megapixels.",
    },
];
const DIVISIBLE_BY_VALUES = ["1", "8", "16", "32", "64", "128"];
const DEFAULT_RESIZABLE_RESIZE = "Keep Ratio";
const BACKEND_DEFAULTS = {
    mode: "VSR Medium",
    resize_type: DEFAULT_RESIZABLE_RESIZE,
    scale: 2,
    megapixels: 2,
    width: 1920,
    height: 1080,
    divisible_by: "1",
    device: 0,
    ratio_preset: "16:9",
    resize_method: "Center Crop (Fill)",
};
const BACKEND_WIDGET_NAMES = [
    "mode",
    "resize_type",
    "scale",
    "megapixels",
    "width",
    "height",
    "divisible_by",
    "device",
    "ratio_preset",
    "resize_method",
];

const EFFECT_COPY = {
    VSR: "Upscale with NVIDIA RTX Video Super Resolution.",
    "High Bitrate": "Upscale cleaner sources with stronger detail retention.",
    Denoise: "Same-size enhancement for noisy images or frames.",
    Deblur: "Same-size enhancement for soft or blurred images.",
};
const MODE_COACH = {
    VSR: "Low-res/compressed -> larger, cleaner, sharper",
    "High Bitrate": "Clean source -> crisp detail-preserving upscale",
    Denoise: "Noise/grain -> smoother, cleaner same-size image",
    Deblur: "Soft/blurred -> clearer, sharper same-size image",
};
const MODE_COACH_LABELS = {
    VSR: "Video Super Resolution",
    "High Bitrate": "High Bitrate",
    Denoise: "Denoise",
    Deblur: "Deblur",
};

app.registerExtension({
    name: "Deno.RTXVFXEasyUpscale",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== EASY_NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupEasyUpscaleNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => {
                setupEasyUpscaleNode(this);
                this.__denoRtxVfxRefresh?.();
                this.__denoRtxVfxResize?.();
            });
            return result;
        };
    },
});

function setupEasyUpscaleNode(node) {
    if (!node) {
        return;
    }

    prepareBackendWidgets(node);
    ensureSingleImageOutput(node);
    ensureEasyControlPanel(node);
    wrapComputeSize(node);
    sanitizeBackendWidgetValues(node);
    updateWidgetVisibility(node);

    if (!node.__denoRtxVfxReady) {
        node.__denoRtxVfxReady = true;
        wrapWidgetCallbacks(node, () => {
            sanitizeBackendWidgetValues(node);
            rememberCurrentResize(node);
            updateWidgetVisibility(node);
            syncEasyControlPanel(node);
            resizeNodeToContent(node, MIN_EASY_WIDTH, minEasyHeight(node));
            requestNodeRedraw(node);
        });
    }

    rememberCurrentResize(node);
    node.__denoRtxVfxRefresh = () => {
        sanitizeBackendWidgetValues(node);
        ensureSingleImageOutput(node);
        updateWidgetVisibility(node);
        syncEasyControlPanel(node);
        requestNodeRedraw(node);
    };
    node.__denoRtxVfxResize = () => resizeNodeToContent(node, MIN_EASY_WIDTH, minEasyHeight(node));
    node.__denoRtxVfxRefresh();
    node.__denoRtxVfxResize();
}

function ensureEasyControlPanel(node) {
    if (node.__denoRtxVfxUi) {
        return;
    }

    const modeWidget = getWidget(node, "mode");
    const ui = buildEasyControlPanel(node);
    const domWidget = node.addDOMWidget("rtx_vfx_controls", "deno_rtx_vfx_controls", ui.root, {
        serialize: false,
    });
    domWidget.computeSize = () => {
        ui.applySize();
        return [Math.max(Number(node.size?.[0]) || 0, MIN_EASY_WIDTH), ui.height() + PANEL_BOTTOM_GAP];
    };
    node.__denoRtxVfxUi = ui;

    if (Array.isArray(node.widgets)) {
        const domIndex = node.widgets.indexOf(domWidget);
        if (domIndex >= 0) {
            node.widgets.splice(domIndex, 1);
        }

        const modeIndex = node.widgets.indexOf(modeWidget);
        if (modeIndex >= 0) {
            node.widgets.splice(modeIndex + 1, 0, domWidget);
        } else {
            node.widgets.unshift(domWidget);
        }
    }
}

function buildEasyControlPanel(node) {
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
        gap:10px;
        overflow:hidden;
        font:11px sans-serif;
        margin-bottom:${PANEL_BOTTOM_GAP}px;
    `;
    installCanvasWheelForwarding(root);

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px;";

    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "display:flex; flex-direction:column; gap:2px; min-width:0;";
    const title = document.createElement("div");
    title.style.cssText = "font:800 14px sans-serif; color:#9dffba;";
    title.textContent = "RTX Video Super Resolution";
    const subtitle = document.createElement("div");
    subtitle.style.cssText = "font:10px sans-serif; color:#8fcfa4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    subtitle.textContent = "Choose effect, quality, then resize.";
    titleWrap.append(title, subtitle);

    const qualityWrap = document.createElement("label");
    qualityWrap.style.cssText = "display:flex; align-items:center; gap:7px; color:#91dca4; font:800 10px sans-serif;";
    const qualityLabel = document.createElement("span");
    qualityLabel.textContent = "Quality";
    const qualitySelect = document.createElement("select");
    qualitySelect.style.cssText = `
        min-width:88px;
        height:27px;
        border-radius:8px;
        border:1px solid rgba(72,255,132,0.42);
        background:rgba(0,0,0,0.42);
        color:#dfffea;
        font:700 11px sans-serif;
        outline:none;
    `;
    for (const quality of QUALITIES) {
        const option = document.createElement("option");
        option.value = quality;
        option.textContent = quality;
        qualitySelect.append(option);
    }
    qualityWrap.append(qualityLabel, qualitySelect);
    header.append(titleWrap, qualityWrap);

    const effectGrid = document.createElement("div");
    effectGrid.style.cssText = "display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:7px;";

    const effectButtons = new Map();
    for (const effect of EFFECTS) {
        const button = createPillButton(EFFECT_LABELS[effect] || effect, EFFECT_COPY[effect], 30, 10);
        button.onclick = () => {
            setEffectAndQuality(node, effect, getCurrentMode(node).quality);
        };
        effectButtons.set(effect, button);
        effectGrid.append(button);
    }

    const coach = document.createElement("div");
    coach.style.cssText = `
        min-height:25px;
        box-sizing:border-box;
        padding:6px 8px;
        border-radius:9px;
        border:1px solid rgba(72,255,132,0.24);
        background:rgba(0,0,0,0.30);
        color:#c8f8d4;
        font:10px/1.25 sans-serif;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
    `;

    const docsLink = document.createElement("a");
    docsLink.href = NVIDIA_VSR_DOCS_URL;
    docsLink.target = "_blank";
    docsLink.rel = "noopener noreferrer";
    docsLink.textContent = "Link : NVIDIA official docs: Video Super Resolution";
    docsLink.title = NVIDIA_VSR_DOCS_URL;
    docsLink.onclick = (event) => {
        event.stopPropagation();
    };
    docsLink.style.cssText = `
        min-height:20px;
        box-sizing:border-box;
        padding:4px 8px;
        border-radius:8px;
        border:1px solid rgba(72,255,132,0.18);
        background:rgba(0,0,0,0.20);
        color:#9dffba;
        font:800 10px/1.2 sans-serif;
        text-decoration:none;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        cursor:pointer;
    `;
    docsLink.onmouseenter = () => {
        docsLink.style.borderColor = "rgba(72,255,132,0.46)";
        docsLink.style.background = "rgba(25,70,38,0.36)";
    };
    docsLink.onmouseleave = () => {
        docsLink.style.borderColor = "rgba(72,255,132,0.18)";
        docsLink.style.background = "rgba(0,0,0,0.20)";
    };

    let refreshLayout = () => {};
    const installGuide = createInstallGuideControls(() => refreshLayout());

    const resizeSection = document.createElement("div");
    resizeSection.style.cssText = "display:flex; flex-direction:column; gap:7px;";

    const resizeLabel = document.createElement("div");
    resizeLabel.style.cssText = "color:#91dca4; font:800 10px sans-serif;";
    resizeLabel.textContent = "Resize";

    const resizeGrid = document.createElement("div");
    resizeGrid.style.cssText = "display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:7px;";

    const resizeButtons = new Map();
    for (const resizeMode of RESIZE_BUTTONS) {
        const button = createPillButton(resizeMode.label, resizeMode.title, 28, 10);
        button.onclick = () => {
            setResizeType(node, resizeMode.value);
        };
        resizeButtons.set(resizeMode.value, button);
        resizeGrid.append(button);
    }

    resizeSection.append(resizeLabel, resizeGrid);

    qualitySelect.onchange = () => {
        setEffectAndQuality(node, getCurrentMode(node).effect, qualitySelect.value);
    };


    root.append(header, effectGrid, coach, docsLink, installGuide.root, resizeSection);

    const panelHeight = () => {
        const { effect } = getCurrentMode(node);
        const baseHeight = SAME_SIZE_EFFECTS.has(effect) ? PANEL_HEIGHT_SAME_SIZE : PANEL_HEIGHT_RESIZABLE;
        return baseHeight + INSTALL_GUIDE_CLOSED_EXTRA_HEIGHT;
    };
    const applySize = () => {
        const width = Math.max(
            PANEL_MIN_WIDTH,
            (Number(node.size?.[0]) || MIN_EASY_WIDTH) - NODE_WIDGET_SIDE_MARGIN
        );
        root.style.width = `${width}px`;
        root.style.minWidth = `${PANEL_MIN_WIDTH}px`;
        root.style.height = `${panelHeight()}px`;
    };
    refreshLayout = () => {
        applySize();
        resizeNodeToContent(node, MIN_EASY_WIDTH, minEasyHeight(node));
        requestNodeRedraw(node);
    };

    return {
        root,
        height: panelHeight,
        applySize,
        qualitySelect,
        effectButtons,
        coach,
        docsLink,
        resizeSection,
        resizeButtons,
        sync: () => {
            const { effect, quality } = getCurrentMode(node);
            const resizeType = getCurrentResizeType(node);
            const sameSizeOnly = SAME_SIZE_EFFECTS.has(effect);
            qualitySelect.value = quality;

            for (const [buttonEffect, button] of effectButtons.entries()) {
                setButtonSelected(button, buttonEffect === effect);
            }

            for (const [buttonResizeType, button] of resizeButtons.entries()) {
                setButtonSelected(button, buttonResizeType === resizeType);
            }

            const coachLabel = MODE_COACH_LABELS[effect] || effect;
            coach.innerHTML = `<strong>${coachLabel}</strong><span> | ${MODE_COACH[effect] || EFFECT_COPY[effect] || ""}</span>`;
            resizeSection.style.display = sameSizeOnly ? "none" : "flex";
            applySize();
        },
    };
}

function installCanvasWheelForwarding(root) {
    root.addEventListener("wheel", (event) => {
        const canvas = app.canvas?.canvas;
        if (!canvas) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        canvas.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            view: window,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
        }));
    }, { passive: false });

    root.addEventListener("pointerdown", (event) => {
        if (event.button !== 1 || isEditableTextTarget(event.target)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const canvas = app.canvas;
        if (!canvas?.ds?.offset) {
            return;
        }
        let lastX = event.clientX;
        let lastY = event.clientY;
        const move = (moveEvent) => {
            const scale = canvas.ds.scale || 1;
            canvas.ds.offset[0] += (moveEvent.clientX - lastX) / scale;
            canvas.ds.offset[1] += (moveEvent.clientY - lastY) / scale;
            lastX = moveEvent.clientX;
            lastY = moveEvent.clientY;
            if (canvas.setDirty) {
                canvas.setDirty(true, true);
            } else {
                app.graph?.setDirtyCanvas?.(true, true);
            }
        };
        const up = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", up, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
    }, true);

    root.addEventListener("auxclick", (event) => {
        if (event.button !== 1 || isEditableTextTarget(event.target)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

function isEditableTextTarget(target) {
    const element = target?.closest?.("input, textarea, [contenteditable='true']");
    return Boolean(element);
}

function createPillButton(label, title, height, fontSize) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.style.cssText = `
        height:${height}px;
        min-width:0;
        padding:0 8px;
        border-radius:999px;
        border:1px solid rgba(90,130,104,0.72);
        background:rgba(9,13,11,0.88);
        color:#c9f7d5;
        font:800 ${fontSize}px sans-serif;
        cursor:pointer;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
    `;
    return button;
}

function createInstallGuideControls(onToggle) {
    const root = document.createElement("div");
    root.style.cssText = "display:flex; flex-direction:column; gap:7px;";

    const row = document.createElement("div");
    row.style.cssText = "display:grid; grid-template-columns:1.2fr 1fr; gap:7px;";

    const guideLink = document.createElement("a");
    guideLink.href = RTX_VFX_INSTALL_GUIDE_URL;
    guideLink.target = "_blank";
    guideLink.rel = "noopener noreferrer";
    guideLink.textContent = "How to install";
    guideLink.title = "Open the visual web install guide.";
    guideLink.style.cssText = `
        height:28px;
        box-sizing:border-box;
        display:flex;
        align-items:center;
        justify-content:center;
        min-width:0;
        padding:0 8px;
        border-radius:999px;
        border:1px solid rgba(72,255,132,0.34);
        background:rgba(6,22,12,0.88);
        color:#c9f7d5;
        font:800 10px sans-serif;
        text-decoration:none;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        cursor:pointer;
    `;
    guideLink.onclick = (event) => {
        event.stopPropagation();
    };

    const copyButton = createPillButton("Copy steps", "Copy the manual install checklist.", 28, 10);
    row.append(guideLink, copyButton);
    copyButton.onclick = async () => {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard is not available.");
            }
            await navigator.clipboard.writeText(RTX_VFX_INSTALL_STEPS);
            const oldText = copyButton.textContent;
            copyButton.textContent = "Copied";
            setTimeout(() => {
                copyButton.textContent = oldText;
            }, 1100);
        } catch (_error) {
            copyButton.textContent = "Copy failed";
            setTimeout(() => {
                copyButton.textContent = "Copy steps";
            }, 1300);
        }
    };

    root.append(row);
    return {
        root,
        isOpen: () => false,
    };
}

function setButtonSelected(button, selected) {
    button.style.borderColor = selected ? "rgba(72,255,132,0.95)" : "rgba(90,130,104,0.72)";
    button.style.background = selected ? "rgba(31,96,50,0.92)" : "rgba(9,13,11,0.88)";
    button.style.color = selected ? "#f0fff4" : "#c9f7d5";
    button.style.boxShadow = selected ? "0 0 0 1px rgba(72,255,132,0.18) inset" : "none";
}

function setEffectAndQuality(node, effect, quality) {
    const safeEffect = EFFECTS.includes(effect) ? effect : "VSR";
    const safeQuality = QUALITIES.includes(quality) ? quality : "Medium";
    const mode = `${safeEffect} ${safeQuality}`;
    const modeWidget = getWidget(node, "mode");
    if (modeWidget) {
        setWidgetValue(node, modeWidget, mode, false);
    }
    sanitizeBackendWidgetValues(node);
    rememberCurrentResize(node);
    updateWidgetVisibility(node);
    syncEasyControlPanel(node);
    resizeNodeToContent(node, MIN_EASY_WIDTH, minEasyHeight(node));
    requestNodeRedraw(node);
}

function setResizeType(node, resizeType) {
    const resizeWidget = getWidget(node, "resize_type");
    const safeResizeType = RESIZE_TYPES.includes(resizeType) && resizeType !== "Same Size"
        ? resizeType
        : DEFAULT_RESIZABLE_RESIZE;
    if (resizeWidget) {
        setWidgetValue(node, resizeWidget, safeResizeType, false);
    }
    sanitizeBackendWidgetValues(node);
    rememberCurrentResize(node);
    updateWidgetVisibility(node);
    syncEasyControlPanel(node);
    resizeNodeToContent(node, MIN_EASY_WIDTH, minEasyHeight(node));
    requestNodeRedraw(node);
}

function syncEasyControlPanel(node) {
    node.__denoRtxVfxUi?.sync?.();
}

function getCurrentMode(node) {
    return parseMode(getWidget(node, "mode")?.value);
}

function getCurrentResizeType(node) {
    const resizeType = String(getWidget(node, "resize_type")?.value || DEFAULT_RESIZABLE_RESIZE);
    if (resizeType === "Megapixels") {
        return DEFAULT_RESIZABLE_RESIZE;
    }
    if (RESIZE_TYPES.includes(resizeType)) {
        return resizeType;
    }
    return DEFAULT_RESIZABLE_RESIZE;
}

function minEasyHeight(node) {
    return SAME_SIZE_EFFECTS.has(getCurrentMode(node).effect)
        ? MIN_EASY_SAME_SIZE_HEIGHT
        : MIN_EASY_HEIGHT;
}

function resizeNodeToContent(node, minWidth, minHeight) {
    const computed = node.computeSize?.();
    const computedWidth = Array.isArray(computed) && Number.isFinite(Number(computed[0]))
        ? Number(computed[0])
        : 0;
    const targetWidth = Math.max(minWidth, Number(node.size?.[0]) || 0, computedWidth);
    const computedHeight = Array.isArray(computed) && Number.isFinite(Number(computed[1]))
        ? Number(computed[1])
        : 0;
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

function wrapComputeSize(node) {
    if (node.__denoRtxVfxComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_EASY_WIDTH, MIN_EASY_HEIGHT];
        const width = Array.isArray(size) && Number.isFinite(Number(size[0]))
            ? Number(size[0])
            : MIN_EASY_WIDTH;
        const height = Array.isArray(size) && Number.isFinite(Number(size[1]))
            ? Number(size[1])
            : MIN_EASY_HEIGHT;
        return [Math.max(width, MIN_EASY_WIDTH), height];
    };
    node.__denoRtxVfxComputeWrapped = true;
}

function sanitizeBackendWidgetValues(node) {
    const modeWidget = getWidget(node, "mode");
    const resizeWidget = getWidget(node, "resize_type");
    const scaleWidget = getWidget(node, "scale");
    const megapixelsWidget = getWidget(node, "megapixels");
    const widthWidget = getWidget(node, "width");
    const heightWidget = getWidget(node, "height");
    const divisibleByWidget = getWidget(node, "divisible_by");
    const deviceWidget = getWidget(node, "device");
    const ratioPresetWidget = getWidget(node, "ratio_preset");
    const resizeMethodWidget = getWidget(node, "resize_method");

    if (modeWidget && !isModeValue(modeWidget.value)) {
        setWidgetValue(node, modeWidget, BACKEND_DEFAULTS.mode, false);
    }
    if (resizeWidget && resizeWidget.value === "Megapixels") {
        setWidgetValue(node, resizeWidget, DEFAULT_RESIZABLE_RESIZE, false);
    }
    if (resizeWidget && !RESIZE_TYPES.includes(String(resizeWidget.value))) {
        setWidgetValue(node, resizeWidget, BACKEND_DEFAULTS.resize_type, false);
    }

    clampNumberWidget(node, scaleWidget, BACKEND_DEFAULTS.scale);
    clampNumberWidget(node, megapixelsWidget, BACKEND_DEFAULTS.megapixels);
    clampNumberWidget(node, widthWidget, BACKEND_DEFAULTS.width);
    clampNumberWidget(node, heightWidget, BACKEND_DEFAULTS.height);
    clampNumberWidget(node, deviceWidget, BACKEND_DEFAULTS.device);

    if (divisibleByWidget && !DIVISIBLE_BY_VALUES.includes(String(divisibleByWidget.value))) {
        setWidgetValue(node, divisibleByWidget, BACKEND_DEFAULTS.divisible_by, false);
    }
    if (ratioPresetWidget && !String(ratioPresetWidget.value || "").includes(":")) {
        setWidgetValue(node, ratioPresetWidget, BACKEND_DEFAULTS.ratio_preset, false);
    }
    if (resizeMethodWidget && !RESIZE_METHODS.includes(String(resizeMethodWidget.value))) {
        setWidgetValue(node, resizeMethodWidget, BACKEND_DEFAULTS.resize_method, false);
    }
    if (deviceWidget) {
        setWidgetValue(node, deviceWidget, BACKEND_DEFAULTS.device, false);
    }

    const mode = parseMode(modeWidget?.value);
    const sameSizeOnly = SAME_SIZE_EFFECTS.has(mode.effect);
    if (sameSizeOnly && resizeWidget?.value !== "Same Size") {
        rememberCurrentResize(node);
        setWidgetValue(node, resizeWidget, "Same Size", false);
        node.__denoRtxVfxForcedSameSize = true;
    } else if (!sameSizeOnly && node.__denoRtxVfxForcedSameSize && resizeWidget?.value === "Same Size") {
        setWidgetValue(node, resizeWidget, node.__denoRtxVfxLastResizeType || DEFAULT_RESIZABLE_RESIZE, false);
        node.__denoRtxVfxForcedSameSize = false;
    } else if (!sameSizeOnly) {
        node.__denoRtxVfxForcedSameSize = false;
    }
}

function updateWidgetVisibility(node) {
    const mode = parseMode(getWidget(node, "mode")?.value);
    const resizeType = getCurrentResizeType(node);
    const sameSizeOnly = SAME_SIZE_EFFECTS.has(mode.effect);
    const divisibleBy = String(getWidget(node, "divisible_by")?.value || BACKEND_DEFAULTS.divisible_by);
    const canNeedAspectPolicy = resizeType === "Scale"
        || resizeType === "Manual"
        || resizeType === "Preset Ratio"
        || (resizeType === "Keep Ratio" && divisibleBy !== "1");

    setWidgetVisible(getWidget(node, "mode"), false);
    setWidgetVisible(getWidget(node, "resize_type"), false);
    setWidgetVisible(getWidget(node, "scale"), !sameSizeOnly && resizeType === "Scale");
    setWidgetVisible(getWidget(node, "device"), false);

    setWidgetVisible(getWidget(node, "megapixels"), !sameSizeOnly && (resizeType === "Keep Ratio" || resizeType === "Preset Ratio"));
    setWidgetVisible(getWidget(node, "width"), !sameSizeOnly && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "height"), !sameSizeOnly && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "ratio_preset"), !sameSizeOnly && resizeType === "Preset Ratio");
    setWidgetVisible(getWidget(node, "resize_method"), !sameSizeOnly && canNeedAspectPolicy);
    setWidgetVisible(getWidget(node, "divisible_by"), !sameSizeOnly);
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
    if (!widget || widget.__denoRtxVfxVisibilityPrepared) {
        return;
    }
    widget.__denoRtxVfxOriginalComputeSize = widget.computeSize;
    widget.__denoRtxVfxOriginalType = widget.type;
    widget.__denoRtxVfxVisibilityPrepared = true;
}

function setWidgetVisible(widget, visible) {
    if (!widget) {
        return;
    }
    prepareWidgetVisibility(widget);
    if (visible) {
        if (widget.__denoRtxVfxOriginalComputeSize) {
            widget.computeSize = widget.__denoRtxVfxOriginalComputeSize;
        } else {
            delete widget.computeSize;
        }
        widget.type = widget.__denoRtxVfxOriginalType || widget.type;
        widget.hidden = false;
        return;
    }
    widget.computeSize = () => [0, -4];
    widget.hidden = true;
    widget.type = "hidden";
}

function rememberCurrentResize(node) {
    const resizeWidget = getWidget(node, "resize_type");
    const resizeType = String(resizeWidget?.value || "");
    if (resizeType && resizeType !== "Same Size" && RESIZE_TYPES.includes(resizeType)) {
        node.__denoRtxVfxLastResizeType = resizeType;
    }
}

function parseMode(value) {
    const mode = String(value || BACKEND_DEFAULTS.mode);
    const parts = mode.split(" ");
    const quality = parts.pop() || "Medium";
    const effect = parts.join(" ") || "VSR";
    return {
        effect: EFFECTS.includes(effect) ? effect : "VSR",
        quality: QUALITIES.includes(quality) ? quality : "Medium",
    };
}

function isModeValue(value) {
    const mode = String(value || "");
    return EFFECTS.some((effect) => QUALITIES.some((quality) => mode === `${effect} ${quality}`));
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
        if (widget.__denoRtxVfxWrapped) {
            continue;
        }
        const originalCallback = widget.callback;
        widget.callback = function () {
            const result = originalCallback?.apply(this, arguments);
            refresh();
            return result;
        };
        widget.__denoRtxVfxWrapped = true;
    }
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function requestNodeRedraw(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}
