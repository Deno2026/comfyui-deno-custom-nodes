import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoLTXModelDownloader";
const ROUTE = "/deno/ltx_model_downloader";
const MIN_SIZE = [430, 390];
const POLL_MS = 1000;

app.registerExtension({
    name: "Deno.LTXModelDownloader",
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
    if (!node || node.type !== NODE_NAME || node.__denoLtxDownloaderReady) {
        return;
    }

    node.__denoLtxDownloaderReady = true;
    node.serialize_widgets = true;
    const rootWidget = getWidget(node, "model_root");
    if (rootWidget) {
        hideWidget(rootWidget);
    }

    const ui = buildUi(node);
    const domWidget = node.addDOMWidget("deno_ltx_downloader_panel", "deno_ltx_downloader_panel", ui.root, {
        serialize: false,
    });
    domWidget.computeSize = () => [Math.max(node.size?.[0] ?? MIN_SIZE[0], MIN_SIZE[0]), MIN_SIZE[1]];
    node.size = [
        Math.max(node.size?.[0] ?? MIN_SIZE[0], MIN_SIZE[0]),
        Math.max(node.size?.[1] ?? MIN_SIZE[1], MIN_SIZE[1] + 46),
    ];
    node.setDirtyCanvas?.(true, true);
    ui.refreshInfo();
}

function getWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
}

function buildUi(node) {
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

    const rootSelect = document.createElement("select");
    rootSelect.style.cssText = "display:none;";

    const pathText = document.createElement("div");
    pathText.style.cssText = `
        flex: 1;
        min-width: 0;
        padding: 6px 9px;
        border-radius: 9px;
        background: rgba(0,0,0,0.42);
        border: 1px solid rgba(108,255,158,0.18);
        color: #ccf8d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    pathText.textContent = "Loading model roots...";

    const chooseButton = createButton("Choose folder");
    pathRow.append(pathText, chooseButton, rootSelect);

    const progressOuter = document.createElement("div");
    progressOuter.style.cssText = `
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(85,255,145,0.48);
        background: rgba(0,0,0,0.55);
        overflow: hidden;
        position: relative;
    `;

    const progressFill = document.createElement("div");
    progressFill.style.cssText = `
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, #18bb62, #80ffad);
        transition: width 180ms ease;
    `;

    const progressLabel = document.createElement("div");
    progressLabel.style.cssText = `
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#f1fff5;
        font: 800 11px sans-serif;
        text-shadow: 0 1px 2px #000;
    `;
    progressOuter.append(progressFill, progressLabel);

    const fileList = document.createElement("div");
    fileList.style.cssText = `
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        overflow: auto;
        padding-right: 2px;
    `;

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex; gap:9px; align-items:center;";
    const downloadButton = createButton("Download", true);
    const status = document.createElement("div");
    status.style.cssText = "flex:1; min-width:0; color:#94f7af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    bottomRow.append(downloadButton, status);

    root.append(title, hint, pathRow, progressOuter, fileList, bottomRow);

    const state = {
        selectedRootId: "",
        roots: [],
        files: [],
        jobId: "",
        polling: null,
        busy: false,
    };

    function setStatus(text, danger = false) {
        status.textContent = text;
        status.style.color = danger ? "#ffb0b0" : "#94f7af";
    }

    function setBusy(value) {
        state.busy = value;
        chooseButton.disabled = value;
        downloadButton.disabled = value;
        for (const button of [chooseButton, downloadButton]) {
            button.style.opacity = value ? "0.55" : "1";
        }
    }

    async function apiJson(path, options = {}) {
        const response = await api.fetchApi(path, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }
        return payload;
    }

    function setProgress(downloaded, total, label = "") {
        const percent = total > 0 ? Math.min(100, Math.max(0, (downloaded / total) * 100)) : 0;
        progressFill.style.width = `${percent.toFixed(1)}%`;
        progressLabel.textContent = label || (percent > 0 ? `${percent.toFixed(1)}%` : "Ready");
    }

    function renderRoots(payload) {
        const roots = payload.roots || [];
        state.roots = roots;
        state.selectedRootId = payload.selected_root_id || roots[0]?.id || "";
        rootSelect.replaceChildren();
        for (const rootInfo of roots) {
            const option = document.createElement("option");
            option.value = rootInfo.id;
            option.textContent = rootInfo.existing_count > 0
                ? `${rootInfo.path} (${rootInfo.existing_count} files found)`
                : rootInfo.path;
            rootSelect.append(option);
        }
        rootSelect.value = state.selectedRootId;
        pathText.textContent = payload.models_root || "No model root selected";
        chooseButton.title = roots.length > 1
            ? "Click to switch between ComfyUI-registered model roots."
            : "Only one ComfyUI-registered model root was found.";
    }

    function renderFiles(files = state.files) {
        state.files = files || [];
        fileList.replaceChildren();
        for (const file of state.files) {
            const row = document.createElement("div");
            row.style.cssText = `
                display:grid;
                grid-template-columns: 1fr auto;
                gap:8px;
                align-items:center;
                padding:7px 8px;
                border-radius:8px;
                background:rgba(255,255,255,0.045);
                border:1px solid rgba(255,255,255,0.045);
            `;

            const name = document.createElement("div");
            name.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#eaffef; font-weight:700;";
            name.textContent = file.relative_path;

            const badge = document.createElement("div");
            badge.style.cssText = `font-weight:800; color:${statusColor(file.status)};`;
            badge.textContent = file.status === "downloading" ? prettyBytes(file.downloaded) : file.status;

            row.title = file.target_path || file.relative_path;
            row.append(name, badge);
            fileList.append(row);
        }
    }

    async function refreshInfo(rootId = state.selectedRootId) {
        try {
            setStatus("Checking registered model roots...");
            const query = rootId ? `?root_id=${encodeURIComponent(rootId)}` : "";
            const payload = await apiJson(`${ROUTE}/info${query}`);
            renderRoots(payload);
            renderFiles(payload.files || []);
            const total = payload.total_size || 0;
            const downloaded = sumDownloaded(payload.files || []);
            setProgress(downloaded, total, downloaded > 0 ? `${((downloaded / total) * 100).toFixed(1)}%` : "Ready");
            setStatus("Ready");
        } catch (error) {
            setStatus(error.message || String(error), true);
        }
    }

    async function startDownload() {
        if (state.busy) {
            return;
        }
        try {
            setBusy(true);
            setStatus("Starting download...");
            const payload = await apiJson(`${ROUTE}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ root_id: state.selectedRootId }),
            });
            state.jobId = payload.job_id;
            applyJob(payload);
            pollJob();
        } catch (error) {
            setBusy(false);
            setStatus(error.message || String(error), true);
        }
    }

    async function pollJob() {
        if (!state.jobId) {
            return;
        }
        clearTimeout(state.polling);
        try {
            const payload = await apiJson(`${ROUTE}/status/${state.jobId}`);
            applyJob(payload);
            if (payload.status === "done" || payload.status === "error") {
                setBusy(false);
                return;
            }
            state.polling = setTimeout(pollJob, POLL_MS);
        } catch (error) {
            setBusy(false);
            setStatus(error.message || String(error), true);
        }
    }

    function applyJob(payload) {
        renderFiles(payload.files || []);
        setProgress(payload.downloaded || 0, payload.total_size || 0, payload.status === "done" ? "Done" : `${payload.percent ?? 0}%`);
        setStatus(payload.error || payload.message || payload.status || "Running", payload.status === "error");
    }

    rootSelect.addEventListener("change", () => {
        state.selectedRootId = rootSelect.value;
        refreshInfo(state.selectedRootId);
    });
    chooseButton.addEventListener("click", () => {
        if (!state.roots.length) {
            refreshInfo(state.selectedRootId);
            return;
        }
        const currentIndex = Math.max(0, state.roots.findIndex((rootInfo) => rootInfo.id === state.selectedRootId));
        const nextRoot = state.roots[(currentIndex + 1) % state.roots.length];
        state.selectedRootId = nextRoot.id;
        rootSelect.value = nextRoot.id;
        refreshInfo(nextRoot.id);
    });
    downloadButton.addEventListener("click", startDownload);

    return { root, refreshInfo };
}

function createButton(label, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border: 1px solid ${primary ? "rgba(108,255,158,0.55)" : "rgba(170,255,197,0.28)"};
        border-radius: 999px;
        padding: 8px 14px;
        background: ${primary ? "linear-gradient(180deg,#176d39,#0d4d29)" : "rgba(255,255,255,0.05)"};
        color: #dcffe8;
        font: 800 12px sans-serif;
        cursor: pointer;
    `;
    return button;
}

function statusColor(status) {
    if (status === "exists" || status === "done") {
        return "#8fffba";
    }
    if (status === "downloading") {
        return "#ffd886";
    }
    if (status === "partial") {
        return "#9bdcff";
    }
    if (status === "error") {
        return "#ff9e9e";
    }
    return "#a8b9ad";
}

function prettyBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes >= 1024 ** 3) {
        return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
    }
    if (bytes >= 1024 ** 2) {
        return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
    }
    return `${Math.round(bytes / 1024)} KiB`;
}

function sumDownloaded(files) {
    return (files || []).reduce((total, file) => total + Math.min(Number(file.downloaded) || 0, Number(file.size) || 0), 0);
}

