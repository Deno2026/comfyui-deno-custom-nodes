import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoMultiLoraLoader";
const UI_VERSION = "generic-lora-v1";
const MAX_SLOTS = 8;
const MIN_WIDTH = 450;
const NONE_VALUE = "__none__";
const GENERATED_PREFIX = "deno_multi_lora_";
const MARGIN = 10;
const ROW_HORIZONTAL_INSET = 15;
const INNER_MARGIN = MARGIN * 0.33;
const NUMBER_COLUMN_GAP = 3 + INNER_MARGIN * 2;
const ICON_SIZE = 18;
const ICON_GAP = 6;
const ICON_RIGHT_PADDING = 18;
const ICON_COLUMN_WIDTH = ICON_SIZE * 2 + ICON_GAP + ICON_RIGHT_PADDING + INNER_MARGIN * 2;
let lastContextMenuEvent = null;
let cachedLoraOptions = null;
let loraOptionsPromise = null;

app.registerExtension({
    name: "Deno.MultiLora",
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
    if (!node || node.type !== NODE_NAME || node.__denoMultiLoraSettingUp) {
        return;
    }
    node.__denoMultiLoraSettingUp = true;
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
        node.__denoMultiLoraUiVersion = UI_VERSION;
    } finally {
        node.__denoMultiLoraSettingUp = false;
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
        if (name.startsWith(GENERATED_PREFIX) || name === "ltx_lora_panel" || name === "multi_lora_panel") {
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
    if (node.__denoMultiLoraComputeWrapped) {
        return;
    }
    const originalComputeSize = node.computeSize;
    node.computeSize = function () {
        const size = originalComputeSize?.apply(this, arguments) || [MIN_WIDTH, 120];
        return [Math.max(size[0], MIN_WIDTH), size[1]];
    };
    node.__denoMultiLoraComputeWrapped = true;
}

function wrapContextMenu(node) {
    if (node.__denoMultiLoraContextWrapped) {
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
            return { widget: rowWidget, output: { type: "DENO LORA ROW" } };
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

    node.__denoMultiLoraContextWrapped = true;
}

function isRightClickEvent(event) {
    return event?.button === 2 || event?.which === 3 || event?.type === "contextmenu";
}

function ensureContextEventTracker() {
    if (window.__denoMultiLoraContextTrackerInstalled) {
        return;
    }
    const remember = (event) => {
        if (isRightClickEvent(event)) {
            lastContextMenuEvent = event;
        }
    };
    window.addEventListener("pointerdown", remember, true);
    window.addEventListener("contextmenu", remember, true);
    window.__denoMultiLoraContextTrackerInstalled = true;
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
        let posX = ROW_HORIZONTAL_INSET;

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
            ctx.fillText("CLIP", numberLabelCenterX(node, 0), midY);
            ctx.fillText("Model", numberLabelCenterX(node, 1), midY);
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
            modelStrengthDec: { bounds: [0, 0], onClick: this.onModelStrengthDec },
            modelStrengthVal: { bounds: [0, 0], onClick: this.onModelStrengthVal },
            modelStrengthInc: { bounds: [0, 0], onClick: this.onModelStrengthInc },
            modelStrengthAny: { bounds: [0, 0], onMove: this.onModelStrengthMove },
            clipStrengthDec: { bounds: [0, 0], onClick: this.onClipStrengthDec },
            clipStrengthVal: { bounds: [0, 0], onClick: this.onClipStrengthVal },
            clipStrengthInc: { bounds: [0, 0], onClick: this.onClipStrengthInc },
            clipStrengthAny: { bounds: [0, 0], onMove: this.onClipStrengthMove },
            info: { bounds: [0, 0], onClick: this.onInfoClick },
            copy: { bounds: [0, 0], onClick: this.onCopyClick },
        };
    }

    draw(ctx, node, width, posY, height) {
        this.last_y = posY;
        const lowQuality = isLowQuality();
        const enabled = Boolean(getValue(node, `enabled_${this.index}`, true));
        const midY = posY + height * 0.5;
        let posX = ROW_HORIZONTAL_INSET;

        ctx.save();
        drawRoundedRectangle(ctx, {
            pos: [posX, posY],
            size: [width - ROW_HORIZONTAL_INSET * 2, height],
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
        this.drawNumber(ctx, node, "clip_strength", numberRightX(node, 0), posY, height, -10, 10);
        const loraRightX = this.drawNumber(ctx, node, "model_strength", numberRightX(node, 1), posY, height, -10, 10);

        const loraWidth = loraRightX - posX;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const loraName = getValue(node, `lora_${this.index}`, NONE_VALUE);
        const trigger = loraName && loraName !== NONE_VALUE ? String(getValue(node, `trigger_${this.index}`, "") || "").trim() : "";
        const label = displayLora(loraName);
        ctx.fillText(fitString(ctx, trigger ? `${label} / ${trigger}` : label, loraWidth), posX, midY);
        this.hitAreas.lora.bounds = [posX, loraWidth];
        ctx.globalAlpha = app.canvas?.editor_alpha ?? 1;
        this.hitAreas.info.bounds = drawIconButton(ctx, iconX(node, 0), posY + 1, "info", Boolean(trigger || getValue(node, `description_${this.index}`, "")));
        this.hitAreas.copy.bounds = drawIconButton(ctx, iconX(node, 1), posY + 1, "copy", Boolean(trigger));
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
        this.hitAreas[areaName(prefix, "Dec")].bounds = dec;
        this.hitAreas[areaName(prefix, "Val")].bounds = text;
        this.hitAreas[areaName(prefix, "Inc")].bounds = inc;
        this.hitAreas[areaName(prefix, "Any")].bounds = [dec[0], inc[0] + inc[1] - dec[0]];
        this.hitAreas[areaName(prefix, "Dec")].min = min;
        this.hitAreas[areaName(prefix, "Dec")].max = max;
        this.hitAreas[areaName(prefix, "Inc")].min = min;
        this.hitAreas[areaName(prefix, "Inc")].max = max;
        this.hitAreas[areaName(prefix, "Val")].min = min;
        this.hitAreas[areaName(prefix, "Val")].max = max;
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

    onModelStrengthDec(event, pos, node, part) {
        this.step(node, "model_strength", -0.05, part.min, part.max);
    }

    onModelStrengthInc(event, pos, node, part) {
        this.step(node, "model_strength", 0.05, part.min, part.max);
    }

    onModelStrengthVal(event, pos, node, part) {
        this.prompt(node, "model_strength", "Model strength", part.min, part.max, event);
    }

    onModelStrengthMove(event, pos, node) {
        this.drag(node, "model_strength", event.deltaX);
    }

    onClipStrengthDec(event, pos, node, part) {
        this.step(node, "clip_strength", -0.05, part.min, part.max);
    }

    onClipStrengthInc(event, pos, node, part) {
        this.step(node, "clip_strength", 0.05, part.min, part.max);
    }

    onClipStrengthVal(event, pos, node, part) {
        this.prompt(node, "clip_strength", "CLIP strength", part.min, part.max, event);
    }

    onClipStrengthMove(event, pos, node) {
        this.drag(node, "clip_strength", event.deltaX);
    }

    onInfoClick(event, pos, node) {
        openLoraInfoEditor(node, this.index);
        this.cancelMouseDown();
        return true;
    }

    onCopyClick(event, pos, node) {
        const loraName = getValue(node, `lora_${this.index}`, NONE_VALUE);
        if (!loraName || loraName === NONE_VALUE) {
            showToast("Choose a LoRA first.");
            this.cancelMouseDown();
            return true;
        }
        const trigger = String(getValue(node, `trigger_${this.index}`, "") || "").trim();
        if (!trigger) {
            showToast("No trigger words saved yet.");
            this.cancelMouseDown();
            return true;
        }
        copyText(trigger);
        showToast("Trigger words copied.");
        this.cancelMouseDown();
        return true;
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
        drawWidgetButton(ctx, { size: [width - ROW_HORIZONTAL_INSET * 2, height], pos: [ROW_HORIZONTAL_INSET, y] }, "+ Add LoRA", this.isMouseDownedAndOver);
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

async function showLoraChooser(event, node, index) {
    const values = await loraOptions(node);
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
    const count = activeCount(node);
    const enabled = getValue(node, `enabled_${index}`, true);
    const menuItems = [
        {
            content: `${enabled ? "Disable" : "Enable"}`,
            callback: () => toggleLoraSlot(node, index),
        },
        null,
        {
            content: "Move Up",
            disabled: index <= 1,
            callback: () => moveLoraSlot(node, index, index - 1),
        },
        {
            content: "Move Down",
            disabled: index >= count,
            callback: () => moveLoraSlot(node, index, index + 1),
        },
        {
            content: "Remove",
            callback: () => removeLoraSlot(node, index),
        },
    ];

    new LiteGraph.ContextMenu(menuItems, {
        event,
        title: `LoRA Slot ${index}`,
        className: "dark",
        scale: Math.max(1, app.canvas?.ds?.scale ?? 1),
    });
}

function toggleLoraSlot(node, index) {
    const count = activeCount(node);
    if (index < 1 || index > count) {
        return;
    }

    const enabledKey = `enabled_${index}`;
    setValue(node, enabledKey, !getValue(node, enabledKey, true));
    rebuildUi(node);
}

function moveLoraSlot(node, fromIndex, toIndex) {
    const count = activeCount(node);
    if (fromIndex < 1 || fromIndex > count || toIndex < 1 || toIndex > count || fromIndex === toIndex) {
        return;
    }

    swapSlotValues(node, fromIndex, toIndex);
    rebuildUi(node);
}

function swapSlotValues(node, firstIndex, secondIndex) {
    for (const prefix of slotValuePrefixes()) {
        const firstKey = `${prefix}_${firstIndex}`;
        const secondKey = `${prefix}_${secondIndex}`;
        const firstValue = getValue(node, firstKey, defaultSlotValue(prefix));
        const secondValue = getValue(node, secondKey, defaultSlotValue(prefix));
        setValue(node, firstKey, secondValue);
        setValue(node, secondKey, firstValue);
    }
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
    for (const prefix of slotValuePrefixes()) {
        setValue(node, `${prefix}_${toIndex}`, getValue(node, `${prefix}_${fromIndex}`, defaultSlotValue(prefix)));
    }
}

function resetSlotValues(node, index) {
    for (const prefix of slotValuePrefixes()) {
        setValue(node, `${prefix}_${index}`, defaultSlotValue(prefix));
    }
}

function slotValuePrefixes() {
    return ["enabled", "lora", "model_strength", "clip_strength", "trigger", "description"];
}

function defaultSlotValue(prefix) {
    if (prefix === "enabled") {
        return true;
    }
    if (prefix === "lora") {
        return NONE_VALUE;
    }
    if (prefix === "trigger" || prefix === "description") {
        return "";
    }
    return 1.0;
}

function areaName(prefix, suffix) {
    return prefix.replace(/_([a-z])/g, (_, char) => char.toUpperCase()) + suffix;
}

function hideBackendWidgets(node) {
    hideWidget(getWidget(node, "active_loras"));
    for (let index = 1; index <= MAX_SLOTS; index += 1) {
        for (const prefix of slotValuePrefixes()) {
            hideWidget(getWidget(node, `${prefix}_${index}`));
        }
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
        normalizeNumber(node, `model_strength_${index}`, 1, -10, 10);
        normalizeNumber(node, `clip_strength_${index}`, 1, -10, 10);
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

async function loraOptions(node) {
    if (loraOptionsPromise) {
        return loraOptionsPromise;
    }
    loraOptionsPromise = fetchLatestLoraOptions(node).finally(() => {
        loraOptionsPromise = null;
    });
    return loraOptionsPromise;
}

async function fetchLatestLoraOptions(node) {
    try {
        const response = await api.fetchApi("/object_info/DenoMultiLoraLoader");
        if (!response.ok) {
            throw new Error(`object_info request failed: ${response.status}`);
        }
        const info = await response.json();
        const values = extractLoraOptions(info);
        if (values.length > 1) {
            cachedLoraOptions = values;
            updateBackendLoraWidgets(node, values);
            return values;
        }
    } catch (error) {
        console.warn("[DenoMultiLora] Failed to refresh LoRA list, using cached widget options.", error);
    }
    return loraOptionsSync(node);
}

function extractLoraOptions(info) {
    const nodeInfo = info?.[NODE_NAME] || info;
    const required = nodeInfo?.input?.required || {};
    const loraInput = required.lora_1;
    const raw = Array.isArray(loraInput) ? loraInput[0] : null;
    const values = Array.isArray(raw) ? raw : [NONE_VALUE];
    return values.includes(NONE_VALUE) ? values : [NONE_VALUE, ...values];
}

function updateBackendLoraWidgets(node, values) {
    for (let index = 1; index <= MAX_SLOTS; index += 1) {
        const widget = getWidget(node, `lora_${index}`);
        if (!widget) {
            continue;
        }
        widget.options = widget.options || {};
        widget.options.values = values;
        widget.options.list = values;
        widget.values = values;
    }
}

function loraOptionsSync(node) {
    if (Array.isArray(cachedLoraOptions) && cachedLoraOptions.length) {
        return cachedLoraOptions;
    }
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
    return rowRightX(node) - INNER_MARGIN - INNER_MARGIN - ICON_COLUMN_WIDTH;
}

function numberRightX(node, indexFromRight) {
    return baseNumberRightX(node) - indexFromRight * (drawNumberWidgetPart.WIDTH_TOTAL + NUMBER_COLUMN_GAP);
}

function numberLabelCenterX(node, indexFromRight) {
    return numberRightX(node, indexFromRight) - drawNumberWidgetPart.WIDTH_TOTAL / 2;
}

function rowRightX(node) {
    return node.size[0] - ROW_HORIZONTAL_INSET;
}

function iconX(node, index) {
    const iconPairWidth = ICON_SIZE * 2 + ICON_GAP;
    const first = rowRightX(node) - ICON_RIGHT_PADDING - iconPairWidth;
    return first + index * (ICON_SIZE + ICON_GAP);
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

function drawIconButton(ctx, x, y, kind, active) {
    const lowQuality = isLowQuality();
    ctx.save();
    drawRoundedRectangle(ctx, {
        pos: [x, y],
        size: [ICON_SIZE, ICON_SIZE],
        borderRadius: 5,
        colorBackground: active ? LiteGraph.WIDGET_BGCOLOR : "#00000044",
        colorStroke: LiteGraph.WIDGET_OUTLINE_COLOR,
    });
    if (!lowQuality) {
        ctx.strokeStyle = active ? LiteGraph.WIDGET_TEXT_COLOR : "rgba(215,220,224,0.55)";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1.2;
        if (kind === "info") {
            ctx.beginPath();
            ctx.arc(x + ICON_SIZE * 0.5, y + ICON_SIZE * 0.5, 5.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = "700 9px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("i", x + ICON_SIZE * 0.5, y + ICON_SIZE * 0.5 + 0.4);
        } else {
            ctx.strokeRect(x + 7, y + 4.5, 6.5, 8);
            ctx.strokeRect(x + 4.5, y + 6.5, 6.5, 8);
        }
    }
    ctx.restore();
    return [x, y, ICON_SIZE, ICON_SIZE];
}

function openLoraInfoEditor(node, index) {
    ensureLoraInfoStyles();
    const overlay = document.createElement("div");
    overlay.className = "deno-multi-lora-info-overlay";
    const loraName = displayLora(getValue(node, `lora_${index}`, NONE_VALUE));

    overlay.innerHTML = `
        <div class="deno-multi-lora-info-panel" role="dialog" aria-modal="true">
            <div class="deno-multi-lora-info-title">
                <div>
                    <strong>LoRA Slot ${index}</strong>
                    <span>${escapeHtml(loraName)}</span>
                </div>
                <button type="button" data-action="close">Close</button>
            </div>
            <label>
                <span>Trigger words</span>
                <input data-field="trigger" type="text" autocomplete="off" spellcheck="false" />
            </label>
            <label>
                <span>LoRA description</span>
                <textarea data-field="description" rows="5" spellcheck="false"></textarea>
            </label>
            <div class="deno-multi-lora-info-actions">
                <button type="button" data-action="copy">Copy Trigger</button>
                <button type="button" data-action="save">Save</button>
            </div>
        </div>
    `;

    const triggerInput = overlay.querySelector('[data-field="trigger"]');
    const descriptionInput = overlay.querySelector('[data-field="description"]');
    triggerInput.value = String(getValue(node, `trigger_${index}`, "") || "");
    descriptionInput.value = String(getValue(node, `description_${index}`, "") || "");

    const close = () => overlay.remove();
    const save = () => {
        setValue(node, `trigger_${index}`, triggerInput.value.trim());
        setValue(node, `description_${index}`, descriptionInput.value.trim());
        redraw(node);
        close();
    };

    overlay.addEventListener("click", (event) => {
        if (event.target?.dataset?.action === "close") {
            close();
        }
        if (event.target?.dataset?.action === "save") {
            save();
        }
        if (event.target?.dataset?.action === "copy") {
            const text = triggerInput.value.trim();
            if (text) {
                copyText(text);
                showToast("Trigger words copied.");
            } else {
                showToast("No trigger words saved yet.");
            }
        }
    });

    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            close();
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            save();
        }
    });

    document.body.appendChild(overlay);
    queueMicrotask(() => triggerInput.focus());
}

function copyText(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
        return;
    }
    fallbackCopyText(text);
}

function fallbackCopyText(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand("copy");
    } catch (_error) {
        // Clipboard availability depends on browser focus and permissions.
    }
    input.remove();
}

function ensureLoraInfoStyles() {
    if (document.getElementById("deno-multi-lora-info-styles")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "deno-multi-lora-info-styles";
    style.textContent = `
        .deno-multi-lora-info-overlay {
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.35);
            pointer-events: auto;
        }
        .deno-multi-lora-info-panel {
            width: min(500px, calc(100vw - 36px));
            border: 1px solid rgba(95, 105, 112, 0.95);
            border-radius: 8px;
            background: rgba(31, 33, 36, 0.98);
            box-shadow: 0 20px 65px rgba(0, 0, 0, 0.55);
            padding: 14px;
            color: #d7dce0;
            font: 12px/1.4 sans-serif;
        }
        .deno-multi-lora-info-title {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
        }
        .deno-multi-lora-info-title strong {
            display: block;
            color: #d7dce0;
            font-size: 14px;
        }
        .deno-multi-lora-info-title span {
            display: block;
            max-width: 370px;
            color: rgba(215, 220, 224, 0.62);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .deno-multi-lora-info-panel label {
            display: block;
            margin-top: 10px;
        }
        .deno-multi-lora-info-panel label span {
            display: block;
            margin-bottom: 5px;
            color: rgba(215, 220, 224, 0.86);
            font-weight: 700;
        }
        .deno-multi-lora-info-panel input,
        .deno-multi-lora-info-panel textarea {
            box-sizing: border-box;
            width: 100%;
            border: 1px solid rgba(95, 105, 112, 0.9);
            border-radius: 6px;
            background: rgba(16, 17, 19, 0.96);
            color: #eef1f3;
            outline: none;
            padding: 8px 9px;
            font: 12px/1.35 sans-serif;
        }
        .deno-multi-lora-info-panel textarea {
            resize: vertical;
            min-height: 86px;
        }
        .deno-multi-lora-info-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 12px;
        }
        .deno-multi-lora-info-panel button {
            border: 1px solid rgba(95, 105, 112, 0.95);
            border-radius: 6px;
            background: rgba(47, 50, 54, 0.98);
            color: #d7dce0;
            cursor: pointer;
            font: 700 11px/1 sans-serif;
            padding: 8px 10px;
        }
        .deno-multi-lora-info-panel button:hover {
            background: rgba(63, 67, 72, 0.98);
        }
        .deno-multi-lora-info-toast {
            position: fixed;
            left: 50%;
            bottom: 32px;
            z-index: 100001;
            transform: translateX(-50%);
            border: 1px solid rgba(95, 105, 112, 0.95);
            border-radius: 999px;
            background: rgba(31, 33, 36, 0.98);
            color: #d7dce0;
            padding: 8px 12px;
            font: 700 12px/1 sans-serif;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
        }
    `;
    document.head.appendChild(style);
}

function showToast(message) {
    ensureLoraInfoStyles();
    document.querySelectorAll(".deno-multi-lora-info-toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = "deno-multi-lora-info-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1450);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

