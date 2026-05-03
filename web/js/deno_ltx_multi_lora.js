import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoLTXMultiLoraLoader";
const UI_VERSION = "rgthree-style-draft-v2";
const MAX_SLOTS = 8;
const MIN_WIDTH = 390;
const NONE_VALUE = "__none__";
const GENERATED_PREFIX = "deno_ltx_multi_lora_";
const MARGIN = 10;
const INNER_MARGIN = MARGIN * 0.33;
const NUMBER_COLUMN_GAP = 3 + INNER_MARGIN * 2;
let lastContextMenuEvent = null;

app.registerExtension({
    name: "Deno.LTXMultiLora",
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
    if (!node || node.type !== NODE_NAME || node.__denoLtxMultiLoraSettingUp) {
        return;
    }
    node.__denoLtxMultiLoraSettingUp = true;
    try {
        if (!getWidget(node, "active_loras")) {
            return;
        }
        node.serialize_widgets = true;
        hideBackendWidgets(node);
        normalizeBackendValues(node);
        wrapComputeSize(node);
        wrapContextMenu(node);
        ensureContextEventTracker();
        rebuildUi(node);
        node.__denoLtxMultiLoraUiVersion = UI_VERSION;
    } finally {
        node.__denoLtxMultiLoraSettingUp = false;
    }
}

function rebuildUi(node) {
    removeGeneratedWidgets(node);
    hideBackendWidgets(node);

    node.addCustomWidget(new DenoDividerWidget());
    node.addCustomWidget(new DenoLoraHeaderWidget());
    for (let index = 1; index <= activeCount(node); index += 1) {
        node.addCustomWidget(new DenoLoraRowWidget(index));
    }
    node.addCustomWidget(new DenoAddLoraWidget());

    const computed = node.computeSize?.() || [MIN_WIDTH, 120];
    node.size = node.size || [MIN_WIDTH, computed[1]];
    node.size[0] = Math.max(node.size[0], MIN_WIDTH);
    node.size[1] = Math.max(computed[1], 90);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function removeGeneratedWidgets(node) {
    const kept = [];
    for (const widget of node.widgets || []) {
        const name = String(widget.name || "");
        if (name.startsWith(GENERATED_PREFIX) || name === "ltx_lora_panel") {
            removeElement(widget);
            continue;
        }
        kept.push(widget);
    }
    node.widgets = kept;
}

function removeElement(widget) {
    if (widget?.element?.parentNode) {
        widget.element.parentNode.removeChild(widget.element);
    } else if (widget?.element?.remove) {
        widget.element.remove();
    }
}

function wrapComputeSize(node) {
    if (node.__denoLtxMultiLoraComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_WIDTH, 120];
        return [Math.max(size[0], MIN_WIDTH), size[1]];
    };
    node.__denoLtxMultiLoraComputeWrapped = true;
}

function wrapContextMenu(node) {
    if (node.__denoLtxMultiLoraContextWrapped) {
        return;
    }

    const originalGetSlotInPosition = node.getSlotInPosition;
    node.getSlotInPosition = function (canvasX, canvasY) {
        const slot = originalGetSlotInPosition?.apply(this, arguments);
        if (slot) {
            return slot;
        }

        const rowWidget = rowWidgetAtCanvasY(this, canvasY);
        if (rowWidget) {
            return { widget: rowWidget, output: { type: "DENO LTX LORA ROW" } };
        }
        return slot;
    };

    const originalGetSlotMenuOptions = node.getSlotMenuOptions;
    node.getSlotMenuOptions = function (slot) {
        if (isLoraRowWidget(slot?.widget)) {
            showRemoveLoraMenu(lastContextMenuEvent, this, slot.widget.index);
            return undefined;
        }
        return originalGetSlotMenuOptions?.apply(this, arguments);
    };

    const originalGetExtraMenuOptions = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_canvas, options) {
        const result = originalGetExtraMenuOptions?.apply(this, arguments);
        const count = activeCount(this);
        if (count <= 0 || !Array.isArray(options)) {
            return result;
        }

        options.unshift({
            content: "Remove LoRA Slot",
            submenu: {
                options: Array.from({ length: count }, (_, index) => {
                    const slot = index + 1;
                    return {
                        content: "Slot " + slot + ": " + displayLora(getValue(this, "lora_" + slot, NONE_VALUE)),
                        callback: () => removeLoraSlot(this, slot),
                    };
                }),
            },
        });
        return result;
    };

    node.__denoLtxMultiLoraContextWrapped = true;
}

function isRightClickEvent(event) {
    return event?.button === 2 || event?.which === 3 || event?.type === "contextmenu";
}

function ensureContextEventTracker() {
    if (window.__denoLtxMultiLoraContextTrackerInstalled) {
        return;
    }
    const remember = (event) => {
        if (isRightClickEvent(event)) {
            lastContextMenuEvent = event;
        }
    };
    window.addEventListener("pointerdown", remember, true);
    window.addEventListener("contextmenu", remember, true);
    window.__denoLtxMultiLoraContextTrackerInstalled = true;
}

function isLoraRowWidget(widget) {
    return String(widget?.name || "").startsWith(`${GENERATED_PREFIX}row_`);
}

function rowWidgetAtCanvasY(node, canvasY) {
    if (!node?.pos || !Array.isArray(node.widgets)) {
        return null;
    }
    const localY = canvasY - node.pos[1];
    for (const widget of node.widgets) {
        if (!isLoraRowWidget(widget) || !Number.isFinite(widget.last_y)) {
            continue;
        }
        const height = widget.computeSize?.(node.size?.[0] || MIN_WIDTH)?.[1] || LiteGraph.NODE_WIDGET_HEIGHT;
        if (localY >= widget.last_y && localY <= widget.last_y + height) {
            return widget;
        }
    }
    return null;
}

class DenoBaseWidget {
    constructor(name) {
        this.name = `${GENERATED_PREFIX}${name}`;
        this.type = "custom";
        this.options = { serialize: false };
        this.value = "";
        this.mouseDowned = null;
        this.isMouseDownedAndOver = false;
        this.hitAreas = {};
        this.downedHitAreasForMove = [];
        this.downedHitAreasForClick = [];
    }

    serializeValue() {
        return undefined;
    }

    clickWasWithinBounds(pos, bounds) {
        const xStart = bounds[0];
        const xEnd = xStart + (bounds.length > 2 ? bounds[2] : bounds[1]);
        const clickedX = pos[0] >= xStart && pos[0] <= xEnd;
        if (bounds.length === 2) {
            return clickedX;
        }
        return clickedX && pos[1] >= bounds[1] && pos[1] <= bounds[1] + bounds[3];
    }

    mouse(event, pos, node) {
        if (isRightClickEvent(event) && typeof this.onContextMenu === "function") {
            event.preventDefault?.();
            event.stopPropagation?.();
            this.cancelMouseDown();
            return this.onContextMenu(event, pos, node) === true;
        }

        if (event.type === "pointerdown") {
            this.mouseDowned = [...pos];
            this.isMouseDownedAndOver = true;
            this.downedHitAreasForMove.length = 0;
            this.downedHitAreasForClick.length = 0;
            let handled = false;
            for (const part of Object.values(this.hitAreas)) {
                if (this.clickWasWithinBounds(pos, part.bounds)) {
                    if (part.onMove) {
                        this.downedHitAreasForMove.push(part);
                    }
                    if (part.onClick) {
                        this.downedHitAreasForClick.push(part);
                    }
                    if (part.onDown) {
                        handled = part.onDown.apply(this, [event, pos, node, part]) === true || handled;
                    }
                    part.wasMouseClickedAndIsOver = true;
                }
            }
            return this.onMouseDown(event, pos, node) ?? handled;
        }

        if (event.type === "pointerup") {
            if (!this.mouseDowned) {
                return true;
            }
            this.downedHitAreasForMove.length = 0;
            const wasMouseDownedAndOver = this.isMouseDownedAndOver;
            this.cancelMouseDown();
            let handled = false;
            for (const part of Object.values(this.hitAreas)) {
                if (part.onUp && this.clickWasWithinBounds(pos, part.bounds)) {
                    handled = part.onUp.apply(this, [event, pos, node, part]) === true || handled;
                }
                part.wasMouseClickedAndIsOver = false;
            }
            for (const part of this.downedHitAreasForClick) {
                if (this.clickWasWithinBounds(pos, part.bounds)) {
                    handled = part.onClick.apply(this, [event, pos, node, part]) === true || handled;
                }
            }
            this.downedHitAreasForClick.length = 0;
            if (wasMouseDownedAndOver) {
                handled = this.onMouseClick(event, pos, node) === true || handled;
            }
            return this.onMouseUp(event, pos, node) ?? handled;
        }

        if (event.type === "pointermove") {
            this.isMouseDownedAndOver = Boolean(this.mouseDowned);
            if (
                this.mouseDowned &&
                (pos[0] < 15 ||
                    pos[0] > node.size[0] - 15 ||
                    pos[1] < this.last_y ||
                    pos[1] > this.last_y + LiteGraph.NODE_WIDGET_HEIGHT)
            ) {
                this.isMouseDownedAndOver = false;
            }
            for (const part of Object.values(this.hitAreas)) {
                if (this.downedHitAreasForMove.includes(part)) {
                    part.onMove.apply(this, [event, pos, node, part]);
                }
                if (this.downedHitAreasForClick.includes(part)) {
                    part.wasMouseClickedAndIsOver = this.clickWasWithinBounds(pos, part.bounds);
                }
            }
            return this.onMouseMove(event, pos, node) ?? true;
        }
        return false;
    }

    cancelMouseDown() {
        this.mouseDowned = null;
        this.isMouseDownedAndOver = false;
        this.downedHitAreasForMove.length = 0;
    }

    onMouseDown() {}
    onMouseUp() {}
    onMouseClick() {}
    onMouseMove() {}
}

class DenoDividerWidget extends DenoBaseWidget {
    constructor() {
        super("divider");
    }

    computeSize(width) {
        return [width, 5];
    }

    draw() {}
}

class DenoLoraHeaderWidget extends DenoBaseWidget {
    constructor() {
        super("header");
        this.hitAreas = {
            toggle: { bounds: [0, 0], onDown: this.onToggleDown },
        };
    }

    draw(ctx, node, width, posY, height) {
        if (activeCount(node) <= 0) {
            return;
        }
        const lowQuality = isLowQuality();
        posY += 2;
        const midY = posY + height * 0.5;
        let posX = MARGIN;

        ctx.save();
        this.hitAreas.toggle.bounds = drawTogglePart(ctx, {
            posX,
            posY,
            height,
            value: allRowsEnabled(node),
        });
        if (!lowQuality) {
            posX += this.hitAreas.toggle.bounds[1] + INNER_MARGIN;
            ctx.globalAlpha = (app.canvas?.editor_alpha ?? 1) * 0.55;
            ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("Toggle All", posX, midY);

            ctx.textAlign = "center";
            ctx.fillText("Audio", numberLabelCenterX(node, 0), midY);
            ctx.fillText("Video", numberLabelCenterX(node, 1), midY);
            ctx.fillText("Strength", numberLabelCenterX(node, 2), midY);
        }
        ctx.restore();
    }

    onToggleDown(event, pos, node) {
        const next = !allRowsEnabled(node);
        for (let index = 1; index <= activeCount(node); index += 1) {
            setValue(node, `enabled_${index}`, next);
        }
        redraw(node);
        this.cancelMouseDown();
        return true;
    }

}

class DenoLoraRowWidget extends DenoBaseWidget {
    constructor(index) {
        super(`row_${index}`);
        this.index = index;
        this.haveMouseMovedStrength = false;
        this.hitAreas = {
            toggle: { bounds: [0, 0], onDown: this.onToggleDown },
            lora: { bounds: [0, 0], onClick: this.onLoraClick },
            strengthDec: { bounds: [0, 0], onClick: this.onStrengthDec },
            strengthVal: { bounds: [0, 0], onClick: this.onStrengthVal },
            strengthInc: { bounds: [0, 0], onClick: this.onStrengthInc },
            strengthAny: { bounds: [0, 0], onMove: this.onStrengthMove },
            videoDec: { bounds: [0, 0], onClick: this.onVideoDec },
            videoVal: { bounds: [0, 0], onClick: this.onVideoVal },
            videoInc: { bounds: [0, 0], onClick: this.onVideoInc },
            videoAny: { bounds: [0, 0], onMove: this.onVideoMove },
            audioDec: { bounds: [0, 0], onClick: this.onAudioDec },
            audioVal: { bounds: [0, 0], onClick: this.onAudioVal },
            audioInc: { bounds: [0, 0], onClick: this.onAudioInc },
            audioAny: { bounds: [0, 0], onMove: this.onAudioMove },
        };
    }

    draw(ctx, node, width, posY, height) {
        this.last_y = posY;
        const lowQuality = isLowQuality();
        const enabled = Boolean(getValue(node, `enabled_${this.index}`, true));
        const midY = posY + height * 0.5;
        let posX = MARGIN;

        ctx.save();
        drawRoundedRectangle(ctx, {
            pos: [posX, posY],
            size: [node.size[0] - MARGIN * 2, height],
        });
        this.hitAreas.toggle.bounds = drawTogglePart(ctx, { posX, posY, height, value: enabled });
        posX += this.hitAreas.toggle.bounds[1] + INNER_MARGIN;

        if (lowQuality) {
            ctx.restore();
            return;
        }
        if (!enabled) {
            ctx.globalAlpha = (app.canvas?.editor_alpha ?? 1) * 0.4;
        }

        ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
        this.drawNumber(ctx, node, "audio", numberRightX(node, 0), posY, height, 0, 2);
        this.drawNumber(ctx, node, "video", numberRightX(node, 1), posY, height, 0, 2);
        const loraRightX = this.drawNumber(ctx, node, "strength", numberRightX(node, 2), posY, height, -10, 10);

        const loraWidth = loraRightX - posX;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = displayLora(getValue(node, `lora_${this.index}`, NONE_VALUE));
        ctx.fillText(fitString(ctx, label, loraWidth), posX, midY);
        this.hitAreas.lora.bounds = [posX, loraWidth];
        ctx.globalAlpha = app.canvas?.editor_alpha ?? 1;
        ctx.restore();
    }

    drawNumber(ctx, node, prefix, rightX, posY, height, min, max) {
        const key = `${prefix}_${this.index}`;
        const [dec, text, inc] = drawNumberWidgetPart(ctx, {
            posX: rightX,
            posY,
            height,
            value: Number(getValue(node, key, prefix === "strength" ? 1 : 1)),
            direction: -1,
        });
        this.hitAreas[`${prefix}Dec`].bounds = dec;
        this.hitAreas[`${prefix}Val`].bounds = text;
        this.hitAreas[`${prefix}Inc`].bounds = inc;
        this.hitAreas[`${prefix}Any`].bounds = [dec[0], inc[0] + inc[1] - dec[0]];
        this.hitAreas[`${prefix}Dec`].min = min;
        this.hitAreas[`${prefix}Dec`].max = max;
        this.hitAreas[`${prefix}Inc`].min = min;
        this.hitAreas[`${prefix}Inc`].max = max;
        this.hitAreas[`${prefix}Val`].min = min;
        this.hitAreas[`${prefix}Val`].max = max;
        return dec[0] - INNER_MARGIN;
    }

    onToggleDown(event, pos, node) {
        const key = `enabled_${this.index}`;
        setValue(node, key, !Boolean(getValue(node, key, true)));
        redraw(node);
        this.cancelMouseDown();
        return true;
    }

    onLoraClick(event, pos, node) {
        showLoraChooser(event, node, this.index);
        this.cancelMouseDown();
        return true;
    }

    onStrengthDec(event, pos, node, part) {
        this.step(node, "strength", -0.05, part.min, part.max);
    }

    onStrengthInc(event, pos, node, part) {
        this.step(node, "strength", 0.05, part.min, part.max);
    }

    onStrengthVal(event, pos, node, part) {
        this.prompt(node, "strength", "Strength", part.min, part.max, event);
    }

    onStrengthMove(event, pos, node) {
        this.drag(node, "strength", event.deltaX);
    }

    onVideoDec(event, pos, node, part) {
        this.step(node, "video", -0.05, part.min, part.max);
    }

    onVideoInc(event, pos, node, part) {
        this.step(node, "video", 0.05, part.min, part.max);
    }

    onVideoVal(event, pos, node, part) {
        this.prompt(node, "video", "Video strength", part.min, part.max, event);
    }

    onVideoMove(event, pos, node) {
        this.drag(node, "video", event.deltaX);
    }

    onAudioDec(event, pos, node, part) {
        this.step(node, "audio", -0.05, part.min, part.max);
    }

    onAudioInc(event, pos, node, part) {
        this.step(node, "audio", 0.05, part.min, part.max);
    }

    onAudioVal(event, pos, node, part) {
        this.prompt(node, "audio", "Audio strength", part.min, part.max, event);
    }

    onAudioMove(event, pos, node) {
        this.drag(node, "audio", event.deltaX);
    }

    onContextMenu(event, pos, node) {
        showRemoveLoraMenu(event, node, this.index);
        return true;
    }

    step(node, prefix, delta, min, max) {
        const key = `${prefix}_${this.index}`;
        setValue(node, key, clamp(round2(Number(getValue(node, key, 1)) + delta), min, max));
        redraw(node);
    }

    drag(node, prefix, deltaX) {
        if (!deltaX) {
            return;
        }
        const key = `${prefix}_${this.index}`;
        this.haveMouseMovedStrength = true;
        setValue(node, key, round2(Number(getValue(node, key, 1)) + deltaX * 0.05));
        redraw(node);
    }

    prompt(node, prefix, label, min, max, event) {
        if (this.haveMouseMovedStrength) {
            return;
        }
        const key = `${prefix}_${this.index}`;
        app.canvas.prompt(label, format(getValue(node, key, 1)), (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                setValue(node, key, clamp(round2(parsed), min, max));
                redraw(node);
            }
        }, event);
    }

    onMouseUp(event, pos, node) {
        this.haveMouseMovedStrength = false;
    }
}

class DenoAddLoraWidget extends DenoBaseWidget {
    constructor() {
        super("add_button");
    }

    draw(ctx, node, width, y, height) {
        drawWidgetButton(ctx, { size: [width - 30, height], pos: [15, y] }, "+ Add LoRA", this.isMouseDownedAndOver);
    }

    onMouseClick(event, pos, node) {
        const current = activeCount(node);
        if (event.shiftKey || event.button === 2) {
            setValue(node, "active_loras", Math.max(0, current - 1));
            rebuildUi(node);
            return true;
        }
        if (current >= MAX_SLOTS) {
            return true;
        }
        const next = current + 1;
        setValue(node, "active_loras", next);
        rebuildUi(node);
        showLoraChooser(event, node, next);
        return true;
    }
}

function showLoraChooser(event, node, index) {
    const values = loraOptions(node);
    new LiteGraph.ContextMenu(values.map((value) => displayLora(value)), {
        event,
        title: "Choose a LoRA",
        className: "dark",
        scale: Math.max(1, app.canvas?.ds?.scale ?? 1),
        callback: (value) => {
            const selected = String(value?.content ?? value?.value ?? value);
            setValue(node, `lora_${index}`, selected === "None" ? NONE_VALUE : selected);
            redraw(node);
        },
    });
}

function showRemoveLoraMenu(event, node, index) {
    new LiteGraph.ContextMenu(["Remove"], {
        event,
        title: `LoRA Slot ${index}`,
        className: "dark",
        scale: Math.max(1, app.canvas?.ds?.scale ?? 1),
        callback: () => {
            removeLoraSlot(node, index);
        },
    });
}

function removeLoraSlot(node, index) {
    const count = activeCount(node);
    if (count <= 0 || index < 1 || index > count) {
        return;
    }

    for (let slot = index; slot < count; slot += 1) {
        copySlotValues(node, slot + 1, slot);
    }
    resetSlotValues(node, count);
    setValue(node, "active_loras", Math.max(0, count - 1));
    rebuildUi(node);
}

function copySlotValues(node, fromIndex, toIndex) {
    for (const prefix of ["enabled", "lora", "strength", "video", "audio"]) {
        setValue(node, `${prefix}_${toIndex}`, getValue(node, `${prefix}_${fromIndex}`, defaultSlotValue(prefix)));
    }
}

function resetSlotValues(node, index) {
    for (const prefix of ["enabled", "lora", "strength", "video", "audio"]) {
        setValue(node, `${prefix}_${index}`, defaultSlotValue(prefix));
    }
}

function defaultSlotValue(prefix) {
    if (prefix === "enabled") {
        return true;
    }
    if (prefix === "lora") {
        return NONE_VALUE;
    }
    return 1.0;
}

function hideBackendWidgets(node) {
    hideWidget(getWidget(node, "active_loras"));
    for (let index = 1; index <= MAX_SLOTS; index += 1) {
        hideWidget(getWidget(node, `enabled_${index}`));
        hideWidget(getWidget(node, `lora_${index}`));
        hideWidget(getWidget(node, `strength_${index}`));
        hideWidget(getWidget(node, `video_${index}`));
        hideWidget(getWidget(node, `audio_${index}`));
    }
}

function hideWidget(widget) {
    if (!widget) {
        return;
    }
    widget.hidden = true;
    widget.type = "converted-widget";
    widget.computeSize = () => [0, -4];
    if (widget.element) {
        widget.element.style.display = "none";
    }
}

function normalizeBackendValues(node) {
    normalizeNumber(node, "active_loras", 1, 0, MAX_SLOTS, true);
    for (let index = 1; index <= MAX_SLOTS; index += 1) {
        normalizeBool(node, `enabled_${index}`, true);
        normalizeNumber(node, `strength_${index}`, 1, -10, 10);
        normalizeNumber(node, `video_${index}`, 1, 0, 2);
        normalizeNumber(node, `audio_${index}`, 1, 0, 2);
        if (!loraOptions(node).includes(getValue(node, `lora_${index}`, NONE_VALUE))) {
            setValue(node, `lora_${index}`, NONE_VALUE);
        }
    }
}

function normalizeBool(node, key, fallback) {
    const value = getValue(node, key, fallback);
    if (typeof value !== "boolean") {
        setValue(node, key, Boolean(value));
    }
}

function normalizeNumber(node, key, fallback, min, max, integer = false) {
    const raw = Number(getValue(node, key, fallback));
    const value = Number.isFinite(raw) ? raw : fallback;
    const normalized = clamp(integer ? Math.round(value) : round2(value), min, max);
    if (getValue(node, key, fallback) !== normalized) {
        setValue(node, key, normalized);
    }
}

function redraw(node) {
    normalizeBackendValues(node);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function activeCount(node) {
    const value = Number(getValue(node, "active_loras", 1));
    return Number.isFinite(value) ? clamp(Math.round(value), 0, MAX_SLOTS) : 1;
}

function allRowsEnabled(node) {
    const count = activeCount(node);
    if (count <= 0) {
        return false;
    }
    for (let index = 1; index <= count; index += 1) {
        if (!Boolean(getValue(node, `enabled_${index}`, true))) {
            return false;
        }
    }
    return true;
}

function loraOptions(node) {
    const widget = getWidget(node, "lora_1");
    const raw = widget?.options?.values || widget?.options?.list || widget?.values || [NONE_VALUE];
    const values = Array.isArray(raw) ? raw : [NONE_VALUE];
    return values.includes(NONE_VALUE) ? values : [NONE_VALUE, ...values];
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function getValue(node, key, fallback) {
    const widget = getWidget(node, key);
    return widget ? widget.value : fallback;
}

function setValue(node, key, value) {
    const widget = getWidget(node, key);
    if (!widget || widget.value === value) {
        return;
    }
    widget.value = value;
}

function displayLora(value) {
    return value && value !== NONE_VALUE ? String(value) : "None";
}

function format(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function round2(value) {
    return Math.round(Number(value) * 100) / 100;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function baseNumberRightX(node) {
    return node.size[0] - MARGIN - INNER_MARGIN - INNER_MARGIN;
}

function numberRightX(node, indexFromRight) {
    return baseNumberRightX(node) - indexFromRight * (drawNumberWidgetPart.WIDTH_TOTAL + NUMBER_COLUMN_GAP);
}

function numberLabelCenterX(node, indexFromRight) {
    return numberRightX(node, indexFromRight) - drawNumberWidgetPart.WIDTH_TOTAL / 2;
}

function isLowQuality() {
    return ((app.canvas?.ds?.scale || 1) <= 0.5);
}

function fitString(ctx, str, maxWidth) {
    const value = String(str ?? "");
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

function drawRoundedRectangle(ctx, options) {
    const lowQuality = isLowQuality();
    ctx.save();
    ctx.strokeStyle = options.colorStroke || LiteGraph.WIDGET_OUTLINE_COLOR;
    ctx.fillStyle = options.colorBackground || LiteGraph.WIDGET_BGCOLOR;
    ctx.beginPath();
    ctx.roundRect(
        ...options.pos,
        ...options.size,
        lowQuality ? [0] : options.borderRadius ? [options.borderRadius] : [options.size[1] * 0.5],
    );
    ctx.fill();
    if (!lowQuality) {
        ctx.stroke();
    }
    ctx.restore();
}

function drawTogglePart(ctx, options) {
    const lowQuality = isLowQuality();
    ctx.save();
    const { posX, posY, height, value } = options;
    const toggleRadius = height * 0.36;
    const toggleBgWidth = height * 1.5;
    if (!lowQuality) {
        ctx.beginPath();
        ctx.roundRect(posX + 4, posY + 4, toggleBgWidth - 8, height - 8, [height * 0.5]);
        ctx.globalAlpha = (app.canvas?.editor_alpha ?? 1) * 0.25;
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fill();
        ctx.globalAlpha = app.canvas?.editor_alpha ?? 1;
    }
    ctx.fillStyle = value === true ? "#89B" : "#888";
    const toggleX = lowQuality || value === false ? posX + height * 0.5 : value === true ? posX + height : posX + height * 0.75;
    ctx.beginPath();
    ctx.arc(toggleX, posY + height * 0.5, toggleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return [posX, toggleBgWidth];
}

function drawNumberWidgetPart(ctx, options) {
    const arrowWidth = 9;
    const arrowHeight = 10;
    const innerMargin = 3;
    const numberWidth = 32;
    const left = [0, 0];
    const text = [0, 0];
    const right = [0, 0];
    ctx.save();
    let posX = options.posX;
    const { posY, height, value, textColor } = options;
    const midY = posY + height / 2;
    if (options.direction === -1) {
        posX = posX - arrowWidth - innerMargin - numberWidth - innerMargin - arrowWidth;
    }
    ctx.fill(new Path2D(`M ${posX} ${midY} l ${arrowWidth} ${arrowHeight / 2} l 0 -${arrowHeight} L ${posX} ${midY} z`));
    left[0] = posX;
    left[1] = arrowWidth;
    posX += arrowWidth + innerMargin;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const oldTextColor = ctx.fillStyle;
    if (textColor) {
        ctx.fillStyle = textColor;
    }
    ctx.fillText(fitString(ctx, Number(value).toFixed(2), numberWidth), posX + numberWidth / 2, midY);
    ctx.fillStyle = oldTextColor;
    text[0] = posX;
    text[1] = numberWidth;
    posX += numberWidth + innerMargin;
    ctx.fill(new Path2D(`M ${posX} ${midY - arrowHeight / 2} l ${arrowWidth} ${arrowHeight / 2} l -${arrowWidth} ${arrowHeight / 2} v -${arrowHeight} z`));
    right[0] = posX;
    right[1] = arrowWidth;
    ctx.restore();
    return [left, text, right];
}
drawNumberWidgetPart.WIDTH_TOTAL = 9 + 3 + 32 + 3 + 9;

function drawWidgetButton(ctx, options, text = null, isMouseDownedAndOver = false) {
    const borderRadius = isLowQuality() ? 0 : options.borderRadius ?? 4;
    ctx.save();
    if (!isLowQuality() && !isMouseDownedAndOver) {
        drawRoundedRectangle(ctx, {
            size: [options.size[0] - 2, options.size[1]],
            pos: [options.pos[0] + 1, options.pos[1] + 1],
            borderRadius,
            colorBackground: "#000000aa",
            colorStroke: "#000000aa",
        });
    }
    drawRoundedRectangle(ctx, {
        size: options.size,
        pos: [options.pos[0], options.pos[1] + (isMouseDownedAndOver ? 1 : 0)],
        borderRadius,
        colorBackground: isMouseDownedAndOver ? "#444" : LiteGraph.WIDGET_BGCOLOR,
        colorStroke: "transparent",
    });
    if (isLowQuality()) {
        ctx.restore();
        return;
    }
    if (!isMouseDownedAndOver) {
        drawRoundedRectangle(ctx, {
            size: [options.size[0] - 0.75, options.size[1] - 0.75],
            pos: options.pos,
            borderRadius: borderRadius - 0.5,
            colorBackground: "transparent",
            colorStroke: "#00000044",
        });
        drawRoundedRectangle(ctx, {
            size: [options.size[0] - 0.75, options.size[1] - 0.75],
            pos: [options.pos[0] + 0.75, options.pos[1] + 0.75],
            borderRadius: borderRadius - 0.5,
            colorBackground: "transparent",
            colorStroke: "#ffffff11",
        });
    }
    if (text) {
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
        ctx.fillText(text, options.pos[0] + options.size[0] / 2, options.pos[1] + options.size[1] / 2 + (isMouseDownedAndOver ? 1 : 0));
    }
    ctx.restore();
}
