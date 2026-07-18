import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const ADVANCED_NODE = "DenoAdvancedImageSourceLoader";
const MIN_SIZE = [520, 620];
const PANEL_MIN_HEIGHT = 360;
const PANEL_RESERVED_NODE_HEIGHT = 248;
const PANEL_MAX_HEIGHT = 780;
const MASONRY_ROW_HEIGHT = 8;
const MASONRY_GAP = 10;
const CARD_MIN_HEIGHT = 116;
const CARD_MAX_HEIGHT = 320;
const IMAGE_RE = /\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/i;
const KEEP_INPUT_RATIO_MODE = "Keep Input Ratio";
const PRESET_MODE = "Preset Ratio";
const MANUAL_MODE = "Manual Input";

app.registerExtension({
    name: "Deno.AdvancedImageSourceLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== ADVANCED_NODE) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupAdvancedImageSourceLoader(this);
            return result;
        };
    },
});

function setupAdvancedImageSourceLoader(node) {
    const pathsWidget = getWidget(node, "image_paths");
    const disabledWidget = getWidget(node, "disabled_image_paths");
    if (!pathsWidget || node.__denoAdvancedSourceReady) {
        return;
    }

    node.__denoAdvancedSourceReady = true;
    hideWidget(pathsWidget);
    if (disabledWidget) {
        hideWidget(disabledWidget);
    }

    node._denoUpdateAdvancedSourceVisibility = function () {
        const mode = getWidget(this, "mode")?.value ?? KEEP_INPUT_RATIO_MODE;
        toggleWidgetVisibility(getWidget(this, "ratio_preset"), mode === PRESET_MODE);
        toggleWidgetVisibility(getWidget(this, "megapixels"), mode === PRESET_MODE || mode === KEEP_INPUT_RATIO_MODE);
        toggleWidgetVisibility(getWidget(this, "width"), mode === MANUAL_MODE);
        toggleWidgetVisibility(getWidget(this, "height"), mode === MANUAL_MODE);
        this.setDirtyCanvas?.(true, true);
    };

    for (const widget of node.widgets || []) {
        if (widget.__denoAdvancedSourceWrapped) {
            continue;
        }
        const originalCallback = widget.callback;
        widget.callback = function () {
            const result = originalCallback?.apply(this, arguments);
            node._denoUpdateAdvancedSourceVisibility?.();
            return result;
        };
        widget.__denoAdvancedSourceWrapped = true;
    }

    const container = document.createElement("div");
    container.tabIndex = 0;
    container.style.cssText = `
        width: 100%;
        height: ${PANEL_MIN_HEIGHT}px;
        display: flex;
        flex-direction: column;
        gap: ${MASONRY_GAP}px;
        padding: 10px;
        box-sizing: border-box;
        background: rgba(4, 8, 7, 0.96);
        border: 1px solid rgba(72, 255, 132, 0.28);
        border-radius: 12px;
        pointer-events: auto;
        overflow: hidden;
        outline: none;
    `;

    const topBar = document.createElement("div");
    topBar.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";

    const uploadBtn = createActionButton("Upload");
    const pasteBtn = createActionButton("Paste");
    const inputFolderBtn = createActionButton("Input Folder");
    const externalFolderBtn = createActionButton("External Folder");
    const urlPathBtn = createActionButton("URL / Path");
    const clearBtn = createActionButton("Clear", true);
    topBar.append(uploadBtn, pasteBtn, inputFolderBtn, externalFolderBtn, urlPathBtn, clearBtn);

    const countLabel = document.createElement("div");
    countLabel.style.cssText = "margin-left:auto; color:#94f7af; font:600 11px sans-serif;";
    topBar.appendChild(countLabel);

    const hint = document.createElement("div");
    hint.style.cssText = "color:#7dcf92; font:11px sans-serif; opacity:0.9;";
    hint.textContent = "Click a thumbnail to disable it; drag cards to reorder the output.";

    const statusLabel = document.createElement("div");
    statusLabel.style.cssText = "min-height:13px; color:#9dffba; font:700 10px sans-serif; opacity:0.95;";

    const grid = document.createElement("div");
    grid.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
        grid-auto-rows: ${MASONRY_ROW_HEIGHT}px;
        gap: 10px;
        align-content: start;
        align-items: start;
        padding-right: 4px;
    `;

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/*";
    uploadInput.multiple = true;
    uploadInput.style.display = "none";

    const folderUploadInput = document.createElement("input");
    folderUploadInput.type = "file";
    folderUploadInput.accept = "image/*";
    folderUploadInput.multiple = true;
    folderUploadInput.webkitdirectory = true;
    folderUploadInput.setAttribute("directory", "");
    folderUploadInput.style.display = "none";

    container.append(topBar, hint, statusLabel, grid, uploadInput, folderUploadInput);

    function panelHeight() {
        const nodeHeight = Number(node.size?.[1]) || MIN_SIZE[1];
        return Math.max(
            PANEL_MIN_HEIGHT,
            Math.min(PANEL_MAX_HEIGHT, nodeHeight - PANEL_RESERVED_NODE_HEIGHT)
        );
    }

    function refreshPanelHeight() {
        container.style.height = `${panelHeight()}px`;
        requestAnimationFrame(refreshMasonrySpans);
    }

    const widget = node.addDOMWidget("advanced_source_panel", "deno_advanced_image_source_loader", container, { serialize: false });
    widget.computeSize = () => {
        const height = panelHeight();
        container.style.height = `${height}px`;
        return [Math.max(node.size?.[0] ?? 0, MIN_SIZE[0]), height + 12];
    };

    node.size = [
        Math.max(node.size?.[0] ?? 0, MIN_SIZE[0]),
        Math.max(node.size?.[1] ?? 0, MIN_SIZE[1]),
    ];

    const originalOnResize = node.onResize;
    node.onResize = function () {
        const result = originalOnResize?.apply(this, arguments);
        refreshPanelHeight();
        return result;
    };

    let draggedCard = null;
    let placeholder = null;
    let isReordering = false;
    let suppressToggleUntil = 0;

    grid.addEventListener("mousemove", (event) => {
        if (!isReordering) {
            return;
        }
        updatePlaceholderFromPoint(event.clientX, event.clientY);
    }, true);

    grid.addEventListener("pointermove", (event) => {
        if (!isReordering) {
            return;
        }
        updatePlaceholderFromPoint(event.clientX, event.clientY);
    }, true);

    function getPaths() {
        return (pathsWidget.value || "")
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    function getDisabledPaths() {
        return (disabledWidget?.value || "")
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    function setDisabledPaths(paths) {
        if (!disabledWidget) {
            return;
        }
        const activePaths = new Set(getPaths());
        const cleaned = Array.from(new Set(paths.map((entry) => String(entry || "").trim()).filter(Boolean)))
            .filter((entry) => activePaths.has(entry));
        disabledWidget.value = cleaned.join("\n");
        disabledWidget.callback?.(disabledWidget.value);
        render();
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    function setPaths(paths, disabledPaths = getDisabledPaths()) {
        const cleaned = Array.from(new Set(paths.map((entry) => String(entry || "").trim()).filter(Boolean)));
        pathsWidget.value = cleaned.join("\n");
        pathsWidget.callback?.(pathsWidget.value);
        if (disabledWidget) {
            const activePaths = new Set(cleaned);
            const cleanedDisabled = Array.from(new Set(disabledPaths.map((entry) => String(entry || "").trim()).filter(Boolean)))
                .filter((entry) => activePaths.has(entry));
            disabledWidget.value = cleanedDisabled.join("\n");
            disabledWidget.callback?.(disabledWidget.value);
        }
        render();
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    function render() {
        const paths = getPaths();
        const disabled = new Set(getDisabledPaths());
        const enabledCount = paths.filter((path) => !disabled.has(path)).length;
        countLabel.textContent = `${enabledCount}/${paths.length} enabled`;
        grid.replaceChildren(...paths.map((path, index) => buildCard(path, index, disabled.has(path))));
        requestAnimationFrame(refreshMasonrySpans);
    }

    function buildCard(path, index, isDisabled) {
        const card = document.createElement("div");
        card.draggable = false;
        card.dataset.path = path;
        card.dataset.sourceIndex = String(index);
        card.style.cssText = `
            position: relative;
            min-width: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 6px;
            box-sizing: border-box;
            border: 1px solid rgba(72,255,132,0.32);
            border-radius: 8px;
            background: ${isDisabled ? "rgba(5, 8, 7, 0.86)" : "rgba(13, 31, 20, 0.9)"};
            color: #d9ffe5;
            cursor: grab;
            overflow: hidden;
            contain: content;
            content-visibility: auto;
        `;
        applyCardSpan(card, CARD_MIN_HEIGHT);

        const preview = document.createElement("div");
        preview.style.cssText = `
            flex: 1;
            min-height: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            overflow: hidden;
            background: rgba(0,0,0,0.42);
            color: #85d99e;
            font: 700 10px sans-serif;
        `;

        const previewUrl = getPreviewUrl(path);
        if (previewUrl) {
            const image = document.createElement("img");
            image.loading = "lazy";
            image.decoding = "async";
            image.src = previewUrl;
            image.alt = "";
            image.style.cssText = `width:100%; height:100%; object-fit:contain; opacity:${isDisabled ? "0.38" : "1"}; pointer-events:none;`;
            image.onload = () => applyMasonrySpanForImage(card, image);
            image.onerror = () => {
                preview.textContent = getSourceKind(path);
                image.remove();
            };
            preview.appendChild(image);
        } else {
            preview.textContent = getSourceKind(path);
        }

        const name = document.createElement("div");
        name.textContent = path;
        name.title = path;
        name.style.cssText = `
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font: 700 10px sans-serif;
            color: ${isDisabled ? "#7d917f" : "#d9ffe5"};
        `;

        const badge = document.createElement("div");
        badge.textContent = String(index + 1);
        badge.style.cssText = `
            position: absolute;
            left: 6px;
            top: 6px;
            min-width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: rgba(0,0,0,0.68);
            color: #d7ffe3;
            font: 800 10px sans-serif;
            pointer-events: none;
        `;

        const disabledOverlay = document.createElement("div");
        disabledOverlay.textContent = "Disabled";
        disabledOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            display: ${isDisabled ? "flex" : "none"};
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.58);
            color: #dfffea;
            font: 900 12px sans-serif;
            letter-spacing: 0;
            pointer-events: none;
        `;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "x";
        remove.title = "Remove";
        remove.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            width: 20px;
            height: 20px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.24);
            background: rgba(119, 26, 26, 0.95);
            color: white;
            font: 700 12px sans-serif;
            cursor: pointer;
        `;
        remove.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const paths = getPaths();
            const disabledPaths = getDisabledPaths();
            paths.splice(index, 1);
            setPaths(paths, disabledPaths.filter((entry) => entry !== path));
        };

        let pointerState = null;
        card.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || event.target === remove) {
                return;
            }
            const onPointerMove = (moveEvent) => {
                if (!pointerState || pointerState.id !== moveEvent.pointerId) {
                    return;
                }
                const distance = Math.hypot(moveEvent.clientX - pointerState.startX, moveEvent.clientY - pointerState.startY);
                if (!pointerState.active && distance < 7) {
                    return;
                }
                if (!pointerState.active) {
                    pointerState.active = true;
                    startReorder(card);
                }
                updatePlaceholderFromPoint(moveEvent.clientX, moveEvent.clientY);
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
            };
            const onPointerUp = (upEvent) => {
                if (!pointerState || pointerState.id !== upEvent.pointerId) {
                    return;
                }
                window.removeEventListener("pointermove", pointerState.onMove, true);
                window.removeEventListener("pointerup", pointerState.onUp, true);
                const wasActive = pointerState.active;
                pointerState = null;
                card.releasePointerCapture?.(upEvent.pointerId);
                if (wasActive) {
                    updatePlaceholderFromPoint(upEvent.clientX, upEvent.clientY);
                    finalizeReorder();
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                }
            };
            pointerState = {
                id: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                active: false,
                onMove: onPointerMove,
                onUp: onPointerUp,
            };
            card.setPointerCapture?.(event.pointerId);
            window.addEventListener("pointermove", onPointerMove, true);
            window.addEventListener("pointerup", onPointerUp, true);
        });

        card.addEventListener("pointermove", (event) => {
            if (!pointerState || pointerState.id !== event.pointerId) {
                return;
            }
            const distance = Math.hypot(event.clientX - pointerState.startX, event.clientY - pointerState.startY);
            if (!pointerState.active && distance < 7) {
                return;
            }
            if (!pointerState.active) {
                pointerState.active = true;
                startReorder(card);
            }
            updatePlaceholderFromPoint(event.clientX, event.clientY);
            event.preventDefault();
            event.stopPropagation();
        });

        card.addEventListener("pointerup", (event) => {
            if (!pointerState || pointerState.id !== event.pointerId) {
                return;
            }
            window.removeEventListener("pointermove", pointerState.onMove, true);
            window.removeEventListener("pointerup", pointerState.onUp, true);
            const wasActive = pointerState.active;
            pointerState = null;
            card.releasePointerCapture?.(event.pointerId);
            if (wasActive) {
                updatePlaceholderFromPoint(event.clientX, event.clientY);
                finalizeReorder();
                event.preventDefault();
                event.stopPropagation();
            }
        });

        card.addEventListener("pointercancel", (event) => {
            if (!pointerState || pointerState.id !== event.pointerId) {
                return;
            }
            window.removeEventListener("pointermove", pointerState.onMove, true);
            window.removeEventListener("pointerup", pointerState.onUp, true);
            pointerState = null;
            resetReorder();
        });

        card.addEventListener("mousedown", (event) => {
            if (event.button !== 0 || event.target === remove) {
                return;
            }
            const mouseState = {
                startX: event.clientX,
                startY: event.clientY,
                active: false,
            };
            const onMouseMove = (moveEvent) => {
                const distance = Math.hypot(moveEvent.clientX - mouseState.startX, moveEvent.clientY - mouseState.startY);
                if (!mouseState.active && distance < 7) {
                    return;
                }
                if (!mouseState.active) {
                    mouseState.active = true;
                    startReorder(card);
                }
                updatePlaceholderFromPoint(moveEvent.clientX, moveEvent.clientY);
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
            };
            const onMouseUp = (upEvent) => {
                window.removeEventListener("mousemove", onMouseMove, true);
                window.removeEventListener("mouseup", onMouseUp, true);
                if (mouseState.active) {
                    updatePlaceholderFromPoint(upEvent.clientX, upEvent.clientY);
                    finalizeReorder();
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                }
            };
            window.addEventListener("mousemove", onMouseMove, true);
            window.addEventListener("mouseup", onMouseUp, true);
        });

        card.onclick = (event) => {
            if (Date.now() < suppressToggleUntil || event.defaultPrevented) {
                return;
            }
            event.preventDefault();
            const disabledPaths = getDisabledPaths();
            if (disabledPaths.includes(path)) {
                setDisabledPaths(disabledPaths.filter((entry) => entry !== path));
            } else {
                setDisabledPaths(disabledPaths.concat(path));
            }
        };

        card.addEventListener("dragstart", (event) => {
            draggedCard = card;
            placeholder = createPlaceholder();
            isReordering = true;
            card.style.opacity = "0.35";
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", path);
            setTimeout(() => {
                if (card.parentElement) {
                    card.parentElement.insertBefore(placeholder, card.nextSibling);
                }
            }, 0);
        });

        card.addEventListener("dragend", finalizeReorder);

        card.addEventListener("drop", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!draggedCard || draggedCard === card || !placeholder) {
                return;
            }
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
            const insertAfter = horizontalDominant
                ? event.clientX > rect.left + rect.width * 0.42
                : event.clientY > rect.top + rect.height * 0.42;
            grid.insertBefore(placeholder, insertAfter ? card.nextSibling : card);
        });

        card.addEventListener("dragover", (event) => {
            event.preventDefault();
            if (!draggedCard || draggedCard === card || !placeholder) {
                return;
            }
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
            const insertAfter = horizontalDominant
                ? event.clientX > rect.left + rect.width * 0.42
                : event.clientY > rect.top + rect.height * 0.42;
            grid.insertBefore(placeholder, insertAfter ? card.nextSibling : card);
        });

        card.append(preview, name, remove, badge, disabledOverlay);
        return card;
    }

    function createPlaceholder() {
        const placeholderElement = document.createElement("div");
        placeholderElement.style.cssText = `
            min-width: 0;
            height: 100%;
            border: 1px dashed rgba(126,255,166,0.74);
            border-radius: 8px;
            background: rgba(28,68,42,0.34);
            box-sizing: border-box;
        `;
        applyCardSpan(placeholderElement, CARD_MIN_HEIGHT);
        return placeholderElement;
    }

    function startReorder(card) {
        if (isReordering) {
            return;
        }
        draggedCard = card;
        placeholder = createPlaceholder();
        isReordering = true;
        card.style.opacity = "0.35";
        card.style.cursor = "grabbing";
        if (card.parentElement) {
            card.parentElement.insertBefore(placeholder, card.nextSibling);
        }
    }

    function resetReorder() {
        if (draggedCard) {
            draggedCard.style.opacity = "1";
            draggedCard.style.cursor = "grab";
        }
        placeholder?.remove();
        placeholder = null;
        draggedCard = null;
        isReordering = false;
    }

    function finalizeReorder() {
        if (draggedCard) {
            draggedCard.style.opacity = "1";
            draggedCard.style.cursor = "grab";
        }
        if (placeholder?.parentElement && draggedCard) {
            placeholder.parentElement.insertBefore(draggedCard, placeholder);
        }
        const newOrder = Array.from(grid.children)
            .filter((child) => child.dataset?.path)
            .map((child) => child.dataset.path);
        placeholder?.remove();
        placeholder = null;
        draggedCard = null;
        isReordering = false;
        suppressToggleUntil = Date.now() + 180;
        if (newOrder.length) {
            setPaths(newOrder);
        }
    }

    function updatePlaceholderFromPoint(clientX, clientY) {
        if (!draggedCard || !placeholder) {
            return;
        }
        const previousPointerEvents = draggedCard.style.pointerEvents;
        draggedCard.style.pointerEvents = "none";
        const target = document.elementFromPoint(clientX, clientY)?.closest("[data-source-index]");
        draggedCard.style.pointerEvents = previousPointerEvents;
        if (!target || target === draggedCard || !grid.contains(target)) {
            return;
        }
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = clientX - centerX;
        const dy = clientY - centerY;
        const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
        const insertAfter = horizontalDominant
            ? clientX > rect.left + rect.width * 0.42
            : clientY > rect.top + rect.height * 0.42;
        grid.insertBefore(placeholder, insertAfter ? target.nextSibling : target);
    }

    function applyCardSpan(card, height) {
        const safeHeight = Math.max(CARD_MIN_HEIGHT, Math.min(CARD_MAX_HEIGHT, Number(height) || CARD_MIN_HEIGHT));
        const span = Math.ceil((safeHeight + MASONRY_GAP) / (MASONRY_ROW_HEIGHT + MASONRY_GAP));
        card.style.gridRowEnd = `span ${Math.max(1, span)}`;
    }

    function applyMasonrySpanForImage(card, image) {
        if (!image?.naturalWidth || !image?.naturalHeight) {
            applyCardSpan(card, CARD_MIN_HEIGHT);
            return;
        }
        const cardWidth = Math.max(96, card.offsetWidth || card.clientWidth || parseFloat(getComputedStyle(card).width) || 112);
        const imageRatio = image.naturalHeight / Math.max(1, image.naturalWidth);
        const previewHeight = Math.max(96, Math.min(282, Math.round(cardWidth * imageRatio)));
        applyCardSpan(card, previewHeight + 38);
    }

    function refreshMasonrySpans() {
        for (const card of grid.querySelectorAll("[data-source-index]")) {
            const image = card.querySelector("img");
            if (image?.complete && image.naturalWidth) {
                applyMasonrySpanForImage(card, image);
            } else {
                applyCardSpan(card, CARD_MIN_HEIGHT);
            }
        }
    }

    function setStatus(message) {
        statusLabel.textContent = message || "";
    }

    function clipboardFilesFromData(clipboardData) {
        const files = Array.from(clipboardData?.files || []).filter((file) => IMAGE_RE.test(file.name || "") || /^image\//i.test(file.type || ""));
        if (files.length) {
            return files;
        }
        return Array.from(clipboardData?.items || [])
            .filter((item) => /^image\//i.test(item.type || ""))
            .map((item, index) => item.getAsFile?.() || null)
            .filter(Boolean)
            .map((file, index) => file.name ? file : new File([file], `clipboard-${Date.now()}-${index}.png`, { type: file.type || "image/png" }));
    }

    async function readClipboardImageFiles() {
        if (!navigator.clipboard?.read) {
            return [];
        }
        const items = await navigator.clipboard.read();
        const files = [];
        for (const item of items) {
            for (const type of item.types || []) {
                if (!/^image\//i.test(type)) {
                    continue;
                }
                const blob = await item.getType(type);
                const extension = type.split("/").pop()?.replace("jpeg", "jpg") || "png";
                files.push(new File([blob], `clipboard-${Date.now()}-${files.length}.${extension}`, { type }));
            }
        }
        return files;
    }

    function focusPanelForPaste() {
        container.focus({ preventScroll: true });
        setStatus("Press Ctrl+V while the panel is focused.");
    }

    async function uploadFiles(fileList, subfolderForFile = null) {
        const uploaded = [];
        for (const file of Array.from(fileList || [])) {
            if (!IMAGE_RE.test(file.name || "")) {
                continue;
            }
            const body = new FormData();
            body.append("image", file);
            const subfolder = subfolderForFile?.(file);
            if (subfolder) {
                body.append("subfolder", subfolder);
            }
            const response = await api.fetchApi("/upload/image", { method: "POST", body });
            if (response.status !== 200) {
                continue;
            }
            const payload = await response.json();
            uploaded.push(payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name);
        }
        if (uploaded.length) {
            setPaths(getPaths().concat(uploaded));
            setStatus(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} added.`);
        } else {
            setStatus("No image file found.");
        }
        return uploaded;
    }

    uploadBtn.onclick = () => uploadInput.click();
    pasteBtn.onclick = async () => {
        try {
            const files = await readClipboardImageFiles();
            if (files.length) {
                await uploadFiles(files);
                return;
            }
        } catch (error) {
            console.warn("[DenoAdvancedImageSourceLoader] Clipboard read failed.", error);
        }
        focusPanelForPaste();
    };
    uploadInput.onchange = async (event) => {
        await uploadFiles(event.target.files);
        uploadInput.value = "";
    };

    clearBtn.onclick = () => setPaths([]);
    inputFolderBtn.onclick = () => showInputFolderBrowser(node, setPaths, getPaths);
    externalFolderBtn.onclick = () => showExternalFolderBrowser(node, setPaths, getPaths, folderUploadInput, uploadFiles);
    urlPathBtn.onclick = () => showSourceTextDialog(node, setPaths, getPaths);

    container.ondragover = (event) => {
        if (isReordering) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };
    container.ondrop = async (event) => {
        if (isReordering) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer?.files?.length) {
            await uploadFiles(event.dataTransfer.files);
        }
    };
    container.addEventListener("paste", async (event) => {
        const files = clipboardFilesFromData(event.clipboardData);
        if (files.length) {
            event.preventDefault();
            await uploadFiles(files);
        } else {
            setStatus("Clipboard does not contain an image.");
        }
    });

    node.__denoAdvancedPanCleanup?.();
    node.__denoAdvancedPanCleanup = installMiddleMouseCanvasPan(container);
    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        this.__denoCloseAdvancedFolderBrowser?.();
        this.__denoCloseAdvancedFolderBrowser = null;
        this.__denoAdvancedPanCleanup?.();
        this.__denoAdvancedPanCleanup = null;
        return originalOnRemoved?.apply(this, arguments);
    };

    setTimeout(() => {
        node._denoUpdateAdvancedSourceVisibility?.();
        refreshPanelHeight();
        render();
    }, 0);
}

function installMiddleMouseCanvasPan(root) {
    let forwardingPan = false;
    let cleanedUp = false;

    const forward = (event) => {
        const canvas = app.canvas?.canvas;
        if (!canvas) {
            return false;
        }
        const forwarded = new MouseEvent(event.type, {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: event.detail,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: event.buttons,
            relatedTarget: event.relatedTarget,
        });
        canvas.dispatchEvent(forwarded);
        return true;
    };

    const shouldForward = (event) => event.button === 1 || forwardingPan || (event.buttons & 4) === 4;
    const consume = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const onMouseDown = (event) => {
        if (!shouldForward(event)) {
            return;
        }
        forwardingPan = true;
        if (forward(event)) {
            consume(event);
        }
    };

    const onRootMouseMove = (event) => {
        if (!shouldForward(event)) {
            return;
        }
        if (forward(event)) {
            consume(event);
        }
    };

    const onWindowMouseMove = (event) => {
        if (!forwardingPan) {
            return;
        }
        if (forward(event)) {
            consume(event);
        }
    };

    const onWindowMouseUp = (event) => {
        if (!forwardingPan) {
            return;
        }
        if (forward(event)) {
            consume(event);
        }
        if (event.button === 1 || (event.buttons & 4) !== 4) {
            forwardingPan = false;
        }
    };

    const onAuxClick = (event) => {
        if (event.button === 1) {
            consume(event);
        }
    };

    root.addEventListener("mousedown", onMouseDown, true);
    root.addEventListener("mousemove", onRootMouseMove, true);
    window.addEventListener("mousemove", onWindowMouseMove, true);
    window.addEventListener("mouseup", onWindowMouseUp, true);
    root.addEventListener("auxclick", onAuxClick, true);

    return () => {
        if (cleanedUp) {
            return;
        }
        cleanedUp = true;
        forwardingPan = false;
        root.removeEventListener("mousedown", onMouseDown, true);
        root.removeEventListener("mousemove", onRootMouseMove, true);
        window.removeEventListener("mousemove", onWindowMouseMove, true);
        window.removeEventListener("mouseup", onWindowMouseUp, true);
        root.removeEventListener("auxclick", onAuxClick, true);
    };
}

function showInputFolderBrowser(node, setPaths, getPaths) {
    showBrowserModal({
        ownerNode: node,
        title: "Add images from ComfyUI input folder",
        rootControls: null,
        initialStatus: "Loading input folder list...",
        fetchEntries: fetchInputFolderImages,
        getPreviewUrl: inputImagePreviewUrl,
        getSourceValue: (entry) => entry.name,
        setPaths,
        getPaths,
    });
}

function showExternalFolderBrowser(node, setPaths, getPaths, folderUploadInput, uploadFiles) {
    const rootRow = document.createElement("div");
    rootRow.style.cssText = "display:flex; gap:8px; align-items:center;";

    const rootInput = document.createElement("input");
    rootInput.type = "text";
    rootInput.placeholder = "Paste an absolute folder path, for example D:\\Images\\Project";
    rootInput.value = String(node.__denoAdvancedLastExternalRoot || "");
    rootInput.style.cssText = inputStyle();

    const loadBtn = createActionButton("Load Path");
    const uploadFolderBtn = createActionButton("Upload Folder...");
    rootRow.append(rootInput, loadBtn, uploadFolderBtn);

    let refresh = null;
    loadBtn.onclick = () => refresh?.("");
    uploadFolderBtn.onclick = () => folderUploadInput.click();
    const onFolderUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        const firstPath = String(files[0]?.webkitRelativePath || "");
        const rootName = sanitizePathPart(firstPath.split("/")[0] || "selected-folder");
        const uploadRoot = `deno_advanced_folder_uploads/${Date.now()}_${rootName}`;
        await uploadFiles(files, (file) => {
            const relativePath = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
            const parts = relativePath.split("/").filter(Boolean);
            parts.pop();
            const folderParts = parts.slice(1).map(sanitizePathPart).filter(Boolean);
            return [uploadRoot].concat(folderParts).join("/");
        });
        folderUploadInput.value = "";
    };
    folderUploadInput.onchange = onFolderUpload;

    refresh = showBrowserModal({
        ownerNode: node,
        title: "Add images from an external folder",
        rootControls: rootRow,
        initialStatus: "Paste a folder path and click Load Path, or use Upload Folder... to import a folder.",
        fetchEntries: async (folderPath, signal) => {
            const rootPath = String(rootInput.value || "").trim();
            return fetchExternalFolderImagesAndRemember(node, rootPath, folderPath, signal);
        },
        getPreviewUrl: (entry) => externalImagePreviewUrl(entry.path),
        getSourceValue: (entry) => entry.path,
        setPaths,
        getPaths,
        waitForManualLoad: true,
        onClose: () => {
            if (folderUploadInput.onchange === onFolderUpload) {
                folderUploadInput.onchange = null;
            }
        },
    });
}

function showSourceTextDialog(node, setPaths, getPaths) {
    node?.__denoCloseAdvancedFolderBrowser?.();
    let closed = false;
    const overlay = createOverlay();
    const modal = createModal("Add URLs or file paths");

    const text = document.createElement("textarea");
    text.placeholder = "Paste one image URL, full file path, input-folder path, or folder path per line.";
    text.value = "";
    text.style.cssText = `
        width: 100%;
        height: 180px;
        resize: vertical;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(126, 255, 166, 0.34);
        background: rgba(1, 6, 4, 0.95);
        color: #d9ffe5;
        padding: 10px;
        font: 12px sans-serif;
        outline: none;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; justify-content:flex-end; gap:8px;";
    const cancelBtn = createActionButton("Cancel");
    const addBtn = createActionButton("Add Sources");
    footer.append(cancelBtn, addBtn);

    const close = () => {
        if (closed) {
            return;
        }
        closed = true;
        overlay.remove();
        if (node?.__denoCloseAdvancedFolderBrowser === close) {
            node.__denoCloseAdvancedFolderBrowser = null;
        }
    };
    if (node) {
        node.__denoCloseAdvancedFolderBrowser = close;
    }
    cancelBtn.onclick = close;
    addBtn.onclick = () => {
        if (closed) {
            return;
        }
        const added = text.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        setPaths(getPaths().concat(added));
        close();
    };

    modal.append(text, footer);
    overlay.append(modal);
    document.body.appendChild(overlay);
    text.focus();
}

function showBrowserModal(options) {
    const ownerNode = options.ownerNode;
    ownerNode?.__denoCloseAdvancedFolderBrowser?.();
    const requestGate = createLatestRequestGate();
    let closed = false;
    const overlay = createOverlay();
    const modal = createModal(options.title);

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search folders or images...";
    search.style.cssText = inputStyle();

    const status = document.createElement("div");
    status.textContent = options.initialStatus;
    status.style.cssText = "color:#94f7af; font:600 11px sans-serif;";

    const pathRow = document.createElement("div");
    pathRow.style.cssText = "display:flex; align-items:center; gap:8px; color:#b7ffd0; font:700 12px sans-serif;";
    const parentBtn = createActionButton("Parent");
    const currentPath = document.createElement("span");
    currentPath.textContent = "root";
    pathRow.append(parentBtn, currentPath);

    const list = document.createElement("div");
    list.style.cssText = `
        flex: 1;
        min-height: 260px;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
        gap: 10px;
        align-content: start;
        padding: 8px;
        border-radius: 10px;
        background: rgba(0, 6, 3, 0.5);
    `;

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px;";
    const selectedLabel = document.createElement("div");
    selectedLabel.style.cssText = "color:#94f7af; font:700 12px sans-serif;";
    const addBtn = createActionButton("Add Selected");
    footer.append(selectedLabel, addBtn);

    const header = modal.firstElementChild;
    const closeBtn = header?.querySelector("button");
    const closeModal = () => {
        if (closed) {
            return;
        }
        closed = true;
        requestGate.dispose();
        overlay.remove();
        options.onClose?.();
        if (ownerNode?.__denoCloseAdvancedFolderBrowser === closeModal) {
            ownerNode.__denoCloseAdvancedFolderBrowser = null;
        }
    };
    closeBtn.onclick = closeModal;
    if (ownerNode) {
        ownerNode.__denoCloseAdvancedFolderBrowser = closeModal;
    }

    if (options.rootControls) {
        modal.append(options.rootControls);
    }
    modal.append(pathRow, search, status, list, footer);
    overlay.append(modal);
    document.body.appendChild(overlay);

    let currentFolder = "";
    let parentFolder = "";
    let folders = [];
    let files = [];
    const selected = new Set();

    const refreshSelected = () => {
        selectedLabel.textContent = `${selected.size} selected`;
        addBtn.disabled = selected.size === 0;
        addBtn.style.opacity = selected.size ? "1" : "0.55";
    };

    const render = () => {
        const query = search.value.trim().toLowerCase();
        currentPath.textContent = currentFolder || "root";
        const folderEntries = folders.map((entry) => ({ ...entry, type: "folder" }));
        const fileEntries = files.map((entry) => ({ ...entry, type: "file" }));
        const entries = folderEntries.concat(fileEntries).filter((entry) => {
            const label = String(entry.display_name || entry.name || entry.path || "").toLowerCase();
            return !query || label.includes(query);
        });

        list.replaceChildren(...entries.map((entry) => {
            const card = document.createElement("div");
            const isFolder = entry.type === "folder";
            const value = isFolder ? "" : options.getSourceValue(entry);
            card.style.cssText = `
                min-width: 0;
                height: 104px;
                display: flex;
                flex-direction: column;
                gap: 5px;
                padding: 6px;
                box-sizing: border-box;
                border: 1px solid ${selected.has(value) ? "rgba(72,255,132,0.95)" : "rgba(72,255,132,0.32)"};
                border-radius: 8px;
                background: ${selected.has(value) ? "rgba(21, 78, 43, 0.96)" : "rgba(13, 31, 20, 0.92)"};
                color: #d9ffe5;
                cursor: pointer;
                overflow: hidden;
            `;

            const preview = document.createElement("div");
            preview.style.cssText = `
                flex: 1;
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                overflow: hidden;
                background: rgba(0,0,0,0.42);
                color: #a4f9bd;
                font: 700 11px sans-serif;
            `;

            if (isFolder) {
                preview.textContent = "Folder";
            } else {
                const previewUrl = options.getPreviewUrl(entry);
                if (previewUrl) {
                    const image = document.createElement("img");
                    image.loading = "eager";
                    image.decoding = "async";
                    image.src = previewUrl;
                    image.alt = "";
                    image.style.cssText = "width:100%; height:100%; object-fit:contain;";
                    image.onerror = () => {
                        preview.textContent = "Image";
                        image.remove();
                    };
                    preview.appendChild(image);
                } else {
                    preview.textContent = "Image";
                }
            }

            const label = document.createElement("div");
            label.textContent = entry.display_name || entry.name || entry.path || "";
            label.title = label.textContent;
            label.style.cssText = "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font:700 10px sans-serif;";

            card.ondblclick = () => {
                if (isFolder) {
                    loadFolder(entry.path || "");
                }
            };
            card.onclick = () => {
                if (isFolder) {
                    return;
                }
                if (selected.has(value)) {
                    selected.delete(value);
                } else {
                    selected.add(value);
                }
                refreshSelected();
                render();
            };

            card.append(preview, label);
            return card;
        }));

        status.textContent = `${folders.length} folder${folders.length === 1 ? "" : "s"}, ${files.length} image${files.length === 1 ? "" : "s"} found`;
        refreshSelected();
    };

    const loadFolder = async (folderPath = "") => {
        const request = requestGate.start();
        status.textContent = "Loading...";
        try {
            const payload = await options.fetchEntries(folderPath, request.signal);
            if (!request.isCurrent() || closed || !overlay.isConnected) {
                return;
            }
            currentFolder = normalizeSlashPath(payload.path || folderPath || "");
            parentFolder = normalizeSlashPath(payload.parent || "");
            folders = payload.folders || [];
            files = payload.files || [];
            render();
        } catch (error) {
            if (!request.isCurrent() || closed || error?.name === "AbortError") {
                return;
            }
            status.textContent = error.message || String(error);
            folders = [];
            files = [];
            list.replaceChildren();
        }
    };

    parentBtn.onclick = () => loadFolder(parentFolder);
    search.oninput = render;
    addBtn.onclick = () => {
        options.setPaths(options.getPaths().concat(Array.from(selected)));
        closeModal();
    };

    if (!options.waitForManualLoad) {
        loadFolder("");
    }

    return loadFolder;
}

async function fetchInputFolderImages(folderPath = "", signal = undefined) {
    const path = normalizeSlashPath(folderPath);
    const endpoint = path
        ? `/deno/input-folder-images?path=${encodeURIComponent(path)}`
        : "/deno/input-folder-images";
    const response = await api.fetchApi(endpoint, { cache: "no-store", signal });
    if (response.status !== 200) {
        throw new Error(`Input folder list failed (${response.status})`);
    }
    const payload = await response.json();
    return {
        path: normalizeSlashPath(payload.path || path),
        parent: normalizeSlashPath(payload.parent || ""),
        folders: (payload.folders || []).map((entry) => ({
            name: entry.name || entry.path || "",
            path: normalizeSlashPath(entry.path || entry.name || ""),
        })).filter((entry) => entry.path),
        files: (payload.files || []).map((entry) => ({
            name: normalizeSlashPath(entry.name || ""),
            display_name: entry.display_name || String(entry.name || "").split("/").pop() || entry.name,
        })).filter((entry) => entry.name && IMAGE_RE.test(entry.name)),
    };
}

async function fetchExternalFolderImages(rootPath, folderPath = "", signal = undefined) {
    const root = String(rootPath || "").trim();
    if (!root) {
        throw new Error("Paste a folder path first.");
    }
    const params = new URLSearchParams({ root, path: normalizeSlashPath(folderPath) });
    const response = await api.fetchApi(`/deno/advanced/external-folder-images?${params.toString()}`, { cache: "no-store", signal });
    if (response.status !== 200) {
        let message = `External folder list failed (${response.status})`;
        try {
            const payload = await response.json();
            message = payload.error || message;
        } catch {
            // Keep the generic HTTP message.
        }
        throw new Error(message);
    }
    const payload = await response.json();
    return {
        path: normalizeSlashPath(payload.path || folderPath),
        parent: normalizeSlashPath(payload.parent || ""),
        folders: (payload.folders || []).map((entry) => ({
            name: entry.name || entry.path || "",
            path: normalizeSlashPath(entry.path || entry.name || ""),
        })).filter((entry) => entry.path),
        files: (payload.files || []).map((entry) => ({
            name: entry.name || entry.path || "",
            display_name: entry.display_name || String(entry.name || entry.path || "").split(/[\\/]/).pop(),
            path: entry.path || "",
        })).filter((entry) => entry.path && IMAGE_RE.test(entry.path)),
    };
}

async function fetchExternalFolderImagesAndRemember(node, rootPath, folderPath = "", signal = undefined) {
    const root = String(rootPath || "").trim();
    const payload = await fetchExternalFolderImages(root, folderPath, signal);
    if (signal?.aborted) {
        const error = new Error("Request aborted");
        error.name = "AbortError";
        throw error;
    }
    node.__denoAdvancedLastExternalRoot = root;
    return payload;
}

function inputImagePreviewUrl(path) {
    const normalized = normalizeSlashPath(path);
    const parts = normalized.split("/").filter(Boolean);
    const filename = parts.pop() || normalized;
    const subfolder = parts.join("/");
    const params = new URLSearchParams({ filename, type: "input" });
    if (subfolder) {
        params.set("subfolder", subfolder);
    }
    return `/api/view?${params.toString()}`;
}

function externalImagePreviewUrl(path) {
    if (!path) {
        return "";
    }
    return `/deno/advanced/external-image-view?path=${encodeURIComponent(path)}`;
}

function getPreviewUrl(path) {
    const text = String(path || "").trim();
    const location = classifySourceLocation(text);
    if (location === "url") {
        return text;
    }
    if (location === "external") {
        return externalImagePreviewUrl(text);
    }
    if (IMAGE_RE.test(text)) {
        return inputImagePreviewUrl(text);
    }
    return "";
}

function getSourceKind(path) {
    const location = classifySourceLocation(path);
    if (location === "url") {
        return "URL";
    }
    if (location === "external") {
        return "Path";
    }
    return "Image";
}

function classifySourceLocation(path) {
    const text = String(path || "").trim();
    if (/^https?:\/\//i.test(text)) {
        return "url";
    }
    if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\") || text.startsWith("/")) {
        return "external";
    }
    return "input";
}

function createLatestRequestGate() {
    let generation = 0;
    let controller = null;
    let disposed = false;

    const invalidate = () => {
        generation += 1;
        controller?.abort();
        controller = null;
    };

    return {
        start() {
            invalidate();
            const requestGeneration = generation;
            controller = new AbortController();
            if (disposed) {
                controller.abort();
            }
            const signal = controller.signal;
            return {
                signal,
                isCurrent: () => !disposed && !signal.aborted && requestGeneration === generation,
            };
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            invalidate();
        },
    };
}

function createOverlay() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.48);
        pointer-events: auto;
    `;
    return overlay;
}

function createModal(titleText) {
    const modal = document.createElement("div");
    modal.style.cssText = `
        width: min(820px, calc(100vw - 48px));
        max-height: min(760px, calc(100vh - 48px));
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid rgba(72, 255, 132, 0.42);
        border-radius: 16px;
        background: rgba(3, 12, 8, 0.98);
        box-shadow: 0 24px 80px rgba(0,0,0,0.55);
        pointer-events: auto;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; gap:12px;";

    const title = document.createElement("div");
    title.textContent = titleText;
    title.style.cssText = "flex:1; color:#9dffb8; font:800 16px sans-serif;";

    const close = createActionButton("Close");
    close.onclick = () => modal.parentElement?.remove();
    header.append(title, close);
    modal.append(header);
    return modal;
}

function createActionButton(label, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border: 1px solid ${danger ? "rgba(255,150,150,0.45)" : "rgba(126,255,166,0.38)"};
        border-radius: 999px;
        padding: 7px 12px;
        cursor: pointer;
        white-space: nowrap;
        font: 800 11px sans-serif;
        color: ${danger ? "#ffdada" : "#d9ffe5"};
        background: ${danger ? "rgba(119,26,26,0.95)" : "rgba(22,58,35,0.95)"};
    `;
    return button;
}

function inputStyle() {
    return `
        flex: 1;
        min-width: 0;
        height: 36px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid rgba(126,255,166,0.34);
        background: rgba(1, 6, 4, 0.95);
        color: #d9ffe5;
        padding: 0 10px;
        outline: none;
        font: 12px sans-serif;
    `;
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    if (widget.element) {
        widget.element.style.display = "none";
    }
}

function toggleWidgetVisibility(widget, visible) {
    if (!widget) {
        return;
    }
    widget.hidden = !visible;
    widget.computeSize = visible ? undefined : () => [0, -4];
    if (widget.element) {
        widget.element.style.display = visible ? "" : "none";
    }
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function normalizeSlashPath(path) {
    return String(path || "")
        .replace(/\\/g, "/")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .join("/");
}

function sanitizePathPart(value) {
    return String(value || "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/^\.+$/, "_")
        .trim()
        .slice(0, 80) || "folder";
}

if (typeof window !== "undefined" && typeof window.__DENO_ADVANCED_IMAGE_SOURCE_TEST_HOOK__ === "function") {
    window.__DENO_ADVANCED_IMAGE_SOURCE_TEST_HOOK__({
        classifySourceLocation,
        fetchExternalFolderImagesAndRemember,
        getPreviewUrl,
        getSourceKind,
        installMiddleMouseCanvasPan,
        createLatestRequestGate,
    });
}
