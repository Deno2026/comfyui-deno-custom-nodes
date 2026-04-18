import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LOADER_NODE = "DenoMultiImageLoader";
const SEQUENCER_NODE = "DenoLTXSequencer";
const LOADER_MIN_SIZE = [360, 520];

window.__denoLtxSequencerNodes = window.__denoLtxSequencerNodes || new Set();

app.registerExtension({
    name: "Deno.ExtraNodes",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === LOADER_NODE) {
            patchMultiImageLoader(nodeType);
        }
        if (nodeData.name === SEQUENCER_NODE) {
            patchSequencer(nodeType);
        }
    },
});

function patchMultiImageLoader(nodeType) {
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = onNodeCreated?.apply(this, arguments);
        setupMultiImageLoader(this);
        return result;
    };
}

function setupMultiImageLoader(node) {
    const pathsWidget = getWidget(node, "image_paths");
    if (!pathsWidget || node.__denoLoaderReady) {
        return;
    }

    node.__denoLoaderReady = true;
    hideWidget(pathsWidget);

    node._denoUpdateLoaderVisibility = function () {
        const mode = getWidget(this, "mode")?.value ?? "Preset Ratio";
        toggleWidgetVisibility(getWidget(this, "ratio_preset"), mode === "Preset Ratio");
        toggleWidgetVisibility(getWidget(this, "megapixels"), mode === "Preset Ratio");
        toggleWidgetVisibility(getWidget(this, "width"), mode !== "Preset Ratio");
        toggleWidgetVisibility(getWidget(this, "height"), mode !== "Preset Ratio");
        this.setDirtyCanvas?.(true, true);
    };

    const container = document.createElement("div");
    container.style.cssText = `
        width: 100%;
        height: 320px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        box-sizing: border-box;
        background: rgba(4, 8, 7, 0.96);
        border: 1px solid rgba(72, 255, 132, 0.28);
        border-radius: 12px;
        pointer-events: auto;
        overflow: hidden;
    `;

    const topBar = document.createElement("div");
    topBar.style.cssText = "display:flex; gap:8px; align-items:center;";

    const uploadBtn = createActionButton("Upload");
    const clearBtn = createActionButton("Clear", true);
    topBar.append(uploadBtn, clearBtn);

    const countLabel = document.createElement("div");
    countLabel.style.cssText = "margin-left:auto; color:#94f7af; font:600 11px sans-serif;";
    topBar.appendChild(countLabel);

    const hint = document.createElement("div");
    hint.style.cssText = "color:#7dcf92; font:11px sans-serif; opacity:0.85;";
    hint.textContent = "Drag files, press Ctrl+V, or use Upload. Drag cards to reorder.";

    const grid = document.createElement("div");
    grid.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
        gap: 10px;
        align-content: start;
        padding-right: 4px;
    `;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";

    container.append(topBar, hint, grid, fileInput);
    const widget = node.addDOMWidget("loader_panel", "deno_multi_image_loader", container, { serialize: false });
    widget.computeSize = () => [Math.max(node.size?.[0] ?? 0, LOADER_MIN_SIZE[0]), 332];

    node.size = [
        Math.max(node.size?.[0] ?? 0, LOADER_MIN_SIZE[0]),
        Math.max(node.size?.[1] ?? 0, LOADER_MIN_SIZE[1]),
    ];

    let draggedCard = null;
    let placeholder = null;

    for (const currentWidget of node.widgets || []) {
        if (currentWidget.__denoLoaderWrapped) {
            continue;
        }
        const originalCallback = currentWidget.callback;
        currentWidget.callback = function (value) {
            const result = originalCallback?.apply(this, arguments);
            node._denoUpdateLoaderVisibility?.();
            return result;
        };
        currentWidget.__denoLoaderWrapped = true;
    }

    function getPaths() {
        return (pathsWidget.value || "")
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    function setPaths(paths) {
        const deduped = paths.filter(Boolean);
        pathsWidget.value = deduped.join("\n");
        pathsWidget.callback?.(pathsWidget.value);
        node._denoImageCount = deduped.length;
        notifyConnectedSequencers(node, deduped.length);
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        render();
    }

    function createPlaceholder() {
        const el = document.createElement("div");
        el.style.cssText = `
            border: 1px dashed rgba(72,255,132,0.55);
            border-radius: 10px;
            background: rgba(28,68,42,0.35);
            min-height: 92px;
        `;
        return el;
    }

    function buildCard(path, index) {
        const card = document.createElement("div");
        card.draggable = true;
        card.dataset.path = path;
        card.style.cssText = `
            position: relative;
            min-height: 92px;
            border-radius: 10px;
            overflow: hidden;
            background: #050707;
            border: 1px solid rgba(54, 110, 74, 0.9);
            cursor: grab;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
        `;

        const image = document.createElement("img");
        image.src = `/api/view?filename=${encodeURIComponent(path)}&type=input`;
        image.style.cssText = "display:block; width:100%; height:100%; object-fit:cover; pointer-events:none;";

        const badge = document.createElement("div");
        badge.textContent = String(index + 1);
        badge.style.cssText = `
            position:absolute; left:0; bottom:0;
            background:rgba(0,0,0,0.72); color:#d7ffe3;
            padding:2px 6px; font:700 11px sans-serif;
            border-top-right-radius:8px;
        `;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "x";
        remove.style.cssText = `
            position:absolute; top:6px; right:6px;
            width:22px; height:22px; border:none; border-radius:999px;
            background:rgba(0,0,0,0.72); color:#fff; cursor:pointer;
            font:700 14px/1 sans-serif;
        `;
        remove.onclick = (event) => {
            event.stopPropagation();
            const nextPaths = getPaths();
            nextPaths.splice(index, 1);
            setPaths(nextPaths);
        };

        card.addEventListener("dragstart", () => {
            draggedCard = card;
            placeholder = createPlaceholder();
            card.style.opacity = "0.35";
            setTimeout(() => {
                if (card.parentElement) {
                    card.parentElement.insertBefore(placeholder, card.nextSibling);
                }
            }, 0);
        });

        card.addEventListener("dragend", () => {
            card.style.opacity = "1";
            if (placeholder?.parentElement && draggedCard) {
                placeholder.parentElement.insertBefore(draggedCard, placeholder);
            }
            placeholder?.remove();
            placeholder = null;
            draggedCard = null;
            const newOrder = Array.from(grid.children)
                .filter((child) => child.dataset?.path)
                .map((child) => child.dataset.path);
            setPaths(newOrder);
        });

        card.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (!draggedCard || draggedCard === card || !placeholder) {
                return;
            }
            const rect = card.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            grid.insertBefore(placeholder, insertAfter ? card.nextSibling : card);
        });

        card.append(image, remove, badge);
        return card;
    }

    async function uploadFiles(fileList) {
        const uploaded = [];
        for (const file of Array.from(fileList || [])) {
            const body = new FormData();
            body.append("image", file);
            const response = await api.fetchApi("/upload/image", { method: "POST", body });
            if (response.status !== 200) {
                continue;
            }
            const payload = await response.json();
            uploaded.push(payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name);
        }
        if (uploaded.length) {
            setPaths(getPaths().concat(uploaded));
        }
    }

    function render() {
        const paths = getPaths();
        countLabel.textContent = `${paths.length} image${paths.length === 1 ? "" : "s"}`;
        grid.replaceChildren(...paths.map((path, index) => buildCard(path, index)));
    }

    function syncLoaderStateFromWidget() {
        const count = getPaths().length;
        if (node._denoImageCount !== count || grid.childElementCount !== count) {
            node._denoImageCount = count;
            notifyConnectedSequencers(node, count);
            render();
        }
    }

    uploadBtn.onclick = () => fileInput.click();
    clearBtn.onclick = () => setPaths([]);
    fileInput.onchange = (event) => uploadFiles(event.target.files);

    container.addEventListener("dragover", (event) => {
        event.preventDefault();
        container.style.borderColor = "rgba(72,255,132,0.9)";
    });
    container.addEventListener("dragleave", () => {
        container.style.borderColor = "rgba(72,255,132,0.28)";
    });
    container.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        container.style.borderColor = "rgba(72,255,132,0.28)";
        if (event.dataTransfer?.files?.length) {
            uploadFiles(event.dataTransfer.files);
        }
    });

    const pasteHandler = (event) => {
        if (!app.canvas.selected_nodes?.[node.id]) {
            return;
        }
        const files = Array.from(event.clipboardData?.items || [])
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        uploadFiles(files);
    };

    document.addEventListener("paste", pasteHandler, { capture: true });
    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        document.removeEventListener("paste", pasteHandler, { capture: true });
        originalRemoved?.apply(this, arguments);
    };

    const originalDraw = node.onDrawBackground;
    node.onDrawBackground = function () {
        originalDraw?.apply(this, arguments);
        syncLoaderStateFromWidget();
    };

    setTimeout(syncLoaderStateFromWidget, 50);
    setTimeout(syncLoaderStateFromWidget, 250);
    node._denoUpdateLoaderVisibility?.();
    render();
}

function patchSequencer(nodeType) {
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = onNodeCreated?.apply(this, arguments);
        setupSequencer(this);
        return result;
    };
}

function isStrengthValueName(name) {
    return /^strength_\d+$/.test(name || "");
}

function normalizeBooleanValue(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (["false", "0", "off", "no", ""].includes(v)) {
            return false;
        }
        if (["true", "1", "on", "yes"].includes(v)) {
            return true;
        }
    }
    return Boolean(value);
}

function normalizeSequencerValue(name, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        if (name === "strength_sync") {
            return normalizeBooleanValue(value);
        }
        return value;
    }

    if (name === "num_images" || name === "frame_rate" || name.startsWith("insert_frame_")) {
        return Math.round(numeric);
    }

    if (name === "strength_sync") {
        return normalizeBooleanValue(value);
    }

    if (name.startsWith("insert_second_")) {
        return Math.max(0, Number(numeric.toFixed(2)));
    }

    if (isStrengthValueName(name)) {
        return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
    }

    return value;
}

function getSequencerDefaultValue(name) {
    if (name.startsWith("insert_frame_") || name.startsWith("insert_second_")) {
        return 0;
    }
    if (isStrengthValueName(name)) {
        return 1.0;
    }
    if (name === "num_images") {
        return 0;
    }
    return 0;
}

function normalizeSequencerOrDefault(name, value, fallback = undefined) {
    const normalized = normalizeSequencerValue(name, value);
    if (normalized === undefined || Number.isNaN(normalized)) {
        if (fallback !== undefined) {
            const normalizedFallback = normalizeSequencerValue(name, fallback);
            if (normalizedFallback !== undefined && !Number.isNaN(normalizedFallback)) {
                return normalizedFallback;
            }
        }
        return getSequencerDefaultValue(name);
    }
    return normalized;
}

function getAllSequencerNodes(referenceNode = null) {
    const result = new Set(window.__denoLtxSequencerNodes || []);
    const graph = referenceNode?.graph || app.graph;
    for (const candidate of graph?._nodes || []) {
        if (candidate?.comfyClass === SEQUENCER_NODE) {
            result.add(candidate);
            if (!candidate.__denoSequencerReady) {
                try {
                    setupSequencer(candidate);
                } catch (_err) {}
            }
        }
    }
    return Array.from(result);
}

function canMirrorImageCountFromPeer(targetNode, count) {
    if (!targetNode) {
        return false;
    }
    const normalizedCount = normalizeSequencerValue("num_images", count);
    const upstreamCount = readUpstreamImageCount(targetNode);
    if (typeof upstreamCount === "number") {
        // Respect independently connected chains with different known loader counts.
        return upstreamCount === normalizedCount;
    }
    // If upstream is unresolved (or disconnected), allow peer synchronization.
    return true;
}

function mirrorSequencerImageCount(sourceNode, count) {
    const normalizedCount = normalizeSequencerValue("num_images", count);
    for (const targetNode of getAllSequencerNodes(sourceNode)) {
        if (targetNode === sourceNode) {
            continue;
        }
        if (!canMirrorImageCountFromPeer(targetNode, normalizedCount)) {
            continue;
        }
        targetNode._syncImageCount?.(normalizedCount, { propagate: false });
    }
}

function findStrengthSyncPeer(node) {
    for (const peerNode of getAllSequencerNodes(node)) {
        if (peerNode === node) {
            continue;
        }
        const peerSyncEnabled = peerNode.properties.strength_sync ?? getWidget(peerNode, "strength_sync")?.value ?? true;
        if (peerSyncEnabled) {
            return peerNode;
        }
    }
    return null;
}

function adoptStrengthValuesFromPeer(targetNode, sourceNode) {
    const count = Number(targetNode.properties.num_images ?? getWidget(targetNode, "num_images")?.value ?? 0);
    targetNode.__denoApplyingSync = true;
    for (let index = 1; index <= count; index += 1) {
        const name = `strength_${index}`;
        const sourceWidget = getWidget(sourceNode, name);
        const normalizedValue = normalizeSequencerValue(name, sourceWidget?.value ?? sourceNode.properties[name] ?? 1.0);
        targetNode.properties[name] = normalizedValue;
        const targetWidget = getWidget(targetNode, name);
        if (targetWidget) {
            targetWidget.value = normalizedValue;
        }
    }
    targetNode.__denoApplyingSync = false;
    targetNode._denoUpdateVisibility?.();
    targetNode.setDirtyCanvas?.(true, true);
}

function enableStrengthSync(node) {
    const peerNode = findStrengthSyncPeer(node);
    if (peerNode) {
        adoptStrengthValuesFromPeer(node, peerNode);
        return;
    }
    syncAllStrengthValues(node);
}

function getSequencerNumImagesValue(node, fallbackValue) {
    const upstreamCount = readUpstreamImageCount(node);
    if (typeof upstreamCount === "number") {
        return upstreamCount;
    }
    return normalizeSequencerValue("num_images", fallbackValue);
}

function deferSequencerWidgetUpdate(fn) {
    setTimeout(fn, 0);
}

function setupSequencer(node) {
    if (node.__denoSequencerReady) {
        return;
    }
    node.__denoSequencerReady = true;
    node.properties = node.properties || {};
    window.__denoLtxSequencerNodes.add(node);
    node._currentImageCount = -1;
    node.__denoApplyingSync = false;

    const strengthSyncWidget = getWidget(node, "strength_sync");
    if (strengthSyncWidget) {
        strengthSyncWidget.value = true;
        node.properties.strength_sync = true;
    }

    const originalRemoved = node.onRemoved;
    node.onRemoved = function () {
        window.__denoLtxSequencerNodes.delete(node);
        if (node.__denoCountPoll) {
            clearInterval(node.__denoCountPoll);
            delete node.__denoCountPoll;
        }
        delete node._syncImageCount;
        originalRemoved?.apply(this, arguments);
    };

    // Compatibility hook:
    // WhatDreamsCost MultiImageLoader broadcasts image-count updates to connected nodes
    // via targetNode._syncImageCount(count). Implement the same contract here.
    node._syncImageCount = function (imageCount, options = {}) {
        const count = normalizeSequencerValue("num_images", imageCount);
        const currentCount = Number(this.properties.num_images ?? getWidget(this, "num_images")?.value ?? 0);
        if (count === currentCount) {
            return;
        }

        this.__denoApplyingSync = true;
        const numWidget = getWidget(this, "num_images");
        if (numWidget) {
            numWidget.value = count;
        }
        this.properties.num_images = count;
        this._applyWidgetCount(count);
        this.__denoApplyingSync = false;
        this._denoUpdateVisibility?.();
        this.setDirtyCanvas?.(true, true);

        if (options?.propagate !== false) {
            mirrorSequencerImageCount(this, count);
        }
    };

    node._hookStaticWidgets = function () {
        for (const widget of this.widgets || []) {
            if (widget.__denoStaticWrapped) {
                continue;
            }
            if (!["num_images", "insert_mode", "frame_rate", "strength_sync"].includes(widget.name)) {
                continue;
            }

            const originalCallback = widget.callback;
            widget.callback = (value) => {
                const callbackResult = originalCallback?.apply(widget, [value]);
                deferSequencerWidgetUpdate(() => {
                    const rawValue = value ?? widget.value;
                    const nextValue = widget.name === "num_images"
                        ? getSequencerNumImagesValue(this, rawValue)
                        : normalizeSequencerValue(widget.name, rawValue);
                    widget.value = nextValue;
                    this.properties[widget.name] = nextValue;

                    if (widget.name === "num_images") {
                        this._applyWidgetCount(nextValue);
                        this._denoUpdateVisibility?.();
                    } else if (widget.name === "strength_sync") {
                        if (nextValue) {
                            enableStrengthSync(this);
                        }
                    } else {
                        syncSequencerState(this, widget.name, nextValue);
                        this._denoUpdateVisibility?.();
                    }
                });
                return callbackResult;
            };
            widget.__denoStaticWrapped = true;
        }
    };

    const originalWidgetChanged = node.onWidgetChanged;
    node.onWidgetChanged = function (name, value, oldValue, widget) {
        const result = originalWidgetChanged?.apply(this, arguments);
        if (this.__denoApplyingSync) {
            return result;
        }

        const widgetName = widget?.name ?? name;
        if (!widgetName) {
            return result;
        }

        const isDynamicWidget =
            widgetName.startsWith("insert_frame_") ||
            widgetName.startsWith("insert_second_") ||
            isStrengthValueName(widgetName);

        // Dynamic widgets are managed by addSyncedWidget callback.
        // Handling them here can overwrite in-flight arrow increments.
        if (isDynamicWidget) {
            return result;
        }

        const rawValue = value ?? widget?.value;
        const normalizedValue = widgetName === "num_images"
            ? getSequencerNumImagesValue(this, rawValue)
            : normalizeSequencerValue(widgetName, rawValue);
        if (widget) {
            widget.value = normalizedValue;
        }
        this.properties[widgetName] = normalizedValue;
        if (widgetName === "num_images") {
            this._applyWidgetCount(normalizedValue);
        } else if (widgetName === "strength_sync") {
            if (normalizedValue) {
                enableStrengthSync(this);
            }
            this.setDirtyCanvas?.(true, true);
        } else {
            const isStrength = isStrengthValueName(widgetName);
            const strengthSyncEnabled = this.properties.strength_sync ?? getWidget(this, "strength_sync")?.value ?? true;
            if (!isStrength || strengthSyncEnabled) {
                syncSequencerState(this, widgetName, normalizedValue);
            }
        }
        return result;
    };

    node._denoUpdateVisibility = function () {
        const count = Number(this.properties.num_images ?? getWidget(this, "num_images")?.value ?? 0);
        const mode = this.properties.insert_mode ?? getWidget(this, "insert_mode")?.value ?? "frames";

        for (const widget of this.widgets || []) {
            const name = widget.name || "";
            if (name.startsWith("insert_frame_")) {
                const index = Number(name.split("_").pop());
                toggleWidgetVisibility(widget, index <= count && mode === "frames");
            } else if (name.startsWith("insert_second_")) {
                const index = Number(name.split("_").pop());
                toggleWidgetVisibility(widget, index <= count && mode === "seconds");
            } else if (isStrengthValueName(name)) {
                const index = Number(name.split("_").pop());
                toggleWidgetVisibility(widget, index <= count);
            }
        }

        this.setDirtyCanvas?.(true, true);
    };

    node._applyWidgetCount = function (count) {
        this._hookStaticWidgets();
        const normalizedCount = Math.max(0, Math.min(Number(count) || 0, 50));
        const width = this.size?.[0] ?? 360;

        if (this.widgets) {
            for (const widget of this.widgets) {
                const name = widget.name || "";
                if (
                    name.startsWith("insert_frame_") ||
                    name.startsWith("insert_second_") ||
                    isStrengthValueName(name)
                ) {
                    this.properties[name] = normalizeSequencerOrDefault(name, widget.value, this.properties[name]);
                }
            }
        }

        this.widgets = (this.widgets || []).filter((widget) => {
            const name = widget.name || "";
            return !(
                name.startsWith("insert_frame_") ||
                name.startsWith("insert_second_") ||
                isStrengthValueName(name) ||
                name.startsWith("header_")
            );
        });

        const addSyncedWidget = (type, name, fallbackValue, options) => {
            const savedValue = this.properties[name];
            const initialValue = normalizeSequencerOrDefault(name, savedValue, fallbackValue);
            this.properties[name] = initialValue;
            const widget = this.addWidget(type, name, initialValue, (value) => {
                const applyValue = (rawValue) => {
                    const prevValue = normalizeSequencerOrDefault(name, this.properties[name], fallbackValue);
                    let nextValue = normalizeSequencerValue(name, rawValue);
                    if (nextValue === undefined || Number.isNaN(nextValue)) {
                        nextValue = normalizeSequencerOrDefault(name, rawValue, prevValue);
                    }

                    // Some arrow paths emit tiny deltas while displayed precision is coarser.
                    // Promote one visible step for arrow-like deltas that would otherwise look stuck.
                    const isInsertFrameParam = name.startsWith("insert_frame_");
                    const isFineStepParam = name.startsWith("insert_second_") || isStrengthValueName(name);
                    const rawNumeric = Number(rawValue);
                    const prevNumeric = Number(prevValue);
                    if (
                        (isFineStepParam || isInsertFrameParam) &&
                        Number.isFinite(rawNumeric) &&
                        Number.isFinite(prevNumeric) &&
                        nextValue === prevValue &&
                        rawNumeric !== prevNumeric
                    ) {
                        const delta = Math.abs(rawNumeric - prevNumeric);
                        const isLikelyArrowDelta = isInsertFrameParam ? delta <= 0.11 : true;
                        if (isLikelyArrowDelta) {
                            const direction = rawNumeric > prevNumeric ? 1 : -1;
                            const step = isInsertFrameParam ? 1 : 0.01;
                            nextValue = normalizeSequencerValue(name, prevNumeric + direction * step);
                        }
                    }

                    // Always coerce the visible widget text/number to the normalized format
                    // (e.g. prevent "-1.20000000000002" staying in an INT field).
                    const normalizedWidgetValue = normalizeSequencerOrDefault(
                        name,
                        widget.value ?? rawValue,
                        nextValue
                    );
                    if (widget.value !== normalizedWidgetValue) {
                        widget.value = normalizedWidgetValue;
                    }

                    if (nextValue === prevValue) {
                        this.properties[name] = prevValue;
                        this.setDirtyCanvas?.(true, true);
                        return;
                    }

                    widget.value = nextValue;
                    this.properties[name] = nextValue;

                    const isStrength = isStrengthValueName(name);
                    const strengthSyncEnabled = this.properties.strength_sync ?? getWidget(this, "strength_sync")?.value ?? true;
                    if (!isStrength || strengthSyncEnabled) {
                        syncSequencerState(this, name, nextValue);
                    }
                    this.setDirtyCanvas?.(true, true);
                };

                // Arrow/button clicks can update widget.value after callback dispatch in some UI paths.
                // Avoid forcing a stale immediate value; sync from the post-update widget state.
                const immediateValue = value;
                const prevValue = normalizeSequencerValue(name, this.properties[name] ?? fallbackValue);
                const normalizedImmediate = normalizeSequencerValue(name, immediateValue);
                if (
                    immediateValue !== undefined &&
                    normalizedImmediate !== undefined &&
                    !Number.isNaN(normalizedImmediate) &&
                    normalizedImmediate !== prevValue
                ) {
                    applyValue(immediateValue);
                }
                deferSequencerWidgetUpdate(() => applyValue(widget.value));
                requestAnimationFrame(() => applyValue(widget.value));
                setTimeout(() => applyValue(widget.value), 16);
            }, options);
            return widget;
        };

        for (let index = 1; index <= normalizedCount; index += 1) {
            this.addCustomWidget({
                name: `header_${index}`,
                type: "text",
                draw(ctx, currentNode, widgetWidth, y) {
                    ctx.save();
                    ctx.strokeStyle = "#333";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(10, y + 5);
                    ctx.lineTo(widgetWidth - 10, y + 5);
                    ctx.stroke();
                    ctx.fillStyle = "#dddddd";
                    ctx.font = "bold 12px Arial";
                    ctx.textAlign = "left";
                    ctx.fillText(`Image #${index}`, 10, y + 24);
                    ctx.restore();
                },
                computeSize(widgetWidth) {
                    return [widgetWidth, 35];
                },
            });

            addSyncedWidget("number", `insert_frame_${index}`, 0, { min: -9999, max: 9999, step: 1, precision: 0 });
            addSyncedWidget("number", `insert_second_${index}`, 0.0, { min: 0.0, max: 9999.0, step: 0.01, precision: 2 });
            addSyncedWidget("number", `strength_${index}`, 1.0, { min: 0.0, max: 1.0, step: 0.01, precision: 2 });
        }

        this.properties.num_images = normalizedCount;
        this._currentImageCount = normalizedCount;
        this._denoUpdateVisibility?.();
        this.setDirtyCanvas?.(true, true);
        requestAnimationFrame(() => {
            if (this.computeSize) {
                this.setSize([width, this.computeSize()[1]]);
            }
        });
    };

    const originalConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, linkInfo) {
        originalConnectionsChange?.apply(this, arguments);
        if (type !== 1 || this.inputs?.[index]?.name !== "multi_input" || !connected) {
            return;
        }

        setTimeout(() => {
            const count = readUpstreamImageCount(this);
            if (typeof count !== "number") {
                return;
            }
            const numWidget = getWidget(this, "num_images");
            if (numWidget) {
                numWidget.value = count;
                this.properties.num_images = count;
            }
            this._syncImageCount?.(count);
        }, 50);
    };

    setTimeout(() => {
        const peerNode = getAllSequencerNodes(node).find((candidate) => candidate !== node);
        if (peerNode) {
            cloneSequencerState(peerNode, node);
        }
        const count = readUpstreamImageCount(node);
        if (typeof count === "number") {
            node._syncImageCount?.(count);
        }
        node._applyWidgetCount(node.properties.num_images ?? getWidget(node, "num_images")?.value ?? 0);
    }, 50);

    // Keep count in sync even when an intermediate node sits between loader and sequencer.
    node.__denoCountPoll = setInterval(() => {
        if (!node.graph) {
            if (node.__denoCountPoll) {
                clearInterval(node.__denoCountPoll);
                delete node.__denoCountPoll;
            }
            return;
        }
        const multiInputSlot = node.inputs?.find((slot) => slot.name === "multi_input");
        if (!getInputLinkIds(multiInputSlot).length) {
            return;
        }
        const count = readUpstreamImageCount(node);
        if (typeof count !== "number") {
            return;
        }
        const currentCount = Number(node.properties.num_images ?? getWidget(node, "num_images")?.value ?? 0);
        if (count !== currentCount) {
            node._syncImageCount?.(count);
        }
    }, 800);
}

function syncSequencerState(sourceNode, changedName, value) {
    if (changedName === "num_images") {
        return;
    }

    const isStrength = isStrengthValueName(changedName);
    const normalizedValue = normalizeSequencerValue(changedName, value);
    const sourceAllowsStrengthSync =
        sourceNode.properties.strength_sync ?? getWidget(sourceNode, "strength_sync")?.value ?? true;
    if (isStrength && !sourceAllowsStrengthSync) {
        return;
    }

    for (const targetNode of getAllSequencerNodes(sourceNode)) {
        if (targetNode === sourceNode) {
            continue;
        }

        if (isStrength) {
            const targetAllowsStrengthSync = targetNode.properties.strength_sync ?? getWidget(targetNode, "strength_sync")?.value ?? true;
            if (!targetAllowsStrengthSync) {
                continue;
            }
        }

        const currentTargetValue = normalizeSequencerValue(
            changedName,
            targetNode.properties[changedName] ?? getWidget(targetNode, changedName)?.value
        );
        if (currentTargetValue === normalizedValue) {
            continue;
        }

        targetNode.__denoApplyingSync = true;
        targetNode.properties[changedName] = normalizedValue;
        const widget = getWidget(targetNode, changedName);
        if (widget) {
            widget.value = normalizedValue;
        }
        if (changedName === "num_images") {
            targetNode._applyWidgetCount?.(normalizedValue);
        }
        targetNode._denoUpdateVisibility?.();
        targetNode.setDirtyCanvas?.(true, true);
        targetNode.__denoApplyingSync = false;
    }
}

function cloneSequencerState(sourceNode, targetNode) {
    targetNode.__denoApplyingSync = true;
    targetNode.properties = { ...targetNode.properties, ...sourceNode.properties };

    const count = Number(sourceNode.properties.num_images ?? getWidget(sourceNode, "num_images")?.value ?? 0);
    targetNode._applyWidgetCount?.(count);

    for (const widget of targetNode.widgets || []) {
        const name = widget.name || "";
        if (targetNode.properties[name] !== undefined) {
            const normalizedValue = normalizeSequencerValue(name, targetNode.properties[name]);
            targetNode.properties[name] = normalizedValue;
            widget.value = normalizedValue;
        }
    }

    targetNode._denoUpdateVisibility?.();
    targetNode.setDirtyCanvas?.(true, true);
    targetNode.__denoApplyingSync = false;
}

function syncAllStrengthValues(sourceNode) {
    const count = Number(sourceNode.properties.num_images ?? getWidget(sourceNode, "num_images")?.value ?? 0);
    for (let index = 1; index <= count; index += 1) {
        const widget = getWidget(sourceNode, `strength_${index}`);
        const value = normalizeSequencerValue(`strength_${index}`, widget?.value ?? sourceNode.properties[`strength_${index}`]);
        if (value !== undefined) {
            syncSequencerState(sourceNode, `strength_${index}`, value);
        }
    }
}

function notifyConnectedSequencers(loaderNode, count) {
    if (!loaderNode.graph) {
        return;
    }

    for (const output of loaderNode.outputs || []) {
        for (const linkId of output?.links || []) {
            const link = loaderNode.graph.links[linkId];
            if (!link) {
                continue;
            }
            const targetNode = loaderNode.graph.getNodeById(link.target_id);
            if (!targetNode || targetNode.comfyClass !== SEQUENCER_NODE) {
                continue;
            }
            targetNode._syncImageCount?.(count);
        }
    }
}

function getInputLinkIds(inputSlot) {
    if (!inputSlot) {
        return [];
    }

    const ids = [];
    if (inputSlot.link !== undefined && inputSlot.link !== null && inputSlot.link !== -1) {
        ids.push(inputSlot.link);
    }
    if (Array.isArray(inputSlot.links)) {
        for (const linkId of inputSlot.links) {
            if (linkId !== undefined && linkId !== null && linkId !== -1) {
                ids.push(linkId);
            }
        }
    }
    return [...new Set(ids)];
}

function getGraphLink(graph, linkId) {
    if (!graph || linkId === undefined || linkId === null) {
        return null;
    }
    const links = graph.links;
    if (!links) {
        return null;
    }
    if (typeof links.get === "function") {
        return links.get(linkId) ?? links.get(Number(linkId)) ?? links.get(String(linkId)) ?? null;
    }
    return links[linkId] ?? links[Number(linkId)] ?? links[String(linkId)] ?? null;
}

function readUpstreamImageCount(node) {
    const input = node.inputs?.find((slot) => slot.name === "multi_input");
    const startLinks = getInputLinkIds(input);
    const graph = node.graph || app.graph;
    if (!startLinks.length || !graph) {
        return null;
    }

    function isLoaderNode(targetNode) {
        if (!targetNode) {
            return false;
        }
        const clsRaw = targetNode.comfyClass || targetNode.type || "";
        const cls = String(clsRaw).toLowerCase().replace(/\s+/g, "");
        return (
            cls === String(LOADER_NODE).toLowerCase() ||
            cls === "multiimageloader" ||
            cls.endsWith("multiimageloader") ||
            typeof targetNode._denoImageCount === "number" ||
            typeof targetNode._imageCount === "number" ||
            !!getWidget(targetNode, "image_paths")
        );
    }

    function getCountFromLoaderNode(loaderNode) {
        if (!isLoaderNode(loaderNode)) {
            return null;
        }
        if (typeof loaderNode._denoImageCount === "number") {
            return loaderNode._denoImageCount;
        }
        if (typeof loaderNode._imageCount === "number") {
            return loaderNode._imageCount;
        }
        const imagePathsWidget = getWidget(loaderNode, "image_paths");
        const rawPaths = imagePathsWidget?.value ?? loaderNode.properties?.image_paths;
        if (typeof rawPaths === "string") {
            return rawPaths.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean).length;
        }
        if (Array.isArray(rawPaths)) {
            return rawPaths.map((entry) => String(entry || "").trim()).filter(Boolean).length;
        }
        return null;
    }

    function scoreInputSlot(slot) {
        const name = String(slot?.name || "").toLowerCase();
        if (name.includes("multi") || name.includes("image")) {
            return 0;
        }
        return 1;
    }

    function enqueueNodeInputs(targetNode, queue) {
        if (!targetNode || targetNode.graph !== graph) {
            return;
        }
        const linkedInputs = (targetNode.inputs || [])
            .map((slot) => ({ slot, linkIds: getInputLinkIds(slot) }))
            .filter((entry) => entry.linkIds.length > 0)
            .sort((a, b) => scoreInputSlot(a.slot) - scoreInputSlot(b.slot));
        for (const entry of linkedInputs) {
            for (const nestedLink of entry.linkIds) {
                queue.push(nestedLink);
            }
        }
    }

    const visitedLinks = new Set();
    const visitedNodeIds = new Set();
    const pendingLinks = [...startLinks];

    while (pendingLinks.length) {
        const linkId = pendingLinks.shift();
        const linkKey = String(linkId);
        if (!linkKey || visitedLinks.has(linkKey)) {
            continue;
        }
        visitedLinks.add(linkKey);

        const upstreamLink = getGraphLink(graph, linkId);
        if (!upstreamLink) {
            continue;
        }
        const originNodeId = upstreamLink.origin_id ?? upstreamLink.originId ?? upstreamLink.origin;
        if (originNodeId === undefined || originNodeId === null) {
            continue;
        }

        const upstreamNode = graph.getNodeById?.(originNodeId);
        if (!upstreamNode) {
            continue;
        }
        const nodeKey = String(upstreamNode.id ?? originNodeId);
        if (visitedNodeIds.has(nodeKey)) {
            continue;
        }
        visitedNodeIds.add(nodeKey);

        const directCount = getCountFromLoaderNode(upstreamNode);
        if (typeof directCount === "number") {
            return directCount;
        }

        // Support virtual Get/Set style nodes (e.g. easy getNode / KJ GetNode):
        // resolve the source link from its paired Set node and continue tracing.
        const originSlot = upstreamLink.origin_slot ?? upstreamLink.originSlot ?? 0;
        if (typeof upstreamNode.getInputLink === "function") {
            try {
                const virtualLink = upstreamNode.getInputLink(originSlot);
                const virtualOriginId = virtualLink?.origin_id ?? virtualLink?.originId;
                if (virtualOriginId !== undefined && virtualOriginId !== null) {
                    const virtualOriginNode = (upstreamNode.graph || graph).getNodeById?.(virtualOriginId);
                    if (virtualOriginNode) {
                        const virtualCount = getCountFromLoaderNode(virtualOriginNode);
                        if (typeof virtualCount === "number") {
                            return virtualCount;
                        }
                        enqueueNodeInputs(virtualOriginNode, pendingLinks);
                    }
                }
            } catch (_err) {}
        }
        if (typeof upstreamNode.resolveVirtualOutput === "function") {
            try {
                const resolved = upstreamNode.resolveVirtualOutput(originSlot);
                const virtualOriginNode = resolved?.node;
                if (virtualOriginNode) {
                    const virtualCount = getCountFromLoaderNode(virtualOriginNode);
                    if (typeof virtualCount === "number") {
                        return virtualCount;
                    }
                    enqueueNodeInputs(virtualOriginNode, pendingLinks);
                }
            } catch (_err) {}
        }

        // Reroute/pass-through nodes
        if (upstreamNode.type === "Reroute" || upstreamNode.comfyClass === "Reroute") {
            const rerouteLinks = getInputLinkIds(upstreamNode.inputs?.[0]);
            for (const nestedLink of rerouteLinks) {
                pendingLinks.unshift(nestedLink);
            }
            continue;
        }

        // Group/subgraph nodes that can expose inner node for connected output slot
        if (typeof upstreamNode.getInnerNode === "function") {
            try {
                const originSlot = upstreamLink.origin_slot ?? upstreamLink.originSlot ?? 0;
                const innerNode = upstreamNode.getInnerNode(originSlot);
                const innerCount = getCountFromLoaderNode(innerNode);
                if (typeof innerCount === "number") {
                    return innerCount;
                }
            } catch (_err) {}
        }

        // Generic pass-through tracing:
        // follow all linked inputs (prioritize image-like names) to find the true upstream loader.
        enqueueNodeInputs(upstreamNode, pendingLinks);
    }

    // Conservative fallback: only when a single known loader exists in the graph.
    const allNodes = graph?._nodes || [];
    const loaderCandidates = allNodes.filter((candidate) => isLoaderNode(candidate));
    if (loaderCandidates.length === 1) {
        return getCountFromLoaderNode(loaderCandidates[0]);
    }

    return null;
}

function toggleWidgetVisibility(widget, visible) {
    if (!widget) {
        return;
    }
    if (visible) {
        if (widget.__denoOrigType !== undefined) {
            widget.type = widget.__denoOrigType;
            widget.computeSize = widget.__denoOrigComputeSize;
            delete widget.__denoOrigType;
            delete widget.__denoOrigComputeSize;
        }
        return;
    }

    if (widget.type !== "hidden") {
        widget.__denoOrigType = widget.type;
        widget.__denoOrigComputeSize = widget.computeSize;
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
    }
}

function createActionButton(label, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border:none;
        border-radius:999px;
        padding:6px 10px;
        cursor:pointer;
        font:600 11px sans-serif;
        color:${danger ? "#ffd5d5" : "#d9ffe5"};
        background:${danger ? "rgba(119, 26, 26, 0.95)" : "rgba(22, 58, 35, 0.95)"};
    `;
    return button;
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    if (widget.element) {
        widget.element.style.display = "none";
    }
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}
