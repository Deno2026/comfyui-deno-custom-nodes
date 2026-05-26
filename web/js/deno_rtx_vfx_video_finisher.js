import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoRTXVFXVideoFinisher";

const MIN_WIDTH = 580;
const MIN_HEIGHT = 340;
const NODE_WIDGET_SIDE_MARGIN = 30;
const PANEL_MIN_WIDTH = MIN_WIDTH - NODE_WIDGET_SIDE_MARGIN;
const PANEL_BOTTOM_GAP = 10;
const PANEL_FALLBACK_HEIGHT = 400;
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

const FIRST_PASS_CHOICES = ["Off", "Denoise", "Deblur"];
const UPSCALE_PASS_CHOICES = ["Off", "VSR", "High Bitrate"];
const UPSCALE_PASS_LABELS = {
    VSR: "Video SR",
    "High Bitrate": "High Bitrate",
    Off: "Off",
};
// Display order: most-used effect first, then the other, then Off.
const FIRST_PASS_ORDER = ["Deblur", "Denoise", "Off"];
const UPSCALE_PASS_ORDER = ["High Bitrate", "VSR", "Off"];
const QUALITY_CHOICES = ["Low", "Medium", "High", "Ultra"];
const RESIZE_TYPES = ["Keep Ratio", "Manual", "Preset Ratio", "Scale", "Same Size"];
const RESIZE_METHODS = ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"];
const RESIZE_BUTTONS = [
    { value: "Scale", label: "Scale", title: "Multiply the source size by 1x - 4x." },
    { value: "Keep Ratio", label: "Megapixels", title: "Keep the input aspect ratio, choose target megapixels." },
    { value: "Preset Ratio", label: "Ratio", title: "Choose a ratio (16:9, 9:16, 1:1) and megapixels." },
    { value: "Manual", label: "W × H", title: "Type the final width and height." },
];
const DIVISIBLE_BY_VALUES = ["1", "8", "16", "32", "64", "128"];

const BACKEND_DEFAULTS = {
    first_pass: "Deblur",
    first_quality: "Ultra",
    upscale_pass: "High Bitrate",
    upscale_quality: "High",
    resize_type: "Scale",
    scale: 2,
    megapixels: 4,
    width: 3840,
    height: 2160,
    divisible_by: "1",
    ratio_preset: "16:9",
    resize_method: "Center Crop (Fill)",
};
const BACKEND_WIDGET_NAMES = Object.keys(BACKEND_DEFAULTS);

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
    repairShiftedBackendWidgetValues(node);
    sanitizeBackendWidgetValues(node);
    updateWidgetVisibility(node);

    if (!node.__denoFinisherReady) {
        node.__denoFinisherReady = true;
        wrapWidgetCallbacks(node, () => {
            repairShiftedBackendWidgetValues(node);
            sanitizeBackendWidgetValues(node);
            updateWidgetVisibility(node);
            syncControlPanel(node);
            resizeNodeToContent(node);
            requestNodeRedraw(node);
        });
    }

    node.__denoFinisherRefresh = () => {
        repairShiftedBackendWidgetValues(node);
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

/* ---------- small DOM helpers ---------- */
function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
}
function sectionLabel(text) {
    return el("div", "color:#91dca4; font:800 10px sans-serif; letter-spacing:.02em;", text);
}
// color-scheme:dark makes Chromium render the native dropdown popup dark
// (instead of the default light/gray list) so it matches the panel.
const SELECT_CSS = (minWidth) => `
    min-width:${minWidth}px; height:26px; border-radius:8px;
    border:1px solid rgba(72,255,132,0.42); background:rgba(0,0,0,0.55);
    color:#dfffea; font:700 11px sans-serif; outline:none; cursor:pointer;
    color-scheme:dark; appearance:auto;
`;
function styleOption(o) {
    o.style.background = "#06120b";
    o.style.color = "#dfffea";
}
function makeSelect(values, minWidth) {
    const select = el("select", SELECT_CSS(minWidth));
    for (const value of values) {
        const o = document.createElement("option");
        o.value = value; o.textContent = value;
        styleOption(o);
        select.append(o);
    }
    return select;
}
function makeSelectMapped(pairs, minWidth) {
    const select = el("select", SELECT_CSS(minWidth));
    for (const [value, text] of pairs) {
        const o = document.createElement("option");
        o.value = value; o.textContent = text;
        styleOption(o);
        select.append(o);
    }
    return select;
}
function pill(label, title, height, fontSize) {
    const b = el("button", `
        height:${height}px; min-width:0; padding:0 8px; border-radius:999px;
        border:1px solid rgba(90,130,104,0.72); background:rgba(9,13,11,0.88);
        color:#c9f7d5; font:800 ${fontSize}px sans-serif; cursor:pointer;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    `, label);
    b.type = "button";
    if (title) b.title = title;
    return b;
}

function createInstallGuideControls(onToggle) {
    const root = el("div", "display:flex; flex-direction:column; gap:7px;");
    const row = el("div", "display:grid; grid-template-columns:1.2fr 1fr; gap:7px;");

    const guideLink = el("a", `
        height:26px; box-sizing:border-box; display:flex; align-items:center;
        justify-content:center; min-width:0; padding:0 8px; border-radius:999px;
        border:1px solid rgba(72,255,132,0.34); background:rgba(6,22,12,0.88);
        color:#c9f7d5; font:800 9px sans-serif; text-decoration:none;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;
    `, "How to install");
    guideLink.href = RTX_VFX_INSTALL_GUIDE_URL;
    guideLink.target = "_blank";
    guideLink.rel = "noopener noreferrer";
    guideLink.title = "Open the visual web install guide.";
    guideLink.onclick = (event) => event.stopPropagation();

    const copyButton = pill("Copy steps", "Copy the manual install checklist.", 26, 9);
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
    return root;
}

function setSelected(button, on, kind) {
    if (on && kind === "off") {
        button.style.borderColor = "rgba(150,150,150,0.6)";
        button.style.background = "rgba(40,40,40,0.85)";
        button.style.color = "#d8d8d8";
        button.style.boxShadow = "none";
    } else if (on) {
        button.style.borderColor = "rgba(72,255,132,0.95)";
        button.style.background = "rgba(31,96,50,0.92)";
        button.style.color = "#f0fff4";
        button.style.boxShadow = "0 0 0 1px rgba(72,255,132,0.18) inset";
    } else {
        button.style.borderColor = "rgba(90,130,104,0.72)";
        button.style.background = "rgba(9,13,11,0.88)";
        button.style.color = "#c9f7d5";
        button.style.boxShadow = "none";
    }
}

function buildControlPanel(node) {
    const root = el("div", `
        width:${PANEL_MIN_WIDTH}px; min-width:${PANEL_MIN_WIDTH}px;
        box-sizing:border-box; padding:12px; border-radius:12px;
        border:1px solid rgba(72,255,132,0.36);
        background:linear-gradient(180deg, rgba(3,12,8,0.98), rgba(1,6,4,0.96));
        color:#dfffea; pointer-events:auto; display:flex; flex-direction:column;
        gap:9px; overflow:hidden; font:11px sans-serif;
        margin-bottom:${PANEL_BOTTOM_GAP}px;
    `);
    installCanvasWheelForwarding(root);

    /* --- header: identity + (i) help --- */
    const header = el("div", "display:flex; align-items:flex-start; justify-content:space-between; gap:10px;");
    const titleWrap = el("div", "display:flex; flex-direction:column; gap:2px; min-width:0;");
    const titleRow = el("div", "display:flex; align-items:center; gap:7px;");
    const title = el("div", "font:800 14px sans-serif; color:#9dffba;", "RTX Video Super Resolution");
    const stageChip = el("span", `
        font:800 9px sans-serif; color:#0a1a10; background:#48ff84;
        padding:2px 7px; border-radius:999px; letter-spacing:.04em;
    `, "2 PASS");
    titleRow.append(title, stageChip);
    const subtitle = el("div",
        "font:10px sans-serif; color:#8fcfa4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;",
        "Clean up, then upscale. Turn on only the passes you need.");
    titleWrap.append(titleRow, subtitle);

    const infoBtn = el("button", `
        flex:0 0 auto; width:22px; height:22px; border-radius:50%;
        border:1px solid rgba(72,255,132,0.6); background:rgba(9,13,11,0.9);
        color:#48ff84; font:900 12px serif; cursor:pointer; line-height:1;
    `, "i");
    infoBtn.type = "button";
    infoBtn.title = "Node info";
    header.append(titleWrap, infoBtn);

    /* --- info popup --- */
    const pop = el("div", `
        display:none; padding:9px 10px; border-radius:9px;
        border:1px solid rgba(72,255,132,0.4); background:rgba(2,10,6,0.98);
        color:#cdefd8; font:10px/1.5 sans-serif;
    `);
    pop.innerHTML =
        "<b style='color:#9dffba'>RTX Video Super Resolution — 2 Pass</b><br>" +
        "Pass 1 cleans the frames (Denoise/Deblur, same size). Pass 2 upscales " +
        "(VSR / High Bitrate). Each pass can be turned Off. Both run frame-by-frame " +
        "in one node so it stays stable on low-spec machines.<br>" +
        "Default: Deblur → High Bitrate. Requires NVIDIA RTX VFX installed.";
    infoBtn.onclick = () => {
        const open = pop.style.display === "block";
        pop.style.display = open ? "none" : "block";
        applySizeAndRedraw(node);
    };

    /* --- flow diagram --- */
    const flow = el("div", `
        display:flex; align-items:center; justify-content:center; gap:7px;
        padding:7px 6px; border-radius:9px; border:1px solid rgba(72,255,132,0.18);
        background:rgba(0,0,0,0.28); font:800 10px sans-serif; flex-wrap:nowrap;
        overflow:hidden;
    `);
    const fIn = el("span", "color:#7fbf95;", "Input");
    const fArrow1 = el("span", "color:#5a7a68;", "→");
    const fStep1 = el("span", "padding:3px 8px; border-radius:7px;", "1 Pass");
    const fArrow2 = el("span", "color:#5a7a68;", "→");
    const fStep2 = el("span", "padding:3px 8px; border-radius:7px;", "2 Pass");
    const fArrow3 = el("span", "color:#5a7a68;", "→");
    const fOut = el("span", "color:#7fbf95;", "Output");
    flow.append(fIn, fArrow1, fStep1, fArrow2, fStep2, fArrow3, fOut);

    /* --- stage cards --- */
    const cardCss = `
        display:flex; flex-direction:column; gap:7px; padding:9px;
        border-radius:10px; border:1px solid rgba(72,255,132,0.20);
        background:rgba(0,0,0,0.22);
    `;
    const stepRow = () => el("div", "display:flex; align-items:center; gap:8px; flex-wrap:wrap;");

    // Pass 1
    const card1 = el("div", cardCss);
    const head1 = el("div", "display:flex; align-items:center; justify-content:space-between; gap:8px;");
    head1.append(
        el("div", "font:800 11px sans-serif; color:#bdebcb;", "1 Pass"),
        el("div", "font:800 9px sans-serif; color:#7fbf95;", "same size · optional"),
    );
    const row1 = stepRow();
    const grid1 = el("div", "display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; flex:1; min-width:160px;");
    const firstButtons = new Map();
    for (const v of FIRST_PASS_ORDER) {
        const b = pill(v, v === "Off" ? "Turn Pass 1 off" : `Pass 1: ${v}`, 28, 10);
        b.onclick = () => setBackend(node, "first_pass", v);
        firstButtons.set(v, b);
        grid1.append(b);
    }
    const q1wrap = el("label", "display:flex; align-items:center; gap:5px; color:#91dca4; font:800 9px sans-serif;");
    const firstQualitySelect = makeSelect(QUALITY_CHOICES, 78);
    firstQualitySelect.onchange = () => setBackend(node, "first_quality", firstQualitySelect.value);
    q1wrap.append(el("span", null, "Quality"), firstQualitySelect);
    row1.append(grid1, q1wrap);
    card1.append(head1, row1);

    // Pass 2
    const card2 = el("div", cardCss);
    const head2 = el("div", "display:flex; align-items:center; justify-content:space-between; gap:8px;");
    const head2R = el("div", "font:800 9px sans-serif; color:#7fbf95;", "upscale");
    head2.append(el("div", "font:800 11px sans-serif; color:#bdebcb;", "2 Pass"), head2R);
    const row2 = stepRow();
    const grid2 = el("div", "display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; flex:1; min-width:160px;");
    const upscaleButtons = new Map();
    for (const v of UPSCALE_PASS_ORDER) {
        const b = pill(UPSCALE_PASS_LABELS[v] || v, v === "Off" ? "Turn Pass 2 off" : `Upscale: ${UPSCALE_PASS_LABELS[v] || v}`, 28, 10);
        b.onclick = () => setBackend(node, "upscale_pass", v);
        upscaleButtons.set(v, b);
        grid2.append(b);
    }
    const q2wrap = el("label", "display:flex; align-items:center; gap:5px; color:#91dca4; font:800 9px sans-serif;");
    const upscaleQualitySelect = makeSelect(QUALITY_CHOICES, 78);
    upscaleQualitySelect.onchange = () => setBackend(node, "upscale_quality", upscaleQualitySelect.value);
    q2wrap.append(el("span", null, "Quality"), upscaleQualitySelect);
    row2.append(grid2, q2wrap);

    const sizeWrap = el("div", "display:flex; flex-direction:column; gap:6px;");
    const sizeGrid = el("div", "display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px;");
    const resizeButtons = new Map();
    for (const r of RESIZE_BUTTONS) {
        const b = pill(r.label, r.title, 26, 9);
        b.onclick = () => setBackend(node, "resize_type", r.value);
        resizeButtons.set(r.value, b);
        sizeGrid.append(b);
    }
    sizeWrap.append(sectionLabel("Output size"), sizeGrid);
    card2.append(head2, row2, sizeWrap);

    /* --- footer: docs + note --- */
    const footer = el("div", "display:flex; flex-direction:column; gap:6px;");
    let refreshLayout = () => {};
    const installGuide = createInstallGuideControls(() => refreshLayout());
    const note = el("div", "color:#7fbf95; font:9px/1.4 sans-serif;",
        "Fine settings (use divisible_by 1 for exact video sizes) are on the node inputs below.");
    const docsLink = el("a", `
        align-self:flex-start; box-sizing:border-box; padding:4px 8px; border-radius:8px;
        border:1px solid rgba(72,255,132,0.18); background:rgba(0,0,0,0.20);
        color:#9dffba; font:800 9px/1.2 sans-serif; text-decoration:none;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;
    `, "Link : NVIDIA docs — Video Super Resolution");
    docsLink.href = NVIDIA_VSR_DOCS_URL;
    docsLink.target = "_blank";
    docsLink.rel = "noopener noreferrer";
    docsLink.title = NVIDIA_VSR_DOCS_URL;
    docsLink.onclick = (e) => e.stopPropagation();
    footer.append(note, docsLink, installGuide);

    root.append(header, pop, flow, card1, card2, footer);

    const applySize = () => {
        const width = Math.max(
            PANEL_MIN_WIDTH,
            (Number(node.size?.[0]) || MIN_WIDTH) - NODE_WIDGET_SIDE_MARGIN
        );
        root.style.width = `${width}px`;
        root.style.minWidth = `${PANEL_MIN_WIDTH}px`;
        root.style.height = "auto";
    };
    const height = () => {
        const h = root.scrollHeight || root.getBoundingClientRect().height;
        return (h && h > 40) ? h : PANEL_FALLBACK_HEIGHT;
    };
    const applySizeAndRedraw = (n) => {
        applySize();
        resizeNodeToContent(n);
        requestNodeRedraw(n);
    };
    refreshLayout = () => applySizeAndRedraw(node);

    const ui = {
        root, applySize, height,
        sync: () => {
            const firstPass = String(getWidget(node, "first_pass")?.value || "Off");
            const firstQuality = String(getWidget(node, "first_quality")?.value || "Medium");
            const upscalePass = String(getWidget(node, "upscale_pass")?.value || "Off");
            const upscaleQuality = String(getWidget(node, "upscale_quality")?.value || "High");
            const resizeType = String(getWidget(node, "resize_type")?.value || "Scale");

            firstQualitySelect.value = QUALITY_CHOICES.includes(firstQuality) ? firstQuality : "Medium";
            upscaleQualitySelect.value = QUALITY_CHOICES.includes(upscaleQuality) ? upscaleQuality : "High";

            const firstOff = firstPass === "Off";
            const upOff = upscalePass === "Off";

            for (const [v, b] of firstButtons.entries()) {
                setSelected(b, v === firstPass, v === "Off" ? "off" : "primary");
            }
            for (const [v, b] of upscaleButtons.entries()) {
                setSelected(b, v === upscalePass, v === "Off" ? "off" : "primary");
            }
            for (const [v, b] of resizeButtons.entries()) {
                setSelected(b, v === resizeType, "primary");
            }

            // Flow stays simple/static text; lit vs dim only signals on/off.
            const lit = "color:#0a1a10; background:#48ff84;";
            const dim = "color:#5f7a69; background:rgba(255,255,255,0.04);";
            fStep1.style.cssText = "padding:3px 8px; border-radius:7px;" + (firstOff ? dim : lit);
            fStep2.style.cssText = "padding:3px 8px; border-radius:7px;" + (upOff ? dim : lit);

            card1.style.opacity = firstOff ? "0.6" : "1";
            card2.style.opacity = upOff ? "0.6" : "1";
            firstQualitySelect.disabled = firstOff;
            firstQualitySelect.style.opacity = firstOff ? "0.4" : "1";
            upscaleQualitySelect.disabled = upOff;
            upscaleQualitySelect.style.opacity = upOff ? "0.4" : "1";
            sizeWrap.style.display = upOff ? "none" : "flex";
            head2R.textContent = upOff ? "off" : "upscale";

            applySize();
        },
    };
    return ui;
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

function repairShiftedBackendWidgetValues(node) {
    const value = (name) => getWidget(node, name)?.value;
    const looksShiftedByOne = (
        FIRST_PASS_CHOICES.includes(String(value("first_quality"))) &&
        QUALITY_CHOICES.includes(String(value("upscale_pass"))) &&
        UPSCALE_PASS_CHOICES.includes(String(value("upscale_quality"))) &&
        QUALITY_CHOICES.includes(String(value("resize_type"))) &&
        RESIZE_TYPES.includes(String(value("scale"))) &&
        String(value("resize_method") || "").includes(":")
    );
    if (!looksShiftedByOne) {
        return false;
    }

    const numberOrDefault = (raw, fallback) => {
        const number = Number(raw);
        return Number.isFinite(number) ? number : fallback;
    };
    const repairedDivisibleBy = DIVISIBLE_BY_VALUES.includes(String(value("ratio_preset")))
        ? String(value("ratio_preset"))
        : BACKEND_DEFAULTS.divisible_by;
    const repairedRatioPreset = String(value("resize_method") || "").includes(":")
        ? String(value("resize_method"))
        : BACKEND_DEFAULTS.ratio_preset;

    const repaired = {
        first_pass: String(value("first_quality")),
        first_quality: String(value("upscale_pass")),
        upscale_pass: String(value("upscale_quality")),
        upscale_quality: String(value("resize_type")),
        resize_type: String(value("scale")),
        scale: numberOrDefault(value("megapixels"), BACKEND_DEFAULTS.scale),
        megapixels: numberOrDefault(value("width"), BACKEND_DEFAULTS.megapixels),
        width: numberOrDefault(value("height"), BACKEND_DEFAULTS.width),
        height: numberOrDefault(value("divisible_by"), BACKEND_DEFAULTS.height),
        divisible_by: repairedDivisibleBy,
        ratio_preset: repairedRatioPreset,
        resize_method: BACKEND_DEFAULTS.resize_method,
    };

    for (const [name, nextValue] of Object.entries(repaired)) {
        const widget = getWidget(node, name);
        if (widget) {
            setWidgetValue(node, widget, nextValue, false);
        }
    }
    node.__denoFinisherRepairedShiftedWidgets = true;
    return true;
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

    clampNumberWidget(node, getWidget(node, "scale"), BACKEND_DEFAULTS.scale);
    clampNumberWidget(node, getWidget(node, "megapixels"), BACKEND_DEFAULTS.megapixels);
    clampNumberWidget(node, getWidget(node, "width"), BACKEND_DEFAULTS.width);
    clampNumberWidget(node, getWidget(node, "height"), BACKEND_DEFAULTS.height);

    const ratioPresetWidget = getWidget(node, "ratio_preset");
    if (ratioPresetWidget && !String(ratioPresetWidget.value || "").includes(":")) {
        setWidgetValue(node, ratioPresetWidget, BACKEND_DEFAULTS.ratio_preset, false);
    }
}

function updateWidgetVisibility(node) {
    const upscalePass = String(getWidget(node, "upscale_pass")?.value || "Off");
    const resizeType = String(getWidget(node, "resize_type")?.value || "Scale");
    const upOff = upscalePass === "Off";
    const sameSize = resizeType === "Same Size";

    // Panel drives these; collapse the raw widgets visually but keep them
    // serializable so ComfyUI cannot shift later widget values forward.
    for (const name of [
        "first_pass", "first_quality", "upscale_pass", "upscale_quality",
        "resize_type",
    ]) {
        setWidgetVisible(getWidget(node, name), false);
    }

    const resizable = !upOff && !sameSize;
    setWidgetVisible(getWidget(node, "scale"), resizable && resizeType === "Scale");
    setWidgetVisible(getWidget(node, "megapixels"), resizable && (resizeType === "Keep Ratio" || resizeType === "Preset Ratio"));
    setWidgetVisible(getWidget(node, "width"), resizable && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "height"), resizable && resizeType === "Manual");
    setWidgetVisible(getWidget(node, "ratio_preset"), resizable && resizeType === "Preset Ratio");
    // resize_method (Center Crop / Fit) matters for every resizable type:
    // the backend always runs _fit_frame_to_target_aspect, and even
    // "Keep Ratio" (Megapixels) can change aspect via divisible_by rounding.
    setWidgetVisible(
        getWidget(node, "resize_method"),
        resizable && (
            resizeType === "Manual" || resizeType === "Preset Ratio"
            || resizeType === "Scale" || resizeType === "Keep Ratio"
        ),
    );
    setWidgetVisible(getWidget(node, "divisible_by"), !upOff && !sameSize);
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
    widget.__denoFinisherOriginalHidden = widget.hidden;
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
        widget.hidden = Boolean(widget.__denoFinisherOriginalHidden);
        widget.__denoFinisherVisuallyCollapsed = false;
        return;
    }
    widget.computeSize = () => [0, -4];
    widget.type = widget.__denoFinisherOriginalType || widget.type;
    widget.hidden = false;
    widget.__denoFinisherVisuallyCollapsed = true;
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
        return [Math.max(width, MIN_WIDTH), Math.max(height, MIN_HEIGHT)];
    };
    node.__denoFinisherComputeWrapped = true;
}

function resizeNodeToContent(node) {
    const computed = node.computeSize?.();
    const computedWidth = Array.isArray(computed) && Number.isFinite(Number(computed[0])) ? Number(computed[0]) : 0;
    const targetWidth = Math.max(MIN_WIDTH, Number(node.size?.[0]) || 0, computedWidth);
    const computedHeight = Array.isArray(computed) && Number.isFinite(Number(computed[1])) ? Number(computed[1]) : 0;
    const targetHeight = Math.max(MIN_HEIGHT, computedHeight);

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
