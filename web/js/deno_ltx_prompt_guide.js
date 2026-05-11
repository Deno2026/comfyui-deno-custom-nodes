import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoLTXPromptGuide";
const GENERATED_PREFIX = "deno_ltx_prompt_guide_";
const PROMPT_MIN_HEIGHT = 50;
const NEGATIVE_PROMPT_DEFAULT_HEIGHT = 110;
const NEGATIVE_PROMPT_MIN_HEIGHT = 80;
const NEGATIVE_PROMPT_MAX_HEIGHT = 180;

const LANGUAGE_AUTO = "Auto";
const LANGUAGE_KOREAN = "Korean";
const LANGUAGE_ENGLISH = "English";
const LANGUAGE_JAPANESE = "Japanese";
const LANGUAGE_CHINESE = "Chinese";
const VALID_LANGUAGES = new Set([LANGUAGE_AUTO, LANGUAGE_KOREAN, LANGUAGE_ENGLISH, LANGUAGE_JAPANESE, LANGUAGE_CHINESE]);

const LANGUAGE_PROFILES = {
    [LANGUAGE_KOREAN]: { unitsPerSecond: 6.2, segmentPadding: 0.15, punctuationPause: 0.12 },
    [LANGUAGE_JAPANESE]: { unitsPerSecond: 6.0, segmentPadding: 0.15, punctuationPause: 0.12 },
    [LANGUAGE_CHINESE]: { unitsPerSecond: 4.8, segmentPadding: 0.15, punctuationPause: 0.12 },
    [LANGUAGE_ENGLISH]: { unitsPerSecond: 2.75, segmentPadding: 0.15, punctuationPause: 0.12 },
};

app.registerExtension({
    name: "Deno.LTXPromptGuide",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => setupNode(this));
            return result;
        };
    },
});

function setupNode(node) {
    if (!node || node.type !== NODE_NAME || node.__denoLtxPromptGuideSettingUp) {
        return;
    }
    node.__denoLtxPromptGuideSettingUp = true;
    try {
        if (!getWidget(node, "positive_prompt") || !getWidget(node, "show_negative_prompt")) {
            return;
        }

        removeGeneratedWidgets(node);
        storeWidgetDefaults(node);
        normalizeLanguageWidget(node);
        setWidgetHidden(getWidget(node, "show_negative_prompt"), true);

        const summary = node.addCustomWidget(new DialogueSummaryWidget());
        const toggle = node.addCustomWidget(new NegativeToggleWidget());
        const promptAnchor = getWidget(node, "positive_prompt");
        const negativeAnchor = getWidget(node, "show_negative_prompt") || getWidget(node, "negative_prompt");
        moveWidgetBefore(node, summary, promptAnchor);
        moveWidgetBefore(node, toggle, negativeAnchor);

        updateNegativeVisibility(node);
        wrapWidgetCallbacks(node);
        refreshNode(node);
    } finally {
        node.__denoLtxPromptGuideSettingUp = false;
    }
}

class DialogueSummaryWidget {
    constructor() {
        this.name = `${GENERATED_PREFIX}dialogue_summary`;
        this.type = "custom";
        this.options = { serialize: false };
        this.value = "";
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        return [width, 32];
    }

    draw(ctx, node, width, y, height) {
        const estimate = estimateDialogue(node);
        const w = Math.min(340, width - 110);
        const x = Math.max(74, (width - w) * 0.5);
        const boxHeight = 22;
        const boxY = y + Math.max(4, (height - boxHeight) * 0.5);

        ctx.save();
        drawRoundedRectangle(ctx, x, boxY, w, boxHeight, boxHeight * 0.5, LiteGraph.WIDGET_BGCOLOR, "#1dbf65");
        ctx.fillStyle = "#9df7ba";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fitString(ctx, estimate, w - 16), x + w * 0.5, boxY + boxHeight * 0.5);
        ctx.restore();
    }
}

class NegativeToggleWidget {
    constructor() {
        this.name = `${GENERATED_PREFIX}negative_toggle`;
        this.type = "custom";
        this.options = { serialize: false };
        this.value = "";
        this.isMouseDownedAndOver = false;
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        return [width, LiteGraph.NODE_WIDGET_HEIGHT];
    }

    draw(ctx, node, width, y, height) {
        const opened = isNegativeOpen(node);
        const label = opened ? "Hide Negative Prompt" : "Show Negative Prompt";
        drawButton(ctx, 15, y, width - 30, height, label, this.isMouseDownedAndOver);
    }

    mouse(event, pos, node) {
        if (event.type === "pointerdown") {
            this.isMouseDownedAndOver = true;
            return true;
        }
        if (event.type === "pointermove") {
            return true;
        }
        if (event.type === "pointerup") {
            this.isMouseDownedAndOver = false;
            toggleNegativePrompt(node);
            return true;
        }
        return false;
    }
}

function removeGeneratedWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => !String(widget?.name || "").startsWith(GENERATED_PREFIX));
}

function storeWidgetDefaults(node) {
    for (const widget of node.widgets || []) {
        if (!widget || String(widget.name || "").startsWith(GENERATED_PREFIX)) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalType")) {
            widget.__denoPromptOriginalType = widget.type;
        }
        if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalComputeSize")) {
            widget.__denoPromptOriginalComputeSize = widget.computeSize;
        }
        if (widget.name === "positive_prompt" || widget.name === "negative_prompt") {
            ensurePromptHeightLock(widget);
        }
    }
}

function moveWidgetBefore(node, widget, anchor) {
    if (!widget || !anchor) {
        return;
    }
    const currentIndex = node.widgets.indexOf(widget);
    if (currentIndex >= 0) {
        node.widgets.splice(currentIndex, 1);
    }
    const anchorIndex = Math.max(0, node.widgets.indexOf(anchor));
    node.widgets.splice(anchorIndex, 0, widget);
}

function wrapWidgetCallbacks(node) {
    for (const widget of node.widgets || []) {
        if (!widget || widget.__denoLtxPromptGuideWrapped || String(widget.name || "").startsWith(GENERATED_PREFIX)) {
            continue;
        }
        const original = widget.callback;
        widget.callback = function () {
            const result = original?.apply(this, arguments);
            if (!node.__denoLtxPromptGuideRefreshing) {
                updateNegativeVisibility(node);
                refreshNode(node);
            }
            return result;
        };
        widget.__denoLtxPromptGuideWrapped = true;
    }
}

function updateNegativeVisibility(node) {
    setWidgetHidden(getWidget(node, "show_negative_prompt"), true);
    setWidgetHidden(getWidget(node, "negative_prompt"), !isNegativeOpen(node));
}

function toggleNegativePrompt(node) {
    const opening = !isNegativeOpen(node);
    const positiveWidget = getWidget(node, "positive_prompt");
    const negativeWidget = getWidget(node, "negative_prompt");
    const positiveHeight = getWidgetCurrentHeight(positiveWidget) ?? NEGATIVE_PROMPT_DEFAULT_HEIGHT;
    const negativeHeight = opening
        ? getNegativePromptTargetHeight(node, positiveHeight)
        : getWidgetCurrentHeight(negativeWidget) ?? negativeWidget?.__denoPromptLastOpenHeight ?? NEGATIVE_PROMPT_DEFAULT_HEIGHT;

    setPromptHeightLock(positiveWidget, positiveHeight, PROMPT_MIN_HEIGHT);
    setPromptHeightLock(negativeWidget, negativeHeight, NEGATIVE_PROMPT_MIN_HEIGHT);
    if (negativeWidget) {
        negativeWidget.__denoPromptLastOpenHeight = negativeHeight;
    }

    setWidgetValue(node, "show_negative_prompt", opening);
    updateNegativeVisibility(node);
    resizeNodeByDelta(node, opening ? negativeHeight + 4 : -(negativeHeight + 4));

    queueMicrotask(() => refreshNode(node));
}

function ensurePromptHeightLock(widget) {
    if (!widget?.options || widget.__denoPromptHeightLockWrapped) {
        return;
    }
    const originalGetHeight = widget.options.getHeight;
    const originalGetMinHeight = widget.options.getMinHeight;
    const originalGetMaxHeight = widget.options.getMaxHeight;
    widget.options.getHeight = function () {
        if (Number.isFinite(widget.__denoPromptLockedHeight)) {
            return widget.__denoPromptLockedHeight;
        }
        return originalGetHeight?.apply(this, arguments);
    };
    widget.options.getMinHeight = function () {
        if (Number.isFinite(widget.__denoPromptLockedHeight)) {
            return widget.__denoPromptLockedHeight;
        }
        return originalGetMinHeight?.apply(this, arguments);
    };
    widget.options.getMaxHeight = function () {
        if (Number.isFinite(widget.__denoPromptLockedHeight)) {
            return widget.__denoPromptLockedHeight;
        }
        return originalGetMaxHeight?.apply(this, arguments);
    };
    widget.__denoPromptHeightLockWrapped = true;
}

function setPromptHeightLock(widget, height, minHeight = PROMPT_MIN_HEIGHT) {
    ensurePromptHeightLock(widget);
    if (widget && Number.isFinite(height)) {
        widget.__denoPromptLockedHeight = Math.max(minHeight, height);
    }
}

function getWidgetCurrentHeight(widget) {
    const height = widget?.computedHeight;
    return Number.isFinite(height) ? height : null;
}

function getNegativePromptTargetHeight(node, positiveHeight) {
    const negativeWidget = getWidget(node, "negative_prompt");
    const remembered = negativeWidget?.__denoPromptLastOpenHeight;
    const target = Number.isFinite(remembered) ? remembered : Math.min(positiveHeight, NEGATIVE_PROMPT_DEFAULT_HEIGHT);
    return Math.max(NEGATIVE_PROMPT_MIN_HEIGHT, Math.min(target, NEGATIVE_PROMPT_MAX_HEIGHT));
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }

    if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalType")) {
        widget.__denoPromptOriginalType = widget.type;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalComputeSize")) {
        widget.__denoPromptOriginalComputeSize = widget.computeSize;
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

    widget.type = widget.__denoPromptOriginalType;
    if (widget.__denoPromptOriginalComputeSize) {
        widget.computeSize = widget.__denoPromptOriginalComputeSize;
    } else {
        delete widget.computeSize;
    }
    if (widget.element) {
        widget.element.style.display = "";
    }
}

function refreshNode(node) {
    if (node.__denoLtxPromptGuideRefreshing) {
        return;
    }
    node.__denoLtxPromptGuideRefreshing = true;
    try {
        const computed = node.computeSize?.();
        if (computed) {
            const width = Math.max(node.size?.[0] || computed[0], computed[0]);
            const height = Math.max(node.size?.[1] || computed[1], computed[1], 120);
            node.setSize?.([width, height]);
        }
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } finally {
        node.__denoLtxPromptGuideRefreshing = false;
    }
}

function resizeNodeByDelta(node, delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) {
        refreshNode(node);
        return;
    }
    const width = node.size?.[0] || node.computeSize?.()?.[0] || 400;
    const height = Math.max((node.size?.[1] || 120) + delta, 120);
    node.setSize?.([width, height]);
    const computed = node.computeSize?.();
    if (computed) {
        node.setSize?.([Math.max(width, computed[0]), Math.max(height, computed[1], 120)]);
    }
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function estimateDialogue(node) {
    const prompt = String(getWidgetValue(node, "positive_prompt", ""));
    const language = String(getWidgetValue(node, "language", LANGUAGE_AUTO));
    const frameRate = Number(getWidgetValue(node, "frame_rate", 25)) || 0;
    const segments = extractDialogueSegments(prompt);

    if (!segments.length) {
        return "Min video length: add quoted dialogue";
    }

    const seconds = round2(segments.reduce((total, segment) => total + estimateSegmentSeconds(segment, language), 0));
    const frames = Math.ceil(seconds * Math.max(frameRate, 0));
    return `Min video length: ${seconds.toFixed(2)}s+ | ${frames} frames+`;
}

function extractDialogueSegments(prompt) {
    const patterns = [
        /"([^"]+)"/g,
        /\u201c([^\u201d]+)\u201d/g,
        /\u300c([^\u300d]+)\u300d/g,
        /\u300e([^\u300f]+)\u300f/g,
    ];
    const segments = [];
    for (const pattern of patterns) {
        for (const match of prompt.matchAll(pattern)) {
            const text = String(match[1] || "").replace(/\s+/g, " ").trim();
            if (text) {
                segments.push({ index: match.index ?? 0, text });
            }
        }
    }
    return segments.sort((a, b) => a.index - b.index).map((item) => item.text);
}

function estimateSegmentSeconds(text, language) {
    const normalizedLanguage = normalizeLanguage(language);
    const selectedLanguage = normalizedLanguage === LANGUAGE_AUTO ? detectLanguage(text) : normalizedLanguage;
    const profile = LANGUAGE_PROFILES[selectedLanguage] || LANGUAGE_PROFILES[LANGUAGE_ENGLISH];
    const units = countUnits(text, selectedLanguage);
    const punctuationCount = (text.match(/[.!?\u3002\uff01\uff1f\u2026]+|[,\u3001;\uff1b:\uff1a]+/g) || []).length;
    const baseSeconds = units / profile.unitsPerSecond;
    const seconds = baseSeconds + profile.segmentPadding + punctuationCount * profile.punctuationPause;
    return Math.max(0.45, seconds);
}

function normalizeLanguageWidget(node) {
    const widget = getWidget(node, "language");
    if (widget && !VALID_LANGUAGES.has(String(widget.value))) {
        widget.value = LANGUAGE_AUTO;
    }
}

function normalizeLanguage(language) {
    const value = String(language || LANGUAGE_AUTO);
    return VALID_LANGUAGES.has(value) ? value : LANGUAGE_AUTO;
}

function detectLanguage(text) {
    const counts = {
        [LANGUAGE_KOREAN]: (text.match(/[\uac00-\ud7a3]/g) || []).length,
        [LANGUAGE_JAPANESE]: (text.match(/[\u3040-\u30ff]/g) || []).length,
        [LANGUAGE_CHINESE]: (text.match(/[\u4e00-\u9fff]/g) || []).length,
        [LANGUAGE_ENGLISH]: (text.match(/[A-Za-z]/g) || []).length,
    };
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return winner?.[1] > 0 ? winner[0] : LANGUAGE_ENGLISH;
}

function countUnits(text, language) {
    if (language === LANGUAGE_ENGLISH) {
        return Math.max(1, (text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) || []).length);
    }
    return Math.max(
        1,
        Array.from(text).filter((char) => !/\s/.test(char) && !/[.!?\u3002\uff01\uff1f\u2026,\u3001;\uff1b:\uff1a]/.test(char)).length,
    );
}

function drawButton(ctx, x, y, width, height, label, pressed) {
    drawRoundedRectangle(ctx, x + 1, y + 1, width - 2, height, 4, "#000000aa", "#000000aa");
    drawRoundedRectangle(ctx, x, y + (pressed ? 1 : 0), width, height, 4, pressed ? "#444" : LiteGraph.WIDGET_BGCOLOR, LiteGraph.WIDGET_OUTLINE_COLOR);
    ctx.save();
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, y + height / 2 + (pressed ? 1 : 0));
    ctx.restore();
}

function drawRoundedRectangle(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [radius]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function fitString(ctx, text, maxWidth) {
    const value = String(text ?? "");
    if (ctx.measureText(value).width <= maxWidth) {
        return value;
    }
    const ellipsis = "...";
    let low = 0;
    let high = value.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (ctx.measureText(value.slice(0, mid) + ellipsis).width <= maxWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return value.slice(0, Math.max(0, low)) + ellipsis;
}

function isNegativeOpen(node) {
    return Boolean(getWidgetValue(node, "show_negative_prompt", false));
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function getWidgetValue(node, name, fallback) {
    const widget = getWidget(node, name);
    return widget ? widget.value : fallback;
}

function setWidgetValue(node, name, value) {
    const widget = getWidget(node, name);
    if (widget) {
        widget.value = value;
    }
}

function round2(value) {
    return Math.round(Number(value) * 100) / 100;
}

function formatFrameRate(value) {
    return Number.isFinite(value) ? Number(value).toFixed(2).replace(/\.?0+$/, "") : "0";
}
