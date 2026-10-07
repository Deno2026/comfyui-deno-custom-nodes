import { app } from "../../scripts/app.js";

const NODE = "DenoFilmGrain";
const MIN_WIDTH = 280;
const VALUE_NAMES = ["enabled", "amount", "grain_size", "roughness", "tone_weighted",
    "temporal_mode", "seed", "control_after_generate", "frame_offset", "processing_batch_size", "grain_scale_mode"];

// Keep the existing backend range and workflow values. Only the visible scale
// changes: strength 0..1 maps linearly to amount 0..12. The selected default
// amount 6 is 0.5. Older values above 12 are preserved until the user edits.
const MAX_AMOUNT = 12;
export const amountToStrength = (value) => Number(value) / MAX_AMOUNT;
export const strengthToAmount = (value) => Number(value) * MAX_AMOUNT;

export function getPanelContentHeight(root, nodeWidth) {
    if (!root.isConnected || root.offsetWidth < Math.min(MIN_WIDTH - 44, Number(nodeWidth) - 44)) return null;
    const height = Math.ceil(root.scrollHeight);
    return Number.isFinite(height) && height > 0 ? height : null;
}

export function isLegacyAutoSize(info) {
    const size = info?.size;
    const version = Number(info?.properties?.denoFilmGrain?.uiVersion || 1);
    return version < 2 && size?.[0] === 340 && (Math.abs(size[1] - 591) < 2 || Math.abs(size[1] - 755) < 2)
        || version < 3 && size?.[0] === 280 && (Math.abs(size[1] - 312) < 2 || Math.abs(size[1] - 424) < 2);
}

export function processingLabel(value) {
    const labels = {1:"Low RAM", 2:"Balanced", 4:"Faster"};
    return Object.hasOwn(labels, String(value)) ? labels[String(value)] : `Custom (${value} frames)`;
}

export function configuredGrainScale(info, widgetIndex, currentValue) {
    const values = info?.widgets_values;
    if (widgetIndex < 0 || !Array.isArray(values)) return currentValue;
    // Older workflows end before this appended widget. Keep their exact
    // pixel-based output; preserve explicitly saved modes, including unknowns.
    if (widgetIndex >= values.length) return "pixels";
    // Native serialization kept a trailing empty DOM value in v1–3. It now
    // lands in the new mode slot; recognize only that exact legacy shape.
    const version = Number(info?.properties?.denoFilmGrain?.uiVersion || 1);
    if (version < 4 && values.length === widgetIndex + 1 && values[widgetIndex] === "") return "pixels";
    return values[widgetIndex];
}

function installStyle() {
    if (document.getElementById("deno-film-grain-style")) return;
    const style = document.createElement("style");
    style.id = "deno-film-grain-style";
    style.textContent = `
    .deno-grain { box-sizing:border-box; width:100%; min-width:0; height:auto;
      padding:8px; color:#d8e7dd; background:rgba(4,8,7,.96);
      border:1px solid rgba(72,255,132,.28); border-radius:6px; font:11px/1.3 sans-serif;
      overflow:hidden; pointer-events:auto; }
    .deno-grain * { box-sizing:border-box; }
    .deno-grain label,.deno-grain span,.deno-grain button { font-weight:400; }
    .deno-grain header { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:5px; min-height:21px; }
    .deno-grain .word { font:inherit; color:#b6cfbf; }
    .deno-grain button,.deno-grain input,.deno-grain select { font:inherit; color:inherit; }
    .deno-grain button { cursor:pointer; }
    .deno-grain button:focus-visible,.deno-grain input:focus-visible,.deno-grain select:focus-visible {
      outline:1px solid #80dba1; outline-offset:2px; }
    .deno-grain .toggle { min-width:48px; border:1px solid #34483d; background:#142219; border-radius:4px; padding:2px 7px; }
    .deno-grain .toggle[aria-pressed=true] { color:#9dffba; border-color:#448657; }
    .deno-grain .row { display:flex; align-items:center; justify-content:space-between; gap:6px; min-height:22px; }
    .deno-grain .field { display:grid; grid-template-columns:70px minmax(0,1fr) 48px; align-items:center; gap:6px; min-height:24px; margin:0 0 3px; }
    .deno-grain input[type=number],.deno-grain input[type=text] { width:48px; height:21px; padding:2px 4px;
      border:1px solid #30473a; border-radius:3px; background:#101a14; text-align:right; }
    .deno-grain input[type=text] { width:132px; }
    .deno-grain input[type=range] { display:block; width:100%; min-width:0; height:18px; margin:0;
      appearance:none; background:transparent; cursor:pointer; }
    .deno-grain input[type=range]::-webkit-slider-runnable-track { height:3px; background:#30473a; border-radius:2px; }
    .deno-grain input[type=range]::-webkit-slider-thumb { appearance:none; width:9px; height:9px;
      border:0; border-radius:50%; background:#80dba1; margin-top:-3px; }
    .deno-grain input[type=range]::-moz-range-track { height:3px; background:#30473a; border-radius:2px; }
    .deno-grain input[type=range]::-moz-range-thumb { width:9px; height:9px; border:0; border-radius:50%; background:#80dba1; }
    .deno-grain input[type=checkbox] { width:12px; height:12px; accent-color:#80dba1; cursor:pointer; }
    .deno-grain select { max-width:150px; height:23px; padding:2px 4px; border:1px solid #30473a; border-radius:3px; background:#101a14; }
    .deno-grain .processing { margin-top:6px; padding-top:6px; border-top:1px solid #2b3e31; }
    .deno-grain .details-button { display:flex; justify-content:space-between; width:100%; padding:5px 0 0;
      margin-top:6px; border:0; border-top:1px solid #2b3e31; background:transparent; color:#a9c7b5; text-align:left; }
    .deno-grain .details { padding-top:6px; }
    .deno-grain .details[hidden] { display:none; }
    .deno-grain .details .row { margin-bottom:4px; }
    .deno-grain .status { color:#88a392; font-size:10px; margin:4px 0 0; }
    .deno-grain .status[hidden] { display:none; }
    .deno-grain [disabled] { opacity:.48; cursor:default; }
    `;
    document.head.append(style);
}

function widget(node, name) { return node.widgets?.find((item) => item.name === name); }
function linked(node, name) {
    return node.inputs?.some((input) => (input.widget?.name || input.name) === name && input.link != null);
}

function refreshNativeLinks(node) {
    const state = node.__denoGrain;
    if (!state?.originals) return;
    for (const [name, original] of state.originals) {
        const item = widget(node, name);
        const external = linked(node, name);
        if (original.external === external && item.hidden === !external) continue;
        original.external = external;
        item.hidden = !external;
        if (external) {
            item.type = original.type;
            if (original.computeSize) item.computeSize = original.computeSize;
            else delete item.computeSize;
            if (original.draw) item.draw = original.draw;
            else delete item.draw;
        } else {
            item.type = "hidden";
            item.computeSize = () => [0, -4]; item.draw = () => {};
        }
    }
}

function setValue(node, name, value) {
    const target = widget(node, name);
    if (!target || linked(node, name)) return;
    app.graph?.beforeChange?.();
    if (node.__denoGrain) node.__denoGrain.pendingHeight ??= Number(node.size?.[1]);
    target.value = value;
    target.callback?.(value, app.canvas, node, undefined, undefined);
    app.graph?.afterChange?.();
    node.__denoGrain?.sync();
    node.graph?.setDirtyCanvas?.(true, true);
}

function makePanel(node) {
    const root = document.createElement("div");
    root.className = "deno-grain";
    root.dataset.denoFilmGrain = String(node.id);
    root.addEventListener("wheel", (event) => {
        const canvas = app.canvas?.canvas;
        if (!canvas) return;
        event.preventDefault(); event.stopPropagation();
        canvas.dispatchEvent(new WheelEvent("wheel", {bubbles:true, cancelable:true,
            clientX:event.clientX, clientY:event.clientY, deltaX:event.deltaX, deltaY:event.deltaY,
            deltaMode:event.deltaMode, ctrlKey:event.ctrlKey, shiftKey:event.shiftKey, altKey:event.altKey}));
    }, {passive:false});
    root.addEventListener("pointerdown", (event) => {
        if (event.button !== 1 || !app.canvas?.canvas) return;
        event.preventDefault(); event.stopPropagation();
        app.canvas.canvas.dispatchEvent(new PointerEvent("pointerdown", {bubbles:true, cancelable:true,
            clientX:event.clientX, clientY:event.clientY, button:1, buttons:event.buttons,
            pointerId:event.pointerId, pointerType:event.pointerType, isPrimary:event.isPrimary}));
    });
    const header = document.createElement("header");
    const title = document.createElement("span");
    title.className = "word";
    title.textContent = "Enabled";
    const enabled = document.createElement("button");
    enabled.type = "button";
    enabled.className = "toggle";
    enabled.dataset.control = "enabled";
    enabled.addEventListener("click", () => setValue(node, "enabled", !widget(node, "enabled")?.value));
    header.append(title, enabled);
    root.append(header);
    const refreshers = [];
    const rangeField = (name, label, min, max, step, read = Number, write = Number) => {
        const field = document.createElement("div");
        field.className = "field";
        const caption = document.createElement("label");
        caption.textContent = label;
        const number = document.createElement("input");
        number.type = "number";
        number.min = String(min); number.max = String(max); number.step = String(step);
        number.setAttribute("aria-label", label);
        number.dataset.control = name;
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(min); range.max = String(max); range.step = String(step);
        range.setAttribute("aria-label", label);
        range.dataset.slider = name;
        caption.addEventListener("click", () => number.focus());
        const change = (input) => {
            const value = Number(input.value);
            if (Number.isFinite(value) && value >= min && value <= max) setValue(node, name, write(value));
            else { input.value = String(read(widget(node, name)?.value)); node.__denoGrain?.sync(); }
        };
        number.addEventListener("change", () => change(number));
        range.addEventListener("input", () => change(range));
        field.append(caption, range, number); root.append(field);
        refreshers.push(() => {
            const value = read(widget(node, name)?.value);
            if (document.activeElement !== number) number.value = Number.isFinite(value) ? String(Number(value.toFixed(3))) : "";
            if (document.activeElement !== range && Number.isFinite(value)) range.value = String(value);
            const external = linked(node, name);
            number.disabled = external; range.disabled = external;
            field.title = external ? "Controlled by the connected input." : "";
        });
    };
    rangeField("amount", "Strength", 0, 1, .005, amountToStrength, strengthToAmount);
    rangeField("grain_size", "Grain size", .25, 4, .05);
    rangeField("roughness", "Roughness", 0, 1, .05);

    const protect = document.createElement("label");
    protect.className = "row";
    const protectLabel = document.createElement("span");
    protectLabel.textContent = "Tone protection";
    protect.title = "Reduce grain near pure black and white.";
    const tone = document.createElement("input");
    tone.type = "checkbox"; tone.dataset.control = "tone_weighted";
    tone.addEventListener("change", () => setValue(node, "tone_weighted", tone.checked));
    protect.append(protectLabel, tone); root.append(protect);

    const processingRow = document.createElement("label");
    processingRow.className = "row processing";
    const processingCaption = document.createElement("span");
    processingCaption.textContent = "Processing";
    const processing = document.createElement("select");
    processing.dataset.control = "processing_mode";
    processing.setAttribute("aria-label", "Processing");
    for (const count of [1, 2, 4]) processing.add(new Option(processingLabel(count), String(count)));
    processing.addEventListener("change", () => {
        const count = Number(processing.value);
        if (Number.isInteger(count) && count >= 1 && count <= 4) setValue(node, "processing_batch_size", count);
        else node.__denoGrain?.sync();
    });
    processingRow.title = "Same quality. Faster processing uses more temporary RAM. Processing uses CPU; the complete output frame batch still needs RAM.";
    processingRow.append(processingCaption, processing); root.append(processingRow);

    const detailsButton = document.createElement("button");
    detailsButton.type = "button"; detailsButton.className = "details-button";
    const detailsLabel = document.createElement("span"); detailsLabel.textContent = "Advanced";
    const arrow = document.createElement("span"); arrow.textContent = "+";
    detailsButton.append(detailsLabel, arrow);
    const details = document.createElement("div"); details.className = "details"; details.hidden = true;
    const detailControl = (name, label, options, bounds, tooltip) => {
        const row = document.createElement("label"); row.className = "row";
        if (tooltip) row.title = tooltip;
        const span = document.createElement("span"); span.textContent = label;
        const input = document.createElement(options ? "select" : "input");
        input.dataset.control = name;
        if (options) for (const [value, title] of options) input.add(new Option(title, value));
        else if (bounds) { input.type = "number"; input.min = String(bounds.min); input.max = String(bounds.max); input.step = "1"; }
        else { input.type = "text"; input.inputMode = "numeric"; }
        input.setAttribute("aria-label", label);
        input.addEventListener("change", () => {
            if (options) setValue(node, name, input.value);
            else if (/^\d+$/.test(input.value) && Number.isSafeInteger(Number(input.value))
                && (!bounds || Number(input.value) >= bounds.min && Number(input.value) <= bounds.max)) setValue(node, name, Number(input.value));
            else { input.value = String(widget(node, name)?.value); node.__denoGrain?.sync(); }
        });
        row.append(span, input); details.append(row);
        refreshers.push(() => {
            const value = String(widget(node, name)?.value ?? "");
            if (options && !Array.from(input.options).some((item) => item.value === value)) input.add(new Option(value, value));
            if (document.activeElement !== input) input.value = value;
            input.disabled = linked(node, name) || !widget(node, name);
        });
    };
    detailControl("processing_batch_size", "Frames at once", null, {min:1,max:4});
    detailControl("grain_scale_mode", "Grain scale", [["resolution", "Match resolution"], ["pixels", "Fixed pixels"]], null,
        "Match resolution samples the grain from a 1536px-short-edge reference (2752 × 1536), keeping a similar texture across resolutions. Only grain is resized; strength stays unchanged. Fixed pixels preserves older workflows. The reference grid uses temporary RAM; fine grain and video compression have sampling limits.");
    detailControl("temporal_mode", "Video grain", [["changing", "Per frame"], ["fixed", "Fixed"]]);
    detailControl("seed", "Seed");
    detailControl("control_after_generate", "Next seed", [["fixed", "Keep"], ["randomize", "Random"], ["increment", "Increment"], ["decrement", "Decrement"]]);
    detailControl("frame_offset", "Frame offset");
    detailsButton.addEventListener("click", () => {
        node.__denoGrain.pendingHeight = Number(node.size?.[1]);
        node.properties ||= {};
        node.properties.denoFilmGrain = {...node.properties.denoFilmGrain,
            detailsOpen: !node.properties.denoFilmGrain?.detailsOpen};
        node.__denoGrain?.sync();
        node.__denoGrain?.schedule();
        node.graph?.change?.();
    });
    root.append(detailsButton, details);
    const status = document.createElement("p"); status.className = "status"; root.append(status);
    const sync = () => {
        refreshNativeLinks(node);
        root.dataset.denoFilmGrain = String(node.id);
        enabled.textContent = widget(node, "enabled")?.value ? "On" : "Off · Original";
        enabled.setAttribute("aria-pressed", String(Boolean(widget(node, "enabled")?.value)));
        enabled.disabled = linked(node, "enabled");
        tone.checked = Boolean(widget(node, "tone_weighted")?.value); tone.disabled = linked(node, "tone_weighted");
        for (const refresher of refreshers) refresher();
        const count = widget(node, "processing_batch_size")?.value;
        const value = String(count ?? 1);
        if (!Array.from(processing.options).some((option) => option.value === value)) processing.add(new Option(processingLabel(value), value));
        processing.value = value;
        processing.disabled = linked(node, "processing_batch_size") || !widget(node, "processing_batch_size");
        const open = node.properties?.denoFilmGrain?.detailsOpen === true;
        details.hidden = !open; detailsButton.setAttribute("aria-expanded", String(open)); arrow.textContent = open ? "−" : "+";
        const connected = node.inputs?.find((input) => input.name === "images")?.link != null;
        const passthrough = !linked(node, "enabled") && widget(node, "enabled")?.value === false
            || !linked(node, "amount") && Number(widget(node, "amount")?.value) === 0;
        const outsideRange = Number(widget(node, "amount")?.value) > MAX_AMOUNT;
        status.hidden = connected && !outsideRange;
        status.textContent = outsideRange ? "Your saved strength is preserved. Editing the slider uses the new range."
            : !connected ? "Connect an image or video frame batch."
            : passthrough ? "The original passes through."
            : "Applied when you run ComfyUI.";
    };
    let measuredHeight = null;
    return {root, sync, height: () => {
        // A newly mounted DOM widget can briefly have a near-zero width.
        // Measuring wrapped text then would turn a compact panel into a very
        // tall node before the canvas assigns its actual width.
        measuredHeight = getPanelContentHeight(root, node.size?.[0]) || measuredHeight;
        return measuredHeight || (details.hidden ? 186 : 350);
    }};
}

export function setupFilmGrain(node) {
    if (node.__denoGrain) { node.__denoGrain.sync(); node.__denoGrain.schedule(); return; }
    installStyle();
    // Hide presentation only. Canonical widgets stay in their original order
    // and keep their serializeValue, input sockets and backend values.
    const originals = new Map();
    for (const name of VALUE_NAMES) {
        const item = widget(node, name);
        if (!item) continue;
        originals.set(name, {computeSize:item.computeSize, draw:item.draw, type:item.type, external:false});
        if (name === "amount" && item.options) { item.options.round = .001; item.options.precision = 3; }
        item.hidden = true;
        item.type = "hidden";
        item.computeSize = () => [0, -4];
        item.draw = () => {};
    }
    const ui = makePanel(node);
    const state = {...ui, originals, frame: null, previousMin: null,
        pendingHeight:Number(node.size?.[1]), observer: null, removed: false};
    node.__denoGrain = state;
    const dom = node.addDOMWidget("film_grain_panel", "deno_film_grain", ui.root, {
        serialize: false, getMinHeight: () => ui.height() + 8,
    });
    dom.computeSize = () => [Math.max(MIN_WIDTH, Number(node.size?.[0]) || 0), ui.height() + 8];
    state.schedule = () => {
        if (state.removed || state.frame != null) return;
        state.frame = requestAnimationFrame(() => {
            state.frame = null;
            const computed = node.computeSize?.() || [MIN_WIDTH, ui.height() + 45];
            const minimum = Number(computed[1]);
            if (!Number.isFinite(minimum)) return;
            const delta = state.previousMin == null ? 0 : minimum - state.previousMin;
            state.previousMin = minimum;
            const width = Math.max(MIN_WIDTH, Number(node.size?.[0]) || 0);
            const current = state.pendingHeight ?? (Number(node.size?.[1]) || minimum);
            state.pendingHeight = null;
            const height = Math.max(minimum, current + delta);
            if (Math.abs(node.size[0] - width) > .5 || Math.abs(node.size[1] - height) > .5) node.setSize([width, height]);
            node.graph?.setDirtyCanvas?.(true, true);
        });
    };
    for (const name of VALUE_NAMES) {
        const item = widget(node, name);
        if (!item) continue;
        const callback = item.callback;
        item.callback = function () {
            const result = callback?.apply(this, arguments);
            ui.sync(); state.schedule(); return result;
        };
    }
    state.observer = new ResizeObserver(state.schedule);
    state.observer.observe(ui.root);
    ui.sync(); state.schedule();
}

app.registerExtension({
    name: "Deno.FilmGrain",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            const scale = widget(this, "grain_scale_mode");
            if (scale) scale.value = "resolution";
            setupFilmGrain(this);
            this.__denoGrain.pendingHeight = 0;
            this.setSize([MIN_WIDTH, this.size[1]]);
            this.properties.denoFilmGrain = {...this.properties.denoFilmGrain, uiVersion:4};
            return result;
        };
        const configure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const compact = isLegacyAutoSize(arguments[0]);
            const savedHeight = Number(arguments[0]?.size?.[1]);
            const result = configure?.apply(this, arguments);
            const scale = widget(this, "grain_scale_mode");
            if (scale) scale.value = configuredGrainScale(arguments[0], this.widgets.indexOf(scale), scale.value);
            if (this.__denoGrain) { this.__denoGrain.previousMin = null; this.__denoGrain.pendingHeight = compact ? 0 : Number.isFinite(savedHeight) ? savedHeight : null; }
            setupFilmGrain(this);
            if (compact) this.setSize([MIN_WIDTH, this.size[1]]);
            this.properties.denoFilmGrain = {...this.properties.denoFilmGrain, uiVersion:4};
            return result;
        };
        for (const name of ["onAdded", "onConnectionsChange", "onExecuted"]) {
            const original = nodeType.prototype[name];
            nodeType.prototype[name] = function () {
                const result = original?.apply(this, arguments);
                this.__denoGrain?.sync(); this.__denoGrain?.schedule(); return result;
            };
        }
        const removed = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            const state = this.__denoGrain;
            if (state) { state.removed = true; state.observer?.disconnect(); if (state.frame != null) cancelAnimationFrame(state.frame); }
            return removed?.apply(this, arguments);
        };
    },
});
