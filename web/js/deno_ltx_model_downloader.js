import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoLTXModelDownloader";
const ROUTE = "/deno/ltx_model_downloader";
const MIN_SIZE = [510, 420];
const PANEL_MIN_HEIGHT = 338;
const NODE_CHROME_HEIGHT = 62;

app.registerExtension({
    name: "Deno.LTXModelSetupHelper",
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
    if (!node || node.type !== NODE_NAME || node.__denoLtxSetupReady) {
        return;
    }

    node.__denoLtxSetupReady = true;
    node.serialize_widgets = true;
    const rootWidget = getWidget(node, "model_root");
    if (rootWidget) {
        hideWidget(rootWidget);
    }

    const ui = buildUi(node);
    const domWidget = node.addDOMWidget("deno_ltx_setup_panel", "deno_ltx_setup_panel", ui.root, {
        serialize: false,
    });
    domWidget.computeSize = () => ui.computeSize();
    ui.applyNodeSize();
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
    title.textContent = "Easy Model Download Helper";

    const preset = document.createElement("div");
    preset.style.cssText = `
        align-self:flex-start;
        padding:4px 8px;
        border-radius:999px;
        border:1px solid rgba(80,255,142,0.34);
        background:rgba(25,92,50,0.45);
        color:#d9ffe4;
        font:800 10px sans-serif;
    `;
    preset.textContent = "Preset: LTX 2.3 8GB VRAM";

    const hint = document.createElement("div");
    hint.style.cssText = "color:#8fcfa4; line-height:1.35;";
    hint.textContent = "Open the official Hugging Face links, download with your browser, then move files into the shown target paths. No Python auto-download is used.";

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

    const switchButton = createButton("Switch root");
    const copyRootButton = createButton("Copy root");
    pathRow.append(pathText, switchButton, copyRootButton, rootSelect);

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
        display: flex;
        flex-direction: column;
        gap: 5px;
        overflow: visible;
    `;

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex; gap:8px; align-items:center;";
    const refreshButton = createButton("Refresh Check", true);
    const status = document.createElement("div");
    status.style.cssText = "flex:1; min-width:0; color:#94f7af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    bottomRow.append(refreshButton, status);

    root.append(title, preset, hint, pathRow, progressOuter, fileList, bottomRow);

    const state = {
        selectedRootId: "",
        roots: [],
        files: [],
        modelsRoot: "",
        presetLabel: "LTX 2.3 8GB VRAM",
    };

    function panelHeight() {
        const rows = Math.max(1, state.files.length);
        return Math.max(PANEL_MIN_HEIGHT, 232 + rows * 52);
    }

    function computeSize() {
        return [Math.max(node.size?.[0] ?? MIN_SIZE[0], MIN_SIZE[0]), panelHeight() + 8];
    }

    function applyNodeSize() {
        const [width, widgetHeight] = computeSize();
        root.style.height = `${panelHeight()}px`;
        node.size = [width, Math.max(MIN_SIZE[1], widgetHeight + NODE_CHROME_HEIGHT)];
        node.setDirtyCanvas?.(true, true);
    }

    function setStatus(text, danger = false) {
        status.textContent = text;
        status.style.color = danger ? "#ffb0b0" : "#94f7af";
    }

    async function apiJson(path, options = {}) {
        const response = await api.fetchApi(path, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }
        return payload;
    }

    function setProgress(existing, total) {
        const percent = total > 0 ? Math.min(100, Math.max(0, (existing / total) * 100)) : 0;
        progressFill.style.width = `${percent.toFixed(1)}%`;
        progressLabel.textContent = `${existing}/${total} files ready`;
    }

    function renderRoots(payload) {
        const roots = payload.roots || [];
        state.roots = roots;
        state.selectedRootId = payload.selected_root_id || roots[0]?.id || "";
        state.modelsRoot = payload.models_root || "";
        state.presetLabel = payload.preset_label || state.presetLabel;
        preset.textContent = `Preset: ${state.presetLabel}`;
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
        pathText.textContent = state.modelsRoot || "No model root selected";
        switchButton.title = roots.length > 1
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
                grid-template-columns: 1fr auto auto auto;
                gap:6px;
                align-items:center;
                padding:6px 7px;
                border-radius:8px;
                background:rgba(255,255,255,0.045);
                border:1px solid rgba(255,255,255,0.045);
            `;

            const nameWrap = document.createElement("div");
            nameWrap.style.cssText = "min-width:0; overflow:hidden;";

            const label = document.createElement("div");
            label.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#eaffef; font-weight:800;";
            label.textContent = file.label;

            const target = document.createElement("div");
            target.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#96caa6; font-size:10px;";
            target.textContent = [file.relative_path, prettyBytes(file.size)].join(" - ");
            nameWrap.append(label, target);

            const badge = document.createElement("div");
            badge.style.cssText = `font-weight:800; color:${statusColor(file.status)}; min-width:48px; text-align:right;`;
            badge.textContent = statusLabel(file.status);

            const openButton = createMiniButton("Open");
            openButton.onclick = () => {
                window.open(file.url, "_blank", "noopener,noreferrer");
                setStatus(`Opened: ${file.filename || file.label}`);
            };

            const copyButton = createMiniButton("Copy");
            copyButton.title = "Copy URL and target path";
            copyButton.onclick = async () => {
                await copyText(`${file.url}\n${file.target_path}`);
                setStatus("Copied URL and target path.");
            };

            row.title = file.target_path || file.relative_path;
            row.append(nameWrap, badge, openButton, copyButton);
            fileList.append(row);
        }
        applyNodeSize();
    }

    async function refreshInfo(rootId = state.selectedRootId) {
        try {
            setStatus("Checking local model files...");
            const query = rootId ? `?root_id=${encodeURIComponent(rootId)}` : "";
            const payload = await apiJson(`${ROUTE}/info${query}`);
            renderRoots(payload);
            renderFiles(payload.files || []);
            const total = (payload.files || []).length;
            const existing = (payload.files || []).filter((file) => file.status === "exists").length;
            setProgress(existing, total);
            setStatus(existing === total ? "All files found. Press R if model lists need refresh." : "Open missing files, then move them to target paths.");
        } catch (error) {
            setStatus(error.message || String(error), true);
        }
    }

    rootSelect.addEventListener("change", () => {
        state.selectedRootId = rootSelect.value;
        refreshInfo(state.selectedRootId);
    });
    switchButton.addEventListener("click", () => {
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
    copyRootButton.addEventListener("click", async () => {
        await copyText(state.modelsRoot || pathText.textContent || "");
        setStatus("Copied selected models root.");
    });
    refreshButton.addEventListener("click", () => refreshInfo(state.selectedRootId));

    return { root, refreshInfo, computeSize, applyNodeSize };
}

function createButton(label, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border: 1px solid ${primary ? "rgba(108,255,158,0.55)" : "rgba(170,255,197,0.28)"};
        border-radius: 999px;
        padding: 8px 12px;
        background: ${primary ? "linear-gradient(180deg,#176d39,#0d4d29)" : "rgba(255,255,255,0.05)"};
        color: #dcffe8;
        font: 800 11px sans-serif;
        cursor: pointer;
        white-space: nowrap;
    `;
    return button;
}

function createMiniButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border: 1px solid rgba(170,255,197,0.22);
        border-radius: 7px;
        padding: 5px 7px;
        background: rgba(255,255,255,0.055);
        color: #dcffe8;
        font: 800 10px sans-serif;
        cursor: pointer;
        white-space: nowrap;
    `;
    return button;
}

function statusColor(status) {
    if (status === "exists") {
        return "#8fffba";
    }
    if (status === "partial") {
        return "#9bdcff";
    }
    return "#ffcf86";
}

function statusLabel(status) {
    if (status === "exists") {
        return "ready";
    }
    if (status === "partial") {
        return "partial";
    }
    return "missing";
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

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}
