import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoLTX8GBModelDownloader";
const MIN_SIZE = [430, 380];
const POLL_MS = 1000;

app.registerExtension({
    name: "Deno.LTX8GBDownloader",
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
    if (!node || node.type !== NODE_NAME || node.__denoLtx8gbReady) {
        return;
    }
    const folderWidget = getWidget(node, "models_folder");
    if (!folderWidget) {
        return;
    }

    node.__denoLtx8gbReady = true;
    node.serialize_widgets = true;
    hideWidget(folderWidget);

    const ui = buildUi(node, folderWidget);
    const domWidget = node.addDOMWidget("deno_ltx8gb_panel", "deno_ltx8gb_panel", ui.root, { serialize: false });
    domWidget.computeSize = () => [Math.max(node.size?.[0] ?? MIN_SIZE[0], MIN_SIZE[0]), MIN_SIZE[1] + 8];
    node.size = [
        Math.max(node.size?.[0] ?? MIN_SIZE[0], MIN_SIZE[0]),
        Math.max(node.size?.[1] ?? MIN_SIZE[1], MIN_SIZE[1]),
    ];
    node.setDirtyCanvas?.(true, true);

    ui.refreshInfo();
}

function buildUi(node, folderWidget) {
    const root = document.createElement("div");
    root.style.cssText = `
        width: 100%;
        height: 372px;
        box-sizing: border-box;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(80,255,142,0.25);
        background: linear-gradient(180deg, rgba(5,13,9,0.98), rgba(3,7,5,0.96));
        color: #dfffe8;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow: hidden;
        font: 11px sans-serif;
    `;

    const title = document.createElement("div");
    title.style.cssText = "font: 700 13px sans-serif; color:#9dffc0;";
    title.textContent = "LTX 2.3 8GB VRAM model set";

    const hint = document.createElement("div");
    hint.style.cssText = "color:#8fcfa4; line-height:1.35;";
    hint.textContent = "Choose your ComfyUI models folder, then download the GGUF beginner set. Existing files are skipped.";

    const pathRow = document.createElement("div");
    pathRow.style.cssText = "display:flex; gap:6px; align-items:center;";

    const pathText = document.createElement("div");
    pathText.style.cssText = `
        flex: 1;
        min-width: 0;
        padding: 5px 8px;
        border-radius: 8px;
        background: rgba(0,0,0,0.42);
        border: 1px solid rgba(108,255,158,0.18);
        color: #ccf8d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const chooseButton = createButton("Choose folder");
    const downloadButton = createButton("Download", false, true);
    pathRow.append(pathText, chooseButton);

    const progressOuter = document.createElement("div");
    progressOuter.style.cssText = `
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(85,255,145,0.42);
        background: rgba(0,0,0,0.55);
        overflow: hidden;
        position: relative;
    `;
    const progressFill = document.createElement("div");
    progressFill.style.cssText = `
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, #1dbf65, #7affad);
        transition: width 180ms ease;
    `;
    const progressLabel = document.createElement("div");
    progressLabel.style.cssText = `
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#eaffef;
        font: 700 11px sans-serif;
        text-shadow: 0 1px 2px #000;
    `;
    progressOuter.append(progressFill, progressLabel);

    const fileList = document.createElement("div");
    fileList.style.cssText = `
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow: auto;
        padding-right: 2px;
    `;

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex; gap:8px; align-items:center;";
    const status = document.createElement("div");
    status.style.cssText = "flex:1; min-width:0; color:#94f7af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    bottomRow.append(downloadButton, status);

    root.append(title, hint, pathRow, progressOuter, fileList, bottomRow);

    const state = {
        files: [],
        jobId: "",
        polling: null,
        busy: false,
    };

    function setStatus(text, danger = false) {
        status.textContent = text;
        status.style.color = danger ? "#ffb0b0" : "#94f7af";
    }

    function setFolder(value) {
        const next = String(value || "").trim();
        folderWidget.value = next;
        folderWidget.callback?.(next);
        node.properties = node.properties || {};
        node.properties.models_folder = next;
        pathText.textContent = next || "No models folder selected";
        node.setDirtyCanvas?.(true, true);
    }

    function setBusy(value) {
        state.busy = value;
        chooseButton.disabled = value;
        downloadButton.disabled = value;
        chooseButton.style.opacity = value ? "0.55" : "1";
        downloadButton.style.opacity = value ? "0.55" : "1";
    }

    async function apiJson(path, options = {}) {
        const response = await api.fetchApi(path, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }
        return payload;
    }

    async function refreshInfo() {
        try {
            const currentFolder = String(folderWidget.value || "");
            const query = currentFolder ? `?models_dir=${encodeURIComponent(currentFolder)}` : "";
            const payload = await apiJson(`/deno/ltx8gb/info${query}`);
            if (!currentFolder) {
                setFolder(payload.models_dir);
            } else {
                pathText.textContent = currentFolder;
            }
            state.files = payload.files || [];
            renderFiles();
            setProgress(0, "Ready");
            setStatus("Ready");
        } catch (error) {
            setStatus(error.message || String(error), true);
        }
    }

    function renderFiles(job = null) {
        const files = job?.files || state.files || [];
        fileList.replaceChildren();
        for (const file of files) {
            const row = document.createElement("div");
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 8px;
                align-items: center;
                padding: 5px 7px;
                border-radius: 8px;
                background: rgba(255,255,255,0.045);
                border: 1px solid rgba(255,255,255,0.055);
            `;
            const name = document.createElement("div");
            name.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
            name.textContent = `${file.target_subdir}/${file.filename}`;
            const badge = document.createElement("div");
            badge.style.cssText = `
                color: ${statusColor(file.status, file.exists)};
                font: 700 10px sans-serif;
                white-space: nowrap;
            `;
            badge.textContent = fileStatusText(file);
            row.append(name, badge);
            fileList.append(row);
        }
    }

    function setProgress(ratio, label) {
        const percent = Math.max(0, Math.min(100, ratio * 100));
        progressFill.style.width = `${percent.toFixed(1)}%`;
        progressLabel.textContent = label || `${percent.toFixed(1)}%`;
    }

    function openFolderPicker() {
        const previous = document.querySelector(".deno-ltx8gb-folder-picker");
        previous?.remove();

        const overlay = document.createElement("div");
        overlay.className = "deno-ltx8gb-folder-picker";
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 28px;
            background: rgba(0,0,0,0.62);
            pointer-events: auto;
        `;

        const panel = document.createElement("div");
        panel.style.cssText = `
            width: min(720px, 92vw);
            max-height: min(620px, 86vh);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 16px;
            border-radius: 14px;
            border: 1px solid rgba(91,255,150,0.42);
            background: linear-gradient(180deg, #111713, #050806);
            color: #e7ffed;
            box-shadow: 0 20px 90px rgba(0,0,0,0.75);
            font: 13px sans-serif;
        `;

        const titleRow = document.createElement("div");
        titleRow.style.cssText = "display:flex; align-items:center; gap:10px;";
        const modalTitle = document.createElement("div");
        modalTitle.style.cssText = "flex:1; font:700 16px sans-serif; color:#94ffb5;";
        modalTitle.textContent = "Choose ComfyUI models folder";
        const closeButton = createButton("Cancel");
        titleRow.append(modalTitle, closeButton);

        const pathLine = document.createElement("div");
        pathLine.style.cssText = `
            padding: 8px 10px;
            border-radius: 9px;
            background: rgba(255,255,255,0.055);
            border: 1px solid rgba(255,255,255,0.08);
            color: #cffff0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        const driveRow = document.createElement("div");
        driveRow.style.cssText = "display:flex; flex-wrap:wrap; gap:6px;";

        const toolbar = document.createElement("div");
        toolbar.style.cssText = "display:flex; gap:8px; align-items:center;";
        const upButton = createButton("Up");
        const defaultButton = createButton("Use default");
        const modalStatus = document.createElement("div");
        modalStatus.style.cssText = "flex:1; min-width:0; color:#90dca5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
        toolbar.append(upButton, defaultButton, modalStatus);

        const folderList = document.createElement("div");
        folderList.style.cssText = `
            min-height: 260px;
            max-height: 360px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 6px;
            border-radius: 10px;
            background: rgba(0,0,0,0.34);
            border: 1px solid rgba(95,255,150,0.16);
        `;

        const actionRow = document.createElement("div");
        actionRow.style.cssText = "display:flex; gap:8px; align-items:center; justify-content:flex-end;";
        const selectButton = createButton("Select this folder", false, true);
        actionRow.append(selectButton);

        panel.append(titleRow, pathLine, driveRow, toolbar, folderList, actionRow);
        overlay.append(panel);
        document.body.append(overlay);

        let currentPath = String(folderWidget.value || "");
        let parentPath = "";

        function stopCanvasEvent(event) {
            event.stopPropagation();
        }
        for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel", "keydown"]) {
            overlay.addEventListener(eventName, stopCanvasEvent, true);
        }

        function close() {
            overlay.remove();
            setStatus("Ready");
        }

        function setModalStatus(text, danger = false) {
            modalStatus.textContent = text;
            modalStatus.style.color = danger ? "#ffb0b0" : "#90dca5";
        }

        async function browse(path) {
            setModalStatus("Loading folders...");
            try {
                const query = path ? `?path=${encodeURIComponent(path)}` : "";
                const payload = await apiJson(`/deno/ltx8gb/browse${query}`);
                currentPath = payload.path || "";
                parentPath = payload.parent || "";
                pathLine.textContent = currentPath;
                renderDrives(payload.drives || []);
                renderFolders(payload.folders || []);
                setModalStatus(`${(payload.folders || []).length} folders`);
            } catch (error) {
                setModalStatus(error.message || String(error), true);
            }
        }

        function renderDrives(drives) {
            driveRow.replaceChildren();
            for (const drive of drives) {
                const button = createButton(drive);
                button.onclick = () => browse(drive);
                driveRow.append(button);
            }
        }

        function renderFolders(folders) {
            folderList.replaceChildren();
            if (!folders.length) {
                const empty = document.createElement("div");
                empty.style.cssText = "padding:18px; color:#88a894; text-align:center;";
                empty.textContent = "No subfolders";
                folderList.append(empty);
                return;
            }
            for (const folder of folders) {
                const row = document.createElement("button");
                row.type = "button";
                row.style.cssText = `
                    width: 100%;
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: 8px;
                    align-items: center;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.045);
                    color: #ddffe6;
                    cursor: pointer;
                    text-align: left;
                    font: 13px sans-serif;
                `;
                const icon = document.createElement("span");
                icon.textContent = "[DIR]";
                icon.style.cssText = "color:#78f59e; font:700 11px sans-serif;";
                const name = document.createElement("span");
                name.textContent = folder.name;
                name.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
                row.append(icon, name);
                row.onclick = () => browse(folder.path);
                folderList.append(row);
            }
        }

        closeButton.onclick = close;
        overlay.onclick = (event) => {
            if (event.target === overlay) {
                close();
            }
        };
        upButton.onclick = () => {
            if (parentPath) {
                browse(parentPath);
            }
        };
        defaultButton.onclick = () => browse("");
        selectButton.onclick = async () => {
            if (!currentPath) {
                return;
            }
            setFolder(currentPath);
            close();
            await refreshInfo();
        };

        setStatus("Folder browser open.");
        browse(currentPath);
    }

    function chooseFolder() {
        if (state.busy) {
            return;
        }
        chooseNativeFolder();
    }

    async function chooseNativeFolder() {
        setBusy(true);
        setStatus("Opening Windows folder picker...");
        try {
            const payload = await apiJson("/deno/ltx8gb/select_folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ initial_dir: folderWidget.value || "" }),
            });
            if (payload.models_dir) {
                setFolder(payload.models_dir);
                await refreshInfo();
            } else {
                setStatus("Folder selection cancelled.");
            }
        } catch (error) {
            setStatus(error.message || String(error), true);
        } finally {
            setBusy(false);
        }
    }

    async function startDownload() {
        if (state.busy) {
            return;
        }
        const modelsFolder = String(folderWidget.value || "").trim();
        if (!modelsFolder) {
            setStatus("Select a models folder first.", true);
            return;
        }
        setBusy(true);
        setStatus("Starting...");
        try {
            const job = await apiJson("/deno/ltx8gb/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ models_dir: modelsFolder }),
            });
            state.jobId = job.id;
            renderJob(job);
            beginPolling();
        } catch (error) {
            setBusy(false);
            setStatus(error.message || String(error), true);
        }
    }

    function beginPolling() {
        if (state.polling) {
            clearInterval(state.polling);
        }
        state.polling = setInterval(async () => {
            if (!state.jobId) {
                return;
            }
            try {
                const job = await apiJson(`/deno/ltx8gb/status/${state.jobId}`);
                renderJob(job);
                if (job.status === "done" || job.status === "error") {
                    clearInterval(state.polling);
                    state.polling = null;
                    setBusy(false);
                }
            } catch (error) {
                clearInterval(state.polling);
                state.polling = null;
                setBusy(false);
                setStatus(error.message || String(error), true);
            }
        }, POLL_MS);
    }

    function renderJob(job) {
        const total = Number(job.total_bytes || 0);
        const done = Number(job.downloaded_bytes || 0);
        const ratio = total > 0 ? done / total : 0;
        const label = job.status === "done" ? "Done" : `${Math.min(100, ratio * 100).toFixed(1)}%`;
        setProgress(ratio, label);
        renderFiles(job);
        setStatus(job.message || job.current_file || job.status || "");
        if (job.status === "error") {
            setStatus(job.error || job.message || "Download failed.", true);
        }
        if (job.status === "done") {
            setStatus("Done. Press R or refresh ComfyUI to reload model lists.");
        }
    }

    chooseButton.onclick = chooseFolder;
    downloadButton.onclick = startDownload;

    setFolder(folderWidget.value);

    return {
        root,
        refreshInfo,
    };
}

function createButton(label, danger = false, strong = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border: 1px solid ${danger ? "rgba(255,100,100,0.45)" : "rgba(92,255,150,0.42)"};
        border-radius: 999px;
        padding: 6px 10px;
        cursor: pointer;
        color: ${danger ? "#ffdede" : "#e4ffeb"};
        background: ${strong ? "rgba(28,108,58,0.92)" : "rgba(27,45,35,0.92)"};
        font: 700 11px sans-serif;
        white-space: nowrap;
    `;
    return button;
}

function fileStatusText(file) {
    if (file.status === "done") {
        return "done";
    }
    if (file.status === "exists" || file.exists) {
        return "exists";
    }
    if (file.status === "downloading") {
        return `${formatBytes(file.downloaded || 0)}`;
    }
    if (file.status === "error") {
        return "error";
    }
    return "pending";
}

function statusColor(status, exists) {
    if (status === "done" || status === "exists" || exists) {
        return "#8fffb2";
    }
    if (status === "downloading") {
        return "#ffd36a";
    }
    if (status === "error") {
        return "#ff9f9f";
    }
    return "#9bb0a4";
}

function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 ** 3) {
        return `${(value / 1024 ** 3).toFixed(2)} GiB`;
    }
    if (value >= 1024 ** 2) {
        return `${(value / 1024 ** 2).toFixed(1)} MiB`;
    }
    return `${Math.round(value / 1024)} KiB`;
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

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}
