import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const ADVANCED_NODE = "DenoAdvancedImageSourceLoader";
const MIN_SIZE = [520, 620];
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
    if (!pathsWidget || node.__denoAdvancedSourceReady) {
        return;
    }

    node.__denoAdvancedSourceReady = true;
    hideWidget(pathsWidget);

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
    container.style.cssText = `
        width: 100%;
        height: 360px;
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
    topBar.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";

    const uploadBtn = createActionButton("Upload");
    const inputFolderBtn = createActionButton("Input Folder");
    const externalFolderBtn = createActionButton("External Folder");
    const urlPathBtn = createActionButton("URL / Path");
    const clearBtn = createActionButton("Clear", true);
    topBar.append(uploadBtn, inputFolderBtn, externalFolderBtn, urlPathBtn, clearBtn);

    const countLabel = document.createElement("div");
    countLabel.style.cssText = "margin-left:auto; color:#94f7af; font:600 11px sans-serif;";
    topBar.appendChild(countLabel);

    const hint = document.createElement("div");
    hint.style.cssText = "color:#7dcf92; font:11px sans-serif; opacity:0.9;";
    hint.textContent = "Use this separate loader for input images, external folders, full paths, web URLs, or mixed-size image lists.";

    const grid = document.createElement("div");
    grid.style.cssText = `
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
        gap: 10px;
        align-content: start;
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

    container.append(topBar, hint, grid, uploadInput, folderUploadInput);

    const widget = node.addDOMWidget("advanced_source_panel", "deno_advanced_image_source_loader", container, { serialize: false });
    widget.computeSize = () => [Math.max(node.size?.[0] ?? 0, MIN_SIZE[0]), 372];

    node.size = [
        Math.max(node.size?.[0] ?? 0, MIN_SIZE[0]),
        Math.max(node.size?.[1] ?? 0, MIN_SIZE[1]),
    ];

    function getPaths() {
        return (pathsWidget.value || "")
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    function setPaths(paths) {
        const cleaned = Array.from(new Set(paths.map((entry) => String(entry || "").trim()).filter(Boolean)));
        pathsWidget.value = cleaned.join("\n");
        pathsWidget.callback?.(pathsWidget.value);
        render();
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    function render() {
        const paths = getPaths();
        countLabel.textContent = `${paths.length} source${paths.length === 1 ? "" : "s"}`;
        grid.replaceChildren(...paths.map((path, index) => buildCard(path, index)));
    }

    function buildCard(path, index) {
        const card = document.createElement("div");
        card.style.cssText = `
            position: relative;
            min-width: 0;
            height: 116px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 6px;
            border: 1px solid rgba(72,255,132,0.32);
            border-radius: 8px;
            background: rgba(13, 31, 20, 0.9);
            color: #d9ffe5;
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
            color: #85d99e;
            font: 700 10px sans-serif;
        `;

        const previewUrl = getPreviewUrl(path);
        if (previewUrl) {
            const image = document.createElement("img");
            image.loading = "eager";
            image.decoding = "async";
            image.src = previewUrl;
            image.alt = "";
            image.style.cssText = "width:100%; height:100%; object-fit:cover;";
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
            color: #d9ffe5;
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
            paths.splice(index, 1);
            setPaths(paths);
        };

        card.append(preview, name, remove);
        return card;
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
        }
        return uploaded;
    }

    uploadBtn.onclick = () => uploadInput.click();
    uploadInput.onchange = async (event) => {
        await uploadFiles(event.target.files);
        uploadInput.value = "";
    };

    clearBtn.onclick = () => setPaths([]);
    inputFolderBtn.onclick = () => showInputFolderBrowser(setPaths, getPaths);
    externalFolderBtn.onclick = () => showExternalFolderBrowser(setPaths, getPaths, folderUploadInput, uploadFiles);
    urlPathBtn.onclick = () => showSourceTextDialog(setPaths, getPaths);

    container.ondragover = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };
    container.ondrop = async (event) => {
        event.preventDefault();
        if (event.dataTransfer?.files?.length) {
            await uploadFiles(event.dataTransfer.files);
        }
    };
    container.addEventListener("paste", async (event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (files.length) {
            await uploadFiles(files);
        }
    });

    setTimeout(() => {
        node._denoUpdateAdvancedSourceVisibility?.();
        render();
    }, 0);
}

function showInputFolderBrowser(setPaths, getPaths) {
    showBrowserModal({
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

function showExternalFolderBrowser(setPaths, getPaths, folderUploadInput, uploadFiles) {
    const rootRow = document.createElement("div");
    rootRow.style.cssText = "display:flex; gap:8px; align-items:center;";

    const rootInput = document.createElement("input");
    rootInput.type = "text";
    rootInput.placeholder = "Paste an absolute folder path, for example D:\\Images\\Project";
    rootInput.style.cssText = inputStyle();

    const loadBtn = createActionButton("Load Path");
    const uploadFolderBtn = createActionButton("Upload Folder...");
    rootRow.append(rootInput, loadBtn, uploadFolderBtn);

    let refresh = null;
    loadBtn.onclick = () => refresh?.("");
    uploadFolderBtn.onclick = () => folderUploadInput.click();
    folderUploadInput.onchange = async (event) => {
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

    refresh = showBrowserModal({
        title: "Add images from an external folder",
        rootControls: rootRow,
        initialStatus: "Paste a folder path and click Load Path, or use Upload Folder... to import a folder.",
        fetchEntries: (folderPath) => fetchExternalFolderImages(rootInput.value, folderPath),
        getPreviewUrl: (entry) => externalImagePreviewUrl(entry.path),
        getSourceValue: (entry) => entry.path,
        setPaths,
        getPaths,
        waitForManualLoad: true,
    });
}

function showSourceTextDialog(setPaths, getPaths) {
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

    cancelBtn.onclick = () => overlay.remove();
    addBtn.onclick = () => {
        const added = text.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        setPaths(getPaths().concat(added));
        overlay.remove();
    };

    modal.append(text, footer);
    overlay.append(modal);
    document.body.appendChild(overlay);
    text.focus();
}

function showBrowserModal(options) {
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
    closeBtn.onclick = () => overlay.remove();

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
                    image.style.cssText = "width:100%; height:100%; object-fit:cover;";
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
        status.textContent = "Loading...";
        try {
            const payload = await options.fetchEntries(folderPath);
            currentFolder = normalizeSlashPath(payload.path || folderPath || "");
            parentFolder = normalizeSlashPath(payload.parent || "");
            folders = payload.folders || [];
            files = payload.files || [];
            render();
        } catch (error) {
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
        overlay.remove();
    };

    if (!options.waitForManualLoad) {
        loadFolder("");
    }

    return loadFolder;
}

async function fetchInputFolderImages(folderPath = "") {
    const path = normalizeSlashPath(folderPath);
    const endpoint = path
        ? `/deno/input-folder-images?path=${encodeURIComponent(path)}`
        : "/deno/input-folder-images";
    const response = await api.fetchApi(endpoint, { cache: "no-store" });
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

async function fetchExternalFolderImages(rootPath, folderPath = "") {
    const root = String(rootPath || "").trim();
    if (!root) {
        throw new Error("Paste a folder path first.");
    }
    const params = new URLSearchParams({ root, path: normalizeSlashPath(folderPath) });
    const response = await api.fetchApi(`/deno/advanced/external-folder-images?${params.toString()}`, { cache: "no-store" });
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
    if (/^https?:\/\//i.test(text)) {
        return text;
    }
    if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\")) {
        return externalImagePreviewUrl(text);
    }
    if (IMAGE_RE.test(text)) {
        return inputImagePreviewUrl(text);
    }
    return "";
}

function getSourceKind(path) {
    const text = String(path || "");
    if (/^https?:\/\//i.test(text)) {
        return "URL";
    }
    if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\")) {
        return "Path";
    }
    return "Image";
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
