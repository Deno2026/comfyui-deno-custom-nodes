import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LOADER_NODE = "DenoMultiImageLoader";
const SEQUENCER_NODE = "DenoLTXSequencer";
const LTX_PRESET_NODE = "DenoLTX23PresetLoader";
const LOADER_MIN_SIZE = [360, 520];
const LOADER_KEEP_INPUT_RATIO_MODE = "Keep Input Ratio";
const LOADER_PRESET_MODE = "Preset Ratio";
const LOADER_MANUAL_MODE = "Manual Input";
const LTX_MODE_NAMES = ["Checkpoint Style", "KJ Style", "GGUF Style"];
const LTX_SERIALIZED_WIDGET_COUNT = 10;
const LTX_SERIALIZED_WIDGET_NAMES = [
    "pipeline_mode",
    "checkpoint_name",
    "diffusion_model_name",
    "gguf_unet_name",
    "video_vae_name",
    "audio_vae_name",
    "text_encoder_name",
    "text_projection_name",
    "clip_device",
    "weight_dtype",
];
const LTX_NONE_VALUE = "__none__";
const LTX_MODEL_WIDGET_NAMES = new Set([
    "checkpoint_name",
    "diffusion_model_name",
    "gguf_unet_name",
    "video_vae_name",
    "audio_vae_name",
    "text_encoder_name",
    "text_projection_name",
]);

window.__denoLtxSequencerNodes = window.__denoLtxSequencerNodes || new Set();

app.registerExtension({
    name: "Deno.ExtraNodes",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === LOADER_NODE) {
            patchMultiImageLoader(nodeType, { inputFolderBrowser: true });
        }
        if (nodeData.name === SEQUENCER_NODE) {
            patchSequencer(nodeType);
        }
        if (nodeData.name === LTX_PRESET_NODE) {
            patchLtxPresetLoader(nodeType);
        }
    },
});

function patchMultiImageLoader(nodeType, options = {}) {
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = onNodeCreated?.apply(this, arguments);
        setupMultiImageLoader(this, options);
        return result;
    };
}

function patchLtxPresetLoader(nodeType) {
    const configure = nodeType.prototype.configure;
    nodeType.prototype.configure = function (info) {
        const normalized = normalizeLtxLegacyWidgetValues(info);
        if (normalized) {
            this.__denoLtxConfiguredWidgetValues = [...normalized];
        }
        const result = configure?.apply(this, arguments);
        if (normalized) {
            this.__denoLtxConfiguredWidgetValues = [...normalized];
            queueMicrotask(() => {
                if (!this.__denoLtxPresetReady) {
                    return;
                }
                applyLtxSerializedValuesToWidgets(this, this.__denoLtxConfiguredWidgetValues);
                sanitizeLtxWidgetValues(this);
                this._denoUpdateLtxPresetVisibility?.();
            });
        }
        return result;
    };

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = onNodeCreated?.apply(this, arguments);
        setupLtxPresetLoader(this);
        return result;
    };
}

function normalizeLtxLegacyWidgetValues(info) {
    const normalized = getNormalizedLtxSerializedValues(info?.widgets_values);
    if (normalized) {
        info.widgets_values = normalized;
    }
    return normalized;
}

function getNormalizedLtxSerializedValues(values) {
    if (!Array.isArray(values)) {
        return null;
    }
    if (!LTX_MODE_NAMES.includes(values[0])) {
        return null;
    }
    if (values.length >= LTX_SERIALIZED_WIDGET_COUNT + 1 && isEmptyLtxSerializedSlot(values[1])) {
        const keepCandidate = values.slice(0, LTX_SERIALIZED_WIDGET_COUNT);
        const dropPlaceholderCandidate = [values[0], ...values.slice(2, LTX_SERIALIZED_WIDGET_COUNT + 1)];
        if (scoreLtxSerializedCandidate(dropPlaceholderCandidate) > scoreLtxSerializedCandidate(keepCandidate)) {
            return dropPlaceholderCandidate;
        }
        return keepCandidate;
    }
    if (values.length >= LTX_SERIALIZED_WIDGET_COUNT) {
        return values.slice(0, LTX_SERIALIZED_WIDGET_COUNT);
    }
    return null;
}

function isEmptyLtxSerializedSlot(value) {
    return value === "" || value == null;
}

function scoreLtxSerializedCandidate(values) {
    if (!Array.isArray(values) || values.length < LTX_SERIALIZED_WIDGET_COUNT || !LTX_MODE_NAMES.includes(values[0])) {
        return -100;
    }

    const mode = values[0];
    let score = 0;
    if (isLtxDeviceValue(values[8])) {
        score += 1;
    }
    if (isNonNoneLtxValue(values[9])) {
        score += 1;
    }

    if (mode === "GGUF Style") {
        score += hasLtxExtension(values[3], ".gguf") ? 8 : 0;
        score -= looksLikeLtxVaeValue(values[3]) ? 8 : 0;
        score += looksLikeLtxVaeValue(values[4]) ? 3 : 0;
        score += looksLikeLtxVaeValue(values[5]) ? 3 : 0;
        score += hasLtxExtension(values[6], ".safetensors") ? 2 : 0;
        score += hasLtxExtension(values[7], ".safetensors") ? 2 : 0;
        score -= isLtxDeviceValue(values[7]) ? 4 : 0;
    } else if (mode === "KJ Style") {
        score += hasLtxExtension(values[2], ".safetensors") ? 4 : 0;
        score += looksLikeLtxVaeValue(values[4]) ? 3 : 0;
        score += looksLikeLtxVaeValue(values[5]) ? 3 : 0;
        score += hasLtxExtension(values[6], ".safetensors") ? 2 : 0;
        score += hasLtxExtension(values[7], ".safetensors") ? 2 : 0;
    } else {
        score += hasLtxExtension(values[1], ".safetensors") ? 4 : 0;
        score += hasLtxExtension(values[6], ".safetensors") ? 2 : 0;
    }

    return score;
}

function applyLtxSerializedValuesToWidgets(node, values) {
    const normalized = getNormalizedLtxSerializedValues(values);
    if (!normalized) {
        return false;
    }

    for (let i = 0; i < LTX_SERIALIZED_WIDGET_NAMES.length; i += 1) {
        const widget = getWidget(node, LTX_SERIALIZED_WIDGET_NAMES[i]);
        if (widget) {
            widget.value = normalized[i];
        }
    }

    node.properties = node.properties || {};
    node.properties.pipeline_mode = normalized[0];
    node.widgets_values = normalized;
    return true;
}

function getComboValues(widget) {
    const values = widget?.options?.values;
    if (typeof values === "function") {
        try {
            const resolved = values(widget);
            return Array.isArray(resolved) ? resolved : [];
        } catch {
            return [];
        }
    }
    if (Array.isArray(values)) {
        return values;
    }
    if (values && typeof values === "object") {
        return Object.keys(values);
    }
    return [];
}

function chooseLtxFallbackValue(widgetName, values, currentValue) {
    if (values.includes(currentValue)) {
        return currentValue;
    }

    if (shouldPreserveStaleLtxModelValue(widgetName, currentValue)) {
        return currentValue;
    }

    const preferredByWidget = {
        checkpoint_name: ["ltx-2.3-22b-dev-fp8.safetensors"],
        diffusion_model_name: [
            "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
            "ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors",
        ],
        gguf_unet_name: [
            "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
            "LTX-2.3-22B-distilled-1.1-Q2_K.gguf",
            "ltx-2.3-22b-dev-Q4_K_M.gguf",
        ],
        video_vae_name: ["LTX23_video_vae_bf16.safetensors"],
        audio_vae_name: ["LTX23_audio_vae_bf16.safetensors"],
        text_encoder_name: ["gemma_3_12B_it_fp4_mixed.safetensors", "gemma_3_12B_it_fp8_scaled.safetensors"],
        text_projection_name: ["ltx-2.3_text_projection_bf16.safetensors"],
        clip_device: ["default"],
        weight_dtype: ["default"],
    };

    for (const preferred of preferredByWidget[widgetName] || []) {
        if (values.includes(preferred)) {
            return preferred;
        }
    }

    return values.find((value) => value !== LTX_NONE_VALUE) ?? values[0];
}

function shouldPreserveStaleLtxModelValue(widgetName, currentValue) {
    if (!LTX_MODEL_WIDGET_NAMES.has(widgetName)) {
        return false;
    }
    const savedValue = String(currentValue ?? "").trim();
    return savedValue !== "" && savedValue !== LTX_NONE_VALUE;
}

function isNonNoneLtxValue(value) {
    const text = String(value ?? "").trim();
    return text !== "" && text !== LTX_NONE_VALUE;
}

function hasLtxExtension(value, extension) {
    return String(value ?? "").trim().toLowerCase().endsWith(extension);
}

function looksLikeLtxVaeValue(value) {
    const text = String(value ?? "").trim().toLowerCase();
    return text.includes("vae") && text.endsWith(".safetensors");
}

function isLtxDeviceValue(value) {
    const text = String(value ?? "").trim();
    return text === "" || text === LTX_NONE_VALUE || text === "default" || text === "cpu";
}

function repairShiftedLtxGgufWidgetValues(node) {
    const mode = getWidget(node, "pipeline_mode")?.value ?? node.properties?.pipeline_mode;
    if (mode !== "GGUF Style") {
        return false;
    }

    const ggufWidget = getWidget(node, "gguf_unet_name");
    const videoVaeWidget = getWidget(node, "video_vae_name");
    const audioVaeWidget = getWidget(node, "audio_vae_name");
    const textEncoderWidget = getWidget(node, "text_encoder_name");
    const textProjectionWidget = getWidget(node, "text_projection_name");
    if (!ggufWidget || !videoVaeWidget || !audioVaeWidget || !textEncoderWidget || !textProjectionWidget) {
        return false;
    }

    const ggufValue = ggufWidget.value;
    const videoVaeValue = videoVaeWidget.value;
    const audioVaeValue = audioVaeWidget.value;
    const textEncoderValue = textEncoderWidget.value;
    const textProjectionValue = textProjectionWidget.value;

    const looksShifted =
        !hasLtxExtension(ggufValue, ".gguf") &&
        looksLikeLtxVaeValue(ggufValue) &&
        looksLikeLtxVaeValue(videoVaeValue) &&
        isNonNoneLtxValue(audioVaeValue) &&
        isNonNoneLtxValue(textEncoderValue) &&
        isLtxDeviceValue(textProjectionValue);
    if (!looksShifted) {
        return false;
    }

    const ggufOptions = getComboValues(ggufWidget);
    const ggufFallback = ggufOptions.find((value) => hasLtxExtension(value, ".gguf")) ?? LTX_NONE_VALUE;
    ggufWidget.value = ggufFallback;
    videoVaeWidget.value = ggufValue;
    audioVaeWidget.value = videoVaeValue;
    textEncoderWidget.value = audioVaeValue;
    textProjectionWidget.value = textEncoderValue;

    node.properties = node.properties || {};
    node.properties.__deno_ltx_shift_repair = "gguf-visible-values-v1";
    return true;
}

function sanitizeLtxWidgetValues(node) {
    let changed = repairShiftedLtxGgufWidgetValues(node);
    for (const widgetName of LTX_SERIALIZED_WIDGET_NAMES) {
        const widget = getWidget(node, widgetName);
        const values = getComboValues(widget);
        if (!widget || values.length === 0) {
            continue;
        }

        const nextValue = chooseLtxFallbackValue(widgetName, values, widget.value);
        if (nextValue !== undefined && widget.value !== nextValue) {
            widget.value = nextValue;
            changed = true;
        }
    }

    const serializedValues = LTX_SERIALIZED_WIDGET_NAMES.map((widgetName) => getWidget(node, widgetName)?.value);
    if (serializedValues.every((value) => value !== undefined)) {
        node.widgets_values = serializedValues;
        node.properties = node.properties || {};
        node.properties.pipeline_mode = serializedValues[0];
    }
    return changed;
}

function setupLtxPresetLoader(node) {
    if (node.__denoLtxPresetReady) {
        return;
    }
    node.__denoLtxPresetReady = true;

    const modeWidget = getWidget(node, "pipeline_mode");
    const modeWidgetIndex = node.widgets ? node.widgets.indexOf(modeWidget) : -1;
    if (modeWidget) {
        hideWidget(modeWidget);
    }

    const modeContainer = document.createElement("div");
    modeContainer.style.cssText = `
        width: 100%;
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 2px 0;
        pointer-events: auto;
    `;

    const modeNames = LTX_MODE_NAMES;
    const modeButtons = new Map();

    const createModeButton = (modeName, label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = `
            flex: 1;
            border-radius: 999px;
            border: 1px solid rgba(85, 92, 99, 0.9);
            background: rgba(32, 36, 42, 0.92);
            color: #d7dce0;
            cursor: pointer;
            padding: 3px 6px;
            font: 600 9px/1.1 sans-serif;
            letter-spacing: -0.1px;
            white-space: nowrap;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        button.onclick = () => {
            if (modeWidget) {
                modeWidget.value = modeName;
                node.properties = node.properties || {};
                node.properties.pipeline_mode = modeName;
                modeWidget.callback?.(modeName);
            }
            node._denoUpdateLtxPresetVisibility?.();
            node._denoRefreshLtxModeButtons?.();
            node.setDirtyCanvas?.(true, true);
        };
        modeButtons.set(modeName, button);
        return button;
    };

    modeContainer.append(
        createModeButton("Checkpoint Style", "Checkpoint"),
        createModeButton("KJ Style", "KJ Style"),
        createModeButton("GGUF Style", "GGUF Style")
    );

    const modeDomWidget = node.addDOMWidget("pipeline_buttons", "deno_ltx_mode_buttons", modeContainer, {
        serialize: false,
    });
    modeDomWidget.computeSize = () => [Math.max(node.size?.[0] ?? 0, 320), 30];

    const originalOnSerialize = node.onSerialize;
    node.onSerialize = function (info) {
        const result = originalOnSerialize?.apply(this, arguments);
        normalizeLtxLegacyWidgetValues(info);
        return result;
    };

    const reorderWidgetSequence = () => {
        if (!Array.isArray(node.widgets)) {
            return;
        }

        const desired = [
            "pipeline_mode",
            "pipeline_buttons",
            "checkpoint_name",
            "diffusion_model_name",
            "gguf_unet_name",
            "video_vae_name",
            "audio_vae_name",
            "text_encoder_name",
            "text_projection_name",
            "clip_device",
            "weight_dtype",
            "split_weight_dtype",
        ];

        const rank = new Map(desired.map((name, idx) => [name, idx]));
        const indexed = node.widgets.map((widget, originalIndex) => ({ widget, originalIndex }));
        indexed.sort((a, b) => {
            const aRank = rank.has(a.widget?.name) ? rank.get(a.widget?.name) : Number.MAX_SAFE_INTEGER;
            const bRank = rank.has(b.widget?.name) ? rank.get(b.widget?.name) : Number.MAX_SAFE_INTEGER;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
            return a.originalIndex - b.originalIndex;
        });
        node.widgets = indexed.map((entry) => entry.widget);
    };

    // Keep the mode buttons near the top and normalize widget sequence.
    if (modeWidgetIndex >= 0 && node.widgets) {
        const domIndex = node.widgets.indexOf(modeDomWidget);
        if (domIndex >= 0) {
            node.widgets.splice(domIndex, 1);
            node.widgets.splice(modeWidgetIndex + 1, 0, modeDomWidget);
        }
    }
    reorderWidgetSequence();
    applyLtxSerializedValuesToWidgets(node, node.__denoLtxConfiguredWidgetValues || node.widgets_values);
    sanitizeLtxWidgetValues(node);

    const migrateLegacyWeightWidget = () => {
        const legacyWidget = getWidget(node, "split_weight_dtype");
        const newWidget = getWidget(node, "weight_dtype");
        if (!legacyWidget) {
            return;
        }

        // Keep old workflows compatible but show the standard label.
        legacyWidget.label = "weight_dtype";
        if (!newWidget) {
            legacyWidget.name = "weight_dtype";
            node.properties = node.properties || {};
            if (node.properties.weight_dtype === undefined && node.properties.split_weight_dtype !== undefined) {
                node.properties.weight_dtype = node.properties.split_weight_dtype;
            }
        }
    };

    const getWeightDtypeWidget = () => getWidget(node, "weight_dtype") || getWidget(node, "split_weight_dtype");

    const applyCompactLabels = () => {
        const labelMap = {
            checkpoint_name: "checkpoint",
            text_encoder_name: "text_encoder",
            text_projection_name: "text_projection",
            diffusion_model_name: "diffusion",
            gguf_unet_name: "gguf_unet",
            video_vae_name: "video_vae",
            audio_vae_name: "audio_vae",
            clip_device: "clip_device",
            weight_dtype: "weight_dtype",
            split_weight_dtype: "weight_dtype",
        };

        const stableLabels = new Set(Object.values(labelMap));
        const mode = getWidget(node, "pipeline_mode")?.value ?? node.properties?.pipeline_mode ?? "Checkpoint Style";
        const modeModelLabel =
            mode === "KJ Style" ? "diffusion" : mode === "GGUF Style" ? "gguf_unet" : "checkpoint";

        const looksLikeFilename = (value) => {
            const text = String(value || "");
            return /(?:\.safetensors|\.gguf)(?:$|\s)|[\\/]/i.test(text);
        };

        for (const widget of node.widgets || []) {
            const widgetName = String(widget?.name || "");
            const currentLabel = String(widget?.label ?? "");

            // 1) Exact known names
            if (widgetName && widgetName in labelMap) {
                widget.label = labelMap[widgetName];
                continue;
            }

            // 2) Fuzzy fallback for legacy / migrated workflows
            if (widgetName.includes("checkpoint")) {
                widget.label = "checkpoint";
                continue;
            }
            if (widgetName.includes("text_encoder")) {
                widget.label = "text_encoder";
                continue;
            }
            if (widgetName.includes("text_projection") || widgetName.includes("projection")) {
                widget.label = "text_projection";
                continue;
            }
            if (widgetName.includes("diffusion")) {
                widget.label = "diffusion";
                continue;
            }
            if (widgetName.includes("gguf")) {
                widget.label = "gguf_unet";
                continue;
            }

            // 3) Guardrail: if label is broken/corrupted, recover with a safe short label.
            if (widget.type === "combo") {
                const rawLabel = currentLabel.trim();
                const labelBroken =
                    !rawLabel ||
                    rawLabel.length <= 2 ||
                    rawLabel.startsWith(".") ||
                    rawLabel.startsWith("-") ||
                    looksLikeFilename(rawLabel) ||
                    looksLikeFilename(widgetName);

                if (labelBroken || !stableLabels.has(rawLabel)) {
                    // Preserve known safe labels if we already have one.
                    if (!stableLabels.has(rawLabel)) {
                        widget.label = modeModelLabel;
                    }
                }
            }
        }
    };

    node._denoEnsureLtxNodeHeight = function () {
        const computed = this.computeSize?.();
        if (!computed || !Array.isArray(computed) || computed.length < 2) {
            return;
        }
        // Keep extra bottom padding to avoid the last widget being clipped
        // by subtle font/rendering differences across frontend versions.
        const requiredHeight = Math.ceil(computed[1] + 24);
        const currentWidth = Math.max(this.size?.[0] ?? computed[0], 320);
        const currentHeight = this.size?.[1] ?? 0;
        if (currentHeight < requiredHeight) {
            this.setSize?.([currentWidth, requiredHeight]);
        }
    };

    const originalOnResize = node.onResize;
    node.onResize = function () {
        const result = originalOnResize?.apply(this, arguments);
        // If user drags node smaller than required widget height, clamp it back.
        this._denoEnsureLtxNodeHeight?.();
        return result;
    };

    // Keep left labels readable: when width is tight, truncate value text first.
    const originalDrawWidgets = node.drawWidgets;
    node.drawWidgets = function () {
        const litegraph = globalThis?.LiteGraph ?? window?.LiteGraph;
        if (!litegraph || !originalDrawWidgets) {
            return originalDrawWidgets?.apply(this, arguments);
        }

        const prevEven = litegraph.truncateWidgetTextEvenly;
        const prevValuesFirst = litegraph.truncateWidgetValuesFirst;
        litegraph.truncateWidgetTextEvenly = false;
        litegraph.truncateWidgetValuesFirst = true;
        try {
            return originalDrawWidgets.apply(this, arguments);
        } finally {
            litegraph.truncateWidgetTextEvenly = prevEven;
            litegraph.truncateWidgetValuesFirst = prevValuesFirst;
        }
    };

    node._denoUpdateLtxPresetVisibility = function () {
        migrateLegacyWeightWidget();
        sanitizeLtxWidgetValues(this);
        applyCompactLabels();
        reorderWidgetSequence();
        const mode = getWidget(this, "pipeline_mode")?.value ?? this.properties?.pipeline_mode ?? "Checkpoint Style";
        const checkpointMode = mode === "Checkpoint Style";
        const kjMode = mode === "KJ Style";
        const ggufMode = mode === "GGUF Style";

        toggleWidgetVisibility(getWidget(this, "checkpoint_name"), checkpointMode);
        toggleWidgetVisibility(getWidget(this, "diffusion_model_name"), kjMode);
        toggleWidgetVisibility(getWidget(this, "gguf_unet_name"), ggufMode);
        toggleWidgetVisibility(getWidget(this, "video_vae_name"), kjMode || ggufMode);
        toggleWidgetVisibility(getWidget(this, "audio_vae_name"), kjMode || ggufMode);
        toggleWidgetVisibility(getWidget(this, "text_projection_name"), kjMode || ggufMode);
        const weightWidget = getWeightDtypeWidget();
        toggleWidgetVisibility(weightWidget, kjMode);

        this._denoRefreshLtxModeButtons?.();

        this.setDirtyCanvas?.(true, true);
        requestAnimationFrame(() => this._denoEnsureLtxNodeHeight?.());
    };

    node._denoRefreshLtxModeButtons = function () {
        const mode = getWidget(this, "pipeline_mode")?.value ?? this.properties?.pipeline_mode ?? "Checkpoint Style";
        for (const modeName of modeNames) {
            const button = modeButtons.get(modeName);
            if (!button) {
                continue;
            }
            const active = modeName === mode;
            button.style.background = active ? "rgba(26, 88, 48, 0.96)" : "rgba(32, 36, 42, 0.92)";
            button.style.borderColor = active ? "rgba(96, 255, 156, 0.95)" : "rgba(85, 92, 99, 0.9)";
            button.style.color = active ? "#dfffe8" : "#d7dce0";
        }
    };

    for (const widget of node.widgets || []) {
        if (widget.__denoPresetWrapped) {
            continue;
        }
        const originalCallback = widget.callback;
        widget.callback = function (value) {
            const callbackResult = originalCallback?.apply(this, arguments);
            node._denoUpdateLtxPresetVisibility?.();
            node._denoRefreshLtxModeButtons?.();
            requestAnimationFrame(() => node._denoEnsureLtxNodeHeight?.());
            return callbackResult;
        };
        widget.__denoPresetWrapped = true;
    }

    setTimeout(() => {
        applyLtxSerializedValuesToWidgets(node, node.__denoLtxConfiguredWidgetValues || node.widgets_values);
        sanitizeLtxWidgetValues(node);
        delete node.__denoLtxConfiguredWidgetValues;
        migrateLegacyWeightWidget();
        applyCompactLabels();
        node._denoUpdateLtxPresetVisibility?.();
        requestAnimationFrame(() => node._denoEnsureLtxNodeHeight?.());
    }, 0);

    // A second delayed pass catches workflows loaded with stale serialized sizes.
    setTimeout(() => {
        node._denoEnsureLtxNodeHeight?.();
    }, 120);
}

function setupMultiImageLoader(node, options = {}) {
    const pathsWidget = getWidget(node, "image_paths");
    if (!pathsWidget || node.__denoLoaderReady) {
        return;
    }

    node.__denoLoaderReady = true;
    hideWidget(pathsWidget);

    node._denoUpdateLoaderVisibility = function () {
        const mode = getWidget(this, "mode")?.value ?? LOADER_KEEP_INPUT_RATIO_MODE;
        toggleWidgetVisibility(getWidget(this, "ratio_preset"), mode === LOADER_PRESET_MODE);
        toggleWidgetVisibility(getWidget(this, "megapixels"), mode === LOADER_PRESET_MODE || mode === LOADER_KEEP_INPUT_RATIO_MODE);
        toggleWidgetVisibility(getWidget(this, "width"), mode === LOADER_MANUAL_MODE);
        toggleWidgetVisibility(getWidget(this, "height"), mode === LOADER_MANUAL_MODE);
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
    const inputFolderBtn = options.inputFolderBrowser ? createActionButton("Input Folder") : null;
    const clearBtn = createActionButton("Clear", true);
    topBar.append(uploadBtn);
    if (inputFolderBtn) {
        topBar.append(inputFolderBtn);
    }
    topBar.append(clearBtn);

    const countLabel = document.createElement("div");
    countLabel.style.cssText = "margin-left:auto; color:#94f7af; font:600 11px sans-serif;";
    topBar.appendChild(countLabel);

    const hint = document.createElement("div");
    hint.style.cssText = "color:#7dcf92; font:11px sans-serif; opacity:0.85;";
    hint.textContent = inputFolderBtn
        ? "Drag files, press Ctrl+V, use Upload, or add existing input-folder images."
        : "Drag files, press Ctrl+V, or use Upload. Drag cards to reorder.";

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
    let isReordering = false;

    for (const currentWidget of node.widgets || []) {
        if (currentWidget.__denoLoaderWrapped) {
            continue;
        }
        const originalCallback = currentWidget.callback;
        currentWidget.callback = function (value) {
            const result = originalCallback?.apply(this, arguments);
            node._denoUpdateLoaderVisibility?.();
            refreshOutputSizeHint();
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
        refreshOutputSizeHint();
    }

    function setOutputSizeHint(size) {
        if (!size || !(size.width > 0) || !(size.height > 0)) {
            return;
        }
        const nextSize = {
            width: Math.round(size.width),
            height: Math.round(size.height),
        };
        const prevSize = node.__denoOutputImageSize ?? {};
        if (prevSize.width === nextSize.width && prevSize.height === nextSize.height) {
            return;
        }
        node.__denoOutputImageSize = nextSize;
        node.properties = node.properties || {};
        node.properties.__denoOutputImageSize = nextSize;
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }

    async function refreshOutputSizeHint() {
        const requestId = (node.__denoOutputSizeRequestId || 0) + 1;
        node.__denoOutputSizeRequestId = requestId;

        const paths = getPaths();
        const size = await calculateLoaderOutputSize(node, paths);
        if (node.__denoOutputSizeRequestId !== requestId) {
            return;
        }
        setOutputSizeHint(size);
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
        setInputImageSource(image, path);
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

        card.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showImageCardMenu(event, path, image);
        });

        card.addEventListener("dragstart", () => {
            draggedCard = card;
            placeholder = createPlaceholder();
            isReordering = true;
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
            isReordering = false;
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
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;
            const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
            // Reorder a bit earlier than strict 50% to feel more responsive.
            const insertAfter = horizontalDominant
                ? event.clientX > rect.left + rect.width * 0.4
                : event.clientY > rect.top + rect.height * 0.4;
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
        const visibleCardCount = Array.from(grid.children).filter((child) => child.dataset?.path).length;
        if (node._denoImageCount !== count || (!isReordering && visibleCardCount !== count)) {
            node._denoImageCount = count;
            notifyConnectedSequencers(node, count);
            render();
            refreshOutputSizeHint();
        }
    }

    function normalizeInputFolderPath(path) {
        const normalized = String(path || "")
            .replace(/\\/g, "/")
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean)
            .join("/");
        return normalized.split("/").includes("..") ? "" : normalized;
    }

    function normalizeInputFolderFile(entry) {
        const rawName = typeof entry === "string" ? entry : (entry?.name ?? entry?.path ?? "");
        const name = normalizeInputFolderPath(rawName);
        return /\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/i.test(name) ? name : "";
    }

    function normalizeInputFolderFolder(entry) {
        const path = normalizeInputFolderPath(typeof entry === "string" ? entry : (entry?.path ?? entry?.name ?? ""));
        if (!path) {
            return null;
        }
        const fallbackName = path.split("/").pop() || path;
        const name = String(entry?.display_name ?? entry?.name ?? fallbackName).trim() || fallbackName;
        return { name, path };
    }

    async function fetchInputFolderImages(inputPath = "") {
        const browserPath = normalizeInputFolderPath(inputPath);
        const denoEndpoint = browserPath
            ? `/deno/input-folder-images?path=${encodeURIComponent(browserPath)}`
            : "/deno/input-folder-images";
        const denoResponse = await api.fetchApi(denoEndpoint, { cache: "no-store" });
        if (denoResponse.status === 200) {
            const payload = await denoResponse.json();
            return {
                path: normalizeInputFolderPath(payload?.path ?? browserPath),
                parent: normalizeInputFolderPath(payload?.parent ?? ""),
                folders: (payload?.folders ?? []).map(normalizeInputFolderFolder).filter(Boolean),
                files: (payload?.files ?? []).map(normalizeInputFolderFile).filter(Boolean),
            };
        }

        if (browserPath) {
            throw new Error(`Input folder list failed (${denoResponse.status})`);
        }

        const response = await api.fetchApi("/object_info/LoadImage", { cache: "no-store" });
        if (response.status !== 200) {
            throw new Error(`Input folder list failed (${denoResponse.status}, fallback ${response.status})`);
        }

        const payload = await response.json();
        const imageOptions = payload?.LoadImage?.input?.required?.image?.[0] ?? [];
        const files = imageOptions
            .map((entry) => String(entry || "").trim())
            .filter((entry) => /\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/i.test(entry))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        return { path: "", parent: "", folders: [], files };
    }

    function showInputFolderBrowser() {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.46);
            pointer-events: auto;
        `;

        const modal = document.createElement("div");
        modal.style.cssText = `
            width: min(760px, calc(100vw - 48px));
            max-height: min(720px, calc(100vh - 48px));
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 16px;
            box-sizing: border-box;
            overflow: hidden;
            border: 1px solid rgba(72, 255, 132, 0.42);
            border-radius: 16px;
            background: rgba(3, 12, 8, 0.98);
            color: #dfffea;
            box-shadow: 0 18px 64px rgba(0, 0, 0, 0.55);
            font: 12px sans-serif;
        `;

        const header = document.createElement("div");
        header.style.cssText = "display:flex; gap:10px; align-items:center;";

        const title = document.createElement("div");
        title.textContent = "Add images from ComfyUI input folder";
        title.style.cssText = "flex:1; color:#9dffba; font:700 15px sans-serif;";

        const closeBtn = createActionButton("Close");
        closeBtn.onclick = () => closeInputFolderBrowser();
        header.append(title, closeBtn);

        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = "Search folders or input images...";
        search.style.cssText = `
            width: 100%;
            border: 1px solid rgba(72, 255, 132, 0.28);
            border-radius: 10px;
            background: rgba(9, 18, 14, 0.96);
            color: #dfffea;
            padding: 8px 10px;
            box-sizing: border-box;
            outline: none;
            font: 12px sans-serif;
        `;

        const pathRow = document.createElement("div");
        pathRow.style.cssText = "display:flex; gap:8px; align-items:center; min-height:28px;";

        const upBtn = createActionButton("Up");
        upBtn.disabled = true;
        upBtn.style.opacity = "0.55";

        const pathLabel = document.createElement("div");
        pathLabel.style.cssText = `
            flex: 1;
            min-width: 0;
            color: #9dffba;
            font: 600 12px/1.35 sans-serif;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        pathRow.append(upBtn, pathLabel);

        const status = document.createElement("div");
        status.textContent = "Loading input folder list...";
        status.style.cssText = "color:#91dca4; min-height:16px;";

        const list = document.createElement("div");
        list.style.cssText = `
            flex: 1;
            width: 100%;
            min-width: 0;
            max-width: 100%;
            min-height: 220px;
            overflow-x: hidden;
            overflow-y: auto;
            scrollbar-gutter: stable;
            position: relative;
            padding: 4px;
            box-sizing: border-box;
            border-radius: 12px;
            background: rgba(0, 0, 0, 0.22);
        `;

        const footer = document.createElement("div");
        footer.style.cssText = "display:flex; gap:8px; align-items:center; justify-content:flex-end; width:100%; min-width:0; box-sizing:border-box; flex:0 0 auto;";
        const addBtn = createActionButton("Add Selected");
        addBtn.disabled = true;
        addBtn.style.opacity = "0.55";
        const selectedLabel = document.createElement("div");
        selectedLabel.style.cssText = "flex:1; color:#9dffba; font:600 12px sans-serif;";
        selectedLabel.textContent = "0 selected";
        footer.append(selectedLabel, addBtn);

        modal.append(header, pathRow, search, status, list, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const stopCanvasEvent = (event) => event.stopPropagation();
        modal.addEventListener("pointerdown", stopCanvasEvent);
        modal.addEventListener("mousedown", stopCanvasEvent);
        modal.addEventListener("wheel", stopCanvasEvent, { passive: false });
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeInputFolderBrowser();
            }
        });

        const selected = new Set();
        let currentPath = "";
        let currentParent = "";
        let allFolders = [];
        let allFiles = [];
        let filteredEntries = [];
        let virtualRenderFrame = 0;
        const virtualGrid = {
            gap: 10,
            padding: 4,
            scrollbarReserve: 18,
            minCardWidth: 132,
            cardHeight: 122,
            overscanRows: 3,
        };

        const cleanupInputFolderBrowser = () => {
            window.removeEventListener("resize", scheduleVirtualRender);
            if (virtualRenderFrame) {
                cancelAnimationFrame(virtualRenderFrame);
                virtualRenderFrame = 0;
            }
        };

        const closeInputFolderBrowser = () => {
            cleanupInputFolderBrowser();
            overlay.remove();
        };

        const refreshSelected = () => {
            selectedLabel.textContent = `${selected.size} selected`;
            addBtn.disabled = selected.size === 0;
            addBtn.style.opacity = selected.size === 0 ? "0.55" : "1";
        };

        const getVirtualMetrics = () => {
            const measuredScrollbar = Math.max(0, list.offsetWidth - list.clientWidth);
            const rightReserve = Math.max(virtualGrid.scrollbarReserve, measuredScrollbar);
            const availableWidth = Math.max(1, list.clientWidth - (virtualGrid.padding * 2) - rightReserve);
            const columns = Math.max(
                1,
                Math.floor((availableWidth + virtualGrid.gap) / (virtualGrid.minCardWidth + virtualGrid.gap))
            );
            const cardWidth = Math.floor((availableWidth - (virtualGrid.gap * (columns - 1))) / columns);
            const rowHeight = virtualGrid.cardHeight + virtualGrid.gap;
            const rowCount = Math.ceil(filteredEntries.length / columns);
            return {
                columns,
                cardWidth,
                rowHeight,
                rowCount,
                contentWidth: availableWidth + (virtualGrid.padding * 2),
                totalHeight: (rowCount * rowHeight) + virtualGrid.padding,
            };
        };

        const updateInputFolderCardSelection = (card, file) => {
            const isSelected = selected.has(file);
            card.style.borderColor = isSelected ? "rgba(72,255,132,0.9)" : "rgba(54,110,74,0.9)";
            card.style.background = isSelected ? "rgba(21, 75, 39, 0.72)" : "rgba(8, 16, 13, 0.95)";
            card.setAttribute("aria-pressed", String(isSelected));
        };

        const createInputFolderCard = (entry, index, metrics) => {
            const isFolder = entry.type === "folder";
            const file = entry.path;
            const column = index % metrics.columns;
            const row = Math.floor(index / metrics.columns);
            const card = document.createElement("button");
            card.type = "button";
            card.title = isFolder ? "Double-click to open folder" : file;
            card.style.cssText = `
                position: absolute;
                left: ${virtualGrid.padding + (column * (metrics.cardWidth + virtualGrid.gap))}px;
                top: ${virtualGrid.padding + (row * metrics.rowHeight)}px;
                width: ${metrics.cardWidth}px;
                height: ${virtualGrid.cardHeight}px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                box-sizing: border-box;
                border: 1px solid rgba(54,110,74,0.9);
                border-radius: 10px;
                padding: 6px;
                background: rgba(8, 16, 13, 0.95);
                color: #dfffea;
                cursor: pointer;
                text-align: left;
                overflow: hidden;
            `;

            const preview = isFolder ? document.createElement("div") : document.createElement("img");
            if (isFolder) {
                preview.textContent = "Folder";
                preview.style.cssText = `
                    width: 100%;
                    height: 82px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 7px;
                    border: 1px solid rgba(72, 255, 132, 0.24);
                    background: linear-gradient(180deg, rgba(35, 83, 50, 0.92), rgba(7, 22, 14, 0.96));
                    color: #9dffba;
                    font: 700 14px sans-serif;
                    pointer-events: none;
                `;
            } else {
                setInputImageSource(preview, file);
                preview.loading = "eager";
                preview.decoding = "async";
                if ("fetchPriority" in preview) {
                    preview.fetchPriority = "low";
                }
                preview.style.cssText = `
                    width: 100%;
                    height: 82px;
                    object-fit: cover;
                    border-radius: 7px;
                    background: #020403;
                    pointer-events: none;
                `;
            }

            const label = document.createElement("div");
            label.textContent = isFolder ? entry.name : file;
            label.title = isFolder ? entry.path : file;
            label.style.cssText = `
                color: #dfffea;
                font: 600 11px/1.25 sans-serif;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;

            if (isFolder) {
                card.ondblclick = () => loadInputFolder(entry.path);
            }
            card.onclick = () => {
                if (isFolder) {
                    return;
                }
                if (selected.has(file)) {
                    selected.delete(file);
                } else {
                    selected.add(file);
                }
                refreshSelected();
                updateInputFolderCardSelection(card, file);
            };
            if (!isFolder) {
                updateInputFolderCardSelection(card, file);
            }
            card.append(preview, label);
            return card;
        };

        const renderEmptyMessage = (message) => {
            const empty = document.createElement("div");
            empty.textContent = message;
            empty.style.cssText = "color:#91dca4; padding:10px;";
            list.replaceChildren(empty);
        };

        const renderVirtualGrid = () => {
            if (!filteredEntries.length) {
                renderEmptyMessage((allFolders.length || allFiles.length) ? "No items match the search." : "No input images found.");
                return;
            }

            const metrics = getVirtualMetrics();
            const scrollTop = list.scrollTop;
            const viewportHeight = list.clientHeight || 220;
            const startRow = Math.max(0, Math.floor(scrollTop / metrics.rowHeight) - virtualGrid.overscanRows);
            const endRow = Math.min(
                metrics.rowCount,
                Math.ceil((scrollTop + viewportHeight) / metrics.rowHeight) + virtualGrid.overscanRows
            );
            const startIndex = startRow * metrics.columns;
            const endIndex = Math.min(filteredEntries.length, endRow * metrics.columns);

            const spacer = document.createElement("div");
            spacer.dataset.denoVirtualGrid = "true";
            spacer.style.cssText = `
                position: relative;
                width: ${metrics.contentWidth}px;
                max-width: 100%;
                box-sizing: border-box;
                overflow: hidden;
                height: ${Math.max(metrics.totalHeight, viewportHeight)}px;
                min-height: ${viewportHeight}px;
            `;

            const cards = [];
            for (let index = startIndex; index < endIndex; index += 1) {
                cards.push(createInputFolderCard(filteredEntries[index], index, metrics));
            }
            spacer.replaceChildren(...cards);
            list.replaceChildren(spacer);
            list.scrollTop = scrollTop;
        };

        const scheduleVirtualRender = () => {
            if (virtualRenderFrame) {
                return;
            }
            virtualRenderFrame = requestAnimationFrame(() => {
                virtualRenderFrame = 0;
                renderVirtualGrid();
            });
        };

        const updatePathLabel = () => {
            pathLabel.textContent = currentPath ? `input/${currentPath}` : "input";
            pathLabel.title = pathLabel.textContent;
            upBtn.disabled = !currentPath;
            upBtn.style.opacity = currentPath ? "1" : "0.55";
        };

        const applyInputFolderFilter = () => {
            const needle = search.value.trim().toLowerCase();
            const folderEntries = allFolders.map((folder) => ({ type: "folder", ...folder }));
            const fileEntries = allFiles.map((file) => ({ type: "file", name: file, path: file }));
            filteredEntries = folderEntries.concat(fileEntries).filter((entry) => {
                if (!needle) {
                    return true;
                }
                return `${entry.name || ""} ${entry.path || ""}`.toLowerCase().includes(needle);
            });
            const totalEntries = allFolders.length + allFiles.length;
            status.textContent = needle
                ? `${filteredEntries.length} of ${totalEntries} input item${totalEntries === 1 ? "" : "s"} shown`
                : `${allFolders.length} folder${allFolders.length === 1 ? "" : "s"}, ${allFiles.length} image${allFiles.length === 1 ? "" : "s"} found`;
            list.scrollTop = 0;
            renderVirtualGrid();
        };

        const loadInputFolder = (path = "") => {
            const nextPath = normalizeInputFolderPath(path);
            status.textContent = "Loading input folder list...";
            list.replaceChildren();
            return fetchInputFolderImages(nextPath)
                .then((payload) => {
                    currentPath = normalizeInputFolderPath(payload.path ?? nextPath);
                    currentParent = normalizeInputFolderPath(payload.parent ?? "");
                    allFolders = payload.folders ?? [];
                    allFiles = payload.files ?? [];
                    updatePathLabel();
                    applyInputFolderFilter();
                    refreshSelected();
                    search.focus();
                })
                .catch((error) => {
                    status.textContent = `Failed to read input folder list: ${error.message || error}`;
                    allFolders = [];
                    allFiles = [];
                    filteredEntries = [];
                    updatePathLabel();
                    list.replaceChildren();
                });
        };

        search.oninput = applyInputFolderFilter;
        upBtn.onclick = () => {
            if (currentPath) {
                loadInputFolder(currentParent);
            }
        };
        list.addEventListener("scroll", scheduleVirtualRender, { passive: true });
        window.addEventListener("resize", scheduleVirtualRender);
        addBtn.onclick = () => {
            if (!selected.size) {
                return;
            }
            setPaths(getPaths().concat(Array.from(selected)));
            closeInputFolderBrowser();
        };

        updatePathLabel();
        loadInputFolder();
    }

    uploadBtn.onclick = () => fileInput.click();
    if (inputFolderBtn) {
        inputFolderBtn.onclick = showInputFolderBrowser;
    }
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
        if (isReordering) {
            return;
        }
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
    refreshOutputSizeHint();
}

async function calculateLoaderOutputSize(node, paths) {
    const mode = getWidget(node, "mode")?.value ?? LOADER_KEEP_INPUT_RATIO_MODE;
    const width = getWidgetNumber(node, "width", 1024);
    const height = getWidgetNumber(node, "height", 1024);
    const megapixels = getWidgetNumber(node, "megapixels", 1.0);
    const divisibleBy = getWidgetNumber(node, "divisible_by", 32);

    if (mode === LOADER_PRESET_MODE) {
        const ratioPreset = getWidget(node, "ratio_preset")?.value ?? "16:9";
        const [ratioX, ratioY] = ratioPreset.split(":").map(Number);
        return dimensionsFromTuple(computeLoaderPresetDims(ratioX || 16, ratioY || 9, megapixels, divisibleBy));
    }

    if (mode === LOADER_KEEP_INPUT_RATIO_MODE) {
        const firstPath = paths?.[0];
        if (firstPath) {
            const sourceSize = await readInputImageSize(firstPath);
            if (sourceSize) {
                return dimensionsFromTuple(
                    computeLoaderKeepInputRatioDims(sourceSize.width, sourceSize.height, megapixels, divisibleBy)
                );
            }
        }
    }

    return {
        width: roundLoaderUp(width, divisibleBy),
        height: roundLoaderUp(height, divisibleBy),
    };
}

function getWidgetNumber(node, name, fallback) {
    const value = Number(getWidget(node, name)?.value ?? node.properties?.[name] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
}

function dimensionsFromTuple(dims) {
    return { width: dims[0], height: dims[1] };
}

function readInputImageSize(path) {
    return new Promise((resolve) => {
        const image = new Image();
        const urls = createInputImageViewUrls(path);
        let urlIndex = 0;
        image.onload = () => {
            const width = Number(image.naturalWidth || image.width || 0);
            const height = Number(image.naturalHeight || image.height || 0);
            resolve(width > 0 && height > 0 ? { width, height } : null);
        };
        image.onerror = () => {
            urlIndex += 1;
            if (urlIndex < urls.length) {
                image.src = urls[urlIndex];
                return;
            }
            resolve(null);
        };
        image.src = urls[urlIndex] || "";
    });
}

function createInputImageViewUrl(path) {
    return createInputImageViewUrls(path)[0] || "/api/view?filename=&type=input";
}

function createInputImageViewUrls(path) {
    const rawPath = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = String(path || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part !== "");
    const filename = parts.pop() || "";
    const subfolder = parts.join("/");
    const urls = [];

    const encodedFilename = encodeURIComponent(filename);
    const encodedSubfolder = encodeURIComponent(subfolder);
    urls.push(`/api/view?filename=${encodedFilename}&type=input${subfolder ? `&subfolder=${encodedSubfolder}` : ""}`);

    const params = new URLSearchParams({ filename, type: "input" });
    if (parts.length) {
        params.set("subfolder", subfolder);
    }
    urls.push(`/api/view?${params.toString()}`);

    if (subfolder) {
        const viewParams = new URLSearchParams({ filename, type: "input", subfolder });
        urls.push(`/view?filename=${encodedFilename}&type=input&subfolder=${encodedSubfolder}`);
        urls.push(`/view?${viewParams.toString()}`);
        urls.push(`/api/view?filename=${encodeURIComponent(rawPath)}&type=input`);
    } else {
        urls.push(`/view?filename=${encodedFilename}&type=input`);
        urls.push(`/view?${params.toString()}`);
    }

    return Array.from(new Set(urls));
}

function setInputImageSource(image, path) {
    const urls = createInputImageViewUrls(path);
    let urlIndex = 0;
    image.onerror = () => {
        urlIndex += 1;
        if (urlIndex < urls.length) {
            image.src = urls[urlIndex];
        }
    };
    image.src = urls[urlIndex] || "";
}

function showImageCardMenu(event, path, image) {
    new LiteGraph.ContextMenu(["Copy Image", "Copy Image Path"], {
        event,
        title: "Image",
        className: "dark",
        scale: Math.max(1, app.canvas?.ds?.scale ?? 1),
        callback: async (value) => {
            const selected = String(value?.content ?? value?.value ?? value);
            if (selected === "Copy Image Path") {
                await copyTextToClipboard(await resolveInputImageCopyPath(path));
                showLoaderToast("Full image path copied.");
                return;
            }
            try {
                await copyImageElementToClipboard(image, path);
                showLoaderToast("Image copied.");
            } catch (error) {
                console.warn("[DenoMultiImageLoader] Copy image failed.", error);
                const copiedPath = await copyTextToClipboard(await resolveInputImageCopyPath(path));
                showLoaderToast(copiedPath ? "Copy image failed. Path copied." : "Copy image failed.");
            }
        },
    });
}

async function resolveInputImageCopyPath(path) {
    const storedPath = String(path || "");
    if (!storedPath) {
        return "";
    }
    try {
        const response = await api.fetchApi(`/deno/input-image-path?path=${encodeURIComponent(storedPath)}`);
        if (response?.ok) {
            const payload = await response.json();
            const resolvedPath = String(payload?.resolved_path || "");
            if (resolvedPath) {
                return resolvedPath;
            }
        }
    } catch (error) {
        console.warn("[DenoMultiImageLoader] Resolve image path failed.", error);
    }
    return storedPath;
}

async function copyImageElementToClipboard(image, path) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is not available in this browser.");
    }
    const sourceImage = await ensureLoadedImage(image, path);
    const width = Number(sourceImage.naturalWidth || sourceImage.width || 0);
    const height = Number(sourceImage.naturalHeight || sourceImage.height || 0);
    if (!(width > 0) || !(height > 0)) {
        throw new Error("Image is not loaded yet.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Canvas is not available.");
    }
    context.drawImage(sourceImage, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result) {
                resolve(result);
            } else {
                reject(new Error("Could not encode image for clipboard."));
            }
        }, "image/png");
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function ensureLoadedImage(image, path) {
    if (image?.complete && Number(image.naturalWidth || 0) > 0) {
        return Promise.resolve(image);
    }

    const urls = createInputImageViewUrls(path);
    return new Promise((resolve, reject) => {
        const fallbackImage = new Image();
        let urlIndex = 0;
        fallbackImage.onload = () => resolve(fallbackImage);
        fallbackImage.onerror = () => {
            urlIndex += 1;
            if (urlIndex < urls.length) {
                fallbackImage.src = urls[urlIndex];
                return;
            }
            reject(new Error("Could not load input image."));
        };
        fallbackImage.src = urls[urlIndex] || "";
    });
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_error) {
            // Fall through to the legacy clipboard path.
        }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch (_error) {
        copied = false;
    }
    textarea.remove();
    return copied;
}

function showLoaderToast(message) {
    ensureLoaderToastStyles();
    document.querySelectorAll(".deno-multi-image-loader-toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = "deno-multi-image-loader-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1450);
}

function ensureLoaderToastStyles() {
    if (document.getElementById("deno-multi-image-loader-toast-styles")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "deno-multi-image-loader-toast-styles";
    style.textContent = `
        .deno-multi-image-loader-toast {
            position: fixed;
            left: 50%;
            bottom: 32px;
            z-index: 100001;
            transform: translateX(-50%);
            border: 1px solid rgba(72, 255, 132, 0.6);
            border-radius: 999px;
            background: rgba(4, 12, 8, 0.98);
            color: #dfffea;
            padding: 8px 12px;
            font: 700 12px/1 sans-serif;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}

function computeLoaderPresetDims(ratioX, ratioY, megapixels, divisibleBy) {
    const effectiveAlignment = getEffectiveAlignment(divisibleBy);
    const totalPixels = Math.max(0.01, megapixels) * 1_000_000;
    const baseWidth = Math.sqrt(totalPixels * ratioX / ratioY);
    const baseHeight = Math.sqrt(totalPixels * ratioY / ratioX);

    const widthCandidates = [
        ...new Set([roundLoaderUp(baseWidth, effectiveAlignment), roundLoaderDown(baseWidth, effectiveAlignment)]),
    ];
    const heightCandidates = [
        ...new Set([roundLoaderUp(baseHeight, effectiveAlignment), roundLoaderDown(baseHeight, effectiveAlignment)]),
    ];
    const candidates = new Map();

    for (const widthCandidate of widthCandidates) {
        const exactHeight = (widthCandidate * ratioY) / ratioX;
        candidates.set(
            `${widthCandidate}x${roundLoaderUp(exactHeight, effectiveAlignment)}`,
            [widthCandidate, roundLoaderUp(exactHeight, effectiveAlignment)]
        );
        candidates.set(
            `${widthCandidate}x${roundLoaderDown(exactHeight, effectiveAlignment)}`,
            [widthCandidate, roundLoaderDown(exactHeight, effectiveAlignment)]
        );
    }

    for (const heightCandidate of heightCandidates) {
        const exactWidth = (heightCandidate * ratioX) / ratioY;
        candidates.set(
            `${roundLoaderUp(exactWidth, effectiveAlignment)}x${heightCandidate}`,
            [roundLoaderUp(exactWidth, effectiveAlignment), heightCandidate]
        );
        candidates.set(
            `${roundLoaderDown(exactWidth, effectiveAlignment)}x${heightCandidate}`,
            [roundLoaderDown(exactWidth, effectiveAlignment), heightCandidate]
        );
    }

    return [...candidates.values()].reduce((best, current) => {
        const score = getLoaderPresetCandidateScore(current[0], current[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);
        const bestScore = getLoaderPresetCandidateScore(best[0], best[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);
        return compareScore(score, bestScore) < 0 ? current : best;
    });
}

function computeLoaderKeepInputRatioDims(sourceWidth, sourceHeight, megapixels, divisibleBy) {
    const effectiveAlignment = getEffectiveAlignment(divisibleBy);
    const safeSourceWidth = Math.max(effectiveAlignment, Number(sourceWidth) || 1024);
    const safeSourceHeight = Math.max(effectiveAlignment, Number(sourceHeight) || 1024);
    const totalPixels = Math.max(0.01, megapixels) * 1_000_000;
    const sourceAspect = safeSourceWidth / safeSourceHeight;
    const scale = Math.sqrt(totalPixels / Math.max(1, safeSourceWidth * safeSourceHeight));
    const baseWidth = Math.max(effectiveAlignment, safeSourceWidth * scale);
    const baseHeight = Math.max(effectiveAlignment, safeSourceHeight * scale);
    const rounders = [roundLoaderDown, roundLoaderNearest, roundLoaderUp];
    const candidates = new Map();

    for (const widthRounder of rounders) {
        const widthCandidate = widthRounder(baseWidth, effectiveAlignment);
        const exactHeight = widthCandidate / sourceAspect;
        for (const heightRounder of rounders) {
            const heightCandidate = heightRounder(exactHeight, effectiveAlignment);
            candidates.set(`${widthCandidate}x${heightCandidate}`, [widthCandidate, heightCandidate]);
        }
    }

    for (const heightRounder of rounders) {
        const heightCandidate = heightRounder(baseHeight, effectiveAlignment);
        const exactWidth = heightCandidate * sourceAspect;
        for (const widthRounder of rounders) {
            const widthCandidate = widthRounder(exactWidth, effectiveAlignment);
            candidates.set(`${widthCandidate}x${heightCandidate}`, [widthCandidate, heightCandidate]);
        }
    }

    candidates.set(
        `${roundLoaderNearest(baseWidth, effectiveAlignment)}x${roundLoaderNearest(baseHeight, effectiveAlignment)}`,
        [roundLoaderNearest(baseWidth, effectiveAlignment), roundLoaderNearest(baseHeight, effectiveAlignment)]
    );

    return [...candidates.values()].reduce((best, current) => {
        const score = getLoaderAutoCandidateScore(current[0], current[1], baseWidth, baseHeight, totalPixels, sourceAspect);
        const bestScore = getLoaderAutoCandidateScore(best[0], best[1], baseWidth, baseHeight, totalPixels, sourceAspect);
        return compareScore(score, bestScore) < 0 ? current : best;
    });
}

function getEffectiveAlignment(divisibleBy) {
    const value = Number.parseInt(String(divisibleBy ?? 32), 10);
    return Number.isFinite(value) && value > 0 ? value : 32;
}

function roundLoaderUp(value, multiple) {
    const effectiveAlignment = getEffectiveAlignment(multiple);
    return Math.ceil(Math.max(value, effectiveAlignment) / effectiveAlignment) * effectiveAlignment;
}

function roundLoaderDown(value, multiple) {
    const effectiveAlignment = getEffectiveAlignment(multiple);
    return Math.max(effectiveAlignment, Math.floor(value / effectiveAlignment) * effectiveAlignment);
}

function roundLoaderNearest(value, multiple) {
    const effectiveAlignment = getEffectiveAlignment(multiple);
    return Math.max(effectiveAlignment, Math.floor(value / effectiveAlignment + 0.5) * effectiveAlignment);
}

function getLoaderPresetCandidateScore(width, height, baseWidth, baseHeight, totalPixels, targetRatio) {
    const preferredDimensions = [512, 720, 768, 1024, 1088, 1536, 1920];
    const widthError = Math.abs(width - baseWidth) / baseWidth;
    const heightError = Math.abs(height - baseHeight) / baseHeight;
    const preferenceError =
        Math.min(...preferredDimensions.map((preferred) => Math.abs(width - preferred))) +
        Math.min(...preferredDimensions.map((preferred) => Math.abs(height - preferred)));
    const areaError = Math.abs((width * height) - totalPixels) / totalPixels;
    const ratioError = Math.abs((width / height) - targetRatio) / targetRatio;
    return [widthError + heightError, preferenceError, areaError, ratioError];
}

function getLoaderAutoCandidateScore(width, height, baseWidth, baseHeight, totalPixels, sourceRatio) {
    const areaError = Math.abs((width * height) - totalPixels) / totalPixels;
    const ratioError = Math.abs((width / height) - sourceRatio) / sourceRatio;
    const distanceError =
        Math.abs(width - baseWidth) / baseWidth +
        Math.abs(height - baseHeight) / baseHeight;
    return [areaError, ratioError, distanceError];
}

function compareScore(score, bestScore) {
    for (let i = 0; i < score.length; i += 1) {
        if (score[i] < bestScore[i]) return -1;
        if (score[i] > bestScore[i]) return 1;
    }
    return 0;
}

function patchSequencer(nodeType) {
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const result = onNodeCreated?.apply(this, arguments);
        setupSequencer(this);
        return result;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
        // Mark nodes restored from workflow serialization so we do not overwrite
        // saved dynamic values with peer clone defaults.
        this.__denoLoadedFromWorkflow = true;
        const result = onConfigure?.apply(this, arguments);
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
        if (name === "strength_sync" || name === "bypass") {
            return normalizeBooleanValue(value);
        }
        return value;
    }

    if (name === "num_images" || name === "frame_rate" || name.startsWith("insert_frame_")) {
        return Math.round(numeric);
    }

    if (name === "strength_sync" || name === "bypass") {
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
    if (name === "bypass") {
        return false;
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

function hasSequencerDynamicState(node) {
    if (!node?.properties) {
        return false;
    }
    for (let index = 1; index <= 50; index += 1) {
        if (node.properties[`insert_frame_${index}`] !== undefined) {
            return true;
        }
        if (node.properties[`insert_second_${index}`] !== undefined) {
            return true;
        }
        if (node.properties[`strength_${index}`] !== undefined) {
            return true;
        }
    }
    return false;
}

function getAllSequencerNodes(referenceNode = null) {
    const graph = referenceNode?.graph || app.graph;
    const registry = window.__denoLtxSequencerNodes || new Set();
    const result = new Set();

    for (const candidate of registry) {
        if (!candidate || candidate.comfyClass !== SEQUENCER_NODE || candidate.graph !== graph) {
            registry.delete(candidate);
            continue;
        }

        const inGraph = typeof graph?.getNodeById === "function"
            ? graph.getNodeById(candidate.id) === candidate
            : (graph?._nodes || []).includes(candidate);
        if (!inGraph) {
            registry.delete(candidate);
            continue;
        }

        result.add(candidate);
    }

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

function scheduleUpstreamCountSync(node, options = {}) {
    const propagate = options?.propagate !== false;
    const delays = [0, 50, 140, 320];
    for (const delay of delays) {
        setTimeout(() => {
            if (!node?.graph) {
                return;
            }
            const multiInputSlot = node.inputs?.find((slot) => slot.name === "multi_input");
            const hasLinks = getInputLinkIds(multiInputSlot).length > 0;
            if (!hasLinks) {
                if (node.__denoHadInputLink) {
                    node.__denoHadInputLink = false;
                    node._syncImageCount?.(0, { propagate: false });
                }
                return;
            }
            node.__denoHadInputLink = true;
            const count = readUpstreamImageCount(node);
            if (typeof count === "number") {
                node._syncImageCount?.(count, { propagate });
            }
        }, delay);
    }
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
    node.__denoHadInputLink = false;

    const strengthSyncWidget = getWidget(node, "strength_sync");
    const initialStrengthSync = normalizeBooleanValue(
        node.properties.strength_sync ?? strengthSyncWidget?.value ?? true
    );
    if (strengthSyncWidget) {
        strengthSyncWidget.value = initialStrengthSync;
    }
    node.properties.strength_sync = initialStrengthSync;

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
            if (!["num_images", "insert_mode", "frame_rate", "strength_sync", "bypass"].includes(widget.name)) {
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
                    } else if (widget.name === "bypass") {
                        this.setDirtyCanvas?.(true, true);
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
        } else if (widgetName === "bypass") {
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
                    // Preserve already-saved properties first, then fall back to current widget value.
                    this.properties[name] = normalizeSequencerOrDefault(
                        name,
                        this.properties[name],
                        widget.value
                    );
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

    const originalConnectInput = node.onConnectInput;
    node.onConnectInput = function (inputIndex) {
        const result = originalConnectInput?.apply(this, arguments);
        if (result === false) {
            return result;
        }
        if (this.inputs?.[inputIndex]?.name === "multi_input") {
            this.__denoHadInputLink = true;
            scheduleUpstreamCountSync(this);
        }
        return result;
    };

    const originalConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, linkInfo) {
        originalConnectionsChange?.apply(this, arguments);
        if (type !== 1 || this.inputs?.[index]?.name !== "multi_input") {
            return;
        }
        if (connected) {
            this.__denoHadInputLink = true;
            scheduleUpstreamCountSync(this);
            return;
        }
        if (this.__denoHadInputLink) {
            this.__denoHadInputLink = false;
            this._syncImageCount?.(0, { propagate: false });
        }
    };

    setTimeout(() => {
        // Keep values loaded from workflow JSON intact.
        // Peer clone is only for fresh sequencer nodes with no dynamic state yet.
        if (!node.__denoLoadedFromWorkflow && !hasSequencerDynamicState(node)) {
            const peerNode = getAllSequencerNodes(node).find((candidate) => candidate !== node);
            if (peerNode) {
                cloneSequencerState(peerNode, node);
            }
        }
        const count = readUpstreamImageCount(node);
        if (typeof count === "number") {
            node._syncImageCount?.(count);
        }
        node._applyWidgetCount(node.properties.num_images ?? getWidget(node, "num_images")?.value ?? 0);
        scheduleUpstreamCountSync(node, { propagate: false });
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
        const hasLinks = getInputLinkIds(multiInputSlot).length > 0;
        if (!hasLinks) {
            if (node.__denoHadInputLink) {
                node.__denoHadInputLink = false;
                node._syncImageCount?.(0, { propagate: false });
            }
            return;
        }
        node.__denoHadInputLink = true;
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
