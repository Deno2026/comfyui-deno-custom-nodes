import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoLTXModelDownloader";
const ROUTE = "/deno/ltx_model_downloader";
const MIN_SIZE = [560, 430];
const PANEL_MIN_HEIGHT = 352;
const NODE_CHROME_HEIGHT = 62;
const PRESET_STORAGE_KEY = "deno_ltx_model_downloader_presets_v1";

const DEFAULT_PACKAGE = {
    id: "ltx_23_8gb_vram",
    title: "LTX 2.3 8GB VRAM",
    description: "Open links, download with your browser, then move files into the shown target paths.",
    files: [
        {
            id: "gguf",
            label: "GGUF model",
            url: "https://huggingface.co/QuantStack/LTX-2.3-GGUF/resolve/main/LTX-2.3-distilled-1.1/LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf?download=true",
            target_subdir: "unet",
            filename: "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
            size: 17763015328,
        },
        {
            id: "gemma",
            label: "Gemma text encoder",
            url: "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors?download=true",
            target_subdir: "text_encoders",
            filename: "gemma_3_12B_it_fp4_mixed.safetensors",
            size: 9447702218,
        },
        {
            id: "projection",
            label: "Text projection",
            url: "https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/text_encoders/ltx-2.3_text_projection_bf16.safetensors?download=true",
            target_subdir: "text_encoders",
            filename: "ltx-2.3_text_projection_bf16.safetensors",
            size: 2312149072,
        },
        {
            id: "video_vae",
            label: "Video VAE",
            url: "https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors?download=true",
            target_subdir: "vae",
            filename: "LTX23_video_vae_bf16.safetensors",
            size: 1452258578,
        },
        {
            id: "audio_vae",
            label: "Audio VAE",
            url: "https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_audio_vae_bf16.safetensors?download=true",
            target_subdir: "vae",
            filename: "LTX23_audio_vae_bf16.safetensors",
            size: 364855188,
        },
        {
            id: "spatial_upscaler",
            label: "Spatial upscaler x2",
            url: "https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors?download=true",
            target_subdir: "latent_upscale_models",
            filename: "ltx-2.3-spatial-upscaler-x2-1.1.safetensors",
            size: 995743560,
        },
    ],
};

const DEFAULT_STATE = {
    active_preset_id: DEFAULT_PACKAGE.id,
    presets: [DEFAULT_PACKAGE],
};

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
    if (!node || node.type !== NODE_NAME) {
        return;
    }
    if (node.__denoLtxSetupReady) {
        node.__denoLtxSetupUi?.reloadFromWidgets?.();
        return;
    }

    node.__denoLtxSetupReady = true;
    node.serialize_widgets = true;

    const rootWidget = getWidget(node, "model_root");
    const presetsWidget = getWidget(node, "presets_json");
    if (rootWidget) {
        hideWidget(rootWidget);
    }
    if (presetsWidget) {
        hideWidget(presetsWidget);
        if (!String(presetsWidget.value || "").trim()) {
            presetsWidget.value = JSON.stringify(DEFAULT_STATE, null, 2);
        }
    }

    const ui = buildUi(node, rootWidget, presetsWidget);
    const domWidget = node.addDOMWidget("deno_ltx_setup_panel", "deno_ltx_setup_panel", ui.root, {
        serialize: false,
    });
    node.__denoLtxSetupUi = ui;
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

function buildUi(node, rootWidget, presetsWidget) {
    const root = document.createElement("div");
    root.style.cssText = `
        width:100%;
        box-sizing:border-box;
        padding:10px;
        border-radius:12px;
        border:1px solid rgba(80,255,142,0.25);
        background:linear-gradient(180deg, rgba(5,13,9,0.98), rgba(3,7,5,0.96));
        color:#dfffe8;
        pointer-events:auto;
        display:flex;
        flex-direction:column;
        gap:8px;
        overflow:hidden;
        font:11px sans-serif;
    `;

    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex; align-items:flex-start; justify-content:space-between; gap:10px;";

    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = "display:flex; flex-direction:column; gap:7px; min-width:0; flex:1;";

    const title = document.createElement("div");
    title.style.cssText = "font:700 13px sans-serif; color:#9dffc0;";
    title.textContent = "Easy Model Download Helper";

    const presetLabel = document.createElement("div");
    presetLabel.style.cssText = "font:800 10px sans-serif; color:#88dca4; letter-spacing:0.02em;";
    presetLabel.textContent = "Preset List";

    const presetWrap = document.createElement("div");
    presetWrap.style.cssText = "position:relative; width:min(260px, 100%);";

    const presetButton = document.createElement("button");
    presetButton.type = "button";
    presetButton.style.cssText = `
        width:100%;
        padding:6px 11px;
        border-radius:9px;
        border:1px solid rgba(80,255,142,0.28);
        background:rgba(0,0,0,0.35);
        color:#d9ffe4;
        font:800 11px sans-serif;
        cursor:pointer;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        text-align:left;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,0.025);
    `;

    const presetMenu = document.createElement("div");
    presetMenu.style.cssText = `
        display:none;
        position:absolute;
        z-index:99;
        top:26px;
        left:0;
        min-width:220px;
        max-width:320px;
        max-height:220px;
        overflow:auto;
        padding:6px;
        border-radius:10px;
        border:1px solid rgba(108,255,158,0.28);
        background:rgba(4,12,7,0.98);
        box-shadow:0 12px 26px rgba(0,0,0,0.5);
    `;
    presetWrap.append(presetButton, presetMenu);

    titleWrap.append(title, presetLabel, presetWrap);

    const editButton = createButton("Edit Preset");
    const addPresetButton = createButton("+ Add Preset");
    const headerActions = document.createElement("div");
    headerActions.style.cssText = "display:flex; align-items:flex-start; gap:7px; padding-top:14px;";
    headerActions.append(addPresetButton, editButton);
    headerRow.append(titleWrap, headerActions);

    const hint = document.createElement("div");
    hint.style.cssText = "color:#8fcfa4; line-height:1.35;";
    hint.textContent = "Open links, download with your browser, then move files into the shown target paths. No Python auto-download is used.";

    const pathRow = document.createElement("div");
    pathRow.style.cssText = "display:flex; flex-direction:column; gap:5px;";

    const rootSelect = document.createElement("select");
    rootSelect.style.cssText = "display:none;";

    const rootHeader = document.createElement("div");
    rootHeader.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px;";

    const rootLabel = document.createElement("div");
    rootLabel.style.cssText = "font:800 10px sans-serif; color:#88dca4; letter-spacing:0.02em;";
    rootLabel.textContent = "Model Roots";

    const copyRootButton = createButton("Copy selected root");
    rootHeader.append(rootLabel, copyRootButton);

    const rootList = document.createElement("div");
    rootList.style.cssText = `
        display:flex;
        flex-direction:column;
        gap:5px;
    `;

    const pathText = document.createElement("div");
    pathText.style.cssText = `
        display:none;
        flex:1;
        min-width:0;
        padding:6px 9px;
        border-radius:9px;
        background:rgba(0,0,0,0.42);
        border:1px solid rgba(108,255,158,0.18);
        color:#ccf8d8;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
    `;
    pathText.textContent = "Loading model roots...";

    pathRow.append(rootHeader, rootList, pathText, rootSelect);

    const progressOuter = document.createElement("div");
    progressOuter.style.cssText = `
        height:22px;
        border-radius:999px;
        border:1px solid rgba(85,255,145,0.48);
        background:rgba(0,0,0,0.55);
        overflow:hidden;
        position:relative;
        margin-top:3px;
        margin-bottom:3px;
    `;

    const progressFill = document.createElement("div");
    progressFill.style.cssText = `
        height:100%;
        width:0%;
        border-radius:999px;
        background:linear-gradient(90deg, #18bb62, #80ffad);
        transition:width 180ms ease;
    `;

    const progressLabel = document.createElement("div");
    progressLabel.style.cssText = `
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#f1fff5;
        font:800 12px sans-serif;
        text-shadow:0 1px 2px #000;
    `;
    progressOuter.append(progressFill, progressLabel);

    const fileList = document.createElement("div");
    fileList.style.cssText = "display:flex; flex-direction:column; gap:5px; overflow:visible;";

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex; gap:8px; align-items:center;";
    const refreshButton = createButton("Refresh Check", true);
    const status = document.createElement("div");
    status.style.cssText = "flex:1; min-width:0; color:#94f7af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
    bottomRow.append(refreshButton, status);

    const state = {
        selectedRootId: "",
        roots: [],
        files: [],
        modelsRoot: "",
        modelSubdirs: [],
        editing: false,
        presetsState: readPresetsState(presetsWidget),
        editorPresetId: "",
    };

    const editor = buildEditor(
        () => currentPackage(state.presetsState),
        () => state.modelSubdirs,
        resolveCivitaiUrl,
        (nextPackage) => saveEditorPreset(nextPackage),
        () => applyNodeSize()
    );
    editor.root.style.display = "none";

    root.append(headerRow, hint, pathRow, progressOuter, fileList, bottomRow, editor.root);
    const viewSections = [
        [presetLabel, "block"],
        [presetWrap, "block"],
        [hint, "block"],
        [pathRow, "flex"],
        [progressOuter, "block"],
        [fileList, "flex"],
        [bottomRow, "flex"],
    ];

    function panelHeight() {
        const editorHeight = state.editing ? Math.max(260, editor.root.scrollHeight || 260) + 12 : 0;
        if (state.editing) {
            return Math.max(PANEL_MIN_HEIGHT, 78 + editorHeight);
        }
        const rows = Math.max(1, state.files.length);
        const rootRows = Math.max(1, state.roots.length || 1);
        return Math.max(PANEL_MIN_HEIGHT, 264 + rows * 56 + Math.max(0, rootRows - 1) * 42 + editorHeight);
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

    function writeRootWidget(path) {
        if (!rootWidget || !path) {
            return;
        }
        rootWidget.value = path;
        rootWidget.callback?.(path);
    }

    async function apiJson(path, options = {}) {
        const response = await api.fetchApi(path, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }
        return payload;
    }

    async function postJson(path, body) {
        return apiJson(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    function setEditingMode(nextEditing, packageValue = currentPackage(state.presetsState)) {
        state.editing = Boolean(nextEditing);
        for (const [section, displayValue] of viewSections) {
            section.style.display = state.editing ? "none" : displayValue;
        }
        editor.root.style.display = state.editing ? "flex" : "none";
        editButton.textContent = state.editing ? "Close" : "Edit Preset";
        addPresetButton.style.display = state.editing ? "none" : "inline-block";
        if (state.editing) {
            editor.load(packageValue);
        }
        applyNodeSize();
    }

    function openNewPresetEditor() {
        presetMenu.style.display = "none";
        state.editorPresetId = "";
        setEditingMode(true, newPresetPackage());
    }

    function renderPresetButton() {
        const active = currentPackage(state.presetsState);
        presetButton.textContent = `${active.title || "Custom Preset"} ▾`;
        presetMenu.replaceChildren();

        for (const item of state.presetsState.presets) {
            const option = createMenuButton(item.title || "Custom Preset", () => {
                state.presetsState.active_preset_id = item.id;
                writePresetsState(presetsWidget, state.presetsState);
                markWorkflowDirty();
                presetMenu.style.display = "none";
                setEditingMode(false);
                editor.load(currentPackage(state.presetsState));
                refreshInfo(state.selectedRootId);
            }, item.id === state.presetsState.active_preset_id);
            presetMenu.append(option);
        }
    }

    function renderRoots(payload) {
        const roots = payload.roots || [];
        state.roots = roots;
        state.selectedRootId = payload.selected_root_id || roots[0]?.id || "";
        state.modelsRoot = payload.models_root || "";
        state.modelSubdirs = payload.model_subdirs || state.modelSubdirs || [];
        hint.textContent = payload.instructions || currentPackage(state.presetsState).description || "Open links, download with your browser, then move files into the shown target paths.";

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
        writeRootWidget(state.modelsRoot);
        renderRootList();
    }

    function renderRootList() {
        rootList.replaceChildren();
        const roots = state.roots || [];
        if (!roots.length) {
            const empty = document.createElement("div");
            empty.style.cssText = rootChipStyle(false);
            empty.textContent = "No ComfyUI model root found";
            rootList.append(empty);
            return;
        }

        roots.forEach((rootInfo, index) => {
            const selected = rootInfo.id === state.selectedRootId;
            const chip = document.createElement("button");
            chip.type = "button";
            chip.style.cssText = rootChipStyle(selected);
            chip.title = rootInfo.path || "";
            chip.dataset.rootCount = String(roots.length);

            const indexBadge = document.createElement("span");
            indexBadge.style.cssText = `
                flex:0 0 auto;
                min-width:20px;
                height:20px;
                box-sizing:border-box;
                border-radius:999px;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                background:${selected ? "rgba(80,255,142,0.22)" : "rgba(255,255,255,0.06)"};
                color:${selected ? "#eaffef" : "#8fa596"};
                font:900 10px sans-serif;
            `;
            indexBadge.textContent = String(index + 1);

            const path = document.createElement("span");
            path.style.cssText = "min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left;";
            path.textContent = rootInfo.path || "(unknown root)";

            const stateLabel = document.createElement("span");
            stateLabel.style.cssText = `
                flex:0 0 auto;
                color:${selected ? "#8fffba" : "#748278"};
                font:900 10px sans-serif;
            `;
            stateLabel.textContent = selected ? "selected" : "detected";

            chip.append(indexBadge, path, stateLabel);
            chip.onclick = () => {
                if (rootInfo.id === state.selectedRootId) {
                    return;
                }
                state.selectedRootId = rootInfo.id;
                rootSelect.value = rootInfo.id;
                writeRootWidget(rootInfo.path || "");
                renderRootList();
                refreshInfo(rootInfo.id);
            };
            rootList.append(chip);
        });
    }

    function renderFiles(files = state.files) {
        state.files = files || [];
        fileList.replaceChildren();
        for (const file of state.files) {
            const row = document.createElement("div");
            row.style.cssText = `
                display:grid;
                grid-template-columns:1fr auto auto;
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
            label.textContent = folderFromRelative(file.relative_path) || file.target_subdir || file.label || "(set models subfolder)";

            const target = document.createElement("div");
            target.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#96caa6; font-size:10px;";
            const foundSuffix = file.found_by === "subfolder" ? "found in subfolder" : "";
            target.textContent = file.error || [file.filename || filenameFromRelative(file.relative_path) || "(set filename)", prettyBytes(file.size), foundSuffix].filter(Boolean).join(" - ");
            nameWrap.append(label, target);

            const badge = document.createElement("div");
            badge.style.cssText = `font-weight:800; color:${statusColor(file.status)}; min-width:48px; text-align:right;`;
            badge.textContent = statusLabel(file.status);

            const downButton = createMiniButton("Down");
            downButton.disabled = !file.url;
            downButton.onclick = () => {
                if (!file.url) {
                    setStatus("This row has no URL yet.", true);
                    return;
                }
                window.open(file.url, "_blank", "noopener,noreferrer");
                setStatus(`Opened download link: ${file.filename || file.target_subdir || "download link"}`);
            };

            row.title = file.target_path || file.relative_path || file.error || "";
            row.append(nameWrap, badge, downButton);
            fileList.append(row);
        }
        applyNodeSize();
    }

    function reloadFromWidgets() {
        state.presetsState = readPresetsState(presetsWidget);
        state.editorPresetId = currentPackage(state.presetsState).id;
        renderPresetButton();
        editor.load(currentPackage(state.presetsState));
        setEditingMode(false);
        refreshInfo("");
    }

    async function refreshInfo(rootId = state.selectedRootId) {
        try {
            renderPresetButton();
            setStatus("Checking local model files...");
            const active = currentPackage(state.presetsState);
            const payload = await postJson(`${ROUTE}/check`, {
                root_id: rootId || "",
                model_root: rootWidget?.value || "",
                presets_state: state.presetsState,
                package: active,
            });
            renderRoots(payload);
            renderFiles(payload.files || []);
            const total = (payload.files || []).length;
            const existing = (payload.files || []).filter((file) => file.status === "exists").length;
            setProgress(existing, total);
            setStatus(existing === total ? "All files found. Press R if model lists need refresh." : "Open missing links, then move files to the shown paths.");
        } catch (error) {
            setStatus(error.message || String(error), true);
        }
    }

    async function resolveCivitaiUrl(url) {
        return resolveCivitaiLocally(url);
    }

    function setProgress(existing, total) {
        const percent = total > 0 ? Math.min(100, Math.max(0, (existing / total) * 100)) : 0;
        progressFill.style.width = `${percent.toFixed(1)}%`;
        progressLabel.textContent = `${existing}/${total} files ready`;
    }

    function saveEditorPreset(nextPackage) {
        const normalized = normalizePackage(nextPackage);
        const editingDefaultPreset = state.editorPresetId === DEFAULT_PACKAGE.id;
        const requestedId = normalized.id || slugify(normalized.title);
        const addingPreset = !state.editorPresetId;
        const packageId = editingDefaultPreset || addingPreset
            ? uniquePresetId(requestedId === DEFAULT_PACKAGE.id ? `${DEFAULT_PACKAGE.id}_custom` : requestedId, state.presetsState.presets)
            : state.editorPresetId;
        normalized.id = packageId;

        const presets = ensureDefaultPreset(state.presetsState.presets);
        const existingIndex = presets.findIndex((item) => item.id === packageId);
        if (existingIndex >= 0) {
            presets[existingIndex] = normalized;
        } else {
            presets.push(normalized);
        }
        state.presetsState = {
            active_preset_id: packageId,
            presets,
        };
        writePresetsState(presetsWidget, state.presetsState);
        markWorkflowDirty();
        state.editorPresetId = packageId;
        setEditingMode(false);
        refreshInfo(state.selectedRootId);
        setStatus("Preset saved in this browser and workflow.");
    }

    function markWorkflowDirty() {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    rootSelect.addEventListener("change", () => {
        state.selectedRootId = rootSelect.value;
        refreshInfo(state.selectedRootId);
    });
    copyRootButton.addEventListener("click", async () => {
        await copyText(state.modelsRoot || pathText.textContent || "");
        setStatus("Copied selected models root.");
    });
    refreshButton.addEventListener("click", () => refreshInfo(state.selectedRootId));
    presetButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        presetMenu.style.display = presetMenu.style.display === "none" ? "block" : "none";
    });
    addPresetButton.addEventListener("click", openNewPresetEditor);
    document.addEventListener("click", () => {
        presetMenu.style.display = "none";
    });
    editButton.addEventListener("click", () => {
        state.editorPresetId = currentPackage(state.presetsState).id;
        setEditingMode(!state.editing);
    });

    renderPresetButton();
    editor.load(currentPackage(state.presetsState));
    setEditingMode(false);
    return { root, refreshInfo, computeSize, applyNodeSize, reloadFromWidgets };
}

function buildEditor(readPackage, getModelSubdirs, resolveCivitaiUrl, onSave, onLayoutChange) {
    const root = document.createElement("div");
    root.style.cssText = `
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:9px;
        border-radius:10px;
        border:1px solid rgba(108,255,158,0.17);
        background:rgba(255,255,255,0.035);
    `;

    const guide = buildExampleGuide(() => load(examplePackage()));

    const sectionTitle = document.createElement("div");
    sectionTitle.style.cssText = "font:800 12px sans-serif; color:#dfffe8;";
    sectionTitle.textContent = "Preset Name";

    const titleInput = createLabeledField("", "DENO LTX Starter Pack");

    const fileSectionTitle = document.createElement("div");
    fileSectionTitle.style.cssText = "font:800 12px sans-serif; color:#dfffe8;";
    fileSectionTitle.textContent = "Models";

    const rows = document.createElement("div");
    rows.style.cssText = "display:flex; flex-direction:column; gap:9px;";
    const scheduleLayout = () => requestAnimationFrame(() => onLayoutChange?.(rows.children.length));
    root.addEventListener("deno-layout-change", scheduleLayout);
    const observer = new MutationObserver(scheduleLayout);
    observer.observe(rows, { childList: true });

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:8px; align-items:center;";
    const addButton = createButton("+ Add file");
    const actionSpacer = document.createElement("div");
    actionSpacer.style.cssText = "flex:1;";
    const saveButton = createButton("Save preset", true);
    actions.append(addButton, actionSpacer, saveButton);

    root.append(guide, sectionTitle, titleInput.root, fileSectionTitle, rows, actions);

    function load(packageValue = readPackage()) {
        const packageData = normalizePackage(packageValue);
        titleInput.input.value = packageData.title;
        rows.replaceChildren();
        const files = packageData.files.length ? packageData.files : [{ url: "", target_subdir: "checkpoints", filename: "", size: 0 }];
        for (const file of files) {
            rows.append(createFileEditorRow(file, rows.children.length + 1, getModelSubdirs(), resolveCivitaiUrl));
        }
        renumberRows(rows);
        scheduleLayout();
    }

    function collect() {
        const files = [...rows.children].map((row) => ({
            url: row.querySelector("[data-field='url']")?.value || "",
            target_subdir: readModelPath(row),
            filename: row.querySelector("[data-field='filename']")?.value || "",
            size: Number(row.querySelector("[data-field='size']")?.value || 0),
        }));
        return normalizePackage({
            id: slugify(titleInput.input.value),
            title: titleInput.input.value,
            files,
        });
    }

    addButton.addEventListener("click", () => {
        rows.append(createFileEditorRow({ url: "", target_subdir: "checkpoints", filename: "", size: 0 }, rows.children.length + 1, getModelSubdirs(), resolveCivitaiUrl));
        renumberRows(rows);
        scheduleLayout();
    });
    saveButton.addEventListener("click", () => onSave(collect()));

    load();
    return { root, load };
}

function buildExampleGuide(onUseExample) {
    const guide = document.createElement("div");
    guide.style.cssText = `
        display:flex;
        flex-direction:column;
        gap:7px;
        padding:8px;
        border-radius:9px;
        background:rgba(25,92,50,0.16);
        border:1px solid rgba(108,255,158,0.16);
    `;

    const top = document.createElement("div");
    top.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px;";
    const title = document.createElement("div");
    title.style.cssText = "font:800 11px sans-serif; color:#9dffc0;";
    title.textContent = "Example";
    const useButton = createMiniButton("Use example");
    useButton.onclick = onUseExample;
    top.append(title, useButton);

    const grid = document.createElement("div");
    grid.style.cssText = `
        display:grid;
        grid-template-columns:96px 1fr;
        gap:5px 8px;
        color:#c9f8d5;
        line-height:1.25;
    `;

    const rows = [
        ["Preset Name", "DENO LTX Starter Pack"],
        ["Path", "unet"],
        ["URL", "direct file or info page"],
        ["File name", "for target path only; exact match not required"],
    ];
    for (const [label, value] of rows) {
        const labelEl = document.createElement("div");
        labelEl.style.cssText = "color:#82c995; font-weight:800;";
        labelEl.textContent = label;
        const valueEl = document.createElement("div");
        valueEl.style.cssText = "min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f1fff5;";
        valueEl.textContent = value;
        grid.append(labelEl, valueEl);
    }

    guide.append(top, grid);
    return guide;
}

function createFileEditorRow(file, index, modelSubdirs = [], resolveCivitaiUrl = null) {
    const row = document.createElement("div");
    row.style.cssText = `
        display:flex;
        flex-direction:column;
        gap:7px;
        padding:9px;
        border-radius:10px;
        border:1px solid rgba(170,255,197,0.14);
        background:rgba(0,0,0,0.22);
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; gap:8px;";
    const heading = document.createElement("div");
    heading.style.cssText = "flex:1; font:800 11px sans-serif; color:#dfffe8;";
    heading.dataset.role = "row-number";
    heading.textContent = String(index);
    const remove = createMiniButton("Remove");
    remove.onclick = () => {
        const parent = row.parentElement;
        row.remove();
        if (parent) {
            renumberRows(parent);
        }
        row.dispatchEvent(new CustomEvent("deno-layout-change", { bubbles: true }));
    };
    header.append(heading, remove);

    const url = createLabeledField("URL", "Direct download URL or model page URL");
    url.input.dataset.field = "url";
    url.input.value = file.url || "";

    const pathGrid = document.createElement("div");
    pathGrid.style.cssText = "display:grid; grid-template-columns:0.9fr 1fr; gap:6px;";

    const targetSubdir = createModelPathField(file.target_subdir || "checkpoints", modelSubdirs);

    const filename = createLabeledField("File name", "for target path only; exact match not required");
    filename.input.dataset.field = "filename";
    filename.input.value = file.filename || "";
    let lastAutoFilename = guessFilename(url.input.value);
    let filenameManuallyEdited = Boolean(filename.input.value.trim() && filename.input.value.trim() !== lastAutoFilename);

    const syncFilenameFromUrl = () => {
        const guessed = guessFilename(url.input.value);
        const current = filename.input.value.trim();
        const canUpdate = !filenameManuallyEdited || !current || current === lastAutoFilename;
        if (!canUpdate) {
            return;
        }
        filename.input.value = guessed;
        filenameManuallyEdited = false;
        lastAutoFilename = guessed;
    };

    filename.input.addEventListener("input", () => {
        const current = filename.input.value.trim();
        filenameManuallyEdited = Boolean(current && current !== lastAutoFilename);
    });
    url.input.addEventListener("input", syncFilenameFromUrl);
    url.input.addEventListener("change", syncFilenameFromUrl);

    const sizeInput = document.createElement("input");
    sizeInput.type = "hidden";
    sizeInput.dataset.field = "size";
    sizeInput.value = String(file.size || 0);

    const urlRow = document.createElement("div");
    urlRow.style.cssText = "display:grid; grid-template-columns:1fr auto; gap:6px; align-items:end;";
    const civitaiButton = createMiniButton("Civitai");
    civitaiButton.title = "Convert a Civitai page or download URL into a direct browser download link.";
    civitaiButton.onclick = async () => {
        if (!resolveCivitaiUrl) {
            return;
        }
        const rawUrl = url.input.value.trim();
        if (!rawUrl) {
            civitaiButton.textContent = "No URL";
            setTimeout(() => { civitaiButton.textContent = "Civitai"; }, 900);
            return;
        }
        civitaiButton.disabled = true;
        civitaiButton.textContent = "...";
        try {
            const result = await resolveCivitaiUrl(rawUrl);
            if (result.download_url) {
                url.input.value = result.download_url;
            }
            if (result.filename) {
                filename.input.value = result.filename;
                lastAutoFilename = result.filename;
                filenameManuallyEdited = false;
            } else {
                filename.input.placeholder = "Enter the downloaded Civitai filename";
            }
            if (result.size) {
                sizeInput.value = String(result.size);
            }
            civitaiButton.textContent = result.filename ? "Done" : "Link";
        } catch (error) {
            console.warn("[DENO] Civitai link conversion failed:", error);
            civitaiButton.textContent = "Fail";
        } finally {
            setTimeout(() => {
                civitaiButton.disabled = false;
                civitaiButton.textContent = "Civitai";
            }, 900);
        }
    };
    urlRow.append(url.root, civitaiButton);

    pathGrid.append(targetSubdir.root, filename.root);
    row.append(header, urlRow, pathGrid, sizeInput);
    return row;
}

function resolveCivitaiLocally(rawUrl) {
    const url = String(rawUrl || "").trim();
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Enter a valid Civitai URL.");
    }

    if (!/civitai\.com$/i.test(parsed.hostname) && !/\.civitai\.com$/i.test(parsed.hostname)) {
        throw new Error("This is not a Civitai URL.");
    }

    const versionId = parsed.searchParams.get("modelVersionId")
        || parsed.pathname.match(/\/api\/download\/models\/(\d+)/i)?.[1]
        || parsed.pathname.match(/\/api\/v1\/model-versions\/(\d+)/i)?.[1]
        || parsed.pathname.match(/\/model-versions\/(\d+)/i)?.[1];

    if (!versionId) {
        throw new Error("No Civitai modelVersionId found.");
    }

    return {
        version_id: versionId,
        filename: guessFilename(url),
        size: 0,
        download_url: `https://civitai.com/api/download/models/${versionId}`,
    };
}

function createModelPathField(value, modelSubdirs = []) {
    const root = document.createElement("div");
    root.style.cssText = "display:flex; flex-direction:column; gap:4px; min-width:0; position:relative;";
    const label = document.createElement("div");
    label.style.cssText = "font:800 10px sans-serif; color:#8fcfa4;";
    label.textContent = "Model Path";

    const customValue = String(value || "").trim();
    const options = uniqueList(["checkpoints", "unet", "diffusion_models", "text_encoders", "clip", "vae", "loras", "controlnet", "upscale_models", "latent_upscale_models", ...modelSubdirs]);
    const useCustom = customValue && !options.includes(customValue);

    const valueInput = document.createElement("input");
    valueInput.type = "hidden";
    valueInput.dataset.field = "target_subdir_value";
    valueInput.value = useCustom ? "" : (customValue || "checkpoints");

    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = `
        ${controlStyle()}
        text-align:left;
        cursor:pointer;
    `;
    button.textContent = useCustom ? "Custom" : valueInput.value;

    const customInput = createInput("custom/path");
    customInput.dataset.field = "target_subdir_custom";
    customInput.style.display = useCustom ? "block" : "none";
    customInput.value = useCustom ? customValue : "";

    const menu = document.createElement("div");
    menu.dataset.field = "target_subdir_menu";
    menu.style.cssText = `
        display:none;
        position:absolute;
        z-index:50;
        top:42px;
        left:0;
        right:0;
        max-height:190px;
        overflow:auto;
        padding:5px;
        border-radius:9px;
        border:1px solid rgba(108,255,158,0.26);
        background:rgba(4,12,7,0.98);
        box-shadow:0 10px 24px rgba(0,0,0,0.48);
    `;

    const setPath = (nextValue, custom = false) => {
        if (custom) {
            valueInput.value = "";
            button.textContent = "Custom";
            customInput.style.display = "block";
            customInput.focus();
        } else {
            valueInput.value = nextValue;
            customInput.value = "";
            customInput.style.display = "none";
            button.textContent = nextValue;
        }
        menu.style.display = "none";
        root.dispatchEvent(new CustomEvent("deno-layout-change", { bubbles: true }));
    };

    for (const option of options) {
        menu.append(createPathOption(option, () => setPath(option)));
    }
    menu.append(createPathOption("Custom...", () => setPath("", true)));

    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeModelPathMenus(menu);
        menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    customInput.addEventListener("input", () => {
        valueInput.value = "";
    });
    document.addEventListener("click", () => {
        menu.style.display = "none";
    });

    root.append(label, button, menu, valueInput, customInput);
    return { root, input: valueInput };
}

function readModelPath(row) {
    const value = row.querySelector("[data-field='target_subdir_value']");
    const custom = row.querySelector("[data-field='target_subdir_custom']");
    return value?.value || custom?.value || "";
}

function createPathOption(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        width:100%;
        box-sizing:border-box;
        padding:6px 8px;
        border:0;
        border-radius:7px;
        background:transparent;
        color:#dfffe8;
        font:800 11px sans-serif;
        text-align:left;
        cursor:pointer;
    `;
    button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(80,255,142,0.16)";
        button.style.color = "#ffffff";
    });
    button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
        button.style.color = "#dfffe8";
    });
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
        button.dispatchEvent(new CustomEvent("deno-layout-change", { bubbles: true }));
    });
    return button;
}

function createMenuButton(label, onClick, active = false) {
    const button = createPathOption(label, onClick);
    if (active) {
        button.style.background = "rgba(80,255,142,0.18)";
        button.style.color = "#ffffff";
    }
    return button;
}

function closeModelPathMenus(exceptMenu = null) {
    const owner = exceptMenu?.ownerDocument || document;
    owner.querySelectorAll("[data-field='target_subdir_menu']").forEach((menu) => {
        if (menu !== exceptMenu) {
            menu.style.display = "none";
        }
    });
}

function renumberRows(container) {
    [...container.children].forEach((row, index) => {
        const number = row.querySelector("[data-role='row-number']");
        if (number) {
            number.textContent = String(index + 1);
        }
    });
}

function uniqueList(values) {
    const seen = new Set();
    return values.filter((value) => {
        const normalized = String(value || "").trim();
        if (!normalized || seen.has(normalized)) {
            return false;
        }
        seen.add(normalized);
        return true;
    });
}

function createLabeledField(labelText, placeholder) {
    return createLabeledControl(labelText, createInput(placeholder));
}

function createLabeledControl(labelText, control) {
    const root = document.createElement("label");
    root.style.cssText = "display:flex; flex-direction:column; gap:4px; min-width:0;";
    if (labelText) {
        const label = document.createElement("div");
        label.style.cssText = "font:800 10px sans-serif; color:#8fcfa4;";
        label.textContent = labelText;
        root.append(label);
    }
    root.append(control);
    return { root, input: control };
}

function createInput(placeholder) {
    const input = document.createElement("input");
    input.placeholder = placeholder;
    input.style.cssText = controlStyle();
    return input;
}

function controlStyle() {
    return `
        min-width:0;
        width:100%;
        box-sizing:border-box;
        padding:6px 8px;
        border-radius:8px;
        border:1px solid rgba(170,255,197,0.18);
        background:rgba(0,0,0,0.32);
        color:#eaffef;
        font:11px sans-serif;
        outline:none;
        color-scheme:dark;
    `;
}

function createButton(label, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border:1px solid ${primary ? "rgba(108,255,158,0.55)" : "rgba(170,255,197,0.28)"};
        border-radius:999px;
        padding:8px 12px;
        background:${primary ? "linear-gradient(180deg,#176d39,#0d4d29)" : "rgba(255,255,255,0.05)"};
        color:#dcffe8;
        font:800 11px sans-serif;
        cursor:pointer;
        white-space:nowrap;
    `;
    return button;
}

function rootChipStyle(selected) {
    return `
        width:100%;
        box-sizing:border-box;
        display:flex;
        align-items:center;
        gap:7px;
        padding:6px 9px;
        border-radius:9px;
        border:1px solid ${selected ? "rgba(80,255,142,0.55)" : "rgba(170,255,197,0.16)"};
        background:${selected ? "rgba(25,92,50,0.45)" : "rgba(255,255,255,0.035)"};
        color:${selected ? "#dfffe8" : "#7f9186"};
        font:800 10px sans-serif;
        cursor:${selected ? "default" : "pointer"};
        opacity:${selected ? "1" : "0.72"};
        box-shadow:${selected ? "inset 0 0 0 1px rgba(80,255,142,0.09)" : "none"};
    `;
}

function createMiniButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = `
        border:1px solid rgba(170,255,197,0.22);
        border-radius:7px;
        padding:5px 7px;
        background:rgba(255,255,255,0.055);
        color:#dcffe8;
        font:800 10px sans-serif;
        cursor:pointer;
        white-space:nowrap;
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
    if (status === "invalid") {
        return "#ff9a9a";
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
    if (status === "invalid") {
        return "invalid";
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
    if (bytes > 0) {
        return `${Math.round(bytes / 1024)} KiB`;
    }
    return "";
}

function readPresetsState(widget) {
    let widgetState = null;
    try {
        widgetState = normalizePresetsState(JSON.parse(widget?.value || ""));
    } catch (_error) {
        widgetState = normalizePresetsState(DEFAULT_STATE);
    }
    if (!hasCustomPresets(widgetState)) {
        const storedState = readStoredPresetsState();
        if (storedState && hasCustomPresets(storedState)) {
            if (widget) {
                widget.value = JSON.stringify(storedState, null, 2);
            }
            return storedState;
        }
    }
    return widgetState;
}

function writePresetsState(widget, value) {
    const normalized = normalizePresetsState(value);
    if (widget) {
        widget.value = JSON.stringify(normalized, null, 2);
        widget.callback?.(widget.value);
    }
    writeStoredPresetsState(normalized);
    return normalized;
}

function readStoredPresetsState() {
    try {
        const raw = localStorage.getItem(PRESET_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        return normalizePresetsState(JSON.parse(raw));
    } catch (_error) {
        return null;
    }
}

function writeStoredPresetsState(value) {
    try {
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(normalizePresetsState(value)));
    } catch (_error) {
        // Browser storage may be unavailable in hardened profiles; the workflow widget still saves.
    }
}

function hasCustomPresets(state) {
    return normalizePresetsState(state).presets.some((item) => item.id !== DEFAULT_PACKAGE.id);
}

function normalizePresetsState(value = {}) {
    const presets = Array.isArray(value.presets) ? value.presets.map(normalizePackage) : [];
    const safePresets = ensureDefaultPreset(presets);
    let activeId = String(value.active_preset_id || safePresets[0].id);
    if (!safePresets.some((item) => item.id === activeId)) {
        activeId = safePresets[0].id;
    }
    return {
        active_preset_id: activeId,
        presets: safePresets,
    };
}

function currentPackage(state) {
    const normalized = normalizePresetsState(state);
    return normalized.presets.find((item) => item.id === normalized.active_preset_id) || normalized.presets[0];
}

function normalizePackage(value = {}) {
    const files = Array.isArray(value.files) ? value.files : [];
    const title = String(value.title || DEFAULT_PACKAGE.title || "Custom Preset");
    return {
        id: String(value.id || slugify(title)),
        title,
        description: String(value.description || ""),
        files: files.map((file, index) => ({
            id: String(file.id || `file_${index + 1}`),
            label: String(file.label || file.target_subdir || file.filename || `File #${index + 1}`),
            url: String(file.url || ""),
            target_subdir: String(file.target_subdir || "checkpoints"),
            filename: String(file.filename || guessFilename(file.url || "")),
            size: Number(file.size || file.expected_size || 0),
        })),
    };
}

function ensureDefaultPreset(presets = []) {
    const defaultPreset = normalizePackage(DEFAULT_PACKAGE);
    const customPresets = presets
        .map(normalizePackage)
        .filter((item) => item.id !== DEFAULT_PACKAGE.id);
    return [defaultPreset, ...customPresets];
}

function uniquePresetId(baseId, presets = []) {
    const safeBase = slugify(baseId || "custom_preset");
    const used = new Set(
        presets
            .map((item) => String(item?.id || ""))
            .filter((id) => id && id !== DEFAULT_PACKAGE.id)
    );
    if (!used.has(safeBase)) {
        return safeBase;
    }
    let index = 2;
    while (used.has(`${safeBase}_${index}`)) {
        index += 1;
    }
    return `${safeBase}_${index}`;
}

function newPresetPackage() {
    return {
        id: "",
        title: "New Preset",
        description: "",
        files: [{ url: "", target_subdir: "checkpoints", filename: "", size: 0 }],
    };
}

function examplePackage() {
    return {
        id: "deno_ltx_starter",
        title: "DENO LTX Starter Pack",
        description: "",
        files: [
            {
                url: "https://huggingface.co/QuantStack/LTX-2.3-GGUF/resolve/main/LTX-2.3-distilled-1.1/LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf?download=true",
                target_subdir: "unet",
                filename: "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
                size: 17_763_015_328,
            },
        ],
    };
}

function slugify(value) {
    const slug = String(value || "custom_preset")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/gi, "_")
        .replace(/^_+|_+$/g, "");
    return slug || `preset_${Date.now()}`;
}

function folderFromRelative(relativePath = "") {
    const parts = String(relativePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 1) {
        return "";
    }
    return parts.slice(0, -1).join("/");
}

function filenameFromRelative(relativePath = "") {
    const parts = String(relativePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.at(-1) || "";
}

function guessFilename(url) {
    try {
        const pathname = new URL(url).pathname;
        const name = decodeURIComponent(pathname.split("/").pop() || "");
        return name.includes(".") ? name : "";
    } catch (_error) {
        return "";
    }
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
