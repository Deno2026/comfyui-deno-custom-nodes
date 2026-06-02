import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoBerniniPromptGuide";
const GENERATED_PREFIX = "deno_bernini_prompt_guide_";
const SUMMARY_HEIGHT = 40;
const PROMPT_MIN_HEIGHT = 50;
const POSITIVE_PROMPT_DEFAULT_HEIGHT = 112;
const POSITIVE_PROMPT_MIN_HEIGHT = 86;
const NEGATIVE_PROMPT_DEFAULT_HEIGHT = 130;
const NEGATIVE_PROMPT_MIN_HEIGHT = 90;
const NEGATIVE_PROMPT_MAX_HEIGHT = 240;
const DEFAULT_NODE_WIDTH = 660;
const INFO_ICON_SIZE = 18;

const TASK_TYPE_CUSTOM_LEGACY = "custom";
const TASK_TYPE_R2V = "r2v";
const TASK_TYPE_RV2V = "rv2v";
const NEGATIVE_PRESET_OFFICIAL = "Official Wan2.2";
const NEGATIVE_PRESET_EMPTY = "Empty";
const NEGATIVE_PRESET_CUSTOM = "Custom";
const NEGATIVE_PRESET_OFFICIAL_CUSTOM = "Official Wan2.2 + Custom";

const OFFICIAL_WAN22_NEGATIVE_PROMPT = "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

const SYSTEM_PROMPTS = {
    default: "You are a helpful assistant.",
    t2i: "You are a helpful assistant specialized in text-to-image generation.",
    t2v: "You are a helpful assistant specialized in text-to-video generation.",
    i2i: "You are a helpful assistant specialized in image editing.",
    r2i: "You are a helpful assistant specialized in subject-to-image generation.",
    i2v: "You are a helpful assistant specialized in image-to-video generation.",
    v2v: "You are a helpful assistant specialized in video editing.",
    r2v: "You are a helpful assistant specialized in subject-to-video generation.",
    vi2v: "You are a helpful assistant specialized in video editing on content propagation.",
    rv2v: "You are a helpful assistant specialized in video editing with reference.",
    ads2v: "You are a helpful assistant specialized in ads insertion.",
    vrc2v: "You are a helpful assistant for editing. You may need to adjust the subject's action or position.",
    mv2v: "You are a helpful assistant for editing. You might need to adjust the video's style, lighting, colors, textures, and the subject's pose or action.",
};

const TASK_TYPE_LABELS = {
    default: "Default",
    t2i: "Text to Image",
    t2v: "Text to Video",
    i2i: "Image Edit",
    r2i: "Subject to Image",
    i2v: "Image to Video",
    v2v: "Video Edit",
    r2v: "Subject to Video",
    vi2v: "Video Propagation",
    rv2v: "Reference Video Edit",
    ads2v: "Ads Insertion",
    vrc2v: "Video Reference Control",
    mv2v: "Motion / Style Edit",
};
const TASK_LABEL_TO_TYPE = Object.fromEntries(Object.entries(TASK_TYPE_LABELS).map(([key, label]) => [label, key]));
const TASK_TYPE_DISPLAY_VALUES = Object.values(TASK_TYPE_LABELS);

const TASK_HELP = {
    default: {
        title: "Default",
        intent: "General prompt mode when you do not need a trained Bernini task prefix.",
        inputs: "Use ordinary text prompt inputs.",
        example: "Describe the image or video you want in direct instruction form.",
    },
    t2i: {
        title: "Text to Image",
        intent: "Create an image from text only.",
        inputs: "No reference image is required.",
        example: "Create a cinematic portrait of a woman in a rain-lit city street.",
    },
    t2v: {
        title: "Text to Video",
        intent: "Create a video from text only.",
        inputs: "No reference image is required.",
        example: "Generate a slow dolly shot through a futuristic alley at night.",
    },
    i2i: {
        title: "Image Edit",
        intent: "Edit an input image while keeping important parts stable.",
        inputs: "Use one source image as the image to edit.",
        example: "Change the jacket to a black leather coat. Keep face, pose, and background unchanged.",
    },
    r2i: {
        title: "Subject to Image",
        intent: "Use reference subject image(s) to create a new image of that subject.",
        inputs: "Usually 1-3 subject reference images. Refer to them as image0, image1, image2 when needed.",
        example: "Create a studio portrait of the subject from image0 wearing a white suit.",
    },
    i2v: {
        title: "Image to Video",
        intent: "Animate one input image into a video.",
        inputs: "Use one source image as the first visual state.",
        example: "Animate image0 with a slow camera push-in. Keep identity, outfit, and background consistent.",
    },
    v2v: {
        title: "Video Edit",
        intent: "Edit an existing video while preserving its motion or structure.",
        inputs: "Use a source video/context from the Bernini/KJ workflow.",
        example: "Turn the scene into a rainy night shot while keeping the original camera motion.",
    },
    r2v: {
        title: "Subject to Video",
        intent: "Create a video using reference subject image(s) as the identity or object guide.",
        inputs: "Usually 1-3 subject reference images. Use image0 for the main subject, then image1/image2 for extra references.",
        example: "Create a walking video of the person from image0 in a neon street. Keep the face and outfit consistent.",
    },
    vi2v: {
        title: "Video Propagation",
        intent: "Propagate an edit or subject change through video frames.",
        inputs: "Use source video/context plus the image or condition required by the KJ workflow.",
        example: "Apply the jacket change from image0 throughout the whole video while keeping camera motion unchanged.",
    },
    rv2v: {
        title: "Reference Video Edit",
        intent: "Edit a video using one or more reference images for style, clothing, subject, or target appearance.",
        inputs: "Use image0/image1/image2 as reference images. The prompt should say exactly what to take from each one.",
        example: "Replace the jacket with the shirt from image0. Keep camera motion, face, lighting, and background unchanged.",
    },
    ads2v: {
        title: "Ads Insertion",
        intent: "Insert or blend an advertised object/product into a video scene.",
        inputs: "Use the source video/context and product/reference images required by the workflow.",
        example: "Place the product from image0 on the table and keep the original hand motion natural.",
    },
    vrc2v: {
        title: "Video Reference Control",
        intent: "Edit action or position using a reference while keeping the video coherent.",
        inputs: "Use source video/context plus the reference image/video expected by the workflow.",
        example: "Adjust the subject's arm position to match the reference while preserving the original scene.",
    },
    mv2v: {
        title: "Motion / Style Edit",
        intent: "Change motion, style, lighting, color, texture, pose, or action in a video.",
        inputs: "Use source video/context and optional references depending on the KJ workflow.",
        example: "Make the video look like a handheld documentary shot with warmer lighting and slower movement.",
    },
};

app.registerExtension({
    name: "Deno.BerniniPromptGuide",
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
    if (!node || node.type !== NODE_NAME || node.__denoBerniniPromptGuideSettingUp) {
        return;
    }
    node.__denoBerniniPromptGuideSettingUp = true;
    try {
        if (!getWidget(node, "task_type") || !getWidget(node, "positive_prompt")) {
            return;
        }

        removeGeneratedWidgets(node);
        storeWidgetDefaults(node);
        polishWidgetLabels(node);
        applyNegativePresetToPrompt(node, { migrateLegacy: true });
        normalizeTaskWidget(node);
        initializePromptHeights(node);
        installResizeHandler(node);

        const summary = node.addCustomWidget(new SystemSummaryWidget());
        const negativeToggle = node.addCustomWidget(new NegativeToggleWidget());
        const taskAnchor = getWidget(node, "task_type");
        const promptAnchor = getWidget(node, "positive_prompt");
        const negativeAnchor = getWidget(node, "negative_preset") || getWidget(node, "negative_prompt");
        moveWidgetAfter(node, summary, taskAnchor, promptAnchor);
        moveWidgetBefore(node, negativeToggle, negativeAnchor);

        updateConditionalVisibility(node);
        wrapWidgetCallbacks(node);
        refreshNode(node);
    } finally {
        node.__denoBerniniPromptGuideSettingUp = false;
    }
}

class SystemSummaryWidget {
    constructor() {
        this.name = `${GENERATED_PREFIX}system_summary`;
        this.type = "custom";
        this.options = { serialize: false };
        this.value = "";
        this.infoBounds = [0, 0, 0, 0];
        this.infoPressed = false;
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        return [width, SUMMARY_HEIGHT];
    }

    draw(ctx, node, width, y, height) {
        const systemPrompt = getVisibleSystemPrompt(node);
        const w = Math.max(420, width - 42);
        const x = Math.max(21, (width - w) * 0.5);
        const boxHeight = 30;
        const boxY = y + Math.max(4, (height - boxHeight) * 0.5);
        const iconX = x + w - INFO_ICON_SIZE - 8;
        const iconY = boxY + (boxHeight - INFO_ICON_SIZE) * 0.5;
        this.infoBounds = [iconX, iconY, INFO_ICON_SIZE, INFO_ICON_SIZE];

        ctx.save();
        drawRoundedRectangle(ctx, x, boxY, w, boxHeight, 8, LiteGraph.WIDGET_BGCOLOR, "#1dbf65");
        ctx.fillStyle = "#9df7ba";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        drawSingleLineText(ctx, systemPrompt, x + 14, boxY + boxHeight * 0.5, w - 46, 11, 8);
        drawInfoIcon(ctx, iconX, iconY, this.infoPressed);
        ctx.restore();
    }

    mouse(event, pos, node) {
        if (event.type === "pointerdown" && isInsideBounds(pos, this.infoBounds)) {
            this.infoPressed = true;
            return true;
        }
        if (event.type === "pointermove") {
            return this.infoPressed;
        }
        if (event.type === "pointerup" && this.infoPressed) {
            this.infoPressed = false;
            if (isInsideBounds(pos, this.infoBounds)) {
                showTaskInfoPanel(node, event);
            }
            node.setDirtyCanvas?.(true, true);
            return true;
        }
        this.infoPressed = false;
        return false;
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
        drawSectionHeader(ctx, 15, y, width - 30, height, "Negative Prompt", opened ? "Hide" : "Show", this.isMouseDownedAndOver);
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
        if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalType")) {
            widget.__denoBerniniOriginalType = widget.type;
        }
        if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalComputeSize")) {
            widget.__denoBerniniOriginalComputeSize = widget.computeSize;
        }
        if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalHidden")) {
            widget.__denoBerniniOriginalHidden = Boolean(widget.hidden);
        }
        if (widget.name === "positive_prompt" || widget.name === "negative_prompt") {
            ensurePromptHeightLock(widget);
        }
    }
}

function polishWidgetLabels(node) {
    const taskWidget = getWidget(node, "task_type");
    if (taskWidget) {
        taskWidget.label = "System Prompt";
    }
    const presetWidget = getWidget(node, "negative_preset");
    if (presetWidget) {
        presetWidget.label = "Preset";
    }
    const negativeWidget = getWidget(node, "negative_prompt");
    if (negativeWidget) {
        negativeWidget.label = "Negative Prompt";
    }
}

function normalizeTaskWidget(node) {
    const widget = getWidget(node, "task_type");
    if (!widget) {
        return;
    }
    const token = normalizeTaskType(widget.value);
    widget.value = TASK_TYPE_LABELS[token] || TASK_TYPE_LABELS.default;
    widget.label = "System Prompt";
    if (widget.options) {
        widget.options.values = TASK_TYPE_DISPLAY_VALUES;
    }
}

function initializePromptHeights(node) {
    const positiveWidget = getWidget(node, "positive_prompt");
    if (positiveWidget && !Number.isFinite(positiveWidget.__denoBerniniLockedHeight)) {
        setPromptHeightLock(positiveWidget, POSITIVE_PROMPT_DEFAULT_HEIGHT, POSITIVE_PROMPT_MIN_HEIGHT);
    }
}

function installResizeHandler(node) {
    if (node.__denoBerniniResizeWrapped) {
        return;
    }
    node.__denoBerniniResizeWrapped = true;
    const originalSetSize = node.setSize;
    if (originalSetSize) {
        node.setSize = function (size) {
            if (!this.__denoBerniniPromptGuideRefreshing && Array.isArray(size) && Number.isFinite(Number(size[1]))) {
                this.__denoBerniniRequestedHeight = Number(size[1]);
            }
            const result = originalSetSize.apply(this, arguments);
            if (!this.__denoBerniniPromptGuideRefreshing && Number.isFinite(this.__denoBerniniRequestedHeight)) {
                queueMicrotask(() => {
                    if (!this.__denoBerniniPromptGuideRefreshing) {
                        refreshNode(this);
                    }
                });
            }
            return result;
        };
    }
    const originalOnResize = node.onResize;
    node.onResize = function () {
        const requestedSize = arguments[0];
        if (Array.isArray(requestedSize) && Number.isFinite(Number(requestedSize[1]))) {
            this.__denoBerniniRequestedHeight = Number(requestedSize[1]);
        }
        const result = originalOnResize?.apply(this, arguments);
        if (!this.__denoBerniniPromptGuideRefreshing) {
            refreshNode(this);
        }
        return result;
    };
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

function moveWidgetAfter(node, widget, anchor, fallbackAnchor) {
    if (!widget) {
        return;
    }
    const currentIndex = node.widgets.indexOf(widget);
    if (currentIndex >= 0) {
        node.widgets.splice(currentIndex, 1);
    }
    const anchorIndex = node.widgets.indexOf(anchor);
    if (anchorIndex >= 0) {
        node.widgets.splice(anchorIndex + 1, 0, widget);
        return;
    }
    moveWidgetBefore(node, widget, fallbackAnchor);
}

function wrapWidgetCallbacks(node) {
    for (const widget of node.widgets || []) {
        if (!widget || widget.__denoBerniniPromptGuideWrapped || String(widget.name || "").startsWith(GENERATED_PREFIX)) {
            continue;
        }
        const original = widget.callback;
        widget.callback = function () {
            const result = original?.apply(this, arguments);
            if (!node.__denoBerniniPromptGuideRefreshing) {
                if (widget.name === "task_type") {
                    normalizeTaskWidget(node);
                }
                if (widget.name === "negative_preset") {
                    applyNegativePresetToPrompt(node, { force: true });
                }
                updateConditionalVisibility(node);
                refreshNode(node);
            }
            return result;
        };
        widget.__denoBerniniPromptGuideWrapped = true;
    }
}

function updateConditionalVisibility(node) {
    const negativeOpen = isNegativeOpen(node);

    setWidgetHidden(getWidget(node, "reference_prompt_helper"), true);
    setWidgetHidden(getWidget(node, "show_negative_prompt"), true);
    setWidgetHidden(getWidget(node, "custom_system_prompt"), true);
    setWidgetHidden(getWidget(node, "negative_preset"), !negativeOpen);
    setWidgetHidden(getWidget(node, "negative_prompt"), !negativeOpen);
}

function applyNegativePresetToPrompt(node, options = {}) {
    const preset = String(getWidgetValue(node, "negative_preset", NEGATIVE_PRESET_OFFICIAL));
    const negativeWidget = getWidget(node, "negative_prompt");
    if (!negativeWidget) {
        return;
    }

    const current = String(negativeWidget.value || "");
    if (preset === NEGATIVE_PRESET_EMPTY) {
        if (options.force) {
            setWidgetValue(node, "negative_prompt", "");
        }
        return;
    }

    if (preset === NEGATIVE_PRESET_OFFICIAL) {
        if (options.force || !current.trim()) {
            setWidgetValue(node, "negative_prompt", OFFICIAL_WAN22_NEGATIVE_PROMPT);
        }
        return;
    }

    // Legacy safety: older draft workflows used separate custom modes. Fold the
    // saved custom text into the visible prompt box once so future output simply
    // follows what the user sees and edits.
    if (preset === NEGATIVE_PRESET_OFFICIAL_CUSTOM) {
        if (!current.trim()) {
            setWidgetValue(node, "negative_prompt", OFFICIAL_WAN22_NEGATIVE_PROMPT);
        } else if (!current.includes(OFFICIAL_WAN22_NEGATIVE_PROMPT)) {
            setWidgetValue(node, "negative_prompt", `${OFFICIAL_WAN22_NEGATIVE_PROMPT} ${current.trim()}`);
        }
        if (options.migrateLegacy) {
            setWidgetValue(node, "negative_preset", NEGATIVE_PRESET_OFFICIAL);
        }
        return;
    }

    if (preset === NEGATIVE_PRESET_CUSTOM && options.force) {
        setWidgetValue(node, "negative_prompt", current);
    }
}

function toggleNegativePrompt(node) {
    const opening = !isNegativeOpen(node);
    const positiveWidget = getWidget(node, "positive_prompt");
    const negativeWidget = getWidget(node, "negative_prompt");
    const positiveHeight = getWidgetCurrentHeight(positiveWidget) ?? positiveWidget?.__denoBerniniLockedHeight ?? POSITIVE_PROMPT_DEFAULT_HEIGHT;
    const negativeHeight = opening
        ? getNegativePromptTargetHeight(node, positiveHeight)
        : getWidgetCurrentHeight(negativeWidget) ?? negativeWidget?.__denoBerniniLastOpenHeight ?? NEGATIVE_PROMPT_DEFAULT_HEIGHT;

    setPromptHeightLock(positiveWidget, positiveHeight, PROMPT_MIN_HEIGHT);
    setPromptHeightLock(negativeWidget, negativeHeight, NEGATIVE_PROMPT_MIN_HEIGHT);
    if (negativeWidget) {
        negativeWidget.__denoBerniniLastOpenHeight = negativeHeight;
    }

    setWidgetValue(node, "show_negative_prompt", opening);
    updateConditionalVisibility(node);
    queueMicrotask(() => refreshNode(node));
}

function ensurePromptHeightLock(widget) {
    if (!widget?.options || widget.__denoBerniniHeightLockWrapped) {
        return;
    }
    const originalGetHeight = widget.options.getHeight;
    const originalGetMinHeight = widget.options.getMinHeight;
    const originalGetMaxHeight = widget.options.getMaxHeight;
    widget.options.getHeight = function () {
        if (Number.isFinite(widget.__denoBerniniLockedHeight)) {
            return widget.__denoBerniniLockedHeight;
        }
        return originalGetHeight?.apply(this, arguments);
    };
    widget.options.getMinHeight = function () {
        if (Number.isFinite(widget.__denoBerniniMinHeight)) {
            return widget.__denoBerniniMinHeight;
        }
        return originalGetMinHeight?.apply(this, arguments);
    };
    widget.options.getMaxHeight = function () {
        const maxHeight = originalGetMaxHeight?.apply(this, arguments);
        if (Number.isFinite(maxHeight)) {
            return maxHeight;
        }
        return Number.MAX_SAFE_INTEGER;
    };
    widget.__denoBerniniHeightLockWrapped = true;
}

function setPromptHeightLock(widget, height, minHeight = PROMPT_MIN_HEIGHT) {
    ensurePromptHeightLock(widget);
    if (widget && Number.isFinite(height)) {
        widget.__denoBerniniMinHeight = Math.max(1, minHeight);
        widget.__denoBerniniLockedHeight = Math.max(minHeight, height);
    }
}

function getWidgetCurrentHeight(widget) {
    const height = widget?.computedHeight;
    return Number.isFinite(height) ? height : null;
}

function getNegativePromptTargetHeight(node, positiveHeight) {
    const negativeWidget = getWidget(node, "negative_prompt");
    const remembered = negativeWidget?.__denoBerniniLastOpenHeight;
    const target = Number.isFinite(remembered) ? remembered : Math.min(positiveHeight, NEGATIVE_PROMPT_DEFAULT_HEIGHT);
    return Math.max(NEGATIVE_PROMPT_MIN_HEIGHT, Math.min(target, NEGATIVE_PROMPT_MAX_HEIGHT));
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalType")) {
        widget.__denoBerniniOriginalType = widget.type;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalComputeSize")) {
        widget.__denoBerniniOriginalComputeSize = widget.computeSize;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoBerniniOriginalHidden")) {
        widget.__denoBerniniOriginalHidden = Boolean(widget.hidden);
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

    widget.type = widget.__denoBerniniOriginalType || widget.type;
    if (widget.__denoBerniniOriginalComputeSize) {
        widget.computeSize = widget.__denoBerniniOriginalComputeSize;
    } else {
        delete widget.computeSize;
    }
    widget.hidden = Boolean(widget.__denoBerniniOriginalHidden);
    if (widget.element) {
        widget.element.style.display = "";
    }
}

function refreshNode(node) {
    if (node.__denoBerniniPromptGuideRefreshing) {
        return;
    }
    node.__denoBerniniPromptGuideRefreshing = true;
    try {
        const requestedHeight = Number.isFinite(node.__denoBerniniRequestedHeight)
            ? node.__denoBerniniRequestedHeight
            : Number(node.size?.[1]);
        const hadExplicitRequestedHeight = Number.isFinite(node.__denoBerniniRequestedHeight);
        fitPositivePromptToNodeHeight(node, requestedHeight, hadExplicitRequestedHeight);
        if (hadExplicitRequestedHeight) {
            delete node.__denoBerniniRequestedHeight;
        }
        const computed = node.computeSize?.();
        if (computed) {
            const width = Math.max(node.size?.[0] || computed[0], computed[0], DEFAULT_NODE_WIDTH);
            // Fit to the actual visible widgets so stale oversized node bodies do
            // not create dead blank areas that block ComfyUI canvas wheel zoom.
            // When the user makes the node taller, the extra room is assigned
            // to the positive prompt instead of being left as inert body space.
            const height = Math.max(requestedHeight || 0, computed[1], 180);
            node.setSize?.([width, height]);
        }
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } finally {
        node.__denoBerniniPromptGuideRefreshing = false;
    }
}

function fitPositivePromptToNodeHeight(node, requestedHeight, explicitResize = false) {
    const positiveWidget = getWidget(node, "positive_prompt");
    if (!positiveWidget) {
        return;
    }
    initializePromptHeights(node);
    const nodeHeight = Number.isFinite(Number(requestedHeight)) ? Number(requestedHeight) : Number(node.size?.[1]);
    if (!Number.isFinite(nodeHeight) || nodeHeight <= 0) {
        return;
    }
    const computed = node.computeSize?.();
    if (!computed || !Number.isFinite(Number(computed[1]))) {
        return;
    }
    const currentPromptHeight = Number.isFinite(positiveWidget.__denoBerniniLockedHeight)
        ? positiveWidget.__denoBerniniLockedHeight
        : POSITIVE_PROMPT_DEFAULT_HEIGHT;
    const fixedHeight = Number(computed[1]) - currentPromptHeight;
    const minPromptHeight = explicitResize ? POSITIVE_PROMPT_MIN_HEIGHT : POSITIVE_PROMPT_DEFAULT_HEIGHT;
    const targetPromptHeight = Math.max(minPromptHeight, nodeHeight - fixedHeight);
    if (Math.abs(targetPromptHeight - currentPromptHeight) < 4) {
        return;
    }
    setPromptHeightLock(
        positiveWidget,
        targetPromptHeight,
        POSITIVE_PROMPT_MIN_HEIGHT,
    );
}

function getVisibleSystemPrompt(node) {
    const taskType = getTaskType(node);
    return SYSTEM_PROMPTS[taskType] || SYSTEM_PROMPTS.default;
}

function shouldShowReferenceHint(node) {
    const taskType = getTaskType(node);
    return Boolean(getWidgetValue(node, "reference_prompt_helper", false)) && (taskType === TASK_TYPE_R2V || taskType === TASK_TYPE_RV2V);
}

function getTaskType(node) {
    return normalizeTaskType(getWidgetValue(node, "task_type", TASK_TYPE_LABELS.default));
}

function getTaskLabel(node) {
    const taskType = getTaskType(node);
    return TASK_TYPE_LABELS[taskType] || TASK_TYPE_LABELS.default;
}

function normalizeTaskType(value) {
    const text = String(value || "").trim();
    if (Object.prototype.hasOwnProperty.call(SYSTEM_PROMPTS, text)) {
        return text;
    }
    if (text === TASK_TYPE_CUSTOM_LEGACY || text === "Custom System Prompt") {
        return "default";
    }
    return TASK_LABEL_TO_TYPE[text] || "default";
}

function isNegativeOpen(node) {
    return Boolean(getWidgetValue(node, "show_negative_prompt", true));
}

function getTaskHelp(node) {
    const taskType = getTaskType(node);
    return TASK_HELP[taskType] || TASK_HELP.default;
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

function isInsideBounds(pos, bounds) {
    return Boolean(
        bounds &&
            pos &&
            pos[0] >= bounds[0] &&
            pos[0] <= bounds[0] + bounds[2] &&
            pos[1] >= bounds[1] &&
            pos[1] <= bounds[1] + bounds[3],
    );
}

function showTaskInfoPanel(node, event) {
    ensureTaskInfoStyles();
    document.getElementById("deno-bernini-task-info-panel")?.remove();

    const help = getTaskHelp(node);
    const panel = document.createElement("div");
    panel.id = "deno-bernini-task-info-panel";
    panel.className = "deno-bernini-task-info-panel";
    panel.innerHTML = `
        <div class="deno-bernini-task-info-title">
            <strong>${escapeHtml(help.title)}</strong>
            <button type="button" data-action="close">Close</button>
        </div>
        <div class="deno-bernini-task-info-row">
            <span>Use for</span>
            <p>${escapeHtml(help.intent)}</p>
        </div>
        <div class="deno-bernini-task-info-row">
            <span>Inputs</span>
            <p>${escapeHtml(help.inputs)}</p>
        </div>
        <div class="deno-bernini-task-info-row">
            <span>Prompt example</span>
            <p>${escapeHtml(help.example)}</p>
        </div>
    `;

    const close = () => {
        panel.remove();
        document.removeEventListener("pointerdown", closeOnOutside, true);
        document.removeEventListener("keydown", closeOnEscape, true);
    };
    const closeOnOutside = (pointerEvent) => {
        if (!panel.contains(pointerEvent.target)) {
            close();
        }
    };
    const closeOnEscape = (keyEvent) => {
        if (keyEvent.key === "Escape") {
            close();
        }
    };

    panel.addEventListener("pointerdown", (pointerEvent) => {
        pointerEvent.stopPropagation();
    });
    panel.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        if (clickEvent.target?.dataset?.action === "close") {
            close();
        }
    });

    document.body.appendChild(panel);
    const panelWidth = 390;
    const maxX = Math.max(14, window.innerWidth - panelWidth - 14);
    const maxY = Math.max(14, window.innerHeight - 260);
    const x = Math.min(maxX, Math.max(14, Number(event?.clientX || window.innerWidth * 0.5) - panelWidth + 18));
    const y = Math.min(maxY, Math.max(14, Number(event?.clientY || window.innerHeight * 0.4) + 12));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;

    setTimeout(() => {
        document.addEventListener("pointerdown", closeOnOutside, true);
        document.addEventListener("keydown", closeOnEscape, true);
    }, 0);
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

function drawInfoIcon(ctx, x, y, pressed) {
    ctx.save();
    ctx.globalAlpha = app.canvas?.editor_alpha ?? 1;
    ctx.fillStyle = pressed ? "rgba(157, 247, 186, 0.18)" : "rgba(0, 0, 0, 0.24)";
    ctx.strokeStyle = "#9df7ba";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(x + INFO_ICON_SIZE * 0.5, y + INFO_ICON_SIZE * 0.5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#9df7ba";
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("i", x + INFO_ICON_SIZE * 0.5, y + INFO_ICON_SIZE * 0.5 + 0.4);
    ctx.restore();
}

function drawSectionHeader(ctx, x, y, width, height, label, state, pressed) {
    drawRoundedRectangle(ctx, x + 1, y + 1, width - 2, height, 4, "#00000088", "#00000088");
    drawRoundedRectangle(ctx, x, y + (pressed ? 1 : 0), width, height, 4, pressed ? "#343434" : LiteGraph.WIDGET_BGCOLOR, LiteGraph.WIDGET_OUTLINE_COLOR);
    ctx.save();
    ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(label, x + 14, y + height / 2 + (pressed ? 1 : 0));
    ctx.textAlign = "right";
    ctx.font = "11px sans-serif";
    ctx.fillStyle = state === "open" ? "#9df7ba" : LiteGraph.WIDGET_SECONDARY_TEXT_COLOR || LiteGraph.WIDGET_TEXT_COLOR;
    ctx.fillText(state, x + width - 14, y + height / 2 + (pressed ? 1 : 0));
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

function drawSingleLineText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize) {
    const value = String(text || "");
    for (let size = maxFontSize; size >= minFontSize; size -= 0.5) {
        ctx.font = `bold ${size}px sans-serif`;
        if (ctx.measureText(value).width <= maxWidth) {
            ctx.fillText(value, x, y);
            return;
        }
    }
    ctx.font = `bold ${minFontSize}px sans-serif`;
    ctx.fillText(value, x, y, maxWidth);
}

function ensureTaskInfoStyles() {
    if (document.getElementById("deno-bernini-task-info-styles")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "deno-bernini-task-info-styles";
    style.textContent = `
        .deno-bernini-task-info-panel {
            position: fixed;
            z-index: 100000;
            box-sizing: border-box;
            width: min(390px, calc(100vw - 28px));
            border: 1px solid rgba(29, 191, 101, 0.95);
            border-radius: 8px;
            background: rgba(27, 30, 31, 0.98);
            box-shadow: 0 18px 58px rgba(0, 0, 0, 0.5);
            color: #d7dce0;
            padding: 12px 13px;
            font: 12px/1.45 sans-serif;
            pointer-events: auto;
        }
        .deno-bernini-task-info-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 9px;
        }
        .deno-bernini-task-info-title strong {
            color: #9df7ba;
            font-size: 14px;
        }
        .deno-bernini-task-info-title button {
            border: 1px solid rgba(157, 247, 186, 0.58);
            border-radius: 5px;
            background: rgba(0, 0, 0, 0.24);
            color: #9df7ba;
            font: 11px sans-serif;
            padding: 3px 8px;
            cursor: pointer;
        }
        .deno-bernini-task-info-row {
            margin-top: 8px;
        }
        .deno-bernini-task-info-row span {
            display: block;
            color: rgba(157, 247, 186, 0.82);
            font-weight: 700;
            margin-bottom: 2px;
        }
        .deno-bernini-task-info-row p {
            margin: 0;
            color: rgba(231, 235, 238, 0.92);
        }
    `;
    document.head.appendChild(style);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
