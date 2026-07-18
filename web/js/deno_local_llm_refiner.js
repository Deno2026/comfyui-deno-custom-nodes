import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DenoLocalLLMRefiner";
const DISPLAY_NAME = "(Deno) Local LLM Loader";
const OLD_DISPLAY_NAME = "(Deno) Local LLM Prompt Refiner";
const LEGACY_DISPLAY_NAMES = new Set([OLD_DISPLAY_NAME, "(Deno) Local LLM Prompt Helper"]);
const GATE_NODE_NAME = "DenoAIReviewGate";
const GATE_DISPLAY_NAME = "(Deno) Local LLM Reviewer";
const GATE_LEGACY_DISPLAY_NAMES = new Set(["(Deno) AI Review Gate", "(Deno) Local LLM Gate"]);
const GENERATED_PREFIX = "deno_local_llm_";
const GATE_GENERATED_PREFIX = "deno_local_llm_gate_";
const OPENAI_MODEL_PICKER_NAME = `${GENERATED_PREFIX}model_picker`;
const DEFAULT_WIDTH = 560;
const GATE_DEFAULT_WIDTH = 420;
const PREVIEW_HEIGHT = 150;
const PROMPT_WIDGET_MIN_HEIGHT = 118;
const PROMPT_WIDGET_DEFAULT_HEIGHT = 156;
const PROMPT_WIDGET_MAX_HEIGHT = 460;
const PROMPT_WIDGET_SIDE_INSET = 0;
const PREVIEW_TEXT_FONT = "10px monospace";
const PREVIEW_LINE_HEIGHT = 13;
const PREVIEW_SCROLLBAR_TRACK_WIDTH = 8;
const PREVIEW_SCROLLBAR_HIT_WIDTH = 18;
const PREVIEW_SCROLLBAR_RIGHT_PAD = 8;
const LOADER_WIDGET_SOCKET_NAMES = new Set([
    "provider",
    "Provider",
    "ollama_model",
    "Ollama Model",
    "lm_studio_model",
    "LM Studio Model",
    "custom_server_url",
    "Custom Server URL",
    "Legacy Server",
    "custom_model",
    "Custom Model",
    "Legacy Model",
    "system_prompt",
    "System Prompt",
    "user_prompt",
    "thinking",
    "Thinking",
    "seed",
    "Seed",
    "seed_mode",
    "Seed Mode",
    "model_memory",
    "Model After Run",
    "keep_minutes",
    "Keep Minutes",
    "comfy_vram_policy",
    "ComfyUI VRAM",
    "Unload ComfyUI Models Setting",
]);
const PROVIDER_OLLAMA = "Ollama";
const PROVIDER_LM_STUDIO = "LM Studio";
const PROVIDER_LLAMA_CPP = "llama.cpp";
const PROVIDER_VLLM = "vLLM";
const PROVIDER_CUSTOM = "Custom";
const LEGACY_PROVIDER_CUSTOM = "Custom Local Server";
const PROVIDER_VALUES = [PROVIDER_OLLAMA, PROVIDER_LM_STUDIO, PROVIDER_LLAMA_CPP, PROVIDER_VLLM, PROVIDER_CUSTOM];
const OPENAI_COMPATIBLE_PROVIDERS = new Set([PROVIDER_LLAMA_CPP, PROVIDER_VLLM, PROVIDER_CUSTOM]);
const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";
const LM_STUDIO_DEFAULT_URL = "http://127.0.0.1:1234/v1";
const LLAMA_CPP_DEFAULT_URL = "http://127.0.0.1:8080/v1";
const VLLM_DEFAULT_URL = "http://127.0.0.1:8000/v1";
const CUSTOM_DEFAULT_URL = "http://127.0.0.1:8000/v1";
const LEGACY_CUSTOM_DEFAULT_URL = CUSTOM_DEFAULT_URL;
const MODEL_MEMORY_VALUES = ["Unload after run", "Keep for minutes", "Keep loaded"];
const MODEL_MEMORY_ALIASES = {
    "Free VRAM after batch": "Unload after run",
};
const COMFY_VRAM_VALUES = [
    "Auto: unload only before first LLM call",
    "Always unload before each LLM call",
    "Never unload before LLM call",
];
const COMFY_VRAM_ALIASES = {
    Auto: "Auto: unload only before first LLM call",
    "Always free": "Always unload before each LLM call",
    "Never free": "Never unload before LLM call",
};
const SEED_MODE_VALUES = ["fixed", "increment", "decrement", "randomize"];
const LOADER_SERIALIZED_WIDGET_COUNT = 13;
const GATE_SERIALIZED_WIDGET_COUNT = 3;
const LOADER_STATE_PROPERTY = "deno_local_llm_state";
const LOADER_STATE_SCHEMA = 1;
const LOADER_STATE_TEXT_LIMIT = 120000;
const LOADER_SERVER_URLS_BY_PROVIDER_PROPERTY = "denoLocalLLMServerUrlsByProvider";
const LOADER_SERIALIZED_WIDGET_NAMES = [
    "provider",
    "ollama_model",
    "lm_studio_model",
    "custom_server_url",
    "custom_model",
    "system_prompt",
    "thinking",
    "seed",
    "seed_mode",
    "model_memory",
    "keep_minutes",
    "comfy_vram_policy",
    "prompt",
];
const LOADER_GENERATED_BUTTON_VALUES = ["Refresh Models", "Stop LLM", "Unload LLM"];
const LOADER_SYSTEM_PROMPT_BUTTON_VALUE = "System Prompt";
const LOADER_GENERATED_WIDGET_RESET_VALUES = Object.freeze({
    [`${GENERATED_PREFIX}refresh_models`]: "Refresh Models",
    [`${GENERATED_PREFIX}stop_llm`]: "Stop LLM",
    [`${GENERATED_PREFIX}unload_llm`]: "Unload LLM",
    [`${GENERATED_PREFIX}preview`]: "",
    [`${GENERATED_PREFIX}system_prompt_button`]: LOADER_SYSTEM_PROMPT_BUTTON_VALUE,
});
const MISSING_SAVED_MODEL_PREFIX = "Missing saved model: ";
const LEGACY_CONTROL_AFTER_GENERATE_VALUES = new Set(["fixed", "randomize", "increment", "decrement", "random"]);
const SHIFTED_MODEL_WIDGET_VALUES = new Set([
    ...PROVIDER_VALUES,
    LEGACY_PROVIDER_CUSTOM,
    ...MODEL_MEMORY_VALUES,
    ...COMFY_VRAM_VALUES,
    ...Object.keys(COMFY_VRAM_ALIASES),
    ...SEED_MODE_VALUES,
    "Refresh Models",
    "Stop LLM",
    "Unload LLM",
    "System Prompt",
    "Prompt",
    "Thinking",
    "Seed",
    "Seed Mode",
    "Model After Run",
    "Unload ComfyUI Models Setting",
    "ComfyUI VRAM",
    "Ollama Model",
    "LM Studio Model",
    "Detected Models",
    "Legacy Model",
    "Custom Model",
    "Custom Server URL",
]);
let graphScanInstalled = false;
let previewWheelAttachedCanvas = null;
let previewWheelAttachedGlobal = false;
let previewWheelHandler = null;
let previewWheelWrappedCanvas = null;
let previewPointerAttachedCanvas = null;
let previewPointerMoveHandler = null;
let previewPointerDownHandler = null;
let previewPointerUpHandler = null;
let previewPointerLeaveHandler = null;
let previewScrollbarCursorActive = false;
let previewScrollbarDragState = null;
let previewScrollbarDragOwnerFrame = 0;
let reviewerTooltipElement = null;
let reviewerTooltipOwner = null;
let reviewerTooltipOwnerFrame = 0;
const progressListenerApis = new WeakSet();
const localLLMQueuePromptApis = new WeakSet();
const localLLMAppQueuePromptApps = new WeakSet();
let progressListenerRetryScheduled = false;
const localLLMStateByNode = new WeakMap();
const localLLMDialogTokenByNode = new WeakMap();
const localLLMOwnedUiByNode = new WeakMap();
const localLLMAsyncActionByNode = new WeakMap();
let localLLMDialogTokenCounter = 0;
const localLLMGraphByPromptBundle = new WeakMap();
const localLLMPromptGraphById = new Map();
const localLLMPromptGraphRememberedAtById = new Map();
const LOCAL_LLM_EXECUTION_MAP_LIMIT = 64;
const LOCAL_LLM_EXECUTION_MAP_TTL_MS = 24 * 60 * 60 * 1000;
const previewTextDialogsByKey = new Map();
let registeredNodeData = null;
let reviewerGraphPromptHookInstalled = false;
let reviewerGraphPromptRetryScheduled = false;
const REVIEWER_SUBMIT_REGENERATE = "regenerate";
const REVIEWER_SUBMIT_APPROVE_ONCE = "approve_once";
const REVIEWER_AUTO_RETRY_MAX = 3;
const REVIEWER_AUTO_RETRY_SEED_AUTO = "auto";
const REVIEWER_PROP_AUTO_RETRY = "deno_auto_retry_on_fail";
const REVIEWER_PROP_SEED_TARGET = "deno_auto_retry_seed_target";
const REVIEWER_FALLBACK_MAX_SEED = 1125899906842624;
const SYSTEM_PROMPT_PRESET_STORAGE_KEY = "deno.localLLM.systemPromptPresets.v1";
const REVIEWER_JSON_SYSTEM_PROMPT = [
    "You are an image review judge for a ComfyUI workflow.",
    "",
    "Compare the provided prompt with the generated image.",
    "Allow fantasy, surreal, impossible, or unrealistic subjects when the prompt asks for them.",
    "Pass the image when the main subject, action, setting, and mood are mostly correct.",
    "Do not fail only because the style is slightly different unless the style mismatch is severe.",
    "Fail only when an important requested subject/action/setting is missing, the image is clearly low quality, or the result contradicts the prompt.",
    "",
    "Return only valid JSON. Do not write markdown. Do not add any text outside the JSON object.",
    "",
    "Schema:",
    "{",
    '  "verdict": "OK" or "FAIL",',
    '  "reason": "short reason for the decision",',
    '  "matched": ["important matched elements"],',
    '  "issues": ["important problems, or an empty array"]',
    "}",
].join("\n");
const PROMPT_ONLY_SYSTEM_PROMPT = [
    "You are an image prompt generator.",
    "",
    "Return exactly one final positive image prompt only.",
    "Do not explain, analyze, reason, list steps, give tips, add headings, use markdown, or mention your process.",
    "Do not write phrases like \"thinking process\", \"analyze the request\", \"draft\", \"final output\", \"tips\", or \"here is\".",
    "",
    "Write exactly one line in this format:",
    "DENO_FINAL_PROMPT: your final image prompt here",
    "",
    "The app will pass only the text after DENO_FINAL_PROMPT: downstream.",
    "If the user asks for a specific language, use that language. Otherwise write a natural English image prompt.",
].join("\n");
const BUILTIN_SYSTEM_PROMPT_PRESETS = Object.freeze([
    {
        id: "prompt_only",
        label: "Prompt Only",
        description: "Image prompt preset that keeps only the final prompt and removes explanations.",
        text: PROMPT_ONLY_SYSTEM_PROMPT,
    },
    {
        id: "reviewer_json",
        label: "Reviewer JSON",
        description: "Image review preset with OK/FAIL verdict and a visible reason.",
        text: REVIEWER_JSON_SYSTEM_PROMPT,
    },
]);
const REVIEWER_HOW_TO_USE_SECTIONS = Object.freeze([
    {
        title: "What this node does",
        lines: [
            "The Reviewer is a gate. It does not judge the image by itself; it reads review text from another node.",
            "If the review says OK, PASS, APPROVE, or APPROVED, image/audio pass through.",
            "If the review says FAIL, REJECT, or BAD, image/audio are blocked.",
            "JSON also works. Use a verdict field like {\"verdict\":\"OK\",\"reason\":\"...\"} to show a readable reason.",
        ],
    },
    {
        title: "Basic setup",
        lines: [
            "1. Send the generated IMAGE into the Reviewer's image input.",
            "2. Put a Local LLM Loader before the Reviewer.",
            "3. Send the same generated IMAGE into the Loader's image input when you want visual review.",
            "4. Send the original prompt or final prompt into the Loader's prompt field/input.",
            "5. Connect Loader result into the Reviewer's review result input.",
            "6. Connect Reviewer image output into Preview Image, Save Image, or the next workflow step.",
        ],
    },
    {
        title: "Recommended LLM prompt",
        lines: [
            "Open the Loader's System Prompt popup and load the built-in Reviewer JSON preset.",
            "That preset tells the LLM to allow requested fantasy or surreal scenes, judge the main subject/action/setting first, and return verdict + reason.",
            "Plain one-word review still works, so old workflows using only OK or Fail are compatible.",
        ],
    },
    {
        title: "Buttons",
        lines: [
            "Review: normal mode. The review text decides pass/block.",
            "Pass: bypass review and pass through when the workflow runs.",
            "Approve Once: pass only the current reviewed result using the saved snapshot, without rerunning the upstream generator.",
            "Regenerate: rerun the upstream path before this Reviewer.",
            "Retry x3: when a review fails, automatically rerun up to 3 times.",
            "Seed: choose which upstream seed is incremented during automatic retry.",
        ],
    },
    {
        title: "Audio",
        lines: [
            "Audio is gated together with the review result.",
            "The Local LLM Loader does not listen to audio directly. Use audio-capable text generation before the Reviewer if the review text should include audio judgement.",
        ],
    },
]);

installProgressListener();

function safeAppGraph() {
    try {
        return app?.rootGraph || app?.graph || app?.canvas?.graph || null;
    } catch {
        return null;
    }
}

function localLLMCandidateGraphs() {
    const graphs = [];
    const pushGraph = (graph) => {
        if (graph && !graphs.includes(graph)) {
            graphs.push(graph);
        }
    };
    try {
        pushGraph(app?.rootGraph);
        pushGraph(app?.graph);
        pushGraph(app?.canvas?.graph);
    } catch {
        // Ignore partially initialized ComfyUI app state.
    }
    return graphs;
}

function localLLMGraphNodes(graph) {
    return [
        ...(Array.isArray(graph?._nodes) ? graph._nodes : []),
        ...(Array.isArray(graph?.nodes) ? graph.nodes : []),
    ];
}

function safeNodeGraph(node) {
    try {
        return node?.graph || null;
    } catch {
        return null;
    }
}

function localLLMActiveGraph() {
    try {
        return app?.canvas?.graph || app?.graph || app?.rootGraph || null;
    } catch {
        return null;
    }
}

function requestLocalLLMAnimationFrame(callback) {
    try {
        return globalThis?.window?.requestAnimationFrame?.(callback) || 0;
    } catch {
        return 0;
    }
}

function cancelLocalLLMAnimationFrame(frame) {
    if (!frame) {
        return;
    }
    try {
        globalThis?.window?.cancelAnimationFrame?.(frame);
    } catch {
        // Ignore teardown races while ComfyUI replaces a graph tab.
    }
}

function ownLocalLLMBodyOverlay(node, overlay, beforeRemove = null) {
    const key = localLLMNodeStateKey(node);
    if (!key || !overlay) {
        return () => overlay?.remove?.();
    }

    const nativeRemove = typeof overlay.remove === "function"
        ? overlay.remove.bind(overlay)
        : () => overlay.parentNode?.removeChild?.(overlay);
    let active = true;
    let frame = 0;
    const owners = localLLMOwnedUiByNode.get(key) || new Set();
    localLLMOwnedUiByNode.set(key, owners);

    const release = () => {
        if (!active) {
            return;
        }
        active = false;
        cancelLocalLLMAnimationFrame(frame);
        frame = 0;
        owners.delete(close);
        if (!owners.size) {
            localLLMOwnedUiByNode.delete(key);
        }
    };
    const close = () => {
        if (!active) {
            return;
        }
        release();
        try {
            beforeRemove?.();
        } finally {
            nativeRemove();
        }
    };
    owners.add(close);
    try {
        overlay.remove = close;
    } catch {
        // The owner watcher still releases bookkeeping if a host element locks remove().
    }

    const ownerGraph = safeNodeGraph(node);
    const watchOwner = () => {
        frame = 0;
        if (!active) {
            return;
        }
        if (!overlay.isConnected) {
            close();
            return;
        }
        const activeGraph = localLLMActiveGraph();
        if (ownerGraph && activeGraph && activeGraph !== ownerGraph) {
            close();
            return;
        }
        frame = requestLocalLLMAnimationFrame(watchOwner);
    };
    frame = requestLocalLLMAnimationFrame(watchOwner);
    return close;
}

function closeLocalLLMOwnedUi(node) {
    const key = localLLMNodeStateKey(node);
    if (!key) {
        return;
    }
    for (const close of Array.from(localLLMOwnedUiByNode.get(key) || [])) {
        try {
            close();
        } catch {
            // Continue closing the remaining node-owned UI.
        }
    }
    localLLMOwnedUiByNode.delete(key);
    for (const [dialogKey, dialog] of Array.from(previewTextDialogsByKey.entries())) {
        if (dialog?.node !== node) {
            continue;
        }
        try {
            dialog.overlay?.remove?.();
        } catch {
            // The stale entry is removed below even if its host element is already gone.
        }
        previewTextDialogsByKey.delete(dialogKey);
    }
    cancelPreviewScrollbarDrag(node);
    removeReviewerTooltipForNode(node);
}

function localLLMAsyncActionCanAbort(action) {
    return String(action || "") === "refresh";
}

function abortLocalLLMAsyncAction(actionState) {
    if (!actionState?.controller || !localLLMAsyncActionCanAbort(actionState.action)) {
        return false;
    }
    try {
        actionState.controller.abort();
        return true;
    } catch {
        return false;
    }
}

function invalidateLocalLLMAsyncAction(node, reason = "invalidated") {
    const key = localLLMNodeStateKey(node);
    if (!key) {
        return 0;
    }
    const previous = localLLMAsyncActionByNode.get(key);
    abortLocalLLMAsyncAction(previous);
    const generation = Math.max(0, Number(previous?.generation) || 0) + 1;
    localLLMAsyncActionByNode.set(key, {
        generation,
        action: "",
        reason: String(reason || "invalidated"),
        controller: null,
    });
    return generation;
}

function beginLocalLLMAsyncAction(node, action) {
    const key = localLLMNodeStateKey(node);
    if (!key) {
        return null;
    }
    const previous = localLLMAsyncActionByNode.get(key);
    abortLocalLLMAsyncAction(previous);
    const token = {
        generation: Math.max(0, Number(previous?.generation) || 0) + 1,
        action: String(action || "action"),
        controller: typeof AbortController === "function" ? new AbortController() : null,
    };
    localLLMAsyncActionByNode.set(key, token);
    return token;
}

function isLocalLLMAsyncActionCurrent(node, token) {
    const key = localLLMNodeStateKey(node);
    return Boolean(key && token && localLLMAsyncActionByNode.get(key) === token);
}

function finishLocalLLMAsyncAction(node, token) {
    const key = localLLMNodeStateKey(node);
    if (!key || !token || localLLMAsyncActionByNode.get(key) !== token) {
        return false;
    }
    localLLMAsyncActionByNode.set(key, {
        generation: token.generation,
        action: "",
        reason: "finished",
        controller: null,
    });
    return true;
}

function localLLMAsyncFetchOptions(token, options) {
    if (!token?.controller?.signal) {
        return options;
    }
    return { ...options, signal: token.controller.signal };
}

function installLocalLLMNodeCleanup(node) {
    if (!node || node.__denoLocalLLMNodeCleanupInstalled) {
        return;
    }
    node.__denoLocalLLMNodeCleanupInstalled = true;
    const previousOnRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        invalidateLocalLLMAsyncAction(this, "node removed");
        closeLocalLLMOwnedUi(this);
        return previousOnRemoved?.apply(this, args);
    };
}

function markGraphDirty(node) {
    node?.setDirtyCanvas?.(true, true);
    safeAppGraph()?.setDirtyCanvas?.(true, true);
}

function localLLMNodeStateKey(node) {
    return node && (typeof node === "object" || typeof node === "function") ? node : null;
}

function pruneLocalLLMPromptGraphs(now = Date.now()) {
    const currentTime = Number(now);
    for (const [key, rememberedAt] of Array.from(localLLMPromptGraphRememberedAtById.entries())) {
        if (
            Number.isFinite(currentTime) &&
            Number.isFinite(Number(rememberedAt)) &&
            currentTime - Number(rememberedAt) > LOCAL_LLM_EXECUTION_MAP_TTL_MS
        ) {
            localLLMPromptGraphRememberedAtById.delete(key);
            localLLMPromptGraphById.delete(key);
        }
    }
    while (localLLMPromptGraphById.size > LOCAL_LLM_EXECUTION_MAP_LIMIT) {
        const oldestKey = localLLMPromptGraphById.keys().next().value;
        localLLMPromptGraphById.delete(oldestKey);
        localLLMPromptGraphRememberedAtById.delete(oldestKey);
    }
    return localLLMPromptGraphById.size;
}

function rememberLocalLLMPromptBundleGraph(promptBundle, graph) {
    if (
        !promptBundle ||
        (typeof promptBundle !== "object" && typeof promptBundle !== "function") ||
        !graph
    ) {
        return false;
    }
    localLLMGraphByPromptBundle.set(promptBundle, graph);
    return true;
}

function rememberLocalLLMPromptGraph(promptId, graph) {
    const key = String(promptId || "").trim();
    if (!key || !graph) {
        return false;
    }
    const now = Date.now();
    pruneLocalLLMPromptGraphs(now);
    localLLMPromptGraphById.delete(key);
    localLLMPromptGraphRememberedAtById.delete(key);
    localLLMPromptGraphById.set(key, graph);
    localLLMPromptGraphRememberedAtById.set(key, now);
    pruneLocalLLMPromptGraphs(now);
    return true;
}

function forgetLocalLLMPromptGraph(promptId) {
    const key = String(promptId || "").trim();
    if (!key) {
        return false;
    }
    localLLMPromptGraphRememberedAtById.delete(key);
    return localLLMPromptGraphById.delete(key);
}

function localLLMNodeInGraph(graph, nodeId) {
    const id = String(nodeId ?? "");
    if (!graph || !id) {
        return null;
    }
    const numericId = Number(id);
    const idMap = graph?._nodes_by_id;
    const node =
        graph?.getNodeById?.(id) ||
        (!Number.isNaN(numericId) ? graph?.getNodeById?.(numericId) : null) ||
        (typeof idMap?.get === "function" ? idMap.get(id) || idMap.get(numericId) : null) ||
        idMap?.[id] ||
        (!Number.isNaN(numericId) ? idMap?.[numericId] : null) ||
        localLLMGraphNodes(graph).find((candidate) => String(candidate?.id ?? "") === id);
    return node?.type === NODE_NAME ? node : null;
}

function localLLMNodeForExecutionDetail(detail) {
    const promptId = String(detail?.prompt_id || "").trim();
    if (!promptId) {
        return null;
    }
    pruneLocalLLMPromptGraphs();
    return localLLMNodeInGraph(localLLMPromptGraphById.get(promptId), detail?.node_id);
}

function invalidateLocalLLMAsyncActionsForExecutionDetail(detail, reason = "execution") {
    const promptId = String(detail?.prompt_id || "").trim();
    if (!promptId) {
        return 0;
    }
    pruneLocalLLMPromptGraphs();
    const graph = localLLMPromptGraphById.get(promptId);
    if (!graph) {
        return 0;
    }
    const nodeId = detail?.node_id ?? detail?.node;
    const nodes = nodeId === null || nodeId === undefined || String(nodeId).trim() === ""
        ? localLLMGraphNodes(graph).filter((node) => node?.type === NODE_NAME)
        : [localLLMNodeInGraph(graph, nodeId)].filter(Boolean);
    for (const node of nodes) {
        invalidateLocalLLMAsyncAction(node, reason);
    }
    return nodes.length;
}

function invalidateLocalLLMAsyncActionsForGraph(graph, reason = "queue submitted") {
    const nodes = localLLMGraphNodes(graph).filter((node) => node?.type === NODE_NAME);
    for (const node of nodes) {
        invalidateLocalLLMAsyncAction(node, reason);
    }
    return nodes.length;
}

function localLLMNodeDialogToken(node) {
    const key = localLLMNodeStateKey(node);
    if (!key) {
        return "";
    }
    let token = localLLMDialogTokenByNode.get(key);
    if (!token) {
        localLLMDialogTokenCounter += 1;
        token = `node-${localLLMDialogTokenCounter}`;
        localLLMDialogTokenByNode.set(key, token);
    }
    return token;
}

function localLLMCachedStateForNode(node) {
    const key = localLLMNodeStateKey(node);
    return key ? localLLMStateByNode.get(key) || null : null;
}

function localLLMStateText(value) {
    return String(value ?? "").slice(0, LOADER_STATE_TEXT_LIMIT);
}

function sanitizeLocalLLMState(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const index = Number(raw.index || 0);
    const total = Number(raw.total || 0);
    const updatedAt = Number(raw.updatedAt || Date.now());
    return {
        schema: LOADER_STATE_SCHEMA,
        status: localLLMStateText(raw.status || "ready").slice(0, 200),
        provider: localLLMStateText(raw.provider || "").slice(0, 80),
        model: localLLMStateText(raw.model || "").slice(0, 500),
        answer: localLLMStateText(raw.answer || ""),
        thinking: localLLMStateText(raw.thinking || ""),
        error: localLLMStateText(raw.error || ""),
        index: Number.isFinite(index) ? Math.max(0, index) : 0,
        total: Number.isFinite(total) ? Math.max(0, total) : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
}

function persistLocalLLMStateToProperties(node, state) {
    if (!node) {
        return null;
    }
    const clean = sanitizeLocalLLMState(state);
    if (!clean) {
        return null;
    }
    node.properties = node.properties || {};
    node.properties[LOADER_STATE_PROPERTY] = clean;
    return clean;
}

function restoreLocalLLMStateFromProperties(node) {
    const restored = sanitizeLocalLLMState(node?.properties?.[LOADER_STATE_PROPERTY]);
    if (!node || !restored) {
        return null;
    }
    node.__denoLocalLLMState = restored;
    const key = localLLMNodeStateKey(node);
    if (key) {
        localLLMStateByNode.set(key, restored);
    }
    return restored;
}

function setLocalLLMNodeState(node, patch) {
    if (!node) {
        return {};
    }
    const key = localLLMNodeStateKey(node);
    const previous =
        node.__denoLocalLLMState ||
        restoreLocalLLMStateFromProperties(node) ||
        (key ? localLLMStateByNode.get(key) : null) ||
        {};
    const next = sanitizeLocalLLMState({
        ...previous,
        ...patch,
        updatedAt: patch?.updatedAt || Date.now(),
    }) || {};
    node.__denoLocalLLMState = next;
    if (key) {
        localLLMStateByNode.set(key, next);
    }
    persistLocalLLMStateToProperties(node, next);
    updateOpenPreviewTextDialogs(node, next);
    return next;
}

function getLocalLLMNodeState(node) {
    return node?.__denoLocalLLMState || restoreLocalLLMStateFromProperties(node) || localLLMCachedStateForNode(node) || {};
}

function localLLMProgressStatePatch(node, detail) {
    const payload = detail || {};
    const previous = getLocalLLMNodeState(node);
    const owns = (key) => Object.prototype.hasOwnProperty.call(payload, key);
    const progressError = String(payload.error || "");
    const status = String(payload.status || "ready");
    const rawIndex = Number(payload.index || 0);
    const rawTotal = Number(payload.total || 0);
    const hasAnswer = owns("answer");
    const hasThinking = owns("thinking");
    const answer = hasAnswer ? String(payload.answer || "") : String(previous?.answer || "");
    const thinking = hasThinking ? String(payload.thinking || "") : String(previous?.thinking || "");
    const startsNewRun =
        !progressError &&
        status === "running" &&
        hasAnswer &&
        hasThinking &&
        !answer &&
        !thinking &&
        (!Number.isFinite(rawIndex) || rawIndex <= 0);

    return {
        status,
        provider: owns("provider") ? String(payload.provider || "") : String(previous?.provider || ""),
        model: owns("model") ? String(payload.model || "") : String(previous?.model || ""),
        index: Number.isFinite(rawIndex) ? Math.max(0, rawIndex) : 0,
        total: Number.isFinite(rawTotal) ? Math.max(0, rawTotal) : Number(previous?.total || 0),
        answer: progressError ? "" : answer,
        thinking: progressError || startsNewRun
            ? ""
            : hasThinking && thinking
              ? thinking
              : String(previous?.thinking || ""),
        error: progressError ? localLLMExecutionErrorMessage({ ...payload, exception_message: progressError }) : "",
    };
}

function previewTextDialogKey(node, kind) {
    const nodeKey = localLLMNodeDialogToken(node);
    const textKind = String(kind || "");
    return nodeKey && textKind ? `${nodeKey}:${textKind}` : "";
}

function previewTextDialogTitle(state, kind, fallback = "Preview") {
    if (kind === "thinking") {
        return "Thinking";
    }
    if (kind === "result") {
        return state?.error ? "Error" : "Result";
    }
    return fallback;
}

function previewTextDialogBody(state, kind, fallback = "Waiting for run output.") {
    if (kind === "thinking") {
        return String(state?.thinking || fallback);
    }
    if (kind === "result") {
        return String(state?.error || state?.answer || fallback);
    }
    return String(fallback || "");
}

function previewTextAreaNearBottom(textBox) {
    if (!textBox) {
        return true;
    }
    return textBox.scrollHeight - textBox.scrollTop - textBox.clientHeight <= 28;
}

function setPreviewTextDialogContent(dialog, state) {
    if (!dialog?.overlay?.isConnected || !dialog.textBox) {
        return false;
    }
    const nextTitle = previewTextDialogTitle(state, dialog.kind, dialog.fallbackTitle);
    const nextText = previewTextDialogBody(state, dialog.kind, dialog.fallbackText);
    const shouldFollow = previewTextAreaNearBottom(dialog.textBox);
    if (dialog.titleElement) {
        dialog.titleElement.textContent = nextTitle;
    }
    if (dialog.textBox.value !== nextText) {
        dialog.textBox.value = nextText;
        if (shouldFollow) {
            dialog.textBox.scrollTop = dialog.textBox.scrollHeight;
        }
    }
    return true;
}

function updateOpenPreviewTextDialogs(node, state = getLocalLLMNodeState(node)) {
    for (const kind of ["thinking", "result"]) {
        const key = previewTextDialogKey(node, kind);
        const dialog = key ? previewTextDialogsByKey.get(key) : null;
        if (!dialog) {
            continue;
        }
        if (!setPreviewTextDialogContent(dialog, state)) {
            previewTextDialogsByKey.delete(key);
        }
    }
}

function localLLMNodeById(nodeId, options = {}) {
    const allowSingleFallback = options?.allowSingleFallback !== false;
    const id = String(nodeId ?? "");
    if (!id) {
        return null;
    }
    const localNodes = [];
    for (const graph of localLLMCandidateGraphs()) {
        const node = localLLMNodeInGraph(graph, id);
        if (node) {
            return node;
        }
        for (const candidate of localLLMGraphNodes(graph)) {
            if (candidate?.type === NODE_NAME && !localNodes.includes(candidate)) {
                localNodes.push(candidate);
            }
        }
    }
    return allowSingleFallback && localNodes.length === 1 ? localNodes[0] : null;
}

function isContextWindowError(message) {
    const text = String(message || "").toLowerCase();
    return (
        text.includes("context length") ||
        text.includes("context window") ||
        text.includes("n_ctx") ||
        text.includes("n_keep") ||
        text.includes("longer than the loaded model context")
    );
}

function localLLMExecutionErrorMessage(detail) {
    const rawMessage = String(
        detail?.exception_message ||
        detail?.message ||
        detail?.error ||
        "Check the ComfyUI log for details.",
    ).trim();
    if (isContextWindowError(rawMessage)) {
        return (
            "Context window is too small for this prompt. " +
            "Increase the model context length in LM Studio, or shorten the System Prompt / Prompt text."
        );
    }
    return `Local LLM run failed. ${rawMessage}`;
}

function isLocalLLMOwnExecutionError(detail) {
    const nodeType = String(detail?.node_type || detail?.type || detail?.class_type || "");
    if (nodeType && nodeType !== NODE_NAME) {
        return false;
    }
    const rawMessage = String(
        detail?.exception_message ||
        detail?.message ||
        detail?.error ||
        "",
    );
    if (
        rawMessage.includes("Ideogram Director") ||
        rawMessage.includes("연결된 프롬프트") ||
        rawMessage.includes("Incoming Prompt") ||
        rawMessage.includes("Input Prompt") ||
        rawMessage.includes("Connected Prompt")
    ) {
        return false;
    }
    return true;
}

function localLLMEventApis() {
    const candidates = [];
    if (api && typeof api.addEventListener === "function") {
        candidates.push(api);
    }
    const activeApi = window?.comfyAPI?.api?.api;
    if (activeApi && typeof activeApi.addEventListener === "function" && activeApi !== api) {
        candidates.push(activeApi);
    }
    return candidates;
}

function previewImageUrl(data) {
    if (!data?.filename) {
        return "";
    }
    const params = new URLSearchParams({
        filename: String(data.filename || ""),
        type: String(data.type || "temp"),
        subfolder: String(data.subfolder || ""),
        rand: String(Date.now()),
    });
    return api.apiURL(`/view?${params.toString()}`);
}

function makeReviewerPreview(data, node) {
    if (!data?.filename) {
        return null;
    }
    const img = new Image();
    const item = {
        descriptor: data,
        url: previewImageUrl(data),
        img,
        loaded: false,
        failed: false,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
    };
    img.onload = () => {
        item.loaded = true;
        item.failed = false;
        if (!item.width) {
            item.width = img.naturalWidth;
        }
        if (!item.height) {
            item.height = img.naturalHeight;
        }
        markGraphDirty(node);
    };
    img.onerror = () => {
        item.failed = true;
        markGraphDirty(node);
    };
    img.src = item.url;
    return item;
}

app.registerExtension({
    name: "Deno.LocalLLMRefiner",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === GATE_NODE_NAME) {
            const configure = nodeType.prototype.configure;
            nodeType.prototype.configure = function (info) {
                normalizeReviewerWidgetValues(info);
                return configure?.apply(this, arguments);
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, arguments);
                setupGateNode(this);
                return result;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure?.apply(this, arguments);
                queueMicrotask(() => setupGateNode(this));
                return result;
            };

            const onSerialize = nodeType.prototype.onSerialize;
            nodeType.prototype.onSerialize = function (info) {
                const result = onSerialize?.apply(this, arguments);
                normalizeReviewerWidgetValues(info);
                return result;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (output) {
                const result = onExecuted?.apply(this, arguments);
                const gateInfo = Array.isArray(output?.deno_llm_gate) ? output.deno_llm_gate[0] : null;
                if (gateInfo) {
                    this.__denoLocalLLMGateState = {
                        passed: Boolean(gateInfo.passed),
                        verdict: String(gateInfo.verdict || ""),
                        reason: String(gateInfo.reason || ""),
                        source: String(gateInfo.source || ""),
                        review: String(gateInfo.review || ""),
                        passedCount: Number.isFinite(Number(gateInfo.passed_count)) ? Number(gateInfo.passed_count) : null,
                        blockedCount: Number.isFinite(Number(gateInfo.blocked_count)) ? Number(gateInfo.blocked_count) : null,
                        preview: makeReviewerPreview(gateInfo.preview_image, this),
                        snapshot: gateInfo.snapshot_image || null,
                        updatedAt: Date.now(),
                    };
                    if (gateInfo.approve_once_consumed) {
                        setWidgetValue(this, "approve_once", false, false);
                    }
                    refreshGateNode(this);
                    markGraphDirty(this);
                    maybeAutoRetryReviewer(this, gateInfo);
                }
                return result;
            };
            return;
        }

        if (nodeData.name !== NODE_NAME) {
            return;
        }
        registeredNodeData = nodeData;

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            const normalizedValues = normalizeLocalLLMLoaderWidgetValues(info);
            const restoredState = sanitizeLocalLLMState(info?.properties?.[LOADER_STATE_PROPERTY]);
            if (restoredState) {
                info.properties = info.properties || {};
                info.properties[LOADER_STATE_PROPERTY] = restoredState;
            }
            this.__denoLocalLLMSavedWidgetValues = Array.isArray(normalizedValues) ? [...normalizedValues] : null;
            preserveLocalLLMLoaderSavedComboOptions(this, normalizedValues);
            const result = configure?.apply(this, arguments);
            if (restoredState) {
                persistLocalLLMStateToProperties(this, restoredState);
            }
            restoreLocalLLMStateFromProperties(this);
            applyLocalLLMLoaderSavedWidgetValues(this, this.__denoLocalLLMSavedWidgetValues);
            return result;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            setupNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            restoreLocalLLMStateFromProperties(this);
            queueMicrotask(() => setupNode(this));
            return result;
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            const result = onSerialize?.apply(this, arguments);
            if (info && Array.isArray(info.widgets_values)) {
                info.widgets_values =
                    localLLMLoaderSerializedValuesFromWidgets(this, info.widgets_values)
                    || normalizeLocalLLMLoaderSerializedValues(info.widgets_values)
                    || info.widgets_values.slice(0, LOADER_SERIALIZED_WIDGET_COUNT);
            }
            const state = sanitizeLocalLLMState(this.__denoLocalLLMState || restoreLocalLLMStateFromProperties(this));
            if (state && info) {
                info.properties = info.properties || {};
                info.properties[LOADER_STATE_PROPERTY] = state;
                this.properties = this.properties || {};
                this.properties[LOADER_STATE_PROPERTY] = state;
            }
            return result;
        };
    },
    nodeCreated(node) {
        setupNode(node);
        setupGateNode(node);
    },
    setup() {
        installProgressListener();
        installLocalLLMAppQueuePromptHook(app);
        installLocalLLMApiQueuePromptHook(api);
        installReviewerGraphToPromptHook();
        installGraphScan();
        installPreviewWheelHandler();
    },
});

function normalizeLocalLLMLoaderWidgetValues(info) {
    if (!info || !Array.isArray(info.widgets_values)) {
        return null;
    }
    const normalized = normalizeLocalLLMLoaderSerializedValues(info.widgets_values);
    info.widgets_values = normalized;
    return normalized;
}

function normalizeReviewerWidgetValues(info) {
    if (!info || !Array.isArray(info.widgets_values)) {
        return null;
    }
    const normalized = normalizeReviewerSerializedValues(info.widgets_values);
    info.widgets_values = normalized;
    return normalized;
}

function normalizeReviewerSerializedValues(values) {
    if (!Array.isArray(values)) {
        return null;
    }
    const normalized = values.slice(0, GATE_SERIALIZED_WIDGET_COUNT);
    while (normalized.length < GATE_SERIALIZED_WIDGET_COUNT) {
        normalized.push("");
    }
    const mode = String(normalized[0] || "Review");
    normalized[0] = mode === "Pass" ? "Pass" : "Review";
    normalized[1] = normalized[1] === true || String(normalized[1]).toLowerCase() === "true";
    normalized[2] = normalized[2] == null ? "" : String(normalized[2]);
    return normalized;
}

function normalizeLocalLLMLoaderSerializedValues(values) {
    if (!Array.isArray(values)) {
        return null;
    }
    let normalized = [...values];
    let generatedButtonStart = findLocalLLMGeneratedButtonRunStart(normalized);
    while (generatedButtonStart >= 0) {
        normalized.splice(generatedButtonStart, LOADER_GENERATED_BUTTON_VALUES.length);
        normalized = normalizeLocalLLMLoaderLegacyButtonValues(normalized);
        generatedButtonStart = findLocalLLMGeneratedButtonRunStart(normalized);
    }
    normalized = normalizeLocalLLMLoaderGeneratedPickerValues(normalized);
    return normalized.slice(0, LOADER_SERIALIZED_WIDGET_COUNT);
}

function normalizeLocalLLMLoaderGeneratedPickerValues(values) {
    const normalized = [...values];
    const provider = normalizeProviderValue(normalized[0]);
    const customModel = String(normalized[4] ?? "").trim();
    const extraAfterCustomModel = String(normalized[5] ?? "").trim();
    const shiftedSeed = normalized[8];
    const likelyGeneratedPickerValue =
        normalized.length > LOADER_SERIALIZED_WIDGET_COUNT &&
        OPENAI_COMPATIBLE_PROVIDERS.has(provider) &&
        customModel &&
        (extraAfterCustomModel === customModel ||
            extraAfterCustomModel === "Detected Models" ||
            (
                typeof normalized[6] === "string" &&
                typeof normalized[7] === "boolean" &&
                (typeof shiftedSeed === "number" || /^-?\d+(?:\.\d+)?$/.test(String(shiftedSeed ?? "").trim())) &&
                SEED_MODE_VALUES.includes(String(normalized[9] ?? ""))
            )) &&
        typeof normalized[6] !== "boolean" &&
        typeof normalized[7] === "boolean";
    if (likelyGeneratedPickerValue) {
        normalized.splice(5, 1);
    }
    return normalized;
}

function localLLMLoaderSerializedValuesFromWidgets(node, fallbackValues) {
    const fallback = normalizeLocalLLMLoaderSerializedValues(fallbackValues) || [];
    if (!node || !Array.isArray(node.widgets)) {
        return fallback.length ? fallback.slice(0, LOADER_SERIALIZED_WIDGET_COUNT) : null;
    }
    let foundNamedWidget = false;
    const values = LOADER_SERIALIZED_WIDGET_NAMES.map((name, index) => {
        const widget = getWidget(node, name);
        if (widget) {
            foundNamedWidget = true;
            return widget.value;
        }
        return index < fallback.length ? fallback[index] : "";
    });
    return foundNamedWidget ? values : (fallback.length ? fallback.slice(0, LOADER_SERIALIZED_WIDGET_COUNT) : null);
}

function findLocalLLMGeneratedButtonRunStart(values) {
    const count = LOADER_GENERATED_BUTTON_VALUES.length;
    for (let start = 0; start <= values.length - count; start += 1) {
        const matches = LOADER_GENERATED_BUTTON_VALUES.every((button, index) => String(values[start + index] ?? "") === button);
        if (matches) {
            return start;
        }
    }
    return -1;
}

function normalizeLocalLLMLoaderLegacyButtonValues(values) {
    const normalized = [...values];
    const tailSystemPromptButtonIndex = normalized.findIndex((value, index) => index >= 8 && String(value ?? "") === LOADER_SYSTEM_PROMPT_BUTTON_VALUE);
    const tailSystemPrompt = tailSystemPromptButtonIndex >= 0 ? normalized[tailSystemPromptButtonIndex + 1] ?? "" : "";
    if (tailSystemPromptButtonIndex >= 0) {
        normalized.splice(tailSystemPromptButtonIndex, 2);
    }

    const legacyControl = String(normalized[5] ?? "").trim();
    const hasLegacyControlAfterGenerate =
        normalized.length >= 13 &&
        LEGACY_CONTROL_AFTER_GENERATE_VALUES.has(legacyControl) &&
        typeof normalized[6] === "boolean";
    if (hasLegacyControlAfterGenerate) {
        normalized.splice(5, 1, tailSystemPrompt);
        return normalized;
    }

    if (tailSystemPromptButtonIndex >= 0 && normalized.length < LOADER_SERIALIZED_WIDGET_COUNT) {
        normalized.splice(5, 0, tailSystemPrompt);
        return normalized;
    }

    const promptIndex = LOADER_SERIALIZED_WIDGET_NAMES.indexOf("prompt");
    if (
        tailSystemPromptButtonIndex >= 0 &&
        promptIndex >= 0 &&
        promptIndex < normalized.length &&
        !String(normalized[promptIndex] ?? "").trim() &&
        String(tailSystemPrompt ?? "").trim()
    ) {
        normalized[promptIndex] = tailSystemPrompt;
    }
    return normalized;
}

function preserveLocalLLMLoaderSavedComboOptions(node, values) {
    if (!node || !Array.isArray(values)) {
        return;
    }
    preserveWidgetOption(getWidget(node, "provider"), values[0]);
    preserveSavedModelWidgetOption(getWidget(node, "ollama_model"), values[1]);
    preserveSavedModelWidgetOption(getWidget(node, "lm_studio_model"), values[2]);
}

function preserveWidgetOption(widget, value) {
    const text = String(value ?? "").trim();
    if (!widget || !text) {
        return false;
    }
    widget.options = widget.options || {};
    const values = Array.isArray(widget.options.values)
        ? [...widget.options.values].map((item) => String(item))
        : Array.isArray(widget.options.list)
          ? [...widget.options.list].map((item) => String(item))
          : [];
    const reordered = [text, ...values.filter((item) => item !== text)];
    widget.options.values = reordered;
    widget.options.list = reordered;
    return true;
}

function preserveSavedModelWidgetOption(widget, value) {
    const original = originalModelValueFromDisplay(value);
    if (!widget || !hasUsableSavedModelValue(original)) {
        return false;
    }
    const existed = currentModelChoiceIds(widget, { includePreserved: true }).includes(original);
    const ok = preserveWidgetOption(widget, original);
    if (ok && !existed) {
        widget.__denoLocalLLMPreservedSavedModels = new Set([
            ...(widget.__denoLocalLLMPreservedSavedModels || []),
            original,
        ]);
    }
    return ok;
}

function isMissingSavedModelDisplayValue(value) {
    return String(value ?? "").trim().startsWith(MISSING_SAVED_MODEL_PREFIX);
}

function originalModelValueFromDisplay(value) {
    const text = String(value ?? "").trim();
    if (text.startsWith(MISSING_SAVED_MODEL_PREFIX)) {
        return text.slice(MISSING_SAVED_MODEL_PREFIX.length).trim();
    }
    return text;
}

function missingSavedModelDisplayValue(value) {
    const original = originalModelValueFromDisplay(value);
    return original ? `${MISSING_SAVED_MODEL_PREFIX}${original}` : "";
}

function currentModelChoiceIds(widget, { includePreserved = false } = {}) {
    const options = widget?.options || {};
    const values = Array.isArray(options.values)
        ? options.values
        : Array.isArray(options.list)
          ? options.list
          : [];
    const preserved = widget?.__denoLocalLLMPreservedSavedModels || new Set();
    return values
        .filter((value) => includePreserved || !isMissingSavedModelDisplayValue(value))
        .map((value) => originalModelValueFromDisplay(value))
        .filter((value) => value && (includePreserved || !preserved.has(value)));
}

function displayModelValueForCurrentChoices(widget, value) {
    const original = originalModelValueFromDisplay(value);
    if (!hasUsableSavedModelValue(original)) {
        return "";
    }
    if (currentModelChoiceIds(widget).includes(original)) {
        return original;
    }
    const display = missingSavedModelDisplayValue(original);
    preserveWidgetOption(widget, display);
    return display;
}

function applyLocalLLMLoaderSavedWidgetValues(node, values) {
    if (!node || !Array.isArray(values)) {
        return false;
    }
    let changed = false;
    for (let index = 0; index < LOADER_SERIALIZED_WIDGET_NAMES.length; index++) {
        if (index >= values.length) {
            continue;
        }
        const name = LOADER_SERIALIZED_WIDGET_NAMES[index];
        const widget = getWidget(node, name);
        if (!widget) {
            continue;
        }
        let value = values[index];
        if (name === "provider") {
            preserveWidgetOption(widget, value);
        }
        if (name === "ollama_model" || name === "lm_studio_model") {
            value = displayModelValueForCurrentChoices(widget, value);
            if (value && !isMissingSavedModelDisplayValue(value)) {
                preserveWidgetOption(widget, value);
            }
        }
        if (widget.value !== value) {
            widget.value = value;
            changed = true;
        }
    }
    changed = resetLocalLLMGeneratedWidgetValues(node) || changed;
    return changed;
}

function resetLocalLLMGeneratedWidgetValues(node) {
    if (!node || !Array.isArray(node.widgets)) {
        return false;
    }
    let changed = false;
    for (const [name, value] of Object.entries(LOADER_GENERATED_WIDGET_RESET_VALUES)) {
        const widget = getWidget(node, name);
        if (!widget) {
            continue;
        }
        if (widget.value !== value) {
            widget.value = value;
            changed = true;
        }
        widget.options = { ...(widget.options || {}), serialize: false };
        widget.serializeValue = () => undefined;
    }
    return changed;
}

function installReviewerGraphToPromptHook() {
    if (reviewerGraphPromptHookInstalled) {
        return;
    }
    const originalGraphToPrompt = app?.["graphToPrompt"];
    if (typeof originalGraphToPrompt !== "function") {
        if (!reviewerGraphPromptRetryScheduled) {
            reviewerGraphPromptRetryScheduled = true;
            window.setTimeout(() => {
                reviewerGraphPromptRetryScheduled = false;
                installReviewerGraphToPromptHook();
            }, 250);
        }
        return;
    }
    reviewerGraphPromptHookInstalled = true;
    app["graphToPrompt"] = async function (...args) {
        const sourceGraph = args[0] || this?.rootGraph || safeAppGraph();
        const result = await originalGraphToPrompt.apply(this, args);
        rememberLocalLLMPromptBundleGraph(result, sourceGraph);
        migrateLocalLLMPromptInputNames(result?.output);
        applyReviewerSubmitModes(result?.output);
        return result;
    };
}

function installLocalLLMApiQueuePromptHook(targetApi = api) {
    if (!targetApi || (typeof targetApi !== "object" && typeof targetApi !== "function")) {
        return false;
    }
    if (localLLMQueuePromptApis.has(targetApi)) {
        return true;
    }
    const originalQueuePrompt = targetApi.queuePrompt;
    if (typeof originalQueuePrompt !== "function") {
        return false;
    }
    targetApi.queuePrompt = async function (...args) {
        const promptBundle = args?.[1];
        const submittedGraph = localLLMGraphByPromptBundle.get(promptBundle) || null;
        if (submittedGraph) {
            invalidateLocalLLMAsyncActionsForGraph(submittedGraph, "queue API submitted");
        }
        const result = await originalQueuePrompt.apply(this, args);
        if (submittedGraph && result?.prompt_id) {
            rememberLocalLLMPromptGraph(result.prompt_id, submittedGraph);
        }
        return result;
    };
    localLLMQueuePromptApis.add(targetApi);
    return true;
}

function installLocalLLMAppQueuePromptHook(targetApp = app) {
    if (!targetApp || (typeof targetApp !== "object" && typeof targetApp !== "function")) {
        return false;
    }
    if (localLLMAppQueuePromptApps.has(targetApp)) {
        return true;
    }
    const originalQueuePrompt = targetApp.queuePrompt;
    if (typeof originalQueuePrompt !== "function") {
        return false;
    }
    targetApp.queuePrompt = function (...args) {
        const submittedGraph = this?.rootGraph || targetApp.rootGraph || safeAppGraph();
        // app.queuePrompt is the earliest queue boundary. Invalidate read-only
        // Refresh work before graphToPrompt serializes provider/model widgets.
        // Stop and Unload requests keep running; only their stale UI ownership
        // token changes.
        invalidateLocalLLMAsyncActionsForGraph(submittedGraph, "queue submitted");
        return originalQueuePrompt.apply(this, args);
    };
    localLLMAppQueuePromptApps.add(targetApp);
    return true;
}

function normalizeLocalLLMSeedMode(value) {
    const text = String(value ?? "").trim();
    if (text === "random") {
        return "randomize";
    }
    return SEED_MODE_VALUES.includes(text) ? text : "fixed";
}

function nextLocalLLMSeedValue(seed, mode) {
    const current = Math.max(0, Math.floor(Number(seed) || 0));
    const normalizedMode = normalizeLocalLLMSeedMode(mode);
    if (normalizedMode === "increment") {
        return Math.min(0xFFFFFFFF, current + 1);
    }
    if (normalizedMode === "decrement") {
        return Math.max(0, current - 1);
    }
    if (normalizedMode === "randomize") {
        return Math.floor(Math.random() * 0x100000000);
    }
    return current;
}

function applyLocalLLMAfterGenerateSeedModes(output) {
    let changed = false;
    for (const [id, entry] of Object.entries(output || {})) {
        if (entry?.class_type !== NODE_NAME) {
            continue;
        }
        const node = localLLMNodeById(id, { allowSingleFallback: false });
        changed = advanceLocalLLMSeedAfterQueued(node, entry?.inputs?.seed_mode) || changed;
    }
    return changed;
}

function advanceLocalLLMSeedAfterQueued(node, fallbackMode) {
    const seedWidget = getWidget(node, "seed");
    const modeWidget = getWidget(node, "seed_mode");
    if (!seedWidget || !modeWidget) {
        return false;
    }
    const mode = normalizeLocalLLMSeedMode(modeWidget.value ?? fallbackMode);
    if (mode === "fixed") {
        return false;
    }
    const nextSeed = nextLocalLLMSeedValue(seedWidget.value, mode);
    if (Number(seedWidget.value) === nextSeed) {
        return false;
    }
    seedWidget.value = nextSeed;
    markGraphDirty(node);
    return true;
}

function normalizeLocalLLMServerBeforeQueue(node) {
    const widget = getWidget(node, "custom_server_url");
    if (!widget) {
        return false;
    }
    const normalized = normalizeServerUrlValue(widget.value);
    if (!normalized || normalized === String(widget.value || "").trim()) {
        return false;
    }
    widget.value = normalized;
    rememberOpenAIProviderServerUrl(node, currentProvider(node), normalized);
    markGraphDirty(node);
    return true;
}

function installLocalLLMQueueCallbacks(node) {
    const seedWidget = getWidget(node, "seed");
    if (seedWidget && !seedWidget.__denoLocalLLMSeedAfterQueued) {
        const originalAfterQueued = seedWidget.afterQueued;
        seedWidget.afterQueued = function () {
            const result = originalAfterQueued?.apply(this, arguments);
            advanceLocalLLMSeedAfterQueued(node);
            return result;
        };
        seedWidget.__denoLocalLLMSeedAfterQueued = true;
    }

    const serverWidget = getWidget(node, "custom_server_url");
    if (serverWidget && !serverWidget.__denoLocalLLMServerBeforeQueued) {
        const originalBeforeQueued = serverWidget.beforeQueued;
        serverWidget.beforeQueued = function () {
            const result = originalBeforeQueued?.apply(this, arguments);
            normalizeLocalLLMServerBeforeQueue(node);
            return result;
        };
        serverWidget.__denoLocalLLMServerBeforeQueued = true;
    }
}

function migrateLocalLLMPromptInputNames(output) {
    for (const entry of Object.values(output || {})) {
        if (entry?.class_type !== NODE_NAME || !entry.inputs) {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(entry.inputs, "user_prompt")) {
            if (!Object.prototype.hasOwnProperty.call(entry.inputs, "prompt")) {
                entry.inputs.prompt = entry.inputs.user_prompt;
            }
            delete entry.inputs.user_prompt;
        }
    }
}

function isPromptLink(value) {
    return Array.isArray(value)
        && value.length >= 2
        && (typeof value[0] === "string" || typeof value[0] === "number");
}

function collectReviewerAncestors(output, reviewerId) {
    const keep = new Set([String(reviewerId)]);
    const stack = [String(reviewerId)];
    while (stack.length) {
        const currentId = stack.pop();
        const inputs = output?.[currentId]?.inputs || {};
        for (const value of Object.values(inputs)) {
            if (!isPromptLink(value)) {
                continue;
            }
            const originId = String(value[0]);
            if (output?.[originId] && !keep.has(originId)) {
                keep.add(originId);
                stack.push(originId);
            }
        }
    }
    return keep;
}

function graphNodeById(graph, id) {
    const key = String(id);
    return graph?.getNodeById?.(Number(key))
        || graph?._nodes_by_id?.[key]
        || (graph?._nodes || graph?.nodes || []).find((node) => String(node?.id) === key)
        || null;
}

function reviewerInputOriginNodes(node) {
    const graph = safeNodeGraph(node) || safeAppGraph();
    const links = graph?.links || {};
    const origins = [];
    for (const input of node?.inputs || []) {
        for (const linkId of asInputLinkList(input)) {
            const link = links?.[linkId];
            if (link?.origin_id == null) {
                continue;
            }
            const originNode = graphNodeById(graph, link.origin_id);
            if (originNode) {
                origins.push(originNode);
            }
        }
    }
    return origins;
}

function isSeedWidgetCandidate(widget) {
    const name = String(widget?.name || widget?.label || "").toLowerCase();
    if (!name || !name.includes("seed") || name.includes("seed_mode") || name.includes("control")) {
        return false;
    }
    const value = Number(widget?.value);
    return Number.isFinite(value);
}

function isPreferredRetrySeedNode(node) {
    const type = String(node?.type || node?.comfyClass || node?.constructor?.name || "");
    return type !== NODE_NAME && type !== GATE_NODE_NAME;
}

function collectReviewerSeedCandidates(node) {
    const graph = safeNodeGraph(node) || safeAppGraph();
    const queue = reviewerInputOriginNodes(node).map((origin, index) => ({
        node: origin,
        distance: 1,
        order: index,
    }));
    const visited = new Set();
    const candidates = [];
    let order = 0;

    while (queue.length) {
        const current = queue.shift();
        const currentNode = current.node;
        const currentId = String(currentNode?.id ?? "");
        if (!currentId || visited.has(currentId)) {
            continue;
        }
        visited.add(currentId);

        for (const widget of currentNode.widgets || []) {
            if (!isSeedWidgetCandidate(widget)) {
                continue;
            }
            const widgetName = String(widget.name || widget.label || "seed");
            candidates.push({
                node: currentNode,
                widget,
                nodeId: currentId,
                widgetName,
                key: `${currentId}:${widgetName}`,
                value: Number(widget.value),
                preferred: isPreferredRetrySeedNode(currentNode),
                distance: current.distance,
                order: order++,
            });
        }

        for (const input of currentNode.inputs || []) {
            for (const linkId of asInputLinkList(input)) {
                const link = graph?.links?.[linkId];
                if (link?.origin_id == null) {
                    continue;
                }
                const originNode = graphNodeById(graph, link.origin_id);
                if (originNode) {
                    queue.push({
                        node: originNode,
                        distance: current.distance + 1,
                        order: order++,
                    });
                }
            }
        }
    }

    return candidates.sort((a, b) => {
        if (a.preferred !== b.preferred) {
            return a.preferred ? -1 : 1;
        }
        if (a.distance !== b.distance) {
            return a.distance - b.distance;
        }
        return a.order - b.order;
    });
}

function collectGraphSeedCandidates(node) {
    const graph = safeNodeGraph(node) || safeAppGraph();
    const nodes = graph?._nodes || graph?.nodes || [];
    const candidates = [];
    let order = 0;
    for (const item of nodes) {
        const nodeId = String(item?.id ?? "");
        if (!nodeId || item === node || item?.type === GATE_NODE_NAME) {
            continue;
        }
        for (const widget of item.widgets || []) {
            if (!isSeedWidgetCandidate(widget)) {
                continue;
            }
            const widgetName = String(widget.name || widget.label || "seed");
            candidates.push({
                node: item,
                widget,
                nodeId,
                widgetName,
                key: `${nodeId}:${widgetName}`,
                value: Number(widget.value),
                preferred: isPreferredRetrySeedNode(item),
                distance: 999,
                order: order++,
                scope: "graph",
            });
        }
    }
    return candidates;
}

function collectReviewerSelectableSeedCandidates(node) {
    const upstream = collectReviewerSeedCandidates(node).map((candidate) => ({
        ...candidate,
        scope: "upstream",
    }));
    const seen = new Set(upstream.map((candidate) => candidate.key));
    const graphCandidates = collectGraphSeedCandidates(node).filter((candidate) => !seen.has(candidate.key));
    return [...upstream, ...graphCandidates];
}

function seedCandidateLabel(candidate) {
    if (!candidate) {
        return "Auto";
    }
    const title = String(candidate.node?.title || candidate.node?.type || "Node").trim();
    const scope = candidate.scope === "graph" ? "graph" : "upstream";
    return `${title} #${candidate.nodeId} / ${candidate.widgetName} (${scope})`;
}

function reviewerSeedTarget(node) {
    ensureReviewerRetryProperties(node);
    return String(node?.properties?.[REVIEWER_PROP_SEED_TARGET] || REVIEWER_AUTO_RETRY_SEED_AUTO);
}

function reviewerSeedTargetCandidate(node) {
    const target = reviewerSeedTarget(node);
    if (target && target !== REVIEWER_AUTO_RETRY_SEED_AUTO) {
        const candidates = collectReviewerSelectableSeedCandidates(node);
        return candidates.find((candidate) => candidate.key === target) || null;
    }
    const upstreamCandidates = collectReviewerSeedCandidates(node);
    return upstreamCandidates.find((candidate) => candidate.preferred) || upstreamCandidates[0] || null;
}

function reviewerMissingSeedReason(node) {
    const target = reviewerSeedTarget(node);
    if (target && target !== REVIEWER_AUTO_RETRY_SEED_AUTO) {
        return "Auto retry could not find the selected seed target. Pick a seed target or rerun manually.";
    }
    return "Auto retry could not find an upstream seed. Pick a seed target or rerun manually.";
}

function reviewerSeedTargetButtonLabel(node) {
    const target = reviewerSeedTarget(node);
    if (target === REVIEWER_AUTO_RETRY_SEED_AUTO) {
        return "Seed: Auto";
    }
    const candidate = collectReviewerSelectableSeedCandidates(node).find((item) => item.key === target);
    if (!candidate) {
        return "Seed: Missing";
    }
    return `Seed: #${candidate.nodeId} ${candidate.widgetName}`;
}

function setReviewerSeedTarget(node, target) {
    ensureReviewerRetryProperties(node);
    node.properties[REVIEWER_PROP_SEED_TARGET] = String(target || REVIEWER_AUTO_RETRY_SEED_AUTO);
    resetReviewerAutoRetry(node);
    markGraphDirty(node);
}

function reviewerSeedWidgetMax(widget) {
    const optionMax = Number(widget?.options?.max ?? widget?.options?.max_value ?? widget?.max);
    if (Number.isFinite(optionMax) && optionMax > 0) {
        return Math.min(Math.floor(optionMax), Number.MAX_SAFE_INTEGER);
    }
    return REVIEWER_FALLBACK_MAX_SEED;
}

function incrementReviewerRetrySeed(node) {
    const candidate = reviewerSeedTargetCandidate(node);
    if (!candidate?.widget) {
        return null;
    }
    const oldSeed = Math.max(0, Math.floor(Number(candidate.widget.value) || 0));
    const maxSeed = reviewerSeedWidgetMax(candidate.widget);
    const newSeed = oldSeed >= maxSeed ? 0 : oldSeed + 1;
    candidate.widget.value = newSeed;
    if (typeof candidate.widget.callback === "function") {
        try {
            candidate.widget.callback(newSeed, app.canvas, candidate.node);
        } catch {
            try {
                candidate.widget.callback(newSeed);
            } catch {
                // Best-effort; the seed value has already been updated.
            }
        }
    }
    markGraphDirty(candidate.node);
    return {
        ...candidate,
        oldSeed,
        newSeed,
        label: seedCandidateLabel(candidate),
    };
}

function restoreReviewerRetrySeed(seedChange) {
    const widget = seedChange?.widget;
    const oldSeed = Number(seedChange?.oldSeed);
    const newSeed = Number(seedChange?.newSeed);
    if (!widget || !Number.isFinite(oldSeed) || Number(widget.value) !== newSeed) {
        return false;
    }
    widget.value = oldSeed;
    if (typeof widget.callback === "function") {
        try {
            widget.callback(oldSeed, app.canvas, seedChange.node);
        } catch {
            try {
                widget.callback(oldSeed);
            } catch {
                // Best-effort; the guarded value restore has already completed.
            }
        }
    }
    markGraphDirty(seedChange.node);
    return true;
}

function collectPromptLinkAncestors(output, link) {
    const keep = new Set();
    if (!isPromptLink(link)) {
        return keep;
    }
    const stack = [String(link[0])];
    while (stack.length) {
        const currentId = stack.pop();
        if (!output?.[currentId] || keep.has(currentId)) {
            continue;
        }
        keep.add(currentId);
        const inputs = output[currentId]?.inputs || {};
        for (const value of Object.values(inputs)) {
            if (isPromptLink(value)) {
                stack.push(String(value[0]));
            }
        }
    }
    return keep;
}

function promptInputReferences(output) {
    const references = new Set();
    for (const entry of Object.values(output || {})) {
        for (const value of Object.values(entry?.inputs || {})) {
            if (isPromptLink(value)) {
                references.add(String(value[0]));
            }
        }
    }
    return references;
}

function pruneUnreferencedPromptAncestors(output, candidates) {
    let changed = true;
    while (changed) {
        changed = false;
        const references = promptInputReferences(output);
        for (const nodeId of candidates || []) {
            const key = String(nodeId);
            if (output?.[key] && !references.has(key)) {
                delete output[key];
                changed = true;
            }
        }
    }
}

function collectAncestorsInto(output, nodeId, keep) {
    const stack = [String(nodeId)];
    while (stack.length) {
        const currentId = stack.pop();
        const inputs = output?.[currentId]?.inputs || {};
        for (const value of Object.values(inputs)) {
            if (!isPromptLink(value)) {
                continue;
            }
            const originId = String(value[0]);
            if (output?.[originId] && !keep.has(originId)) {
                keep.add(originId);
                stack.push(originId);
            }
        }
    }
}

function graphLinksObject() {
    return safeAppGraph()?.links || {};
}

function reviewerOutgoingLinks(node) {
    const links = [];
    for (const output of node?.outputs || []) {
        for (const linkId of asLinkList(output?.links)) {
            links.push(linkId);
        }
    }
    return links;
}

function collectReviewerDownstream(output, reviewerId, node) {
    const keep = new Set([String(reviewerId)]);
    const graphLinks = graphLinksObject();
    const stack = reviewerOutgoingLinks(node)
        .map((linkId) => graphLinks?.[linkId])
        .filter(Boolean)
        .map((link) => String(link.target_id));

    while (stack.length) {
        const currentId = stack.pop();
        if (!output?.[currentId] || keep.has(currentId)) {
            continue;
        }
        keep.add(currentId);
        const currentNode = safeAppGraph()?.getNodeById?.(Number(currentId));
        for (const linkId of reviewerOutgoingLinks(currentNode)) {
            const link = graphLinks?.[linkId];
            if (link?.target_id != null) {
                stack.push(String(link.target_id));
            }
        }
    }
    return keep;
}

function promptLinksMatch(a, b) {
    return isPromptLink(a)
        && isPromptLink(b)
        && String(a[0]) === String(b[0])
        && Number(a[1]) === Number(b[1]);
}

function reroutePromptInputs(output, keep, fromLink, toLink) {
    if (!isPromptLink(fromLink) || !isPromptLink(toLink)) {
        return;
    }
    for (const nodeId of keep) {
        const entry = output?.[String(nodeId)];
        if (!entry?.inputs) {
            continue;
        }
        for (const [inputName, value] of Object.entries(entry.inputs)) {
            if (promptLinksMatch(value, fromLink)) {
                entry.inputs[inputName] = [String(toLink[0]), Number(toLink[1])];
            }
        }
    }
}

function applyReviewerRegenerateMode(output, reviewerId, entry) {
    if (!output || !entry || entry.class_type !== GATE_NODE_NAME) {
        return;
    }
    const keep = collectReviewerAncestors(output, reviewerId);
    for (const nodeId of Object.keys(output)) {
        if (!keep.has(String(nodeId))) {
            delete output[nodeId];
        }
    }
}

function applyReviewerPassMode(output, reviewerId, entry) {
    if (!output || !entry || entry.class_type !== GATE_NODE_NAME) {
        return;
    }
    const reviewAncestors = collectPromptLinkAncestors(output, entry.inputs?.review);
    entry.inputs = {
        ...(entry.inputs || {}),
        review: "Manual pass.",
        review_mode: "Pass",
        approve_once: false,
    };
    pruneUnreferencedPromptAncestors(output, reviewAncestors);
}

function applyReviewerApproveOnceMode(output, reviewerId, entry, node) {
    if (!output || !entry || entry.class_type !== GATE_NODE_NAME) {
        return;
    }
    const snapshot = node?.__denoLocalLLMGateState?.snapshot || null;
    const originalImageInput = isPromptLink(entry.inputs?.image) ? [...entry.inputs.image] : null;

    entry.inputs = {
        ...(entry.inputs || {}),
        review: "Approved once.",
        review_mode: "Review",
        approve_once: true,
        reviewer_state: JSON.stringify({
            mode: REVIEWER_SUBMIT_APPROVE_ONCE,
            snapshot_image: snapshot,
        }),
    };
    if (snapshot) {
        delete entry.inputs.image;
    }

    const keep = collectReviewerDownstream(output, reviewerId, node);
    if (originalImageInput && snapshot) {
        reroutePromptInputs(output, keep, originalImageInput, [String(reviewerId), 0]);
    }
    for (const keptId of [...keep]) {
        collectAncestorsInto(output, keptId, keep);
    }
    for (const nodeId of Object.keys(output)) {
        if (!keep.has(String(nodeId))) {
            delete output[nodeId];
        }
    }
}

function reviewerNodeIndex() {
    const graph = safeAppGraph();
    const nodes = graph?._nodes || graph?.nodes || [];
    const index = new Map();
    for (const node of nodes) {
        if (node?.id != null) {
            index.set(String(node.id), node);
        }
    }
    return index;
}

function applyReviewerSubmitModes(output) {
    if (!output) {
        return;
    }
    let index = null;
    const passReviewers = [];
    for (const id of Object.keys(output)) {
        const entry = output[id];
        if (!entry || entry.class_type !== GATE_NODE_NAME) {
            continue;
        }
        if (!index) {
            index = reviewerNodeIndex();
        }
        const node = index.get(String(id));
        if (node?._denoReviewerSubmitMode === REVIEWER_SUBMIT_REGENERATE) {
            applyReviewerRegenerateMode(output, id, entry);
            return;
        }
        if (node?._denoReviewerSubmitMode === REVIEWER_SUBMIT_APPROVE_ONCE) {
            applyReviewerApproveOnceMode(output, id, entry, node);
            return;
        }
        const mode = String(entry.inputs?.review_mode || getWidgetValue(node, "review_mode", "Review") || "Review");
        if (mode === "Pass") {
            passReviewers.push([id, entry]);
        }
    }
    for (const [id, entry] of passReviewers) {
        applyReviewerPassMode(output, id, entry);
    }
}

if (typeof globalThis !== "undefined" && typeof globalThis.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__ === "function") {
    globalThis.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__({
        applyReviewerApproveOnceMode,
        applyReviewerPassMode,
        applyReviewerRegenerateMode,
        applyReviewerSubmitModes,
        applyLocalLLMAfterGenerateSeedModes,
        advanceLocalLLMSeedAfterQueued,
        beginLocalLLMAsyncAction,
        finishLocalLLMAsyncAction,
        isLocalLLMOwnExecutionError,
        isLocalLLMAsyncActionCurrent,
        isShiftedCustomModelValue,
        localLLMExecutionErrorMessage,
        nextLocalLLMSeedValue,
        normalizeReviewerSerializedValues,
        normalizeReviewerWidgetValues,
        normalizeLocalLLMLoaderSerializedValues,
        normalizeLocalLLMLoaderWidgetValues,
        localLLMLoaderSerializedValuesFromWidgets,
        resetLocalLLMGeneratedWidgetValues,
        persistLocalLLMStateToProperties,
        restoreLocalLLMStateFromProperties,
        sanitizeLocalLLMState,
        getLocalLLMNodeState,
        localLLMProgressStatePatch,
        setLocalLLMNodeState,
        setupNode,
        applyLocalLLMLoaderSavedWidgetValues,
        getWidget,
        preserveLocalLLMLoaderSavedComboOptions,
        preserveWidgetOption,
        migrateLocalLLMPromptInputNames,
        modelChoiceValuesWithSavedValue,
        hasUsableSavedModelValue,
        collectReviewerSeedCandidates,
        collectReviewerSelectableSeedCandidates,
        closeLocalLLMOwnedUi,
        incrementReviewerRetrySeed,
        installLocalLLMAppQueuePromptHook,
        installLocalLLMApiQueuePromptHook,
        installLocalLLMNodeCleanup,
        installLocalLLMQueueCallbacks,
        invalidateLocalLLMAsyncAction,
        invalidateLocalLLMAsyncActionsForGraph,
        invalidateLocalLLMAsyncActionsForExecutionDetail,
        localLLMNodeForExecutionDetail,
        maybeAutoRetryReviewer,
        previewTextDialogBody,
        previewTextDialogTitle,
        setPreviewTextDialogContent,
        previewTextWidth,
        normalizeServerUrlValue,
        ownLocalLLMBodyOverlay,
        pruneLocalLLMPromptGraphs,
        rememberLocalLLMPromptBundleGraph,
        rememberLocalLLMPromptGraph,
        repairPromptWidgetValue,
        resetReviewerAutoRetry,
        reviewerControlTooltip,
        reviewerHoverKeyFromGraphMouse,
        reviewerAutoRetryEnabled,
        reviewerRefreshSize,
        reviewerQueueResultAccepted,
        restoreReviewerRetrySeed,
        reviewerWidgetDrawWidth,
        reviewerWidgetLayoutWidth,
        setReviewerAutoRetryEnabled,
        setReviewerSeedTarget,
        splitPreviewLinesForWidth,
        refreshModels,
        stopLocalModel,
        unloadLocalModel,
        wrapModelCallback,
        wrapProviderCallback,
    });
}

function installProgressListener() {
    try {
        const apis = localLLMEventApis();
        if (!apis.length) {
            if (!progressListenerRetryScheduled) {
                progressListenerRetryScheduled = true;
                window.setTimeout(() => {
                    progressListenerRetryScheduled = false;
                    installProgressListener();
                }, 250);
            }
            return;
        }
        for (const eventApi of apis) {
            if (progressListenerApis.has(eventApi)) {
                continue;
            }
            progressListenerApis.add(eventApi);
            eventApi.addEventListener("deno-local-llm-progress", ({ detail }) => {
                const node = localLLMNodeForExecutionDetail(detail);
                if (!node) {
                    return;
                }
                invalidateLocalLLMAsyncAction(node, "execution progress");
                setLocalLLMNodeState(node, localLLMProgressStatePatch(node, detail));
                markGraphDirty(node);
            });
            eventApi.addEventListener("execution_start", ({ detail }) => {
                invalidateLocalLLMAsyncActionsForExecutionDetail(detail, "execution started");
            });
            eventApi.addEventListener("execution_error", ({ detail }) => {
                if (!isLocalLLMOwnExecutionError(detail)) {
                    return;
                }
                const node = localLLMNodeForExecutionDetail(detail);
                if (!node) {
                    return;
                }
                invalidateLocalLLMAsyncAction(node, "execution error");
                setLocalLLMNodeState(node, {
                    status: "error",
                    answer: "",
                    thinking: "",
                    error: localLLMExecutionErrorMessage(detail),
                });
                markGraphDirty(node);
            });
            for (const eventName of ["execution_success", "execution_error", "execution_interrupted"]) {
                eventApi.addEventListener(eventName, ({ detail }) => {
                    if (eventName === "execution_interrupted") {
                        invalidateLocalLLMAsyncActionsForExecutionDetail(detail, "execution interrupted");
                    }
                    forgetLocalLLMPromptGraph(detail?.prompt_id);
                });
            }
        }
    } catch (error) {
        console.warn("[Deno.LocalLLM] Progress listener disabled:", error);
    }
}

function installGraphScan() {
    if (graphScanInstalled) {
        return;
    }
    graphScanInstalled = true;
    const scan = () => {
        installPreviewWheelHandler();
        for (const node of safeAppGraph()?._nodes || []) {
            if (node?.type === NODE_NAME) {
                setupNode(node);
            }
            if (node?.type === GATE_NODE_NAME) {
                setupGateNode(node);
            }
        }
    };
    queueMicrotask(scan);
    window.setTimeout(scan, 150);
    window.setTimeout(scan, 700);
    window.setTimeout(scan, 1800);
}

function installPreviewWheelHandler() {
    const attach = () => {
        wrapPreviewWheelProcessor();
        attachGlobalPreviewWheelHandler();
        const canvas = currentGraphCanvasElement();
        if (!canvas || canvas === previewWheelAttachedCanvas) {
            return;
        }
        if (previewWheelAttachedCanvas && previewWheelHandler) {
            previewWheelAttachedCanvas.removeEventListener("wheel", previewWheelHandler, { capture: true });
        }
        previewWheelHandler = previewWheelHandler || handleCanvasPreviewWheel;
        canvas.addEventListener("wheel", previewWheelHandler, { capture: true, passive: false });
        previewWheelAttachedCanvas = canvas;
        attachPreviewPointerHandler(canvas);
    };
    attach();
    window.setTimeout(attach, 150);
    window.setTimeout(attach, 700);
    window.setTimeout(attach, 1800);
    window.setTimeout(attach, 3500);
    window.setTimeout(attach, 7000);
}

function attachPreviewPointerHandler(canvas) {
    if (!canvas || canvas === previewPointerAttachedCanvas) {
        return;
    }
    if (previewPointerAttachedCanvas && previewPointerMoveHandler) {
        previewPointerAttachedCanvas.removeEventListener("pointermove", previewPointerMoveHandler, { capture: true });
    }
    if (previewPointerAttachedCanvas && previewPointerDownHandler) {
        previewPointerAttachedCanvas.removeEventListener("pointerdown", previewPointerDownHandler, { capture: true });
    }
    if (previewPointerAttachedCanvas && previewPointerUpHandler) {
        previewPointerAttachedCanvas.removeEventListener("pointerup", previewPointerUpHandler, { capture: true });
    }
    if (previewPointerAttachedCanvas && previewPointerLeaveHandler) {
        previewPointerAttachedCanvas.removeEventListener("pointerleave", previewPointerLeaveHandler, { capture: true });
    }
    previewPointerMoveHandler = previewPointerMoveHandler || handleCanvasPreviewPointerMove;
    previewPointerDownHandler = previewPointerDownHandler || handleCanvasPreviewPointerDown;
    previewPointerUpHandler = previewPointerUpHandler || handleCanvasPreviewPointerUp;
    previewPointerLeaveHandler = previewPointerLeaveHandler || handleCanvasPreviewPointerLeave;
    canvas.addEventListener("pointerdown", previewPointerDownHandler, { capture: true, passive: false });
    canvas.addEventListener("pointermove", previewPointerMoveHandler, { capture: true, passive: false });
    canvas.addEventListener("pointerup", previewPointerUpHandler, { capture: true, passive: false });
    canvas.addEventListener("pointerleave", previewPointerLeaveHandler, { capture: true, passive: true });
    previewPointerAttachedCanvas = canvas;
}

function attachGlobalPreviewWheelHandler() {
    if (previewWheelAttachedGlobal) {
        return;
    }
    previewWheelHandler = previewWheelHandler || handleCanvasPreviewWheel;
    window.addEventListener?.("wheel", previewWheelHandler, { capture: true, passive: false });
    document.addEventListener?.("wheel", previewWheelHandler, { capture: true, passive: false });
    previewWheelAttachedGlobal = true;
}

function wrapPreviewWheelProcessor() {
    const canvasObj = app.canvas;
    if (!canvasObj || canvasObj === previewWheelWrappedCanvas || typeof canvasObj.processMouseWheel !== "function") {
        return;
    }
    const originalProcessMouseWheel = canvasObj.processMouseWheel;
    canvasObj.processMouseWheel = function (event) {
        const hit = previewWheelHitFromEvent(event);
        if (hit && handlePreviewWheel(event, hit.pos, hit.node, hit.widget.blockBounds, hit.widget.blockLineInfo)) {
            return true;
        }
        return originalProcessMouseWheel.apply(this, arguments);
    };
    previewWheelWrappedCanvas = canvasObj;
}

function handleCanvasPreviewWheel(event) {
    if (isDenoLocalLLMModalEvent(event)) {
        return;
    }
    const hit = previewWheelHitFromEvent(event);
    if (!hit) {
        return;
    }
    const consumed = handlePreviewWheel(event, hit.pos, hit.node, hit.widget.blockBounds, hit.widget.blockLineInfo);
    if (consumed) {
        event.stopImmediatePropagation?.();
    }
}

function cancelPreviewScrollbarDrag(node = null, captureTarget = previewPointerAttachedCanvas) {
    const state = previewScrollbarDragState;
    if (!state || (node && state.node !== node)) {
        return false;
    }
    previewScrollbarDragState = null;
    cancelLocalLLMAnimationFrame(previewScrollbarDragOwnerFrame);
    previewScrollbarDragOwnerFrame = 0;
    try {
        captureTarget?.releasePointerCapture?.(state.pointerId);
    } catch {
        // Pointer capture may already have been released by the host canvas.
    }
    clearPreviewScrollbarCursor();
    return true;
}

function watchPreviewScrollbarDragOwner() {
    cancelLocalLLMAnimationFrame(previewScrollbarDragOwnerFrame);
    previewScrollbarDragOwnerFrame = 0;
    const state = previewScrollbarDragState;
    if (!state) {
        return;
    }
    const ownerGraph = safeNodeGraph(state.node);
    const activeGraph = localLLMActiveGraph();
    if (ownerGraph && activeGraph && activeGraph !== ownerGraph) {
        cancelPreviewScrollbarDrag(state.node);
        return;
    }
    previewScrollbarDragOwnerFrame = requestLocalLLMAnimationFrame(watchPreviewScrollbarDragOwner);
}

function handleCanvasPreviewPointerMove(event) {
    if (isDenoLocalLLMModalEvent(event)) {
        clearPreviewScrollbarCursor();
        hideReviewerTooltip();
        return;
    }
    handleReviewerTooltipPointerMove(event);
    if (previewScrollbarDragState) {
        const pos = previewLocalPosFromEvent(event, previewScrollbarDragState.node);
        if (pos) {
            handlePreviewScrollbarPointer(
                event,
                pos,
                previewScrollbarDragState.node,
                previewScrollbarDragState.key,
                previewScrollbarDragState.widget?.scrollbarBounds,
                previewScrollbarDragState.widget?.blockLineInfo,
            );
        }
        setPreviewScrollbarCursor(true);
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        return;
    }
    const hit = previewScrollbarHitFromEvent(event);
    setPreviewScrollbarCursor(Boolean(hit));
    if (hit) {
        event.stopImmediatePropagation?.();
    }
}

function handleCanvasPreviewPointerDown(event) {
    if (isDenoLocalLLMModalEvent(event)) {
        return;
    }
    const hit = previewScrollbarHitFromEvent(event);
    if (!hit) {
        return;
    }
    previewScrollbarDragState = {
        node: hit.node,
        widget: hit.widget,
        key: hit.key,
        pointerId: event.pointerId,
    };
    watchPreviewScrollbarDragOwner();
    setPreviewScrollbarCursor(true);
    handlePreviewScrollbarPointer(event, hit.pos, hit.node, hit.key, hit.widget?.scrollbarBounds, hit.widget?.blockLineInfo);
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
}

function handleCanvasPreviewPointerUp(event) {
    if (!previewScrollbarDragState) {
        setPreviewScrollbarCursor(Boolean(previewScrollbarHitFromEvent(event)));
        return;
    }
    const state = previewScrollbarDragState;
    const pos = previewLocalPosFromEvent(event, state.node);
    if (pos) {
        handlePreviewScrollbarPointer(event, pos, state.node, state.key, state.widget?.scrollbarBounds, state.widget?.blockLineInfo);
    }
    cancelPreviewScrollbarDrag(state.node, event.currentTarget);
    setPreviewScrollbarCursor(Boolean(previewScrollbarHitFromEvent(event)));
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
}

function handleCanvasPreviewPointerLeave() {
    hideReviewerTooltip();
    if (!previewScrollbarDragState) {
        clearPreviewScrollbarCursor();
    }
}

function handleReviewerTooltipPointerMove(event) {
    const hit = reviewerTooltipHitFromEvent(event);
    if (!hit) {
        hideReviewerTooltip();
        return;
    }
    hit.widget.hoverKey = hit.key;
    showReviewerTooltip(hit.node, reviewerControlTooltip(hit.key), hit.bounds);
}

function reviewerTooltipHitFromEvent(event) {
    if (isDenoLocalLLMModalEvent(event) || isDenoLocalLLMModalOpen()) {
        return null;
    }
    const canvas = currentGraphCanvasElement();
    const graph = safeAppGraph();
    if (!canvas || !graph) {
        return null;
    }
    const canvasPoint = canvasPointFromWheelEvent(event, canvas);
    if (!canvasPoint) {
        return null;
    }
    const graphPoint = graphPointFromCanvasPoint(canvasPoint, app.canvas?.ds);
    const nodes = Array.isArray(graph?._nodes) ? [...graph._nodes].reverse() : [];
    for (const node of nodes) {
        if (node?.type !== GATE_NODE_NAME || !isPointInsideNode(graphPoint, node)) {
            continue;
        }
        const widget = (node.widgets || []).find((candidate) => String(candidate?.name || "") === `${GATE_GENERATED_PREFIX}controls`);
        if (!widget?.hitAreas) {
            continue;
        }
        const local = [
            graphPoint[0] - Number(node.pos?.[0] || 0),
            graphPoint[1] - Number(node.pos?.[1] || 0),
        ];
        const entry = Object.entries(widget.hitAreas).find(([, bounds]) => isInsideBounds(local, bounds));
        if (entry) {
            const [key, bounds] = entry;
            return { node, widget, key, bounds };
        }
    }
    return null;
}

function setPreviewScrollbarCursor(active) {
    const canvas = currentGraphCanvasElement();
    if (!canvas?.style) {
        return;
    }
    if (active) {
        canvas.style.cursor = "ns-resize";
        document.body.style.cursor = "ns-resize";
        previewScrollbarCursorActive = true;
        requestAnimationFrame?.(() => {
            if (previewScrollbarCursorActive) {
                canvas.style.cursor = "ns-resize";
                document.body.style.cursor = "ns-resize";
            }
        });
        return;
    }
    if (previewScrollbarCursorActive && canvas.style.cursor === "ns-resize") {
        canvas.style.cursor = "";
    }
    if (previewScrollbarCursorActive && document.body.style.cursor === "ns-resize") {
        document.body.style.cursor = "";
    }
    previewScrollbarCursorActive = false;
}

function clearPreviewScrollbarCursor() {
    setPreviewScrollbarCursor(false);
}

function previewWheelHitFromEvent(event) {
    if (isDenoLocalLLMModalEvent(event)) {
        return null;
    }
    const canvas = currentGraphCanvasElement();
    const ds = app.canvas?.ds;
    const graph = safeAppGraph();
    if (!canvas || !graph) {
        return null;
    }
    const graphPoints = graphPointCandidatesFromWheelEvent(event, canvas, ds);
    if (!graphPoints.length) {
        return null;
    }
    const nodes = previewNodeCandidates(graph);
    for (const graphPoint of graphPoints) {
        for (const node of nodes) {
            if (node?.type !== NODE_NAME || !isPointInsideNode(graphPoint, node)) {
                continue;
            }
            const widget = getWidget(node, `${GENERATED_PREFIX}preview`);
            if (!widget?.blockBounds || !widget.blockLineInfo) {
                continue;
            }
            const localPos = [
                graphPoint[0] - Number(node.pos?.[0] || 0),
                graphPoint[1] - Number(node.pos?.[1] || 0),
            ];
            if (!Object.keys(widget.blockBounds || {}).some((key) => isInsideBounds(localPos, widget.blockBounds[key]))) {
                continue;
            }
            return { node, widget, pos: localPos };
        }
    }
    return null;
}

function previewScrollbarHitFromEvent(event) {
    const hit = previewWheelHitFromEvent(event);
    if (!hit) {
        return null;
    }
    const key = previewScrollbarKeyFromPos(hit.pos, hit.widget?.scrollbarBounds);
    return key ? { ...hit, key } : null;
}

function previewLocalPosFromEvent(event, node) {
    const canvas = currentGraphCanvasElement();
    const ds = app.canvas?.ds;
    if (!canvas || !node) {
        return null;
    }
    const canvasPoint = canvasPointFromWheelEvent(event, canvas);
    const graphPoint = graphPointFromCanvasPoint(canvasPoint, ds);
    return [
        graphPoint[0] - Number(node.pos?.[0] || 0),
        graphPoint[1] - Number(node.pos?.[1] || 0),
    ];
}

function isDenoLocalLLMModalEvent(event) {
    const target = event?.target;
    return Boolean(target?.closest?.(".deno-local-llm-preview-modal, .deno-local-llm-system-prompt-modal, .deno-local-llm-seed-modal, .deno-local-llm-reviewer-help-modal"));
}

function isDenoLocalLLMModalOpen() {
    return Boolean(document.querySelector?.(".deno-local-llm-preview-modal, .deno-local-llm-system-prompt-modal, .deno-local-llm-seed-modal, .deno-local-llm-reviewer-help-modal"));
}

function graphPointCandidatesFromWheelEvent(event, canvas, ds) {
    const candidates = [];
    const addGraphPoint = (point) => {
        const pair = pointPair(point);
        if (pair) {
            candidates.push(pair);
        }
    };
    const addCanvasPoint = (point) => {
        const pair = pointPair(point);
        if (!pair) {
            return;
        }
        addGraphPoint(graphPointFromCanvasPoint(pair, ds));
    };

    const directCanvasPoint = canvasPointFromWheelEvent(event, canvas);
    addCanvasPoint(directCanvasPoint);
    if (directCanvasPoint) {
        return dedupePointCandidates(candidates);
    }

    const canvasObj = app.canvas || {};
    addGraphPoint(canvasObj.graph_mouse);
    addGraphPoint(canvasObj.graphMouse);
    addCanvasPoint(canvasObj.canvas_mouse);
    addCanvasPoint(canvasObj.last_mouse);

    return dedupePointCandidates(candidates);
}

function graphPointFromCanvasPoint(canvasPoint, ds) {
    if (ds && typeof ds.convertCanvasToOffset === "function") {
        return ds.convertCanvasToOffset(canvasPoint);
    }
    const scale = Number(ds?.scale || 1) || 1;
    return [
        canvasPoint[0] / scale - Number(ds?.offset?.[0] || 0),
        canvasPoint[1] / scale - Number(ds?.offset?.[1] || 0),
    ];
}

function graphPointToCanvasPoint(graphPoint, ds) {
    if (ds && typeof ds.convertOffsetToCanvas === "function") {
        return ds.convertOffsetToCanvas(graphPoint);
    }
    const scale = Number(ds?.scale || 1) || 1;
    return [
        (graphPoint[0] + Number(ds?.offset?.[0] || 0)) * scale,
        (graphPoint[1] + Number(ds?.offset?.[1] || 0)) * scale,
    ];
}

function pointPair(value) {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const x = Number(value[0]);
        const y = Number(value[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    if (value && typeof value === "object") {
        const x = Number(value.x);
        const y = Number(value.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    return null;
}

function dedupePointCandidates(points) {
    const seen = new Set();
    const unique = [];
    for (const point of points) {
        const pair = pointPair(point);
        if (!pair) {
            continue;
        }
        const key = `${Math.round(pair[0] * 10) / 10},${Math.round(pair[1] * 10) / 10}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(pair);
    }
    return unique;
}

function previewNodeCandidates(graph) {
    const candidates = [];
    const seen = new Set();
    const add = (node) => {
        if (!node || seen.has(node.id) || node.type !== NODE_NAME) {
            return;
        }
        seen.add(node.id);
        candidates.push(node);
    };
    const canvasObj = app.canvas || {};
    add(canvasObj.node_over);
    add(canvasObj.node_mouse_over);
    add(canvasObj.node_capturing_input);
    add(canvasObj.last_node_over);
    for (const node of [...(graph._nodes || [])].reverse()) {
        add(node);
    }
    return candidates;
}

function canvasPointFromWheelEvent(event, canvas) {
    if (
        (event?.target === canvas || event?.currentTarget === canvas)
        && typeof event.offsetX === "number"
        && typeof event.offsetY === "number"
    ) {
        return [event.offsetX, event.offsetY];
    }
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
        const rect = canvas.getBoundingClientRect?.();
        if (rect) {
            return [event.clientX - rect.left, event.clientY - rect.top];
        }
    }
    if (typeof event.pageX === "number" && typeof event.pageY === "number") {
        const rect = canvas.getBoundingClientRect?.();
        if (rect) {
            return [event.pageX - rect.left - window.scrollX, event.pageY - rect.top - window.scrollY];
        }
    }
    return null;
}

function currentGraphCanvasElement() {
    return document.querySelector?.("#graph-canvas")
        || document.querySelector?.("canvas.lgraphcanvas")
        || app.canvas?.canvas
        || null;
}

function isPointInsideNode(pos, node) {
    const x = Number(node.pos?.[0] || 0);
    const y = Number(node.pos?.[1] || 0);
    const width = Number(node.size?.[0] || 0);
    const height = Number(node.size?.[1] || 0);
    return pos[0] >= x && pos[0] <= x + width && pos[1] >= y && pos[1] <= y + height;
}

function setupNode(node) {
    if (!node || node.type !== NODE_NAME || node.__denoLocalLLMSettingUp) {
        return;
    }
    installPreviewWheelHandler();
    installLocalLLMNodeCleanup(node);
    node.__denoLocalLLMSettingUp = true;
    try {
        if (
            !getWidget(node, "provider") ||
            !ensureProviderWidgets(node)
        ) {
            return;
        }
        node.resizable = true;
        normalizeNodeTitle(node);
        syncLoaderOutputSlots(node);
        removeLegacyPromptBoxDomElements();
        removeGeneratedWidgets(node);
        ensureSystemPromptWidget(node);
        ensurePromptWidget(node);
        removePromptWidgets(node);
        normalizeLoaderPromptInputSocket(node);
        removeLoaderWidgetInputSockets(node);
        ensureSeedModeWidget(node);
        migrateLegacyModelWidgets(node);
        removeLegacyWidgets(node);
        dedupeKnownWidgets(node);
        repairLegacyProviderValues(node);
        repairSavedWidgetValues(node);
        applyLocalLLMLoaderSavedWidgetValues(node, node.__denoLocalLLMSavedWidgetValues);
        repairSavedWidgetValues(node);
        installLocalLLMQueueCallbacks(node);
        restoreLocalLLMStateFromProperties(node);
        const provider = currentProvider(node);
        if (!node.__denoLocalLLMState) {
            const cachedState = localLLMCachedStateForNode(node);
            setLocalLLMNodeState(node, {
                status: cachedState?.status || "ready",
                provider,
                model: String(activeModelWidget(node)?.value || ""),
                answer: String(cachedState?.answer || ""),
                thinking: String(cachedState?.thinking || ""),
                error: String(cachedState?.error || ""),
                index: Number(cachedState?.index || 0),
                total: Number(cachedState?.total || 0),
                updatedAt: cachedState?.updatedAt || Date.now(),
            });
        }
        polishWidgetLabels(node);
        polishInputLabels(node);
        setActiveProviderModelVisibility(node);
        wrapProviderCallback(node);
        wrapModelCallback(node);
        wrapServerCallback(node);
        wrapModelMemoryCallback(node);
        addRefreshButton(node);
        addStopButton(node);
        addUnloadButton(node);
        node.addCustomWidget(new LocalLLMPreviewWidget());
        addSystemPromptButton(node);
        positionPromptWidget(node);
        schedulePostSetupCleanup(node);
        refreshNode(node);
    } finally {
        node.__denoLocalLLMSettingUp = false;
    }
}

function normalizeNodeTitle(node) {
    const title = String(node.title || "");
    if (!title || title === NODE_NAME || LEGACY_DISPLAY_NAMES.has(title)) {
        node.title = DISPLAY_NAME;
    }
}

function setupGateNode(node) {
    if (!node || node.type !== GATE_NODE_NAME || node.__denoLocalLLMGateSettingUp) {
        return;
    }
    installLocalLLMNodeCleanup(node);
    node.__denoLocalLLMGateSettingUp = true;
    try {
        ensureReviewerRetryProperties(node);
        if (!node.title || node.title === GATE_NODE_NAME || GATE_LEGACY_DISPLAY_NAMES.has(node.title)) {
            node.title = GATE_DISPLAY_NAME;
        }
        syncReviewerInputSlots(node);
        syncReviewerOutputSlots(node);
        ensureReviewerControlWidgets(node);
        polishGateInputLabels(node);
        removeGateGeneratedWidgets(node);
        if (!node.__denoLocalLLMGateState) {
            node.__denoLocalLLMGateState = {
                passed: null,
                verdict: "",
                reason: "Waiting for review output.",
                source: "",
                review: "",
                passedCount: null,
                blockedCount: null,
                preview: null,
                snapshot: null,
                updatedAt: Date.now(),
            };
        }
        node.addCustomWidget(new ReviewerControlsWidget(node));
        node.addCustomWidget(new GateStatusWidget(node));
        refreshGateNode(node);
    } finally {
        node.__denoLocalLLMGateSettingUp = false;
    }
}

function ensureReviewerRetryProperties(node) {
    if (!node) {
        return;
    }
    node.properties = node.properties || {};
    node.properties[REVIEWER_PROP_AUTO_RETRY] = Boolean(node.properties[REVIEWER_PROP_AUTO_RETRY]);
    const target = String(node.properties[REVIEWER_PROP_SEED_TARGET] || REVIEWER_AUTO_RETRY_SEED_AUTO);
    node.properties[REVIEWER_PROP_SEED_TARGET] = target || REVIEWER_AUTO_RETRY_SEED_AUTO;
}

function reviewerAutoRetryEnabled(node) {
    ensureReviewerRetryProperties(node);
    return Boolean(node?.properties?.[REVIEWER_PROP_AUTO_RETRY]);
}

function setReviewerAutoRetryEnabled(node, enabled) {
    ensureReviewerRetryProperties(node);
    node.properties[REVIEWER_PROP_AUTO_RETRY] = Boolean(enabled);
    resetReviewerAutoRetry(node);
    markGraphDirty(node);
}

function resetReviewerAutoRetry(node) {
    if (!node) {
        return;
    }
    node._denoReviewerAutoRetryActive = false;
    node._denoReviewerAutoRetryAttempt = 0;
    node._denoReviewerAutoRetryBusy = false;
}

function ensureReviewerControlWidgets(node) {
    const modeWidget = getWidget(node, "review_mode");
    if (modeWidget) {
        modeWidget.label = "Reviewer Mode";
        if (!["Review", "Pass"].includes(String(modeWidget.value || ""))) {
            modeWidget.value = "Review";
        }
        setWidgetHidden(modeWidget, true);
    }
    const approveWidget = getWidget(node, "approve_once");
    if (approveWidget) {
        approveWidget.label = "Approve Once";
        approveWidget.value = Boolean(approveWidget.value);
        setWidgetHidden(approveWidget, true);
    }
    const reviewerStateWidget = getWidget(node, "reviewer_state");
    if (reviewerStateWidget) {
        setWidgetHidden(reviewerStateWidget, true);
    }
}

function syncReviewerInputSlots(node) {
    const current = Array.isArray(node.inputs) ? node.inputs : [];
    const reviewInput = current.find((input) => input?.name === "review") || current[0] || {};
    const existingImageInput = current.find((input) => input?.name === "image");
    const legacyVideoInput = current.find((input) => input?.name === "video");
    const imageInput = existingImageInput || legacyVideoInput || {};
    const audioInput = current.find((input) => input?.name === "audio") || {};

    const imageLinks = asInputLinkList(imageInput);
    if (imageLinks.length === 0 && legacyVideoInput && legacyVideoInput !== imageInput) {
        imageLinks.push(...asInputLinkList(legacyVideoInput));
    }
    const keepLinks = new Set([
        ...asInputLinkList(reviewInput),
        ...imageLinks,
        ...asInputLinkList(audioInput),
    ]);

    for (let index = current.length - 1; index >= 0; index -= 1) {
        const input = current[index];
        if (input === reviewInput || input === imageInput || input === audioInput) {
            continue;
        }
        const links = asInputLinkList(input);
        if (!links.some((linkId) => keepLinks.has(linkId))) {
            disconnectInputSlot(node, index);
        }
    }

    node.inputs = [
        {
            ...reviewInput,
            name: "review",
            localized_name: "review result",
            label: "review result",
            type: "STRING",
        },
        {
            ...imageInput,
            name: "image",
            localized_name: "image",
            label: "image",
            type: "IMAGE",
            link: imageLinks[0] ?? null,
        },
        {
            ...audioInput,
            name: "audio",
            localized_name: "audio",
            label: "audio",
            type: "AUDIO",
        },
    ];
    updateInputLinkSlots(node, asInputLinkList(node.inputs[0]), 0);
    updateInputLinkSlots(node, imageLinks, 1);
    updateInputLinkSlots(node, asInputLinkList(node.inputs[2]), 2);
}

function asInputLinkList(input) {
    if (!input) {
        return [];
    }
    const links = [];
    if (Array.isArray(input.links)) {
        links.push(...input.links);
    }
    if (input.link !== undefined && input.link !== null && !links.includes(input.link)) {
        links.push(input.link);
    }
    return links;
}

function disconnectInputSlot(node, slot) {
    if (safeNodeGraph(node) && typeof node.disconnectInput === "function") {
        node.disconnectInput(slot);
        return;
    }
    const input = Array.isArray(node.inputs) ? node.inputs[slot] : null;
    if (input) {
        input.link = null;
        input.links = [];
    }
}

function syncReviewerOutputSlots(node) {
    const current = Array.isArray(node.outputs) ? node.outputs : [];
    const imageOutput = current.find((output) => output?.name === "image" || output?.type === "IMAGE") || current[0] || {};
    const audioOutput = current.find((output) => output?.name === "audio" || output?.type === "AUDIO") || {};
    const keepLinks = new Set([
        ...asLinkList(imageOutput.links),
        ...asLinkList(audioOutput.links),
    ]);

    for (let index = current.length - 1; index >= 0; index -= 1) {
        const output = current[index];
        if (output === imageOutput || output === audioOutput) {
            continue;
        }
        const links = asLinkList(output?.links);
        if (links.some((linkId) => !keepLinks.has(linkId))) {
            disconnectOutputSlot(node, index);
        }
    }

    node.outputs = [
        {
            ...imageOutput,
            name: "image",
            localized_name: "image",
            type: "IMAGE",
            links: asLinkList(imageOutput.links),
        },
        {
            ...audioOutput,
            name: "audio",
            localized_name: "audio",
            type: "AUDIO",
            links: asLinkList(audioOutput.links),
        },
    ];
    updateOutputLinkSlots(node, node.outputs[0].links, 0);
    updateOutputLinkSlots(node, node.outputs[1].links, 1);
}

function syncLoaderOutputSlots(node) {
    const current = Array.isArray(node.outputs) ? node.outputs : [];
    const resultOutput = current.find((output) => output?.name === "result" || output?.type === "STRING") || current[0] || {};

    for (let index = current.length - 1; index >= 0; index -= 1) {
        const output = current[index];
        if (output === resultOutput) {
            continue;
        }
        disconnectOutputSlot(node, index);
    }

    node.outputs = [
        {
            ...resultOutput,
            name: "result",
            localized_name: "result",
            type: "STRING",
            links: asLinkList(resultOutput.links),
        },
    ];
    updateOutputLinkSlots(node, node.outputs[0].links, 0);
}

function disconnectOutputSlot(node, slot) {
    if (safeNodeGraph(node) && typeof node.disconnectOutput === "function") {
        node.disconnectOutput(slot);
        return;
    }
    const output = Array.isArray(node.outputs) ? node.outputs[slot] : null;
    if (output) {
        output.links = [];
    }
}

function asLinkList(links) {
    return Array.isArray(links) ? [...links] : [];
}

function updateOutputLinkSlots(node, links, slot) {
    const graphLinks = safeNodeGraph(node)?.links || safeAppGraph()?.links || {};
    for (const linkId of asLinkList(links)) {
        const link = graphLinks?.[linkId];
        if (link && link.origin_id === node.id) {
            link.origin_slot = slot;
        }
    }
}

function updateInputLinkSlots(node, links, slot) {
    const graphLinks = safeNodeGraph(node)?.links || safeAppGraph()?.links || {};
    for (const linkId of asLinkList(links)) {
        const link = graphLinks?.[linkId];
        if (link && link.target_id === node.id) {
            link.target_slot = slot;
        }
    }
}

function reviewerWidgetLayoutWidth(node, width) {
    const nodeWidth = Number(node?.size?.[0] || 0);
    if (nodeWidth > 0) {
        return Math.max(nodeWidth, GATE_DEFAULT_WIDTH);
    }
    const rawWidth = Number(width || 0);
    return Math.max(rawWidth || GATE_DEFAULT_WIDTH, GATE_DEFAULT_WIDTH);
}

function reviewerWidgetDrawWidth(node, width) {
    const rawWidth = Number(width || 0);
    const nodeWidth = Number(node?.size?.[0] || 0);
    if (nodeWidth > 0 && rawWidth > 0) {
        return Math.max(1, Math.min(rawWidth, nodeWidth));
    }
    return Math.max(1, nodeWidth || rawWidth || GATE_DEFAULT_WIDTH);
}

function reviewerRefreshSize(node, computed) {
    const currentWidth = Number(node?.size?.[0] || 0);
    const computedWidth = Number(computed?.[0] || 0);
    const width = Math.max(currentWidth || computedWidth || GATE_DEFAULT_WIDTH, GATE_DEFAULT_WIDTH);
    const height = Math.max(Number(computed?.[1] || 0), 252);
    return [width, height];
}

function loaderPreviewWidgetLayoutWidth(node, width) {
    const nodeWidth = Number(node?.size?.[0] || 0);
    if (nodeWidth > 0) {
        return Math.max(nodeWidth, DEFAULT_WIDTH);
    }
    const rawWidth = Number(width || 0);
    return Math.max(rawWidth || DEFAULT_WIDTH, DEFAULT_WIDTH);
}

function loaderPreviewWidgetDrawWidth(node, width) {
    const rawWidth = Number(width || 0);
    const nodeWidth = Number(node?.size?.[0] || 0);
    if (nodeWidth > 0 && rawWidth > 0) {
        return Math.max(1, Math.min(rawWidth, nodeWidth));
    }
    return Math.max(1, nodeWidth || rawWidth || DEFAULT_WIDTH);
}

class ReviewerControlsWidget {
    constructor(node) {
        this.name = `${GATE_GENERATED_PREFIX}controls`;
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
        this.hitAreas = {};
        this.pressed = "";
        this.hoverKey = "";
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        return [reviewerWidgetLayoutWidth(this.node, width), 148];
    }

    draw(ctx, node, width, y, height) {
        this.node = node;
        const drawWidth = reviewerWidgetDrawWidth(node, width);
        const x = 15;
        const panelY = y + 6;
        const panelW = Math.max(1, drawWidth - 30);
        const mode = String(getWidgetValue(node, "review_mode", "Review") || "Review");
        const gap = 8;
        const rowH = 26;
        const halfW = (panelW - gap) / 2;
        const reviewBounds = [x, panelY, halfW, rowH];
        const passBounds = [x + halfW + gap, panelY, halfW, rowH];
        const approveBounds = [x, panelY + rowH + 7, halfW, rowH];
        const regenBounds = [x + halfW + gap, panelY + rowH + 7, halfW, rowH];
        const retryBounds = [x, panelY + (rowH + 7) * 2, halfW, rowH];
        const seedBounds = [x + halfW + gap, panelY + (rowH + 7) * 2, halfW, rowH];
        const helpBounds = [x, panelY + (rowH + 7) * 3, panelW, rowH];
        const autoRetry = reviewerAutoRetryEnabled(node);
        this.hitAreas = {
            review: reviewBounds,
            pass: passBounds,
            approve: approveBounds,
            regenerate: regenBounds,
            retry: retryBounds,
            seed: seedBounds,
            help: helpBounds,
        };
        if (isDenoLocalLLMModalOpen()) {
            this.hoverKey = "";
        } else if (!this.pressed) {
            this.hoverKey = reviewerHoverKeyFromGraphMouse(node, this.hitAreas);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, drawWidth, Math.max(Number(height) || 0, 148));
        ctx.clip();
        drawReviewerControlButton(ctx, reviewBounds, "Review", mode !== "Pass", this.pressed === "review", "#9dffba");
        drawReviewerControlButton(ctx, passBounds, "Pass", mode === "Pass", this.pressed === "pass", "#ffb28b");
        drawReviewerControlButton(ctx, approveBounds, "Approve Once", false, this.pressed === "approve", "#9dffba");
        drawReviewerControlButton(ctx, regenBounds, "Regenerate", false, this.pressed === "regenerate", "#dfffea");
        drawReviewerControlButton(ctx, retryBounds, autoRetry ? "Retry x3 On" : "Retry x3 Off", autoRetry, this.pressed === "retry", "#9dffba");
        drawReviewerControlButton(ctx, seedBounds, reviewerSeedTargetButtonLabel(node), reviewerSeedTarget(node) !== REVIEWER_AUTO_RETRY_SEED_AUTO, this.pressed === "seed", "#dfffea");
        drawReviewerControlButton(ctx, helpBounds, "How to use", false, this.pressed === "help", "#c8f1d2");
        const tooltip = reviewerControlTooltip(this.hoverKey);
        ctx.restore();
        if (tooltip && this.hitAreas[this.hoverKey]) {
            showReviewerTooltip(node, tooltip, this.hitAreas[this.hoverKey]);
        } else {
            hideReviewerTooltip(node);
        }
    }

    mouse(event, pos, node) {
        const eventType = String(event?.type || "");
        const key = Object.entries(this.hitAreas || {}).find(([, bounds]) => isInsideBounds(pos, bounds))?.[0] || "";
        if (eventType === "pointerleave" || eventType === "mouseleave" || eventType === "mouseout") {
            this.pressed = "";
            this.hoverKey = "";
            hideReviewerTooltip(node);
            markGraphDirty(node);
            return false;
        }
        if (eventType === "pointermove" || eventType === "mousemove") {
            if (this.hoverKey !== key) {
                this.hoverKey = key;
                if (!key) {
                    hideReviewerTooltip(node);
                }
                markGraphDirty(node);
            }
            return Boolean(this.pressed);
        }
        if ((eventType === "pointerdown" || eventType === "mousedown") && key) {
            this.pressed = key;
            this.hoverKey = key;
            return true;
        }
        if ((eventType === "pointerup" || eventType === "mouseup") && this.pressed) {
            const pressed = this.pressed;
            this.pressed = "";
            this.hoverKey = key;
            if (!key || key !== pressed) {
                node.setDirtyCanvas?.(true, true);
                return true;
            }
            if (pressed === "review") {
                resetReviewerAutoRetry(node);
                setWidgetValue(node, "review_mode", "Review");
                setWidgetValue(node, "approve_once", false, false);
                setReviewerWaitingReason(node, "Review mode. Press Run to review.");
            } else if (pressed === "pass") {
                resetReviewerAutoRetry(node);
                setWidgetValue(node, "review_mode", "Pass");
                setWidgetValue(node, "approve_once", false, false);
                setReviewerWaitingReason(node, "Pass mode. Press Run to pass through.");
            } else if (pressed === "approve") {
                setReviewerWaitingReason(node, "Approving the current reviewed result once.");
                void triggerReviewerApproveOnce(node);
            } else if (pressed === "regenerate") {
                setReviewerWaitingReason(node, "Regenerating the path into this reviewer.");
                void triggerReviewerRegenerate(node);
            } else if (pressed === "retry") {
                const enabled = !reviewerAutoRetryEnabled(node);
                setReviewerAutoRetryEnabled(node, enabled);
                setReviewerWaitingReason(
                    node,
                    enabled
                        ? `Auto retry on. Failed reviews rerun up to ${REVIEWER_AUTO_RETRY_MAX} times.`
                        : "Auto retry off."
                );
            } else if (pressed === "seed") {
                openReviewerSeedTargetDialog(node);
            } else if (pressed === "help") {
                this.hoverKey = "";
                hideReviewerTooltip(node);
                openReviewerHowToUseDialog(node);
            }
            refreshGateNode(node);
            return true;
        }
        if (eventType === "pointerup" || eventType === "mouseup") {
            this.pressed = "";
            this.hoverKey = key;
            markGraphDirty(node);
        }
        return false;
    }
}

class LocalLLMPreviewWidget {
    constructor() {
        this.name = `${GENERATED_PREFIX}preview`;
        this.type = "custom";
        this.options = { serialize: false };
        this.value = "";
        this.expandBounds = {};
        this.blockBounds = {};
        this.blockLineInfo = {};
        this.scrollbarBounds = {};
        this.dragScrollKey = "";
        this.pressed = "";
        this.__expanded = false;
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        return [loaderPreviewWidgetLayoutWidth(this.__node, width), PREVIEW_HEIGHT];
    }

    draw(ctx, node, width, y, height) {
        this.__node = node;
        const state = getLocalLLMNodeState(node);
        const hasError = Boolean(state.error);
        const resultText = hasError ? String(state.error || "") : String(state.answer || "");
        const drawWidth = loaderPreviewWidgetDrawWidth(node, width);
        const x = 15;
        const panelY = y + 6;
        const panelW = Math.max(1, drawWidth - 30);
        this.__expanded = false;
        const expectedHeight = PREVIEW_HEIGHT;
        const actualHeight = Math.max(expectedHeight, Number(height) || 0);
        const panelH = Math.max(80, actualHeight - 12);
        const buttonLabel = "More";
        const buttonW = 44;
        const buttonH = 20;
        const rowGap = 8;
        const thinkingH = Math.min(72, Math.max(58, Math.floor(panelH * 0.34)));
        const resultY = panelY + thinkingH + rowGap;
        const resultH = Math.max(56, panelH - thinkingH - rowGap);
        const answerMaxLines = maxPreviewLinesForHeight(resultH);
        const thinkingMaxLines = maxPreviewLinesForHeight(thinkingH);
        ctx.save();
        ctx.font = PREVIEW_TEXT_FONT;
        let answerLines = splitPreviewLinesForWidth(ctx, resultText, previewTextWidth(panelW, false));
        let thinkingLines = splitPreviewLinesForWidth(ctx, state.thinking, previewTextWidth(panelW, false));
        if (answerLines.length > answerMaxLines) {
            answerLines = splitPreviewLinesForWidth(ctx, resultText, previewTextWidth(panelW, true));
        }
        if (thinkingLines.length > thinkingMaxLines) {
            thinkingLines = splitPreviewLinesForWidth(ctx, state.thinking, previewTextWidth(panelW, true));
        }
        ctx.restore();
        const answerView = previewWindow(node, "result", answerLines, answerMaxLines);
        const thinkingView = previewWindow(node, "thinking", thinkingLines, thinkingMaxLines);
        this.blockBounds = {
            thinking: [x, panelY, panelW, thinkingH],
            result: [x, resultY, panelW, resultH],
        };
        this.expandBounds = {
            thinking: [x + panelW - buttonW - 10, panelY + 7, buttonW, buttonH],
            result: [x + panelW - buttonW - 10, resultY + 7, buttonW, buttonH],
        };
        this.blockLineInfo = {
            thinking: { total: thinkingLines.length, max: thinkingMaxLines },
            result: { total: answerLines.length, max: answerMaxLines },
        };
        this.scrollbarBounds = {
            thinking: previewScrollbarBounds(this.blockBounds.thinking, thinkingLines.length, thinkingMaxLines),
            result: previewScrollbarBounds(this.blockBounds.result, answerLines.length, answerMaxLines),
        };

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, drawWidth, actualHeight);
        ctx.clip();
        drawPreviewBlock(ctx, x, panelY, panelW, thinkingH, "Thinking", thinkingView.lines, "#91dca4", {
            buttonBounds: this.expandBounds.thinking,
            buttonLabel,
            buttonPressed: this.pressed === "thinking",
            scrollFromBottom: thinkingView.scrollFromBottom,
            totalLines: thinkingLines.length,
            maxLines: thinkingMaxLines,
        });
        drawPreviewBlock(ctx, x, resultY, panelW, resultH, hasError ? "Error" : "Result", answerView.lines, hasError ? "#ffb4b4" : "#dfffea", {
            buttonBounds: this.expandBounds.result,
            buttonLabel,
            buttonPressed: this.pressed === "result",
            fill: hasError ? "rgba(30, 0, 0, 0.62)" : undefined,
            stroke: hasError ? "rgba(255, 104, 104, 0.72)" : undefined,
            labelColor: hasError ? "#ff8f8f" : undefined,
            scrollFromBottom: answerView.scrollFromBottom,
            totalLines: answerLines.length,
            maxLines: answerMaxLines,
        });
        ctx.restore();
    }

    mouse(event, pos, node) {
        const eventType = String(event?.type || "");
        const isWheel = eventType === "wheel" || eventType === "mousewheel";
        const isDown = eventType === "pointerdown" || eventType === "mousedown";
        const isMove = eventType === "pointermove" || eventType === "mousemove";
        const isUp = eventType === "pointerup" || eventType === "mouseup";
        if (isWheel) {
            return handlePreviewWheel(event, pos, node, this.blockBounds, this.blockLineInfo);
        }
        if (isDown) {
            const scrollKey = previewScrollbarKeyFromPos(pos, this.scrollbarBounds);
            if (scrollKey) {
                this.dragScrollKey = scrollKey;
                setPreviewScrollbarCursor(true);
                return handlePreviewScrollbarPointer(event, pos, node, scrollKey, this.scrollbarBounds, this.blockLineInfo);
            }
        }
        if (isMove && this.dragScrollKey) {
            setPreviewScrollbarCursor(true);
            return handlePreviewScrollbarPointer(event, pos, node, this.dragScrollKey, this.scrollbarBounds, this.blockLineInfo);
        }
        if (isMove) {
            setPreviewScrollbarCursor(Boolean(previewScrollbarKeyFromPos(pos, this.scrollbarBounds)));
        }
        if (isUp && this.dragScrollKey) {
            const scrollKey = this.dragScrollKey;
            this.dragScrollKey = "";
            const handled = handlePreviewScrollbarPointer(event, pos, node, scrollKey, this.scrollbarBounds, this.blockLineInfo);
            setPreviewScrollbarCursor(Boolean(previewScrollbarKeyFromPos(pos, this.scrollbarBounds)));
            return handled;
        }
        const pressedExpandKey = isInsideBounds(pos, this.expandBounds.thinking)
            ? "thinking"
            : isInsideBounds(pos, this.expandBounds.result)
                ? "result"
                : "";
        if (isDown && pressedExpandKey) {
            this.pressed = pressedExpandKey;
            return true;
        }
        if (isMove) {
            return this.pressed;
        }
        if (isUp && this.pressed) {
            const pressedKey = this.pressed;
            this.pressed = "";
            if (pressedKey === "thinking" && isInsideBounds(pos, this.expandBounds.thinking)) {
                const state = getLocalLLMNodeState(node);
                const text = String(state.thinking || "Waiting for run output.");
                openPreviewTextDialog(node, "thinking", "Thinking", text);
            } else if (pressedKey === "result" && isInsideBounds(pos, this.expandBounds.result)) {
                const state = getLocalLLMNodeState(node);
                const isError = Boolean(state.error);
                const text = String(
                    isError
                        ? state.error
                        : state.answer || "Waiting for run output.",
                );
                openPreviewTextDialog(node, "result", isError ? "Error" : "Result", text);
            }
            return true;
        }
        this.pressed = "";
        this.dragScrollKey = "";
        clearPreviewScrollbarCursor();
        return false;
    }
}

class GateStatusWidget {
    constructor(node) {
        this.name = `${GATE_GENERATED_PREFIX}status`;
        this.type = "custom";
        this.node = node;
        this.options = { serialize: false };
    }

    serializeValue() {
        return undefined;
    }

    computeSize(width) {
        const hasPreview = Boolean(this.node?.__denoLocalLLMGateState?.preview);
        return [reviewerWidgetLayoutWidth(this.node, width), hasPreview ? 246 : 104];
    }

    draw(ctx, node, width, y, height) {
        this.node = node;
        const state = node.__denoLocalLLMGateState || {};
        const drawWidth = reviewerWidgetDrawWidth(node, width);
        const x = 15;
        const panelY = y + 6;
        const panelW = Math.max(1, drawWidth - 30);
        const availableNodeHeight = Math.max(0, Number(node.size?.[1]) - y - 12);
        const actualHeight = Math.max(Number(height) || 0, availableNodeHeight, state.preview ? 224 : 82);
        const passed = state.passed;
        const verdict = passed === null ? "Waiting" : passed ? "Passed" : "Blocked";
        const color = passed === false ? "#ff8f8f" : "#9dffba";
        const reason = String(state.reason || (passed === null ? "Waiting for review output." : ""));
        const source = String(state.source || "");
        const counts = state.passedCount !== null && state.blockedCount !== null
            ? `Passed ${state.passedCount} / Blocked ${state.blockedCount}`
            : "";
        const subline = [source, counts].filter(Boolean).join(" · ");
        const hasPreview = Boolean(state.preview);
        const statusH = hasPreview ? 82 : Math.max(58, actualHeight - 12);
        const reasonLines = splitPreviewLines(reason, maxPreviewCharsForWidth(panelW)).slice(0, subline ? 2 : 3);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, drawWidth, actualHeight);
        ctx.clip();
        drawRoundedRectangle(ctx, x, panelY, panelW, statusH, 6, "rgba(0, 0, 0, 0.58)", "rgba(126, 255, 166, 0.26)");
        ctx.fillStyle = color;
        ctx.font = "700 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(verdict, x + 8, panelY + 7);
        if (subline) {
            ctx.fillStyle = "#9dffba";
            ctx.font = "700 9px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(fitString(ctx, subline, panelW - 92), x + panelW - 8, panelY + 8);
        }
        ctx.fillStyle = "#dfffea";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        const reasonClipX = x + 8;
        const reasonClipY = panelY + 27;
        const reasonClipW = Math.max(1, panelW - 16);
        const reasonClipH = Math.max(1, statusH - 34);
        ctx.save();
        ctx.beginPath();
        ctx.rect(reasonClipX, reasonClipY, reasonClipW, reasonClipH);
        ctx.clip();
        for (let index = 0; index < reasonLines.length; index += 1) {
            const line = fitString(ctx, String(reasonLines[index] || ""), reasonClipW);
            ctx.fillText(line, reasonClipX, reasonClipY + 1 + index * 13);
        }
        ctx.restore();
        if (hasPreview) {
            const previewY = panelY + statusH + 8;
            const previewH = Math.max(112, actualHeight - statusH - 20);
            drawReviewerImagePreview(ctx, state.preview, x, previewY, panelW, previewH);
        }
        ctx.restore();
    }

    mouse() {
        return false;
    }
}

function drawReviewerImagePreview(ctx, preview, x, y, width, height) {
    drawRoundedRectangle(ctx, x, y, width, height, 6, "rgba(1, 7, 4, 0.78)", "rgba(126, 255, 166, 0.32)");
    ctx.save();
    ctx.fillStyle = "#9dffba";
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Image Preview", x + 8, y + 7);
    const sizeText = preview?.width && preview?.height ? `${preview.width}x${preview.height}` : "";
    if (sizeText) {
        ctx.textAlign = "right";
        ctx.fillText(sizeText, x + width - 8, y + 7);
    }

    const imageRect = {
        x: x + 8,
        y: y + 25,
        w: width - 16,
        h: Math.max(1, height - 33),
    };
    drawRoundedRectangle(ctx, imageRect.x, imageRect.y, imageRect.w, imageRect.h, 5, "#050906", "rgba(126, 255, 166, 0.14)");
    if (!preview?.loaded || preview?.failed) {
        ctx.fillStyle = preview?.failed ? "#ffb1b1" : "#8fcfa4";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(preview?.failed ? "Preview failed to load." : "Loading preview...", imageRect.x + imageRect.w / 2, imageRect.y + imageRect.h / 2);
        ctx.restore();
        return;
    }
    drawContainedImage(ctx, preview.img, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
    ctx.restore();
}

function drawReviewerControlButton(ctx, bounds, label, active, pressed, accent) {
    const [x, y, width, height] = bounds;
    const fill = active
        ? "rgba(27, 93, 49, 0.92)"
        : pressed
          ? "rgba(38, 48, 42, 0.96)"
          : "rgba(6, 10, 8, 0.80)";
    const stroke = active ? accent : "rgba(126, 255, 166, 0.32)";
    drawRoundedRectangle(ctx, x, y + (pressed ? 1 : 0), width, height, 6, fill, stroke);
    ctx.save();
    ctx.fillStyle = active ? "#f0fff5" : "#cfe8d6";
    ctx.font = "600 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitString(ctx, label, width - 14), x + width / 2, y + height / 2 + (pressed ? 1 : 0));
    ctx.restore();
}

function reviewerControlTooltip(key) {
    const tooltips = {
        review: "Review mode. The review text decides whether image/audio pass or block.",
        pass: "Bypass review and pass image/audio through when you run the workflow.",
        approve: "Approve only the current reviewed result using the saved snapshot.",
        regenerate: "Rerun the upstream path before this reviewer, then review again.",
        retry: `When review fails, rerun up to ${REVIEWER_AUTO_RETRY_MAX} times and change the selected seed.`,
        seed: "Choose which seed changes during automatic retry.",
        help: "Open a quick wiring guide for the Local LLM Reviewer workflow.",
    };
    return tooltips[String(key || "")] || "";
}

function stopReviewerTooltipOwnerWatch() {
    cancelLocalLLMAnimationFrame(reviewerTooltipOwnerFrame);
    reviewerTooltipOwnerFrame = 0;
}

function watchReviewerTooltipOwner() {
    stopReviewerTooltipOwnerWatch();
    const owner = reviewerTooltipOwner;
    if (!owner || !reviewerTooltipElement?.isConnected || reviewerTooltipElement.style.display === "none") {
        return;
    }
    const ownerGraph = safeNodeGraph(owner);
    const activeGraph = localLLMActiveGraph();
    if (ownerGraph && activeGraph && activeGraph !== ownerGraph) {
        hideReviewerTooltip(owner);
        return;
    }
    reviewerTooltipOwnerFrame = requestLocalLLMAnimationFrame(watchReviewerTooltipOwner);
}

function removeReviewerTooltipForNode(node) {
    if (!node || reviewerTooltipOwner !== node) {
        return false;
    }
    stopReviewerTooltipOwnerWatch();
    reviewerTooltipOwner = null;
    const element = reviewerTooltipElement;
    reviewerTooltipElement = null;
    try {
        element?.remove?.();
    } catch {
        // The graph host may already have detached the tooltip element.
    }
    return true;
}

function ensureReviewerTooltipElement() {
    if (reviewerTooltipElement?.isConnected) {
        return reviewerTooltipElement;
    }
    const element = document.createElement("div");
    element.className = "deno-local-llm-reviewer-tooltip";
    Object.assign(element.style, {
        position: "fixed",
        display: "none",
        zIndex: "100000",
        maxWidth: "320px",
        padding: "9px 11px",
        boxSizing: "border-box",
        borderRadius: "7px",
        border: "1px solid rgba(157, 255, 186, 0.78)",
        background: "rgba(2, 7, 5, 0.97)",
        color: "#dcffe6",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.42)",
        font: "500 11px/1.35 'Segoe UI', sans-serif",
        whiteSpace: "normal",
        overflowWrap: "break-word",
        pointerEvents: "none",
    });
    document.body.appendChild(element);
    reviewerTooltipElement = element;
    return element;
}

function hideReviewerTooltip(node = null) {
    if (node && reviewerTooltipOwner && reviewerTooltipOwner !== node) {
        return;
    }
    stopReviewerTooltipOwnerWatch();
    reviewerTooltipOwner = null;
    if (reviewerTooltipElement) {
        reviewerTooltipElement.style.display = "none";
    }
}

function showReviewerTooltip(node, text, anchorBounds) {
    if (!node || !text || !anchorBounds || typeof document === "undefined") {
        hideReviewerTooltip(node);
        return;
    }
    const canvas = currentGraphCanvasElement();
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect) {
        hideReviewerTooltip(node);
        return;
    }
    const element = ensureReviewerTooltipElement();
    element.textContent = text;
    element.style.display = "block";
    reviewerTooltipOwner = node;
    watchReviewerTooltipOwner();

    const [anchorX, anchorY, anchorW, anchorH] = anchorBounds;
    const graphAnchor = [
        Number(node.pos?.[0] || 0) + anchorX + anchorW / 2,
        Number(node.pos?.[1] || 0) + anchorY + anchorH,
    ];
    const canvasPoint = graphPointToCanvasPoint(graphAnchor, app.canvas?.ds);
    const elementWidth = element.offsetWidth || 220;
    const elementHeight = element.offsetHeight || 42;
    const screenAnchorX = rect.left + canvasPoint[0];
    const screenAnchorY = rect.top + canvasPoint[1];
    const margin = 8;
    let left = screenAnchorX - elementWidth / 2;
    let top = screenAnchorY + 8;
    if (top + elementHeight > window.innerHeight - margin) {
        top = screenAnchorY - elementHeight - anchorH - 8;
    }
    left = Math.min(window.innerWidth - elementWidth - margin, Math.max(margin, left));
    top = Math.min(window.innerHeight - elementHeight - margin, Math.max(margin, top));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

function reviewerHoverKeyFromGraphMouse(node, hitAreas) {
    const mouse = pointPair(app?.canvas?.graph_mouse || app?.canvas?.graphMouse);
    if (!mouse || !node) {
        return "";
    }
    const local = [
        mouse[0] - Number(node.pos?.[0] || 0),
        mouse[1] - Number(node.pos?.[1] || 0),
    ];
    return Object.entries(hitAreas || {}).find(([, bounds]) => isInsideBounds(local, bounds))?.[0] || "";
}

function drawContainedImage(ctx, img, x, y, width, height) {
    const iw = Number(img?.naturalWidth || img?.width || 0);
    const ih = Number(img?.naturalHeight || img?.height || 0);
    if (!iw || !ih || width <= 0 || height <= 0) {
        return null;
    }
    const scale = Math.min(width / iw, height / ih);
    const drawW = Math.max(1, iw * scale);
    const drawH = Math.max(1, ih * scale);
    const drawX = x + (width - drawW) / 2;
    const drawY = y + (height - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [5]);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
    return { x: drawX, y: drawY, w: drawW, h: drawH };
}

function setReviewerWaitingReason(node, reason) {
    node.__denoLocalLLMGateState = {
        ...(node.__denoLocalLLMGateState || {}),
        passed: null,
        verdict: "",
        reason,
        source: "",
        updatedAt: Date.now(),
    };
    markGraphDirty(node);
}

function clearOtherReviewerSubmitModes(targetNode) {
    const graph = safeAppGraph();
    const nodes = graph?._nodes || graph?.nodes || [];
    for (const node of nodes) {
        if (node !== targetNode && node?.type === GATE_NODE_NAME) {
            node._denoReviewerSubmitMode = null;
        }
    }
}

async function queueReviewerWithMode(node, mode) {
    if (!node) {
        return false;
    }
    clearOtherReviewerSubmitModes(node);
    node._denoReviewerSubmitMode = mode;
    node._denoReviewerQueueBlockReason = "";
    let clearLater = false;
    try {
        if (typeof app?.queuePrompt === "function") {
            const result = await app.queuePrompt(0, 1);
            node._denoReviewerQueueBlockReason = reviewerQueueBlockReason(result);
            return reviewerQueueResultAccepted(result);
        }
        if (typeof app?.extensionManager?.queuePrompt === "function") {
            const result = await app.extensionManager.queuePrompt(0, 1);
            node._denoReviewerQueueBlockReason = reviewerQueueBlockReason(result);
            return reviewerQueueResultAccepted(result);
        }
        const buttons = Array.from(document?.querySelectorAll?.("button") || []);
        const runButton = buttons.find((button) => {
            const label = `${button.getAttribute?.("aria-label") || ""} ${button.textContent || ""}`.trim();
            return /(^|\s)Run(\s|$)/i.test(label) && !button.disabled;
        });
        if (runButton) {
            runButton.click();
            clearLater = true;
            window.setTimeout(() => {
                if (node._denoReviewerSubmitMode === mode) {
                    node._denoReviewerSubmitMode = null;
                }
            }, 2000);
            return true;
        }
    } catch (error) {
        console.warn("[Deno Local LLM Reviewer] Regenerate request failed", error);
    } finally {
        if (!clearLater && node._denoReviewerSubmitMode === mode) {
            node._denoReviewerSubmitMode = null;
        }
    }
    return false;
}

function reviewerQueueResultAccepted(result) {
    if (result === false) {
        return false;
    }
    if (
        result &&
        typeof result === "object" &&
        result.deno_ideogram_director === "preflight_waiting"
    ) {
        return false;
    }
    return true;
}

function reviewerQueueBlockReason(result) {
    if (
        result &&
        typeof result === "object" &&
        result.deno_ideogram_director === "preflight_waiting"
    ) {
        return "Complete or cancel the open Ideogram Director preflight, then retry.";
    }
    return "";
}

function takeReviewerQueueBlockReason(node, fallback) {
    const reason = String(node?._denoReviewerQueueBlockReason || "").trim();
    if (node) {
        node._denoReviewerQueueBlockReason = "";
    }
    return reason || fallback;
}

function markReviewerAutoRetryLimit(node) {
    node.__denoLocalLLMGateState = {
        ...(node.__denoLocalLLMGateState || {}),
        passed: false,
        verdict: "FAIL",
        reason: `Blocked after ${REVIEWER_AUTO_RETRY_MAX} auto retries. Change the seed target or run manually.`,
        source: "Auto retry",
        updatedAt: Date.now(),
    };
    resetReviewerAutoRetry(node);
    refreshGateNode(node);
}

function maybeAutoRetryReviewer(node, gateInfo) {
    if (!node || !gateInfo) {
        return false;
    }
    if (!reviewerAutoRetryEnabled(node)) {
        resetReviewerAutoRetry(node);
        return false;
    }
    if (Boolean(gateInfo.passed)) {
        resetReviewerAutoRetry(node);
        return false;
    }
    if (node._denoReviewerAutoRetryBusy) {
        return false;
    }
    if (!node._denoReviewerAutoRetryActive) {
        node._denoReviewerAutoRetryActive = true;
        node._denoReviewerAutoRetryAttempt = 0;
    }
    const attempt = Number(node._denoReviewerAutoRetryAttempt || 0);
    if (attempt >= REVIEWER_AUTO_RETRY_MAX) {
        markReviewerAutoRetryLimit(node);
        return false;
    }

    const seedChange = incrementReviewerRetrySeed(node);
    if (!seedChange) {
        node.__denoLocalLLMGateState = {
            ...(node.__denoLocalLLMGateState || {}),
            passed: false,
            verdict: "FAIL",
            reason: reviewerMissingSeedReason(node),
            source: "Auto retry",
            updatedAt: Date.now(),
        };
        resetReviewerAutoRetry(node);
        refreshGateNode(node);
        return false;
    }

    const nextAttempt = attempt + 1;
    node._denoReviewerAutoRetryAttempt = nextAttempt;
    node._denoReviewerAutoRetryBusy = true;
    setReviewerWaitingReason(
        node,
        `Auto retry ${nextAttempt}/${REVIEWER_AUTO_RETRY_MAX}: ${seedChange.label} ${seedChange.oldSeed} -> ${seedChange.newSeed}.`
    );
    window.setTimeout(async () => {
        try {
            const queued = await queueReviewerWithMode(node, REVIEWER_SUBMIT_REGENERATE);
            if (!queued) {
                restoreReviewerRetrySeed(seedChange);
                node.__denoLocalLLMGateState = {
                    ...(node.__denoLocalLLMGateState || {}),
                    passed: false,
                    verdict: "FAIL",
                    reason: takeReviewerQueueBlockReason(
                        node,
                        "Auto retry could not start. Press Regenerate or Run to retry."
                    ),
                    source: "Auto retry",
                    updatedAt: Date.now(),
                };
                resetReviewerAutoRetry(node);
                refreshGateNode(node);
            }
        } finally {
            node._denoReviewerAutoRetryBusy = false;
        }
    }, 150);
    return true;
}

async function triggerReviewerRegenerate(node) {
    resetReviewerAutoRetry(node);
    const queued = await queueReviewerWithMode(node, REVIEWER_SUBMIT_REGENERATE);
    if (!queued) {
        setReviewerWaitingReason(
            node,
            takeReviewerQueueBlockReason(node, "Regenerate could not start. Press Run to retry.")
        );
        refreshGateNode(node);
    }
    return queued;
}

async function triggerReviewerApproveOnce(node) {
    resetReviewerAutoRetry(node);
    setWidgetValue(node, "review_mode", "Review", false);
    setWidgetValue(node, "approve_once", false, false);
    const queued = await queueReviewerWithMode(node, REVIEWER_SUBMIT_APPROVE_ONCE);
    if (!queued) {
        setReviewerWaitingReason(
            node,
            takeReviewerQueueBlockReason(node, "Approve Once could not start. Press Run to retry.")
        );
        refreshGateNode(node);
    }
    return queued;
}

function removeGateGeneratedWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => !String(widget?.name || "").startsWith(GATE_GENERATED_PREFIX));
}

function polishGateInputLabels(node) {
    const labels = {
        review: "review result",
        image: "image",
        audio: "audio",
    };
    for (const input of node.inputs || []) {
        if (labels[input.name]) {
            input.label = labels[input.name];
        }
    }
}

function refreshGateNode(node) {
    const computed = node.computeSize?.();
    if (computed) {
        const [width, height] = reviewerRefreshSize(node, computed);
        node.setSize?.([width, height]);
        if (Array.isArray(node.size)) {
            node.size[0] = width;
            node.size[1] = height;
        }
    }
    markGraphDirty(node);
}

function removeGeneratedWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => {
        const name = String(widget?.name || "");
        const value = String(widget?.value || "");
        if (name.startsWith(GENERATED_PREFIX)) {
            removeWidgetElement(widget);
            return false;
        }
        if (
            name === "Refresh Models" ||
            value === "Refresh Models" ||
            name === "Stop LLM" ||
            value === "Stop LLM" ||
            name === "Unload LLM" ||
            value === "Unload LLM"
        ) {
            removeWidgetElement(widget);
            return false;
        }
        return true;
    });
}

function removeWidgetElement(widget) {
    const elements = [
        widget?.__denoElement,
        widget?.element,
        widget?.inputEl,
        widget?.domElement,
    ].filter(Boolean);
    if (!elements.length) {
        return;
    }
    for (const element of elements) {
        removeDomWidgetElement(element);
    }
}

function removeDomWidgetElement(element) {
    if (!element || element.__denoRemoved) {
        return;
    }
    element.__denoRemoved = true;
    const wrapper = element.closest?.(".dom-widget");
    const target = wrapper || element;
    try {
        target?.remove?.();
    } catch {
        try {
            target?.parentNode?.removeChild?.(target);
        } catch {
            // Best-effort cleanup for stale DOM widgets.
        }
    }
}

function schedulePostSetupCleanup(node) {
    if (node.__denoLocalLLMCleanupScheduled) {
        return;
    }
    node.__denoLocalLLMCleanupScheduled = true;
    const cleanup = () => {
        ensureSystemPromptWidget(node);
        ensurePromptWidget(node);
        removePromptWidgets(node);
        normalizeLoaderPromptInputSocket(node);
        removeLoaderWidgetInputSockets(node);
        ensureProviderWidgets(node);
        migrateLegacyModelWidgets(node);
        removeLegacyWidgets(node);
        dedupeKnownWidgets(node);
        repairSavedWidgetValues(node);
        repairLegacyProviderValues(node);
        ensureSeedModeWidget(node);
        installLocalLLMQueueCallbacks(node);
        ensureSinglePreviewWidget(node);
        ensureSingleRefreshButton(node);
        ensureSingleStopButton(node);
        ensureSingleUnloadButton(node);
        ensureSingleSystemPromptButton(node);
        removeLegacyPromptBoxDomElements();
        positionPromptWidget(node);
        setActiveProviderModelVisibility(node);
        addRefreshButton(node);
        addStopButton(node);
        addUnloadButton(node);
        addSystemPromptButton(node);
        positionPromptWidget(node);
        node.__denoLocalLLMCleanupScheduled = false;
        refreshNode(node);
    };
    queueMicrotask(cleanup);
    window.setTimeout(cleanup, 80);
    window.setTimeout(cleanup, 300);
}

function setWidgetHidden(widget, hidden) {
    if (!widget) {
        return;
    }
    if (
        !Object.prototype.hasOwnProperty.call(widget, "__denoLocalLLMOriginalType") ||
        widget.__denoLocalLLMOriginalType === "converted-widget"
    ) {
        widget.__denoLocalLLMOriginalType = widget.type;
    }
    if (
        !Object.prototype.hasOwnProperty.call(widget, "__denoLocalLLMOriginalComputeSize") ||
        isCollapsedComputeSize(widget.__denoLocalLLMOriginalComputeSize)
    ) {
        widget.__denoLocalLLMOriginalComputeSize = widget.computeSize;
    }
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoLocalLLMOriginalHidden") || !hidden) {
        widget.__denoLocalLLMOriginalHidden = Boolean(widget.hidden);
    }

    widget.hidden = hidden;
    if (hidden) {
        widget.type = "converted-widget";
        widget.computeSize = () => [0, -4];
        if (widget.element) {
            widget.element.style.display = "none";
        }
        return;
    }

    widget.type =
        widget.__denoLocalLLMOriginalType && widget.__denoLocalLLMOriginalType !== "converted-widget"
            ? widget.__denoLocalLLMOriginalType
            : inferWidgetType(widget);
    if (widget.__denoLocalLLMOriginalComputeSize && !isCollapsedComputeSize(widget.__denoLocalLLMOriginalComputeSize)) {
        widget.computeSize = widget.__denoLocalLLMOriginalComputeSize;
    } else {
        delete widget.computeSize;
    }
    widget.hidden = false;
    if (widget.element) {
        widget.element.style.display = "";
    }
}

function inferWidgetType(widget) {
    const name = String(widget?.name || "");
    if (
        name === "ollama_model" ||
        name === "lm_studio_model" ||
        name === "provider" ||
        name === "model_memory" ||
        name === "comfy_vram_policy"
    ) {
        return "combo";
    }
    if (name === "custom_server_url" || name === "custom_model" || name === "prompt") {
        return "text";
    }
    if (name === "thinking") {
        return "toggle";
    }
    if (name === "system_prompt") {
        return "text";
    }
    return widget?.type && widget.type !== "converted-widget" ? widget.type : "number";
}

function normalizeModelMemoryValue(value) {
    const text = String(value ?? "").trim();
    return MODEL_MEMORY_ALIASES[text] || text;
}

function normalizeProviderValue(value) {
    const text = String(value ?? "").trim();
    if (text === LEGACY_PROVIDER_CUSTOM) {
        return PROVIDER_CUSTOM;
    }
    return PROVIDER_VALUES.includes(text) ? text : PROVIDER_OLLAMA;
}

function normalizeComfyVramValue(value) {
    const text = String(value ?? "").trim();
    const normalized = COMFY_VRAM_ALIASES[text] || text;
    return COMFY_VRAM_VALUES.includes(normalized) ? normalized : COMFY_VRAM_VALUES[0];
}

function syncComfyVramWidgetOptions(widget) {
    if (!widget) {
        return;
    }
    widget.options = widget.options || {};
    widget.options.values = COMFY_VRAM_VALUES;
    widget.options.list = COMFY_VRAM_VALUES;
}

function isCollapsedComputeSize(computeSize) {
    if (typeof computeSize !== "function") {
        return false;
    }
    try {
        const size = computeSize(500);
        return Array.isArray(size) && Number(size[1]) <= 0;
    } catch {
        return false;
    }
}

function removePromptWidgets(node) {
    const promptWidget = getWidget(node, "prompt");
    let copiedLegacyValue = false;
    node.widgets = (node.widgets || []).filter((widget) => {
        const name = String(widget?.name || "");
        if (name !== "user_prompt") {
            return true;
        }
        const legacyValue = String(widget?.value || "");
        if (!copiedLegacyValue && promptWidget && !String(promptWidget.value || "").trim() && legacyValue.trim()) {
            promptWidget.value = legacyValue;
            copiedLegacyValue = true;
        }
        removeWidgetElement(widget);
        return false;
    });
}

function normalizeLoaderPromptInputSocket(node) {
    if (!node) {
        return false;
    }
    if (!Array.isArray(node.inputs)) {
        node.inputs = [];
    }

    let changed = false;
    let promptInput = node.inputs.find((input) => isPromptWidgetSocket(input));
    for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
        const input = node.inputs[index];
        const identifiers = loaderSocketIdentifiers(input);
        const isLegacyUserPrompt = identifiers.includes("user_prompt");
        if (!isLegacyUserPrompt) {
            continue;
        }
        if (!promptInput || promptInput === input) {
            promptInput = input;
            setPromptInputSocketFields(promptInput);
            changed = true;
            continue;
        }
        if (asInputLinkList(promptInput).length === 0 && asInputLinkList(input).length > 0) {
            promptInput.link = input.link ?? null;
            promptInput.links = Array.isArray(input.links) ? [...input.links] : [];
            updateInputLinkSlots(node, asInputLinkList(promptInput), node.inputs.indexOf(promptInput));
        }
        disconnectInputSlot(node, index);
        node.inputs.splice(index, 1);
        changed = true;
    }

    promptInput = node.inputs.find((input) => isPromptWidgetSocket(input));
    if (!promptInput) {
        promptInput = {
            name: "prompt",
            localized_name: "prompt",
            label: "prompt",
            type: "STRING",
            link: null,
        };
        const imageIndex = node.inputs.findIndex((input) => String(input?.name || input?.label || input?.localized_name || "") === "image");
        node.inputs.splice(imageIndex >= 0 ? imageIndex + 1 : 0, 0, promptInput);
        changed = true;
    }
    setPromptInputSocketFields(promptInput);
    if (changed) {
        node.inputs.forEach((input, index) => updateInputLinkSlots(node, asInputLinkList(input), index));
        markGraphDirty(node);
    }
    return changed;
}

function setPromptInputSocketFields(input) {
    if (!input) {
        return;
    }
    input.name = "prompt";
    input.localized_name = "prompt";
    input.label = "prompt";
    input.type = "STRING";
}

function removeLoaderWidgetInputSockets(node) {
    if (!Array.isArray(node?.inputs)) {
        return false;
    }
    let removed = false;
    for (let index = node.inputs.length - 1; index >= 0; index -= 1) {
        const input = node.inputs[index];
        if (!isLoaderWidgetSocket(input)) {
            continue;
        }
        if (isPromptWidgetSocket(input)) {
            copyLinkedPromptTextIntoWidget(node, input);
        }
        disconnectInputSlot(node, index);
        node.inputs.splice(index, 1);
        removed = true;
    }
    if (!removed) {
        return false;
    }
    node.inputs.forEach((input, index) => updateInputLinkSlots(node, asInputLinkList(input), index));
    markGraphDirty(node);
    return true;
}

function isLoaderWidgetSocket(input) {
    return loaderSocketIdentifiers(input).some((identifier) => LOADER_WIDGET_SOCKET_NAMES.has(identifier));
}

function isPromptWidgetSocket(input) {
    return loaderSocketIdentifiers(input).some((identifier) => ["prompt", "user_prompt", "Prompt"].includes(identifier));
}

function loaderSocketIdentifiers(input) {
    return [
        input?.name,
        input?.label,
        input?.localized_name,
    ].map((value) => String(value || "")).filter(Boolean);
}

function copyLinkedPromptTextIntoWidget(node, input) {
    const promptWidget = getWidget(node, "prompt");
    if (!promptWidget || String(promptWidget.value || "").trim()) {
        return false;
    }
    const text = linkedPromptTextCandidate(node, input);
    if (!text.trim()) {
        return false;
    }
    promptWidget.value = text;
    return true;
}

function linkedPromptTextCandidate(node, input) {
    const graph = safeNodeGraph(node) || safeAppGraph();
    const links = graph?.links || {};
    for (const linkId of asInputLinkList(input)) {
        const link = links?.[linkId];
        if (link?.origin_id == null) {
            continue;
        }
        const origin = graphNodeById(graph, link.origin_id);
        const value = bestStringWidgetValue(origin);
        if (value.trim()) {
            return value;
        }
    }
    return "";
}

function bestStringWidgetValue(node) {
    const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
    const preferredNames = ["prompt", "text", "positive_prompt", "caption", "value", "string"];
    for (const preferredName of preferredNames) {
        const widget = widgets.find((candidate) => String(candidate?.name || "").toLowerCase() === preferredName);
        const value = String(widget?.value || "");
        if (value.trim()) {
            return value;
        }
    }
    let best = "";
    for (const widget of widgets) {
        const value = String(widget?.value || "");
        if (value.trim() && value.length > best.length) {
            best = value;
        }
    }
    return best;
}

function ensureSystemPromptWidget(node) {
    let widget = getWidget(node, "system_prompt");
    if (!widget) {
        widget = createInputWidgetFromNodeData(node, "system_prompt", "System Prompt");
    }
    if (!widget) {
        return null;
    }
    widget.name = "system_prompt";
    widget.label = "System Prompt";
    if (typeof widget.value !== "string") {
        widget.value = String(widget.value || "");
    }
    setWidgetHidden(widget, true);
    return widget;
}

function ensurePromptWidget(node) {
    let widget = getWidget(node, "prompt");
    if (!widget) {
        widget = createInputWidgetFromNodeData(node, "prompt", "Prompt");
    }
    if (!widget) {
        return null;
    }
    widget.name = "prompt";
    widget.label = "Prompt";
    if (typeof widget.value !== "string") {
        widget.value = String(widget.value || "");
    }
    setWidgetHidden(widget, false);
    configurePromptWidget(node, widget);
    return widget;
}

function configurePromptWidget(node, widget) {
    if (!widget) {
        return;
    }
    widget.options = widget.options || {};
    widget.options.multiline = true;
    widget.computeSize = (width) => {
        const promptHeight = loaderPromptWidgetHeight(node);
        stylePromptWidgetElement(widget, promptHeight);
        return [Math.max(width || DEFAULT_WIDTH, DEFAULT_WIDTH), promptHeight];
    };
    stylePromptWidgetElement(widget, loaderPromptWidgetHeight(node));
}

function stylePromptWidgetElement(widget, height) {
    const element = widget?.element || widget?.inputEl || null;
    if (!element?.style) {
        return;
    }
    element.style.boxSizing = "border-box";
    element.style.display = "block";
    element.style.marginLeft = `${PROMPT_WIDGET_SIDE_INSET}px`;
    element.style.marginRight = `${PROMPT_WIDGET_SIDE_INSET}px`;
    element.style.width = `calc(100% - ${PROMPT_WIDGET_SIDE_INSET * 2}px)`;
    element.style.maxWidth = `calc(100% - ${PROMPT_WIDGET_SIDE_INSET * 2}px)`;
    element.style.minHeight = `${Math.max(80, height - 8)}px`;
    element.style.height = `${Math.max(80, height - 8)}px`;
    element.style.resize = "none";
    element.style.overflow = "auto";
}

function ensureSeedModeWidget(node) {
    let widget = getWidget(node, "seed_mode");
    if (!widget) {
        widget = createInputWidgetFromNodeData(node, "seed_mode", "Seed Mode");
    }
    if (!widget) {
        return null;
    }
    widget.name = "seed_mode";
    widget.label = "Seed Mode";
    widget.options = widget.options || {};
    widget.options.values = SEED_MODE_VALUES;
    widget.options.list = SEED_MODE_VALUES;
    if (!SEED_MODE_VALUES.includes(String(widget.value || ""))) {
        widget.value = "fixed";
    }
    setWidgetHidden(widget, false);
    moveWidgetAfter(node, widget, getWidget(node, "seed"));
    return widget;
}

function addSystemPromptButton(node) {
    const systemWidget = ensureSystemPromptWidget(node);
    if (!systemWidget) {
        return;
    }
    ensureSingleSystemPromptButton(node);
    if (getWidget(node, `${GENERATED_PREFIX}system_prompt_button`)) {
        return;
    }
    const button = {
        name: `${GENERATED_PREFIX}system_prompt_button`,
        type: "button",
        value: "System Prompt",
        options: { serialize: false },
        callback: () => openSystemPromptDialog(node),
        computeSize: (width) => [width, LiteGraph.NODE_WIDGET_HEIGHT],
        draw: (ctx, nodeRef, width, y, height) => {
            const prompt = String(getWidget(nodeRef, "system_prompt")?.value || "").trim();
            drawWideButtonWithStatus(ctx, 15, y, width - 30, height, "System Prompt", prompt ? "set" : "empty", false);
        },
        mouse: (event, pos, nodeRef) => {
            if (event.type === "pointerdown") {
                button.__pressed = true;
                return true;
            }
            if (event.type === "pointermove") {
                return Boolean(button.__pressed);
            }
            if (event.type === "pointerup" && button.__pressed) {
                button.__pressed = false;
                openSystemPromptDialog(nodeRef);
                return true;
            }
            button.__pressed = false;
            return false;
        },
        serializeValue: () => undefined,
    };
    node.addCustomWidget(button);
    moveWidgetAfter(node, button, systemPromptButtonAnchor(node) || systemWidget);
    ensureSingleSystemPromptButton(node);
}

function systemPromptButtonAnchor(node) {
    return getWidget(node, `${GENERATED_PREFIX}preview`)
        || getWidget(node, `${GENERATED_PREFIX}unload_llm`)
        || getWidget(node, `${GENERATED_PREFIX}stop_llm`)
        || getWidget(node, `${GENERATED_PREFIX}refresh_models`);
}

function ensureSingleSystemPromptButton(node) {
    const buttons = (node.widgets || []).filter((widget) => String(widget?.name || "") === `${GENERATED_PREFIX}system_prompt_button`);
    if (!buttons.length) {
        return;
    }
    const keep = buttons[0];
    node.widgets = (node.widgets || []).filter((widget) => String(widget?.name || "") !== `${GENERATED_PREFIX}system_prompt_button` || widget === keep);
    const anchor = systemPromptButtonAnchor(node);
    if (anchor) {
        moveWidgetAfter(node, keep, anchor);
    }
    resetLocalLLMGeneratedWidgetValues(node);
}

function positionPromptWidget(node) {
    const widget = ensurePromptWidget(node);
    if (!widget) {
        return;
    }
    const anchor = getWidget(node, `${GENERATED_PREFIX}system_prompt_button`)
        || getWidget(node, `${GENERATED_PREFIX}preview`)
        || getWidget(node, "comfy_vram_policy");
    if (anchor && anchor !== widget) {
        moveWidgetAfter(node, widget, anchor);
    }
    configurePromptWidget(node, widget);
}

function removeLegacyPromptBoxDomElements() {
    if (typeof document === "undefined") {
        return;
    }
    for (const element of document.querySelectorAll(".deno-local-llm-prompt-box")) {
        removeDomWidgetElement(element);
    }
}

function ensureProviderWidgets(node) {
    if (!node || !getWidget(node, "provider")) {
        return false;
    }
    const definitions = [
        ["ollama_model", "Ollama Model"],
        ["lm_studio_model", "LM Studio Model"],
        ["custom_server_url", "Server URL"],
        ["custom_model", "Model"],
    ];
    let anchor = getWidget(node, "provider");
    for (const [name, label] of definitions) {
        let widget = getWidget(node, name);
        if (!widget) {
            widget = createInputWidgetFromNodeData(node, name, label);
        }
        if (!widget) {
            continue;
        }
        widget.name = name;
        widget.label = label;
        moveWidgetAfter(node, widget, anchor);
        anchor = widget;
    }
    return Boolean(getWidget(node, "ollama_model") || getWidget(node, "lm_studio_model"));
}

function createInputWidgetFromNodeData(node, name, label) {
    const spec = registeredNodeData?.input?.required?.[name];
    const inputType = Array.isArray(spec) ? spec[0] : undefined;
    const inputOptions = Array.isArray(spec) && spec[1] && typeof spec[1] === "object" ? spec[1] : {};
    const values = Array.isArray(inputType) ? inputType.map((value) => String(value)) : [];
    const widgetType = values.length ? "combo" : inputType === "BOOLEAN" ? "toggle" : inputType === "INT" || inputType === "FLOAT" ? "number" : "text";
    const fallback = name === "custom_server_url" ? LEGACY_CUSTOM_DEFAULT_URL : values[0] || "";
    const initialValue = inputOptions.default ?? fallback;
    if (typeof node.addWidget !== "function") {
        return null;
    }
    const widget = node.addWidget(
        widgetType,
        label,
        initialValue,
        () => {
            setLocalLLMNodeState(node, {
                provider: currentProvider(node),
                model: String(activeModelWidget(node)?.value || ""),
                status: "ready",
            });
            refreshNode(node);
        },
        values.length ? { values, list: values } : {}
    );
    widget.name = name;
    widget.label = label;
    if (values.length) {
        widget.options = widget.options || {};
        widget.options.values = values;
        widget.options.list = values;
    }
    return widget;
}

function migrateLegacyModelWidgets(node) {
    const legacyModel = getWidget(node, "model");
    const legacyServer = getWidget(node, "server_url");
    const oldModel = String(legacyModel?.value || "").trim();
    const oldServer = String(legacyServer?.value || "").trim();
    const provider = currentProvider(node);
    const ollamaWidget = getWidget(node, "ollama_model");
    const lmWidget = getWidget(node, "lm_studio_model");

    if (oldModel && !isLikelyUrl(oldModel)) {
        if ((provider === "LM Studio" || oldServer.includes("1234")) && lmWidget && !String(lmWidget.value || "").trim()) {
            lmWidget.value = oldModel;
        } else if (ollamaWidget && !String(ollamaWidget.value || "").trim()) {
            ollamaWidget.value = oldModel;
        }
    }

    const ollamaValue = String(ollamaWidget?.value || "").trim();
    const lmValue = String(lmWidget?.value || "").trim();
    if (provider === "Ollama" && isLikelyUrl(ollamaValue) && lmValue && !isLikelyUrl(lmValue) && ollamaWidget) {
        ollamaWidget.value = lmValue;
    }
    if (ollamaWidget && isLikelyUrl(ollamaWidget.value)) {
        ollamaWidget.value = firstWidgetChoice(ollamaWidget);
    }
    if (lmWidget && isLikelyUrl(lmWidget.value)) {
        lmWidget.value = firstWidgetChoice(lmWidget);
    }
    repairModelWidgetValue(ollamaWidget);
    repairModelWidgetValue(lmWidget);
}

function repairSavedWidgetValues(node) {
    const providerWidget = getWidget(node, "provider");
    if (providerWidget) {
        providerWidget.options = providerWidget.options || {};
        providerWidget.options.values = PROVIDER_VALUES;
        providerWidget.options.list = PROVIDER_VALUES;
        providerWidget.value = normalizeProviderValue(providerWidget.value);
    }

    for (const name of ["ollama_model", "lm_studio_model"]) {
        const widget = getWidget(node, name);
        repairModelWidgetValue(widget);
        if (widget) {
            widget.value = displayModelValueForCurrentChoices(widget, widget.value);
        }
    }

    const customServerWidget = getWidget(node, "custom_server_url");
    if (customServerWidget) {
        const value = String(customServerWidget.value || "").trim();
        const normalizedValue = normalizeServerUrlValue(value);
        if (normalizedValue) {
            customServerWidget.value = normalizedValue;
            if (normalizedValue !== LEGACY_CUSTOM_DEFAULT_URL) {
                delete customServerWidget.__denoLocalLLMRepairedBlankServerUrl;
            }
        } else {
            customServerWidget.value = LEGACY_CUSTOM_DEFAULT_URL;
            customServerWidget.__denoLocalLLMRepairedBlankServerUrl = true;
        }
    }

    const seedWidget = getWidget(node, "seed");
    if (seedWidget) {
        const seed = Number(seedWidget.value);
        seedWidget.value = Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : 1;
    }

    const seedModeWidget = getWidget(node, "seed_mode");
    const memoryWidget = getWidget(node, "model_memory");
    const keepWidget = getWidget(node, "keep_minutes");
    if (seedModeWidget && String(seedModeWidget.value || "").trim() === "random") {
        seedModeWidget.value = "randomize";
    }
    if (seedModeWidget && !SEED_MODE_VALUES.includes(String(seedModeWidget.value || ""))) {
        const shiftedMemory = normalizeModelMemoryValue(seedModeWidget.value);
        const shiftedKeep = Number(memoryWidget?.value);
        if (memoryWidget && MODEL_MEMORY_VALUES.includes(shiftedMemory)) {
            memoryWidget.value = shiftedMemory;
        }
        if (keepWidget && Number.isFinite(shiftedKeep)) {
            keepWidget.value = shiftedKeep;
        }
        seedModeWidget.value = "fixed";
    }

    if (memoryWidget) {
        memoryWidget.value = normalizeModelMemoryValue(memoryWidget.value);
        if (!MODEL_MEMORY_VALUES.includes(String(memoryWidget.value || ""))) {
            memoryWidget.value = "Unload after run";
        }
    }

    if (keepWidget) {
        const keep = Number(keepWidget.value);
        keepWidget.value = Number.isFinite(keep) ? Math.min(240, Math.max(1, Math.floor(keep))) : 5;
    }

    const comfyVramWidget = getWidget(node, "comfy_vram_policy");
    if (comfyVramWidget) {
        syncComfyVramWidgetOptions(comfyVramWidget);
        comfyVramWidget.value = normalizeComfyVramValue(comfyVramWidget.value);
    }

    repairPromptWidgetValue(getWidget(node, "prompt"));

    const thinkingWidget = getWidget(node, "thinking");
    if (thinkingWidget && typeof thinkingWidget.value !== "boolean") {
        thinkingWidget.value = String(thinkingWidget.value).toLowerCase() === "true";
    }

    resetLocalLLMGeneratedWidgetValues(node);
}

function repairLegacyProviderValues(node) {
    const providerWidget = getWidget(node, "provider");
    if (providerWidget) {
        providerWidget.value = normalizeProviderValue(providerWidget.value);
    }

    const customServerWidget = getWidget(node, "custom_server_url");
    const customModelWidget = getWidget(node, "custom_model");
    const thinkingWidget = getWidget(node, "thinking");
    const seedWidget = getWidget(node, "seed");
    const memoryWidget = getWidget(node, "model_memory");
    const keepWidget = getWidget(node, "keep_minutes");
    const comfyVramWidget = getWidget(node, "comfy_vram_policy");

    const customServerValue = String(customServerWidget?.value ?? "").trim();
    const customModelValue = String(customModelWidget?.value ?? "").trim();
    const shiftedFromOldTwoProviderNode =
        Boolean(customServerWidget) &&
        Boolean(customModelWidget) &&
        (
            (customServerValue && !isLikelyUrl(customServerValue)) ||
            (customModelValue && isShiftedCustomModelValue(customModelValue))
        );

    if (!shiftedFromOldTwoProviderNode) {
        return;
    }

    if (customServerWidget) {
        customServerWidget.value = LEGACY_CUSTOM_DEFAULT_URL;
    }
    if (customModelWidget && isShiftedCustomModelValue(customModelValue)) {
        customModelWidget.value = firstWidgetChoice(customModelWidget);
    }
    if (thinkingWidget && typeof thinkingWidget.value !== "boolean") {
        thinkingWidget.value = false;
    }
    if (seedWidget) {
        const seed = Number(seedWidget.value);
        seedWidget.value = Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : 1;
    }
    if (memoryWidget) {
        memoryWidget.value = normalizeModelMemoryValue(memoryWidget.value);
        if (!MODEL_MEMORY_VALUES.includes(String(memoryWidget.value || ""))) {
            memoryWidget.value = "Unload after run";
        }
    }
    if (keepWidget) {
        const keep = Number(keepWidget.value);
        keepWidget.value = Number.isFinite(keep) ? Math.min(240, Math.max(1, Math.floor(keep))) : 5;
    }
    if (comfyVramWidget) {
        syncComfyVramWidgetOptions(comfyVramWidget);
        comfyVramWidget.value = normalizeComfyVramValue(comfyVramWidget.value);
    }
}

function isShiftedCustomModelValue(value) {
    const text = String(value ?? "").trim();
    if (!text) {
        return false;
    }
    if (isLikelyUrl(text)) {
        return true;
    }
    if (
        MODEL_MEMORY_VALUES.includes(text) ||
        COMFY_VRAM_VALUES.includes(text) ||
        Object.prototype.hasOwnProperty.call(MODEL_MEMORY_ALIASES, text)
    ) {
        return true;
    }
    if (/^(true|false)$/i.test(text)) {
        return true;
    }
    return /^-?\d+(\.\d+)?$/.test(text);
}

function isShiftedModelWidgetValue(value) {
    const text = originalModelValueFromDisplay(value);
    if (!text) {
        return false;
    }
    if (isLikelyUrl(text) || SHIFTED_MODEL_WIDGET_VALUES.has(text)) {
        return true;
    }
    if (Object.prototype.hasOwnProperty.call(MODEL_MEMORY_ALIASES, text)) {
        return true;
    }
    if (/^(true|false)$/i.test(text)) {
        return true;
    }
    return /^-?\d+(\.\d+)?$/.test(text);
}

function isUnavailableModelWidgetValue(value) {
    return isMissingSavedModelDisplayValue(value) || isShiftedModelWidgetValue(value);
}

function repairModelWidgetValue(widget) {
    if (!widget) {
        return false;
    }
    const value = String(widget.value || "").trim();
    if (value && !isShiftedModelWidgetValue(value)) {
        return false;
    }
    const fallback = firstValidWidgetChoice(widget);
    widget.value = fallback || "";
    return true;
}

function repairPromptWidgetValue(widget) {
    if (!widget) {
        return false;
    }
    if (!isShiftedPromptWidgetValue(widget.value)) {
        return false;
    }
    widget.value = "";
    return true;
}

function isShiftedPromptWidgetValue(value) {
    const text = String(value ?? "").trim();
    if (!text) {
        return false;
    }
    if (SHIFTED_MODEL_WIDGET_VALUES.has(text)) {
        return true;
    }
    if (Object.prototype.hasOwnProperty.call(MODEL_MEMORY_ALIASES, text)) {
        return true;
    }
    return false;
}

function removeLegacyWidgets(node) {
    const legacyNames = new Set(["control_after_generate", "control after generate", "server_url", "model"]);
    node.widgets = (node.widgets || []).filter((widget) => {
        const name = String(widget?.name || "");
        const label = String(widget?.label || "");
        if (legacyNames.has(name) || legacyNames.has(label)) {
            return false;
        }
        return true;
    });
}

function dedupeKnownWidgets(node) {
    const names = new Set([
        "provider",
        "ollama_model",
        "lm_studio_model",
        "custom_server_url",
        "custom_model",
        "system_prompt",
        "prompt",
        "thinking",
        "seed",
        "seed_mode",
        "model_memory",
        "keep_minutes",
        "comfy_vram_policy",
    ]);
    const best = new Map();
    for (const widget of node.widgets || []) {
        const name = String(widget?.name || "");
        if (!names.has(name)) {
            continue;
        }
        const previous = best.get(name);
        if (!previous || widgetScore(name, widget) > widgetScore(name, previous)) {
            best.set(name, widget);
        }
    }
    const seen = new Set();
    node.widgets = (node.widgets || []).filter((widget) => {
        const name = String(widget?.name || "");
        if (!names.has(name)) {
            return true;
        }
        if (seen.has(name) || best.get(name) !== widget) {
            return false;
        }
        seen.add(name);
        return true;
    });
}

function widgetScore(name, widget) {
    const value = String(widget?.value || "");
    if (name === "ollama_model" || name === "lm_studio_model" || name === "custom_model") {
        return value.trim() ? 4 : 1;
    }
    return value.trim() ? 2 : 1;
}

function polishWidgetLabels(node) {
    const labels = {
        provider: "Provider",
        ollama_model: "Ollama Model",
        lm_studio_model: "LM Studio Model",
        custom_server_url: "Server URL",
        custom_model: "Model",
        system_prompt: "System Prompt",
        prompt: "Prompt",
        thinking: "Thinking",
        seed: "Seed",
        seed_mode: "Seed Mode",
        model_memory: "Model After Run",
        keep_minutes: "Keep Minutes",
        comfy_vram_policy: "Unload ComfyUI Models Setting",
    };
    for (const [name, label] of Object.entries(labels)) {
        const widget = getWidget(node, name);
        if (widget) {
            widget.label = label;
        }
    }
}

function polishInputLabels(node) {
    const labels = {
        image: "image",
    };
    for (const input of node.inputs || []) {
        if (labels[input.name]) {
            input.label = labels[input.name];
        }
    }
}

function currentProvider(node) {
    const value = String(getWidgetValue(node, "provider", PROVIDER_OLLAMA) || PROVIDER_OLLAMA);
    return normalizeProviderValue(value);
}

function activeModelNameForProvider(provider) {
    if (provider === PROVIDER_LM_STUDIO) {
        return "lm_studio_model";
    }
    if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
        return "custom_model";
    }
    return "ollama_model";
}

function activeModelWidget(node) {
    return getWidget(node, activeModelNameForProvider(currentProvider(node)));
}

function defaultServerForProvider(provider, node) {
    if (provider === PROVIDER_LM_STUDIO) {
        return LM_STUDIO_DEFAULT_URL;
    }
    if (provider === PROVIDER_LLAMA_CPP) {
        return serverUrlForOpenAIProvider(node, LLAMA_CPP_DEFAULT_URL);
    }
    if (provider === PROVIDER_VLLM) {
        return serverUrlForOpenAIProvider(node, VLLM_DEFAULT_URL);
    }
    if (provider === PROVIDER_CUSTOM) {
        return serverUrlForOpenAIProvider(node, CUSTOM_DEFAULT_URL);
    }
    return OLLAMA_DEFAULT_URL;
}

function serverUrlForOpenAIProvider(node, fallback) {
    const value = String(getWidget(node, "custom_server_url")?.value || "").trim();
    return value || fallback;
}

function defaultOpenAIProviderUrl(provider) {
    if (provider === PROVIDER_LLAMA_CPP) {
        return LLAMA_CPP_DEFAULT_URL;
    }
    if (provider === PROVIDER_VLLM) {
        return VLLM_DEFAULT_URL;
    }
    return CUSTOM_DEFAULT_URL;
}

function applyOpenAIProviderServerDefault(node, provider) {
    const widget = getWidget(node, "custom_server_url");
    const previousProviderRaw = String(node.__denoLocalLLMLastProvider || "").trim();
    const previousProvider = previousProviderRaw ? normalizeProviderValue(previousProviderRaw) : "";
    const current = String(widget?.value || "").trim();
    if (previousProvider && previousProvider !== provider && OPENAI_COMPATIBLE_PROVIDERS.has(previousProvider)) {
        rememberOpenAIProviderServerUrl(node, previousProvider, current);
    }
    if (!OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
        node.__denoLocalLLMLastProvider = provider;
        node.__denoLocalLLMProviderInitialized = true;
        return;
    }
    if (!widget) {
        node.__denoLocalLLMLastProvider = provider;
        node.__denoLocalLLMProviderInitialized = true;
        return;
    }
    const providerDefault = defaultOpenAIProviderUrl(provider);
    const cached = openAIProviderServerUrl(node, provider);
    const providerChanged = Boolean(previousProvider && previousProvider !== provider);
    const repairedBlankServerUrl = Boolean(widget.__denoLocalLLMRepairedBlankServerUrl);
    if (cached && (providerChanged || !current)) {
        widget.value = cached;
        if (cached === providerDefault) {
            widget.__denoLocalLLMAppliedServerDefault = providerDefault;
        } else {
            delete widget.__denoLocalLLMAppliedServerDefault;
        }
        delete widget.__denoLocalLLMRepairedBlankServerUrl;
        rememberOpenAIProviderServerUrl(node, provider, widget.value);
        node.__denoLocalLLMLastProvider = provider;
        node.__denoLocalLLMProviderInitialized = true;
        return;
    }
    const activeCurrent = String(widget.value || "").trim();
    if (!current || repairedBlankServerUrl) {
        widget.value = providerDefault;
        widget.__denoLocalLLMAppliedServerDefault = providerDefault;
    } else if (
        widget.__denoLocalLLMAppliedServerDefault === activeCurrent ||
        providerChanged
    ) {
        widget.value = providerDefault;
        widget.__denoLocalLLMAppliedServerDefault = providerDefault;
    } else if (String(widget.value || "").trim() !== providerDefault) {
        delete widget.__denoLocalLLMAppliedServerDefault;
    }
    delete widget.__denoLocalLLMRepairedBlankServerUrl;
    rememberOpenAIProviderServerUrl(node, provider, widget.value);
    node.__denoLocalLLMLastProvider = provider;
    node.__denoLocalLLMProviderInitialized = true;
}

function openAIProviderServerUrlCache(node) {
    node.properties = node.properties || {};
    const current = node.properties[LOADER_SERVER_URLS_BY_PROVIDER_PROPERTY];
    if (current && typeof current === "object" && !Array.isArray(current)) {
        return current;
    }
    const cache = {};
    node.properties[LOADER_SERVER_URLS_BY_PROVIDER_PROPERTY] = cache;
    return cache;
}

function openAIProviderServerUrl(node, provider) {
    const cache = node?.properties?.[LOADER_SERVER_URLS_BY_PROVIDER_PROPERTY];
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
        return "";
    }
    return String(cache[normalizeProviderValue(provider)] || "").trim();
}

function rememberOpenAIProviderServerUrl(node, provider, value) {
    const providerKey = normalizeProviderValue(provider);
    const url = normalizeServerUrlValue(value);
    if (!OPENAI_COMPATIBLE_PROVIDERS.has(providerKey) || !url) {
        return;
    }
    const cache = openAIProviderServerUrlCache(node);
    cache[providerKey] = url;
}

function openAIModelChoicesForProvider(node, provider) {
    const providerKey = normalizeProviderValue(provider);
    const stored = node?.properties?.denoLocalLLMModelChoicesByProvider?.[providerKey];
    return normalizeModelChoices(Array.isArray(stored) ? stored : []);
}

function openAIModelPickerValues(choices) {
    const seen = new Set();
    const values = [];
    for (const choice of choices || []) {
        const id = String(choice?.id || "").trim();
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        values.push(id);
    }
    return values;
}

function removeOpenAIModelPickerRows(node) {
    node.widgets = (node.widgets || []).filter((widget) => {
        if (String(widget?.name || "") !== OPENAI_MODEL_PICKER_NAME) {
            return true;
        }
        removeWidgetElement(widget);
        return false;
    });
}

function syncOpenAIModelPicker(node, provider) {
    const providerKey = normalizeProviderValue(provider);
    const modelWidget = getWidget(node, "custom_model");
    if (!OPENAI_COMPATIBLE_PROVIDERS.has(providerKey) || !modelWidget) {
        removeOpenAIModelPickerRows(node);
        return null;
    }
    const values = openAIModelPickerValues(openAIModelChoicesForProvider(node, providerKey));
    if (!values.length) {
        removeOpenAIModelPickerRows(node);
        return null;
    }
    if (!hasUsableSavedModelValue(modelWidget.value)) {
        modelWidget.value = values[0];
    }
    let picker = getWidget(node, OPENAI_MODEL_PICKER_NAME);
    if (!picker) {
        picker = node.addWidget?.("combo", "Detected Models", values[0], () => {
            const selected = String(picker?.value || "").trim();
            if (!selected) {
                return;
            }
            modelWidget.value = selected;
            setLocalLLMNodeState(node, {
                provider: currentProvider(node),
                model: selected,
                status: "ready",
                thinking: "Detected model copied into the Model field.",
            });
            refreshNode(node);
        }, { values, list: values });
        if (!picker) {
            return null;
        }
    }
    picker.name = OPENAI_MODEL_PICKER_NAME;
    picker.label = "Detected Models";
    picker.type = "combo";
    picker.options = { ...(picker.options || {}), values, list: values, serialize: false };
    picker.serializeValue = () => undefined;
    const current = String(modelWidget.value || "").trim();
    picker.value = values.includes(current) ? current : values[0];
    setWidgetHidden(picker, false);
    moveWidgetAfter(node, picker, modelWidget);
    return picker;
}

function setActiveProviderModelVisibility(node) {
    const provider = currentProvider(node);
    const modelMemory = normalizeModelMemoryValue(getWidget(node, "model_memory")?.value);
    const usesOpenAICompatible = OPENAI_COMPATIBLE_PROVIDERS.has(provider);
    applyOpenAIProviderServerDefault(node, provider);
    setWidgetHidden(getWidget(node, "ollama_model"), provider !== PROVIDER_OLLAMA);
    setWidgetHidden(getWidget(node, "lm_studio_model"), provider !== PROVIDER_LM_STUDIO);
    setWidgetHidden(getWidget(node, "custom_server_url"), !usesOpenAICompatible);
    setWidgetHidden(getWidget(node, "custom_model"), !usesOpenAICompatible);
    setWidgetHidden(getWidget(node, "system_prompt"), true);
    setWidgetHidden(getWidget(node, "prompt"), true);
    setWidgetHidden(getWidget(node, "model_memory"), false);
    setWidgetHidden(getWidget(node, "keep_minutes"), modelMemory !== "Keep for minutes");
    for (const name of ["ollama_model", "lm_studio_model"]) {
        const widget = getWidget(node, name);
        repairModelWidgetValue(widget);
        if (widget) {
            widget.value = displayModelValueForCurrentChoices(widget, widget.value);
        }
    }
    const customModelWidget = getWidget(node, "custom_model");
    if (customModelWidget) {
        customModelWidget.type = usesOpenAICompatible ? "text" : customModelWidget.type;
        customModelWidget.label = "Model";
    }
    syncOpenAIModelPicker(node, provider);
    const customServerWidget = getWidget(node, "custom_server_url");
    if (customServerWidget) {
        customServerWidget.label = "Server URL";
    }
    const activeValue = String(activeModelWidget(node)?.value || "").trim();
    setLocalLLMNodeState(node, {
        provider,
        model: activeValue,
    });
    if (isMissingSavedModelDisplayValue(activeValue) && !isLocalLLMBusyState(node)) {
        setLocalLLMNodeState(node, {
            status: "saved model not found",
            provider,
            model: activeValue,
            answer: "",
            thinking: `Saved ${provider} model "${originalModelValueFromDisplay(activeValue)}" is not available on this PC. Start the local server and press Refresh Models, or choose another model.`,
        });
    }
}

function wrapModelMemoryCallback(node) {
    const memoryWidget = getWidget(node, "model_memory");
    if (!memoryWidget || memoryWidget.__denoLocalLLMMemoryWrapped) {
        return;
    }
    const original = memoryWidget.callback;
    memoryWidget.callback = function () {
        const result = original?.apply(this, arguments);
        memoryWidget.value = normalizeModelMemoryValue(memoryWidget.value);
        setActiveProviderModelVisibility(node);
        refreshNode(node);
        return result;
    };
    memoryWidget.__denoLocalLLMMemoryWrapped = true;
}

function wrapModelCallback(node) {
    for (const name of ["ollama_model", "lm_studio_model", "custom_model"]) {
        const modelWidget = getWidget(node, name);
        if (!modelWidget || modelWidget.__denoLocalLLMWrapped) {
            continue;
        }
        const original = modelWidget.callback;
        modelWidget.callback = function () {
            invalidateLocalLLMAsyncAction(node, "model changed");
            const result = original?.apply(this, arguments);
            repairModelWidgetValue(modelWidget);
            if (name !== "custom_model") {
                modelWidget.value = displayModelValueForCurrentChoices(modelWidget, modelWidget.value);
            }
            if (name === activeModelNameForProvider(currentProvider(node))) {
                const value = String(modelWidget.value || "");
                setLocalLLMNodeState(node, {
                    model: value,
                    status: isMissingSavedModelDisplayValue(value) ? "saved model not found" : "ready",
                    thinking: isMissingSavedModelDisplayValue(value)
                        ? `Saved ${currentProvider(node)} model "${originalModelValueFromDisplay(value)}" is not available on this PC. Press Refresh Models after installing or loading it.`
                        : "Model selection is ready.",
                });
                refreshNode(node);
            }
            return result;
        };
        modelWidget.__denoLocalLLMWrapped = true;
    }
}

function wrapServerCallback(node) {
    const serverWidget = getWidget(node, "custom_server_url");
    if (!serverWidget || serverWidget.__denoLocalLLMServerWrapped) {
        return;
    }
    const original = serverWidget.callback;
    serverWidget.callback = function () {
        invalidateLocalLLMAsyncAction(node, "server changed");
        const result = original?.apply(this, arguments);
        const provider = currentProvider(node);
        if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
            rememberOpenAIProviderServerUrl(node, provider, serverWidget.value);
        }
        return result;
    };
    serverWidget.__denoLocalLLMServerWrapped = true;
}

function wrapProviderCallback(node) {
    const providerWidget = getWidget(node, "provider");
    if (!providerWidget || providerWidget.__denoLocalLLMWrapped) {
        return;
    }
    const original = providerWidget.callback;
    providerWidget.callback = function () {
        invalidateLocalLLMAsyncAction(node, "provider changed");
        const result = original?.apply(this, arguments);
        const provider = currentProvider(node);
        setActiveProviderModelVisibility(node);
        setLocalLLMNodeState(node, {
            provider,
            model: String(activeModelWidget(node)?.value || ""),
            status: "ready",
        });
        removeRefreshButtonWidgets(node);
        removeStopButtonWidgets(node);
        removeUnloadButtonWidgets(node);
        addRefreshButton(node);
        addStopButton(node);
        addUnloadButton(node);
        refreshNode(node);
        return result;
    };
    providerWidget.__denoLocalLLMWrapped = true;
}

function addRefreshButton(node) {
    const modelWidget = activeModelWidget(node);
    if (!modelWidget) {
        return;
    }
    removeRefreshButtonWidgets(node);
    const button = node.addWidget?.("button", "Refresh Models", "Refresh Models", () => refreshModels(node));
    if (!button) {
        return;
    }
    button.name = `${GENERATED_PREFIX}refresh_models`;
    button.label = "Refresh Models";
    button.options = { ...(button.options || {}), serialize: false };
    button.serializeValue = () => undefined;
    moveWidgetAfter(node, button, getWidget(node, `${GENERATED_PREFIX}model_picker`) || modelWidget);
    ensureSingleRefreshButton(node);
}

function addStopButton(node) {
    const modelWidget = activeModelWidget(node);
    if (!modelWidget) {
        return;
    }
    removeStopButtonWidgets(node);
    const button = node.addWidget?.("button", "Stop LLM", "Stop LLM", () => stopLocalModel(node));
    if (!button) {
        return;
    }
    button.name = `${GENERATED_PREFIX}stop_llm`;
    button.label = "Stop LLM";
    button.options = { ...(button.options || {}), serialize: false };
    button.serializeValue = () => undefined;
    moveWidgetAfter(node, button, getWidget(node, `${GENERATED_PREFIX}refresh_models`) || modelWidget);
    ensureSingleStopButton(node);
}

function addUnloadButton(node) {
    const modelWidget = activeModelWidget(node);
    if (!modelWidget) {
        return;
    }
    removeUnloadButtonWidgets(node);
    const button = node.addWidget?.("button", "Unload LLM", "Unload LLM", () => unloadLocalModel(node));
    if (!button) {
        return;
    }
    button.name = `${GENERATED_PREFIX}unload_llm`;
    button.label = "Unload LLM";
    button.options = { ...(button.options || {}), serialize: false };
    button.serializeValue = () => undefined;
    moveWidgetAfter(node, button, getWidget(node, `${GENERATED_PREFIX}stop_llm`) || getWidget(node, `${GENERATED_PREFIX}refresh_models`) || modelWidget);
    ensureSingleUnloadButton(node);
}

function removeRefreshButtonWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => !isRefreshButtonWidget(widget));
}

function removeStopButtonWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => !isStopButtonWidget(widget));
}

function removeUnloadButtonWidgets(node) {
    node.widgets = (node.widgets || []).filter((widget) => !isUnloadButtonWidget(widget));
}

function ensureSingleRefreshButton(node) {
    const refreshes = (node.widgets || []).filter((widget) => isRefreshButtonWidget(widget));
    if (!refreshes.length) {
        return;
    }
    const keep = refreshes[0];
    node.widgets = (node.widgets || []).filter((widget) => !isRefreshButtonWidget(widget) || widget === keep);
    const modelWidget = activeModelWidget(node);
    const picker = getWidget(node, OPENAI_MODEL_PICKER_NAME);
    if (picker) {
        moveWidgetAfter(node, keep, picker);
    } else if (modelWidget) {
        moveWidgetAfter(node, keep, modelWidget);
    }
    resetLocalLLMGeneratedWidgetValues(node);
}

function ensureSingleStopButton(node) {
    const stops = (node.widgets || []).filter((widget) => isStopButtonWidget(widget));
    if (!stops.length) {
        return;
    }
    const keep = stops[0];
    node.widgets = (node.widgets || []).filter((widget) => !isStopButtonWidget(widget) || widget === keep);
    const refreshButton = getWidget(node, `${GENERATED_PREFIX}refresh_models`);
    const modelWidget = activeModelWidget(node);
    if (refreshButton) {
        moveWidgetAfter(node, keep, refreshButton);
    } else if (modelWidget) {
        moveWidgetAfter(node, keep, modelWidget);
    }
    resetLocalLLMGeneratedWidgetValues(node);
}

function ensureSingleUnloadButton(node) {
    const unloads = (node.widgets || []).filter((widget) => isUnloadButtonWidget(widget));
    if (!unloads.length) {
        return;
    }
    const keep = unloads[0];
    node.widgets = (node.widgets || []).filter((widget) => !isUnloadButtonWidget(widget) || widget === keep);
    const stopButton = getWidget(node, `${GENERATED_PREFIX}stop_llm`);
    const refreshButton = getWidget(node, `${GENERATED_PREFIX}refresh_models`);
    const modelWidget = activeModelWidget(node);
    if (stopButton) {
        moveWidgetAfter(node, keep, stopButton);
    } else if (refreshButton) {
        moveWidgetAfter(node, keep, refreshButton);
    } else if (modelWidget) {
        moveWidgetAfter(node, keep, modelWidget);
    }
    resetLocalLLMGeneratedWidgetValues(node);
}

function ensureSinglePreviewWidget(node) {
    let kept = false;
    let keptWidget = null;
    node.widgets = (node.widgets || []).filter((widget) => {
        if (String(widget?.name || "") !== `${GENERATED_PREFIX}preview`) {
            return true;
        }
        if (kept) {
            return false;
        }
        kept = true;
        keptWidget = widget;
        return true;
    });
    return keptWidget;
}

function isUnloadButtonWidget(widget) {
    const name = String(widget?.name || "");
    const label = String(widget?.label || "");
    const value = String(widget?.value || "");
    const type = String(widget?.type || "");
    const drawText = String(widget?.draw || "");
    const callbackText = String(widget?.callback || "");
    return (
        name.startsWith(`${GENERATED_PREFIX}unload_llm`) ||
        name === "Unload LLM" ||
        label === "Unload LLM" ||
        value === "Unload LLM" ||
        (type === "button" &&
            (name.toLowerCase().includes("unload") ||
                drawText.includes("Unload LLM") ||
                callbackText.includes("unloadLocalModel")))
    );
}

function isRefreshButtonWidget(widget) {
    const name = String(widget?.name || "");
    const label = String(widget?.label || "");
    const value = String(widget?.value || "");
    const type = String(widget?.type || "");
    const drawText = String(widget?.draw || "");
    const callbackText = String(widget?.callback || "");
    return (
        name.startsWith(`${GENERATED_PREFIX}refresh_models`) ||
        name === "Refresh Models" ||
        label === "Refresh Models" ||
        value === "Refresh Models" ||
        (type === "button" &&
            (name.toLowerCase().includes("refresh") ||
                drawText.includes("Refresh Models") ||
                callbackText.includes("refreshModels")))
    );
}

function isStopButtonWidget(widget) {
    const name = String(widget?.name || "");
    const label = String(widget?.label || "");
    const value = String(widget?.value || "");
    const type = String(widget?.type || "");
    const drawText = String(widget?.draw || "");
    const callbackText = String(widget?.callback || "");
    return (
        name.startsWith(`${GENERATED_PREFIX}stop_llm`) ||
        name === "Stop LLM" ||
        label === "Stop LLM" ||
        value === "Stop LLM" ||
        (type === "button" &&
            (name.toLowerCase().includes("stop") ||
                drawText.includes("Stop LLM") ||
                callbackText.includes("stopLocalModel")))
    );
}

function isLocalLLMBusyState(node) {
    const status = String(getLocalLLMNodeState(node).status || "").toLowerCase();
    return (
        status === "running" ||
        status === "freeing comfyui vram" ||
        status === "stop requested" ||
        status === "unloading llm"
    );
}

async function stopLocalModel(node) {
    const action = beginLocalLLMAsyncAction(node, "stop");
    if (!action) {
        return;
    }
    const provider = currentProvider(node);
    const serverUrl = defaultServerForProvider(provider, node);
    const modelWidget = activeModelWidget(node);
    repairModelWidgetValue(modelWidget);
    const model = String(modelWidget?.value || "").trim();
    const invalidModel = !model || isUnavailableModelWidgetValue(model);
    setLocalLLMNodeState(node, {
        status: "stop requested",
        provider,
        model,
        answer: "",
        thinking: invalidModel ? "Refresh Models and select an installed local LLM model before stopping." : "Asking the local LLM request to stop.",
    });
    refreshNode(node);
    if (invalidModel) {
        setLocalLLMNodeState(node, {
            status: "stop skipped",
            thinking: "Refresh Models and select an installed local LLM model before stopping.",
        });
        finishLocalLLMAsyncAction(node, action);
        refreshNode(node);
        return;
    }
    try {
        const response = await fetch("/deno/local_llm/stop", localLLMAsyncFetchOptions(action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, server_url: serverUrl, model }),
        }));
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        const payload = await response.json();
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        if (!response.ok && !payload?.message) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        setLocalLLMNodeState(node, {
            status: payload.ok ? "stop requested" : "nothing to stop",
            provider,
            model,
            answer: "",
            thinking: String(payload.message || payload.error || "Stop request finished."),
        });
    } catch (error) {
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        setLocalLLMNodeState(node, {
            status: "stop failed",
            provider,
            model,
            answer: "",
            thinking: String(error?.message || error),
        });
    } finally {
        if (finishLocalLLMAsyncAction(node, action)) {
            refreshNode(node);
        }
    }
}

function isManualUnloadUnavailableMessage(message) {
    const lowered = String(message || "").toLowerCase();
    return lowered.includes("no standard unload api") || lowered.includes("do not share a standard unload api");
}

async function unloadLocalModel(node) {
    const provider = currentProvider(node);
    const serverUrl = defaultServerForProvider(provider, node);
    const modelWidget = activeModelWidget(node);
    repairModelWidgetValue(modelWidget);
    const model = String(modelWidget?.value || "").trim();
    const invalidModel = !model || isUnavailableModelWidgetValue(model);
    if (isLocalLLMBusyState(node)) {
        const key = localLLMNodeStateKey(node);
        const pendingAction = key ? localLLMAsyncActionByNode.get(key) : null;
        if (pendingAction?.action !== "unload") {
            invalidateLocalLLMAsyncAction(node, "unload blocked");
        }
        setLocalLLMNodeState(node, {
            status: "unload blocked",
            provider,
            model,
            answer: "",
            thinking: "The local LLM is still generating. Press Stop LLM first, then unload after it has stopped.",
        });
        refreshNode(node);
        return;
    }
    const action = beginLocalLLMAsyncAction(node, "unload");
    if (!action) {
        return;
    }
    setLocalLLMNodeState(node, {
        status: "unloading LLM",
        provider,
        model,
        answer: "",
        thinking: invalidModel ? "Refresh Models and select an installed local LLM model before unloading." : "Requesting unload from the local LLM server.",
    });
    refreshNode(node);
    if (invalidModel) {
        setLocalLLMNodeState(node, {
            status: "unload skipped",
            thinking: "Refresh Models and select an installed local LLM model before unloading.",
        });
        finishLocalLLMAsyncAction(node, action);
        refreshNode(node);
        return;
    }
    try {
        const response = await fetch("/deno/local_llm/unload", localLLMAsyncFetchOptions(action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, server_url: serverUrl, model }),
        }));
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        const payload = await response.json();
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        const payloadMessage = String(payload?.message || payload?.error || "");
        if (!response.ok && !payloadMessage) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        const manualUnavailable = !payload.ok && !payload.busy && (payload?.manual_unavailable || isManualUnloadUnavailableMessage(payloadMessage));
        setLocalLLMNodeState(node, {
            status: payload.ok ? "LLM unloaded" : (payload.busy ? "unload blocked" : (manualUnavailable ? "manual unload unavailable" : "LLM unload failed")),
            provider,
            model,
            answer: "",
            thinking: payloadMessage || "Unload request finished.",
        });
    } catch (error) {
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        setLocalLLMNodeState(node, {
            status: "LLM unload failed",
            provider,
            model,
            answer: "",
            thinking: String(error?.message || error),
        });
    } finally {
        if (finishLocalLLMAsyncAction(node, action)) {
            refreshNode(node);
        }
    }
}

async function refreshModels(node) {
    const action = beginLocalLLMAsyncAction(node, "refresh");
    if (!action) {
        return;
    }
    const provider = currentProvider(node);
    const serverUrl = defaultServerForProvider(provider, node);
    const modelWidget = activeModelWidget(node);
    const savedModel = originalModelValueFromDisplay(modelWidget?.value);
    setLocalLLMNodeState(node, {
        status: "loading models",
        provider,
        model: savedModel,
    });
    refreshNode(node);
    try {
        const response = await fetch("/deno/local_llm/models", localLLMAsyncFetchOptions(action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, server_url: serverUrl }),
        }));
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        const payload = await response.json();
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        if (!response.ok || payload.error) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        const choices = normalizeModelChoices(Array.isArray(payload.models) ? payload.models : []);
        const savedModelStillExists = choices.some((choice) => choice.id === savedModel);
        updateModelChoices(node, provider, choices);
        const current = String(modelWidget?.value || "").trim();
        if (modelWidget && savedModelStillExists) {
            modelWidget.value = savedModel;
        } else if (modelWidget && choices[0]?.id && (!current || isShiftedModelWidgetValue(current))) {
            modelWidget.value = choices[0].id;
        }
        const savedModelMissing =
            hasUsableSavedModelValue(savedModel) &&
            choices.length > 0 &&
            !savedModelStillExists &&
            isMissingSavedModelDisplayValue(modelWidget?.value);
        setLocalLLMNodeState(node, {
            status: savedModelMissing ? "saved model not found" : choices.length ? `${choices.length} models found` : "no models found",
            provider,
            model: String(modelWidget?.value || ""),
            answer: "",
            thinking: savedModelMissing
                ? `Saved ${provider} model "${savedModel}" is not in the current model list. The node keeps the saved value, but running it may fail until you load it or choose another model.`
                : choices.length
                ? `Model list is ready. Choose from the ${provider} model row.`
                : "No models were returned by the local server.",
        });
    } catch (error) {
        if (!isLocalLLMAsyncActionCurrent(node, action)) {
            return;
        }
        updateModelChoices(node, provider, []);
        if (!OPENAI_COMPATIBLE_PROVIDERS.has(provider) && modelWidget && hasUsableSavedModelValue(savedModel)) {
            modelWidget.value = missingSavedModelDisplayValue(savedModel);
        }
        setLocalLLMNodeState(node, {
            status: !OPENAI_COMPATIBLE_PROVIDERS.has(provider) && hasUsableSavedModelValue(savedModel) ? "saved model not found" : "model refresh failed",
            provider,
            model: String(modelWidget?.value || ""),
            answer: "",
            thinking: !OPENAI_COMPATIBLE_PROVIDERS.has(provider) && hasUsableSavedModelValue(savedModel)
                ? `Saved ${provider} model "${savedModel}" could not be verified on this PC. ${String(error?.message || error)}`
                : String(error?.message || error),
        });
    } finally {
        if (finishLocalLLMAsyncAction(node, action)) {
            refreshNode(node);
        }
    }
}

function normalizeModelChoices(models) {
    const seen = new Set();
    const choices = [];
    for (const model of models || []) {
        const id = String(model?.id || "").trim();
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        choices.push({
            id,
            label: String(model?.label || id).trim(),
            loaded: Boolean(model?.loaded),
        });
    }
    return choices;
}

function updateModelChoices(node, provider, choices) {
    const providerKey = normalizeProviderValue(provider);
    node.properties = node.properties || {};
    node.properties.denoLocalLLMModelChoicesByProvider = {
        ...(node.properties.denoLocalLLMModelChoicesByProvider || {}),
        [providerKey]: Array.isArray(choices) ? choices : [],
    };
    const widget = getWidget(node, activeModelNameForProvider(providerKey));
    if (widget) {
        widget.__denoLocalLLMPreservedSavedModels = new Set();
    }
    if (OPENAI_COMPATIBLE_PROVIDERS.has(providerKey)) {
        if (widget && Array.isArray(choices) && choices.length && !hasUsableSavedModelValue(widget.value)) {
            widget.value = String(choices[0]?.id || "");
        }
        syncOpenAIModelPicker(node, providerKey);
        return;
    }
    if (widget && Array.isArray(choices) && choices.length) {
        const savedValue = String(widget.value || "").trim();
        const values = modelChoiceValuesWithSavedValue(choices, savedValue);
        widget.options = widget.options || {};
        widget.options.values = values;
        widget.options.list = values;
        if (!hasUsableSavedModelValue(widget.value)) {
            widget.value = firstValidWidgetChoice(widget);
        }
    } else if (widget && hasUsableSavedModelValue(widget.value)) {
        const display = missingSavedModelDisplayValue(widget.value);
        widget.options = widget.options || {};
        widget.options.values = [display];
        widget.options.list = [display];
        widget.value = display;
    }
}

function modelChoiceValuesWithSavedValue(choices, savedValue) {
    const seen = new Set();
    const values = [];
    const current = originalModelValueFromDisplay(savedValue);
    const choiceIds = new Set((choices || []).map((choice) => String(choice?.id || "").trim()).filter(Boolean));
    if (hasUsableSavedModelValue(current)) {
        const display = choiceIds.has(current) ? current : missingSavedModelDisplayValue(current);
        seen.add(display);
        values.push(display);
    }
    for (const choice of choices || []) {
        const id = String(choice?.id || "").trim();
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        values.push(id);
    }
    return values;
}

function hasUsableSavedModelValue(value) {
    const text = originalModelValueFromDisplay(value);
    return Boolean(text && !isShiftedModelWidgetValue(text));
}

function moveWidgetAfter(node, widget, anchor) {
    if (!widget || !anchor) {
        return;
    }
    const currentIndex = node.widgets.indexOf(widget);
    if (currentIndex >= 0) {
        node.widgets.splice(currentIndex, 1);
    }
    const anchorIndex = node.widgets.indexOf(anchor);
    node.widgets.splice(anchorIndex >= 0 ? anchorIndex + 1 : node.widgets.length, 0, widget);
}

function loaderPromptWidgetHeight(node) {
    const nodeHeight = Number(node?.size?.[1]) || 0;
    if (!nodeHeight) {
        return PROMPT_WIDGET_DEFAULT_HEIGHT;
    }
    const reserved = loaderNonPromptWidgetHeight(node);
    return clampNumber(nodeHeight - reserved, PROMPT_WIDGET_MIN_HEIGHT, PROMPT_WIDGET_MAX_HEIGHT);
}

function loaderNonPromptWidgetHeight(node) {
    const width = Number(node?.size?.[0]) || DEFAULT_WIDTH;
    let total = 86;
    for (const widget of node?.widgets || []) {
        const name = String(widget?.name || "");
        if (name === "prompt" || widget?.hidden) {
            continue;
        }
        let height = LiteGraph.NODE_WIDGET_HEIGHT || 20;
        if (typeof widget?.computeSize === "function") {
            try {
                const size = widget.computeSize(width);
                if (Array.isArray(size)) {
                    height = Number(size[1]) || height;
                }
            } catch {
                // Keep the default row height for brittle third-party widget methods.
            }
        }
        total += Math.max(0, height);
    }
    return total + 20;
}

function clampNumber(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return minimum;
    }
    return Math.min(maximum, Math.max(minimum, number));
}

function refreshNode(node) {
    if (node.__denoLocalLLMRefreshing) {
        return;
    }
    node.__denoLocalLLMRefreshing = true;
    try {
        ensureProviderWidgets(node);
        ensurePromptWidget(node);
        removePromptWidgets(node);
        normalizeLoaderPromptInputSocket(node);
        removeLoaderWidgetInputSockets(node);
        ensureSeedModeWidget(node);
        setActiveProviderModelVisibility(node);
        if (!(node.widgets || []).some((widget) => isRefreshButtonWidget(widget)) && activeModelWidget(node)) {
            addRefreshButton(node);
        }
        if (!(node.widgets || []).some((widget) => isStopButtonWidget(widget)) && activeModelWidget(node)) {
            addStopButton(node);
        }
        if (!(node.widgets || []).some((widget) => isUnloadButtonWidget(widget)) && activeModelWidget(node)) {
            addUnloadButton(node);
        }
        if (!getWidget(node, `${GENERATED_PREFIX}system_prompt_button`)) {
            addSystemPromptButton(node);
        }
        removeLegacyPromptBoxDomElements();
        positionPromptWidget(node);
        const previewWidget = ensureSinglePreviewWidget(node);
        if (previewWidget) {
            previewWidget.__node = node;
            previewWidget.__expanded = false;
        }
        ensureSingleRefreshButton(node);
        ensureSingleStopButton(node);
        ensureSingleUnloadButton(node);
        ensureSingleSystemPromptButton(node);
        positionPromptWidget(node);
        const computed = node.computeSize?.();
        if (computed) {
            const width = Math.max(node.size?.[0] || 0, computed[0], DEFAULT_WIDTH);
            const manualHeight = Number(node.size?.[1]) || 0;
            const height = Math.max(manualHeight, computed[1], 180);
            node.setSize?.([width, height]);
            if (Array.isArray(node.size)) {
                node.size[0] = width;
                node.size[1] = height;
            }
        }
        markGraphDirty(node);
    } finally {
        node.__denoLocalLLMRefreshing = false;
    }
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function getWidgetValue(node, name, fallback) {
    const widget = getWidget(node, name);
    return widget ? widget.value : fallback;
}

function setWidgetValue(node, name, value, callCallback = true) {
    const widget = getWidget(node, name);
    if (!widget) {
        return false;
    }
    widget.value = value;
    if (callCallback && typeof widget.callback === "function") {
        try {
            widget.callback(value, app.canvas, node);
        } catch {
            try {
                widget.callback(value);
            } catch {
                // Best-effort; the value has already been set.
            }
        }
    }
    markGraphDirty(node);
    return true;
}

function isLikelyUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizeServerUrlValue(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }
    let candidate = "";
    if (/^https?:\/\//i.test(text)) {
        candidate = text;
    } else if (
        /^(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]):\d{1,5}(?:\/[^\s]*)?$/i.test(text)
    ) {
        candidate = `http://${text}`;
    } else {
        return "";
    }
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }
        if (parsed.port) {
            const port = Number(parsed.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                return "";
            }
        }
        return candidate;
    } catch {
        return "";
    }
}

function firstWidgetChoice(widget) {
    const options = widget?.options || {};
    const values = Array.isArray(options.values)
        ? options.values
        : Array.isArray(options.list)
          ? options.list
          : [];
    return String(values[0] || "").trim();
}

function firstValidWidgetChoice(widget) {
    const options = widget?.options || {};
    const values = Array.isArray(options.values)
        ? options.values
        : Array.isArray(options.list)
          ? options.list
          : [];
    for (const value of values) {
        const text = String(value || "").trim();
        if (text && !isShiftedModelWidgetValue(text)) {
            return text;
        }
    }
    return "";
}

function splitPreviewLines(value, maxChars = 68) {
    const text = String(value || "").replace(/\r\n/g, "\n").trim();
    if (!text) {
        return ["Waiting for run output."];
    }
    return text.split("\n").flatMap((line) => wrapTextLine(line, maxChars));
}

function maxPreviewLinesForHeight(height) {
    return Math.max(1, Math.floor((Number(height) - 28) / PREVIEW_LINE_HEIGHT));
}

function maxPreviewCharsForWidth(width) {
    return Math.max(18, Math.floor((Number(width) - 28) / 10));
}

function previewTextWidth(panelWidth, hasScroll = false) {
    const reserved = hasScroll ? PREVIEW_SCROLLBAR_HIT_WIDTH + PREVIEW_SCROLLBAR_RIGHT_PAD + 10 : 16;
    return Math.max(24, Number(panelWidth || 0) - reserved);
}

function splitPreviewLinesForWidth(ctx, value, maxWidth) {
    const text = String(value || "").replace(/\r\n/g, "\n").trim();
    if (!text) {
        return ["Waiting for run output."];
    }
    return text.split("\n").flatMap((line) => wrapTextLineToWidth(ctx, line, maxWidth));
}

function previewWindow(node, key, lines, maxLines) {
    const total = Array.isArray(lines) ? lines.length : 0;
    const maxVisible = Math.max(1, Number(maxLines) || 1);
    const maxScroll = Math.max(0, total - maxVisible);
    const scrollState = node.properties?.denoLocalLLMPreviewScroll || {};
    const scrollFromBottom = Math.min(maxScroll, Math.max(0, Number(scrollState[key]) || 0));
    const start = Math.max(0, total - maxVisible - scrollFromBottom);
    return {
        lines: lines.slice(start, start + maxVisible),
        scrollFromBottom,
    };
}

function handlePreviewWheel(event, pos, node, blockBounds, blockLineInfo) {
    const targetKey = Object.keys(blockBounds || {}).find((key) => isInsideBounds(pos, blockBounds[key]));
    if (!targetKey) {
        return false;
    }
    const info = blockLineInfo?.[targetKey] || {};
    const maxScroll = Math.max(0, Number(info.total || 0) - Number(info.max || 0));
    if (maxScroll <= 0) {
        return false;
    }
    const delta = Number(event.deltaY || event.wheelDeltaY || event.detail || 0);
    const step = delta < 0 ? 1 : -1;
    node.properties = node.properties || {};
    const current = node.properties.denoLocalLLMPreviewScroll || {};
    const currentValue = Number(current[targetKey]) || 0;
    const next = Math.min(maxScroll, Math.max(0, currentValue + step));
    node.properties.denoLocalLLMPreviewScroll = {
        ...current,
        [targetKey]: next,
    };
    event.preventDefault?.();
    event.stopPropagation?.();
    markGraphDirty(node);
    return true;
}

function previewScrollbarBounds(blockBounds, totalLines, visibleLines) {
    const total = Number(totalLines || 0);
    const visible = Number(visibleLines || 0);
    if (!blockBounds || total <= visible) {
        return null;
    }
    return [
        blockBounds[0] + blockBounds[2] - PREVIEW_SCROLLBAR_RIGHT_PAD - PREVIEW_SCROLLBAR_HIT_WIDTH,
        blockBounds[1] + 24,
        PREVIEW_SCROLLBAR_HIT_WIDTH,
        Math.max(1, blockBounds[3] - 32),
    ];
}

function previewScrollbarKeyFromPos(pos, scrollbarBounds) {
    return Object.keys(scrollbarBounds || {}).find((key) => isInsideBounds(pos, scrollbarBounds[key]));
}

function handlePreviewScrollbarPointer(event, pos, node, key, scrollbarBounds, blockLineInfo) {
    const bounds = scrollbarBounds?.[key];
    const info = blockLineInfo?.[key] || {};
    if (!bounds) {
        return false;
    }
    const total = Math.max(1, Number(info.total || 0));
    const visible = Math.max(1, Number(info.max || 0));
    const maxScroll = Math.max(0, total - visible);
    if (maxScroll <= 0) {
        return false;
    }
    const ratio = Math.min(1, visible / total);
    const thumbH = Math.max(16, Math.floor(bounds[3] * ratio));
    const travel = Math.max(1, bounds[3] - thumbH);
    const localY = Math.min(bounds[3], Math.max(0, Number(pos?.[1] || 0) - bounds[1] - thumbH / 2));
    const fromTop = Math.round((localY / travel) * maxScroll);
    const scrollFromBottom = Math.min(maxScroll, Math.max(0, maxScroll - fromTop));
    node.properties = node.properties || {};
    node.properties.denoLocalLLMPreviewScroll = {
        ...(node.properties.denoLocalLLMPreviewScroll || {}),
        [key]: scrollFromBottom,
    };
    event.preventDefault?.();
    event.stopPropagation?.();
    markGraphDirty(node);
    return true;
}

function wrapTextLine(line, maxChars) {
    const value = String(line || "");
    if (value.length <= maxChars) {
        return [value];
    }
    const chunks = [];
    for (let index = 0; index < value.length; index += maxChars) {
        chunks.push(value.slice(index, index + maxChars));
    }
    return chunks;
}

function wrapTextLineToWidth(ctx, line, maxWidth) {
    const value = String(line || "");
    const width = Math.max(24, Number(maxWidth || 0));
    if (!value) {
        return [""];
    }
    if (!ctx || typeof ctx.measureText !== "function") {
        return wrapTextLine(value, Math.max(8, Math.floor(width / 6)));
    }
    if (ctx?.measureText?.(value)?.width <= width) {
        return [value];
    }

    const parts = value.split(/(\s+)/);
    const lines = [];
    let current = "";
    const pushCurrent = () => {
        if (current) {
            lines.push(current.trimEnd());
            current = "";
        }
    };

    for (const part of parts) {
        if (!part) {
            continue;
        }
        const candidate = `${current}${part}`;
        if (!current || ctx.measureText(candidate).width <= width) {
            current = candidate;
            continue;
        }
        if (!part.trim()) {
            pushCurrent();
            continue;
        }
        pushCurrent();
        if (ctx.measureText(part).width <= width) {
            current = part.trimStart();
            continue;
        }
        const chunks = breakLongPreviewToken(ctx, part, width);
        lines.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1] || "";
    }
    pushCurrent();
    return lines.length ? lines : [value];
}

function breakLongPreviewToken(ctx, token, maxWidth) {
    const value = String(token || "");
    const chunks = [];
    let current = "";
    for (const char of value) {
        const candidate = `${current}${char}`;
        if (!current || ctx.measureText(candidate).width <= maxWidth) {
            current = candidate;
            continue;
        }
        chunks.push(current);
        current = char;
    }
    if (current) {
        chunks.push(current);
    }
    return chunks;
}

function drawPreviewBlock(ctx, x, y, width, height, label, lines, textColor, options = {}) {
    drawRoundedRectangle(
        ctx,
        x,
        y,
        width,
        height,
        6,
        options.fill || "rgba(0, 0, 0, 0.58)",
        options.stroke || "rgba(126, 255, 166, 0.26)",
    );
    ctx.fillStyle = options.labelColor || "#9dffba";
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const labelMaxWidth = options.buttonBounds ? Math.max(40, width - options.buttonBounds[2] - 30) : width - 16;
    ctx.fillText(fitString(ctx, label, labelMaxWidth), x + 8, y + 7);
    if (options.buttonBounds) {
        drawSmallButton(ctx, options.buttonBounds, options.buttonLabel || "More", Boolean(options.buttonPressed));
    }
    ctx.fillStyle = textColor;
    ctx.font = PREVIEW_TEXT_FONT;
    const lineHeight = PREVIEW_LINE_HEIGHT;
    const maxLines = Math.max(1, Math.floor((height - 28) / lineHeight));
    const hasScroll = Number(options.totalLines || 0) > Number(options.maxLines || maxLines);
    const shown = Array.isArray(lines) ? lines.slice(0, maxLines) : [];
    const clipX = x + 6;
    const clipY = y + 24;
    const clipW = width - (hasScroll ? PREVIEW_SCROLLBAR_HIT_WIDTH + PREVIEW_SCROLLBAR_RIGHT_PAD + 8 : 12);
    const clipH = Math.max(1, height - 30);
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();
    for (let index = 0; index < shown.length; index += 1) {
        ctx.fillText(String(shown[index] ?? ""), x + 8, y + 24 + index * lineHeight);
    }
    ctx.restore();
    if (hasScroll) {
        drawPreviewScrollbar(
            ctx,
            x + width - PREVIEW_SCROLLBAR_RIGHT_PAD - PREVIEW_SCROLLBAR_TRACK_WIDTH,
            y + 24,
            PREVIEW_SCROLLBAR_TRACK_WIDTH,
            Math.max(1, height - 32),
            Number(options.totalLines || 0),
            Number(options.maxLines || maxLines),
            Number(options.scrollFromBottom || 0),
        );
    }
}

function drawPreviewScrollbar(ctx, x, y, width, height, totalLines, visibleLines, scrollFromBottom) {
    const total = Math.max(1, Number(totalLines) || 1);
    const visible = Math.min(total, Math.max(1, Number(visibleLines) || 1));
    const maxScroll = Math.max(0, total - visible);
    const ratio = visible / total;
    const thumbH = Math.max(16, Math.floor(height * ratio));
    const travel = Math.max(1, height - thumbH);
    const fromTop = maxScroll - Math.min(maxScroll, Math.max(0, Number(scrollFromBottom) || 0));
    const thumbY = y + Math.floor((fromTop / Math.max(1, maxScroll)) * travel);
    ctx.save();
    drawRoundedRectangle(ctx, x, y, width, height, 4, "rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.12)");
    drawRoundedRectangle(ctx, x, thumbY, width, thumbH, 4, "rgba(157, 247, 186, 0.72)", "rgba(157, 247, 186, 0.9)");
    ctx.restore();
}

function drawWideButton(ctx, x, y, width, height, label, pressed) {
    drawRoundedRectangle(ctx, x + 1, y + 1, width - 2, height, 4, "#00000088", "#00000088");
    drawRoundedRectangle(ctx, x, y + (pressed ? 1 : 0), width, height, 4, pressed ? "#343434" : LiteGraph.WIDGET_BGCOLOR, LiteGraph.WIDGET_OUTLINE_COLOR);
    ctx.save();
    ctx.fillStyle = "#9dffba";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 12px sans-serif";
    ctx.fillText(label, x + width / 2, y + height / 2 + (pressed ? 1 : 0));
    ctx.restore();
}

function drawWideButtonWithStatus(ctx, x, y, width, height, label, status, pressed) {
    drawWideButton(ctx, x, y, width, height, label, pressed);
    ctx.save();
    ctx.fillStyle = status === "set" ? "#9dffba" : "#9aa0a6";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "700 10px sans-serif";
    ctx.fillText(status, x + width - 12, y + height / 2 + (pressed ? 1 : 0));
    ctx.restore();
}

function readSystemPromptUserPresets() {
    try {
        const raw = localStorage?.getItem?.(SYSTEM_PROMPT_PRESET_STORAGE_KEY);
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((preset) => ({
                id: String(preset?.id || "").trim(),
                label: String(preset?.label || "").trim(),
                text: String(preset?.text || ""),
            }))
            .filter((preset) => preset.id && preset.label);
    } catch {
        return [];
    }
}

function writeSystemPromptUserPresets(presets) {
    try {
        localStorage?.setItem?.(
            SYSTEM_PROMPT_PRESET_STORAGE_KEY,
            JSON.stringify(Array.isArray(presets) ? presets : [])
        );
        return true;
    } catch {
        return false;
    }
}

function makeSystemPromptPresetId(label) {
    const slug = String(label || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48);
    return `user_${slug || "preset"}_${Date.now().toString(36)}`;
}

function systemPromptPresetEntries(userPresets) {
    return [
        ...BUILTIN_SYSTEM_PROMPT_PRESETS.map((preset) => ({ ...preset, kind: "builtin", value: `builtin:${preset.id}` })),
        ...(Array.isArray(userPresets) ? userPresets : []).map((preset) => ({
            ...preset,
            kind: "user",
            value: `user:${preset.id}`,
            description: "Saved in this browser.",
        })),
    ];
}

function populateSystemPromptPresetSelect(select, userPresets, selectedValue) {
    if (!select) {
        return null;
    }
    const entries = systemPromptPresetEntries(userPresets);
    select.replaceChildren();
    for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.kind === "builtin" ? `${entry.label} (built-in)` : entry.label;
        option.dataset.kind = entry.kind;
        select.append(option);
    }
    if (selectedValue && entries.some((entry) => entry.value === selectedValue)) {
        select.value = selectedValue;
    } else if (entries[0]) {
        select.value = entries[0].value;
    }
    return entries.find((entry) => entry.value === select.value) || null;
}

function selectedSystemPromptPreset(select, userPresets) {
    return systemPromptPresetEntries(userPresets).find((entry) => entry.value === select?.value) || null;
}

function systemPromptFieldStyle() {
    return [
        "height:34px",
        "box-sizing:border-box",
        "border:1px solid rgba(116,156,130,0.45)",
        "border-radius:6px",
        "background:#121614",
        "color:#eef6f0",
        "font-family:'Segoe UI',Arial,sans-serif",
        "font-size:12px",
        "outline:none",
    ].join(";");
}

function openSystemPromptDialog(node) {
    const systemWidget = ensureSystemPromptWidget(node);
    if (!systemWidget) {
        return;
    }
    document.querySelector?.(".deno-local-llm-system-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "deno-local-llm-system-modal deno-local-llm-system-prompt-modal";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:10000",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(0,0,0,0.46)",
    ].join(";");

    const panel = document.createElement("div");
    panel.className = "deno-local-llm-system-prompt-panel";
    panel.style.cssText = [
        "width:min(860px,calc(100vw - 72px))",
        "height:min(680px,calc(100vh - 72px))",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "gap:12px",
        "padding:18px",
        "border:1px solid rgba(104,150,116,0.78)",
        "border-radius:8px",
        "background:#101412",
        "box-shadow:0 22px 60px rgba(0,0,0,0.62)",
        "color:#e7efe9",
        "font-family:'Segoe UI',Arial,sans-serif",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";
    const title = document.createElement("div");
    title.textContent = "System Prompt";
    title.style.cssText = "font-size:18px;font-weight:750;color:#c8f1d2;";
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = buttonStyle(false);
    header.append(title, closeButton);

    let userPresets = readSystemPromptUserPresets();
    const presetPanel = document.createElement("div");
    presetPanel.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:8px",
        "padding:10px",
        "border:1px solid rgba(104,150,116,0.42)",
        "border-radius:7px",
        "background:#0d1110",
    ].join(";");
    const presetRow = document.createElement("div");
    presetRow.style.cssText = "display:grid;grid-template-columns:minmax(190px,1fr) minmax(160px,0.8fr) auto auto auto;gap:8px;align-items:center;";
    const presetSelect = document.createElement("select");
    presetSelect.style.cssText = `${systemPromptFieldStyle()};padding:0 10px;`;
    const presetName = document.createElement("input");
    presetName.type = "text";
    presetName.placeholder = "Preset name";
    presetName.style.cssText = `${systemPromptFieldStyle()};padding:0 10px;`;
    const loadPresetButton = document.createElement("button");
    loadPresetButton.textContent = "Load";
    loadPresetButton.style.cssText = buttonStyle(false);
    const savePresetButton = document.createElement("button");
    savePresetButton.textContent = "Save Preset";
    savePresetButton.style.cssText = buttonStyle(false);
    const deletePresetButton = document.createElement("button");
    deletePresetButton.textContent = "Delete";
    deletePresetButton.style.cssText = buttonStyle(false);
    const presetHint = document.createElement("div");
    presetHint.textContent = "Load a preset into the editor, then save it to the node.";
    presetHint.style.cssText = "font-size:11px;line-height:1.35;color:#aebdb3;";
    presetRow.append(presetSelect, presetName, loadPresetButton, savePresetButton, deletePresetButton);
    presetPanel.append(presetRow, presetHint);

    const updatePresetControls = () => {
        const selected = selectedSystemPromptPreset(presetSelect, userPresets);
        deletePresetButton.disabled = selected?.kind !== "user";
        deletePresetButton.style.opacity = selected?.kind === "user" ? "1" : "0.45";
        if (selected?.kind === "user") {
            presetName.value = selected.label;
        } else if (selected?.kind === "builtin") {
            presetName.value = "";
        }
        presetHint.textContent = selected?.description || "Load a preset into the editor, then save it to the node.";
    };
    populateSystemPromptPresetSelect(presetSelect, userPresets);
    updatePresetControls();

    const textarea = document.createElement("textarea");
    textarea.value = String(systemWidget.value || "");
    textarea.placeholder = "Optional system prompt. Empty is OK.";
    textarea.style.cssText = [
        "flex:1",
        "min-height:0",
        "width:100%",
        "box-sizing:border-box",
        "resize:none",
        "overflow:auto",
        "padding:12px",
        "border:1px solid rgba(104,150,116,0.58)",
        "border-radius:6px",
        "outline:none",
        "background:#151716",
        "color:#f3faf5",
        "font:13px/1.45 Consolas,monospace",
        "white-space:pre-wrap",
        "overscroll-behavior:contain",
    ].join(";");

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear";
    clearButton.style.cssText = buttonStyle(false);
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save to Node";
    saveButton.style.cssText = buttonStyle(true);
    footer.append(clearButton, saveButton);

    const close = ownLocalLLMBodyOverlay(node, overlay);
    const save = () => {
        systemWidget.value = textarea.value;
        node.properties = node.properties || {};
        node.properties.denoLocalLLMSystemPromptUpdatedAt = Date.now();
        refreshNode(node);
        close();
    };

    closeButton.addEventListener("click", close);
    presetSelect.addEventListener("change", updatePresetControls);
    loadPresetButton.addEventListener("click", () => {
        const selected = selectedSystemPromptPreset(presetSelect, userPresets);
        if (!selected) {
            presetHint.textContent = "No preset is selected.";
            return;
        }
        textarea.value = String(selected.text || "");
        presetHint.textContent = `${selected.label} loaded. Press Save to Node to apply it.`;
        if (selected.kind === "user") {
            presetName.value = selected.label;
        }
        textarea.focus();
    });
    savePresetButton.addEventListener("click", () => {
        const name = String(presetName.value || "").trim() || "My System Prompt";
        const existing = userPresets.find((preset) => preset.label.toLowerCase() === name.toLowerCase());
        const nextPreset = {
            id: existing?.id || makeSystemPromptPresetId(name),
            label: name,
            text: textarea.value,
        };
        userPresets = existing
            ? userPresets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
            : [...userPresets, nextPreset];
        if (writeSystemPromptUserPresets(userPresets)) {
            populateSystemPromptPresetSelect(presetSelect, userPresets, `user:${nextPreset.id}`);
            updatePresetControls();
            presetHint.textContent = `${name} saved in this browser.`;
        } else {
            presetHint.textContent = "Preset save failed. Browser storage is unavailable.";
        }
    });
    deletePresetButton.addEventListener("click", () => {
        const selected = selectedSystemPromptPreset(presetSelect, userPresets);
        if (selected?.kind !== "user") {
            presetHint.textContent = "Built-in presets cannot be deleted.";
            return;
        }
        userPresets = userPresets.filter((preset) => preset.id !== selected.id);
        if (writeSystemPromptUserPresets(userPresets)) {
            populateSystemPromptPresetSelect(presetSelect, userPresets, "builtin:reviewer_json");
            updatePresetControls();
            presetHint.textContent = `${selected.label} deleted.`;
        } else {
            presetHint.textContent = "Preset delete failed. Browser storage is unavailable.";
        }
    });
    clearButton.addEventListener("click", () => {
        textarea.value = "";
        textarea.focus();
    });
    saveButton.addEventListener("click", save);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) {
            close();
        }
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    textarea.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    textarea.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            save();
        }
    });

    panel.append(header, presetPanel, textarea, footer);
    overlay.append(panel);
    document.body.append(overlay);
    textarea.focus();
}

function openPreviewTextDialog(node, kind, titleText, textValue) {
    document.querySelector?.(".deno-local-llm-preview-modal")?.remove();
    for (const [key, dialog] of previewTextDialogsByKey.entries()) {
        if (!dialog?.overlay?.isConnected) {
            previewTextDialogsByKey.delete(key);
        }
    }

    const overlay = document.createElement("div");
    overlay.className = "deno-local-llm-preview-modal";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:10000",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(0,0,0,0.46)",
    ].join(";");

    const panel = document.createElement("div");
    panel.className = "deno-local-llm-reviewer-help-panel";
    panel.style.cssText = [
        "width:min(900px,calc(100vw - 72px))",
        "height:min(620px,calc(100vh - 72px))",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "gap:12px",
        "padding:18px",
        "border:1px solid rgba(126,255,166,0.75)",
        "border-radius:8px",
        "background:#0b1210",
        "box-shadow:0 18px 48px rgba(0,0,0,0.55)",
        "color:#dfffea",
        "font-family:'Segoe UI',Arial,sans-serif",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";
    const title = document.createElement("div");
    const state = getLocalLLMNodeState(node);
    title.textContent = previewTextDialogTitle(state, kind, titleText || "Preview");
    title.style.cssText = "font-size:18px;font-weight:800;color:#9dffba;";
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = buttonStyle(false);
    header.append(title, closeButton);

    const textBox = document.createElement("textarea");
    textBox.value = previewTextDialogBody(state, kind, textValue || "");
    textBox.readOnly = true;
    textBox.style.cssText = [
        "flex:1",
        "min-height:0",
        "width:100%",
        "box-sizing:border-box",
        "resize:none",
        "overflow:auto",
        "padding:12px",
        "border:1px solid rgba(126,255,166,0.45)",
        "border-radius:6px",
        "outline:none",
        "background:#111",
        "color:#f0fff5",
        "font:13px/1.45 Consolas,monospace",
        "white-space:pre-wrap",
        "overscroll-behavior:contain",
    ].join(";");

    const dialogKey = previewTextDialogKey(node, kind);
    const close = ownLocalLLMBodyOverlay(node, overlay, () => {
        if (dialogKey && previewTextDialogsByKey.get(dialogKey)?.overlay === overlay) {
            previewTextDialogsByKey.delete(dialogKey);
        }
    });
    closeButton.addEventListener("click", close);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) {
            close();
        }
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    textBox.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    textBox.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });

    panel.append(header, textBox);
    overlay.append(panel);
    document.body.append(overlay);
    if (dialogKey) {
        previewTextDialogsByKey.set(dialogKey, {
            node,
            overlay,
            kind,
            titleElement: title,
            textBox,
            fallbackTitle: String(titleText || "Preview"),
            fallbackText: String(textValue || ""),
        });
        setPreviewTextDialogContent(previewTextDialogsByKey.get(dialogKey), state);
    }
    textBox.focus();
}

function openReviewerHowToUseDialog(node) {
    document.querySelector?.(".deno-local-llm-reviewer-help-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "deno-local-llm-reviewer-help-modal deno-local-llm-system-prompt-modal";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:10000",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(0,0,0,0.50)",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
        "width:min(860px,calc(100vw - 72px))",
        "max-height:min(680px,calc(100vh - 72px))",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "gap:14px",
        "padding:18px",
        "border:1px solid rgba(104,150,116,0.78)",
        "border-radius:8px",
        "background:#101412",
        "box-shadow:0 22px 60px rgba(0,0,0,0.62)",
        "color:#e7efe9",
        "font-family:'Segoe UI',Arial,sans-serif",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";
    const title = document.createElement("div");
    title.textContent = "How to use";
    title.style.cssText = "font-size:18px;font-weight:750;color:#c8f1d2;";
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = buttonStyle(false);
    header.append(title, closeButton);

    const intro = document.createElement("div");
    intro.textContent = "Use this node when you want an LLM to decide whether a generated image/audio result should continue through the workflow.";
    intro.style.cssText = "font-size:12px;line-height:1.5;color:#cddbd1;";

    const body = document.createElement("div");
    body.style.cssText = [
        "overflow:auto",
        "padding:2px 4px 2px 0",
        "display:flex",
        "flex-direction:column",
        "gap:12px",
        "overscroll-behavior:contain",
    ].join(";");

    for (const section of REVIEWER_HOW_TO_USE_SECTIONS) {
        const block = document.createElement("section");
        block.style.cssText = [
            "padding:12px",
            "border:1px solid rgba(104,150,116,0.36)",
            "border-radius:7px",
            "background:#0d1110",
        ].join(";");
        const heading = document.createElement("div");
        heading.textContent = section.title;
        heading.style.cssText = "font-size:13px;font-weight:750;color:#d7f5df;margin-bottom:8px;";
        const list = document.createElement("ul");
        list.style.cssText = "margin:0;padding-left:18px;color:#dce8df;font-size:12px;line-height:1.55;";
        for (const line of section.lines || []) {
            const item = document.createElement("li");
            item.textContent = line;
            item.style.cssText = "margin:0 0 5px 0;";
            list.append(item);
        }
        block.append(heading, list);
        body.append(block);
    }

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
    const closeFooterButton = document.createElement("button");
    closeFooterButton.textContent = "Close";
    closeFooterButton.style.cssText = buttonStyle(true);
    footer.append(closeFooterButton);

    const close = ownLocalLLMBodyOverlay(node, overlay);
    closeButton.addEventListener("click", close);
    closeFooterButton.addEventListener("click", close);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) {
            close();
        }
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    body.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });

    panel.append(header, intro, body, footer);
    overlay.append(panel);
    document.body.append(overlay);
    closeFooterButton.focus();
}

function openReviewerSeedTargetDialog(node) {
    document.querySelector?.(".deno-local-llm-seed-modal")?.remove();
    ensureReviewerRetryProperties(node);
    const candidates = collectReviewerSelectableSeedCandidates(node);
    const currentTarget = reviewerSeedTarget(node);

    const overlay = document.createElement("div");
    overlay.className = "deno-local-llm-seed-modal deno-local-llm-system-prompt-modal";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:10000",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(0,0,0,0.46)",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
        "width:min(760px,calc(100vw - 72px))",
        "max-height:min(640px,calc(100vh - 72px))",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "gap:12px",
        "padding:18px",
        "border:1px solid rgba(126,255,166,0.75)",
        "border-radius:8px",
        "background:#0b1210",
        "box-shadow:0 18px 48px rgba(0,0,0,0.55)",
        "color:#dfffea",
        "font-family:'Segoe UI',Arial,sans-serif",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";
    const title = document.createElement("div");
    title.textContent = "Retry Seed Target";
    title.style.cssText = "font-size:17px;font-weight:700;color:#9dffba;letter-spacing:0;";
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = buttonStyle(false);
    header.append(title, closeButton);

    const hint = document.createElement("div");
    hint.textContent = "Choose which seed changes when Reviewer auto-reruns after a failed review.";
    hint.style.cssText = "font-size:12px;line-height:1.45;color:#b8d8c1;";

    const list = document.createElement("div");
    list.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:8px",
        "min-height:0",
        "overflow:auto",
        "overscroll-behavior:contain",
        "padding-right:4px",
    ].join(";");

    const close = ownLocalLLMBodyOverlay(node, overlay);
    const select = (target, label) => {
        setReviewerSeedTarget(node, target);
        setReviewerWaitingReason(node, `Seed target: ${label}.`);
        refreshGateNode(node);
        close();
    };

    list.append(makeSeedTargetRow({
        label: "Auto: nearest upstream seed",
        value: "Prefers generation/sampler seed. Local LLM seed is used only when no generation seed is found.",
        active: currentTarget === REVIEWER_AUTO_RETRY_SEED_AUTO,
        onClick: () => select(REVIEWER_AUTO_RETRY_SEED_AUTO, "Auto"),
    }));

    if (!candidates.length) {
        const empty = document.createElement("div");
        empty.textContent = "No seed widgets found. Connect a sampler/generation node, or keep Seed: Auto and rerun manually.";
        empty.style.cssText = "padding:12px;border:1px solid rgba(255,177,177,0.35);border-radius:6px;color:#ffd1d1;background:rgba(70,20,20,0.28);font-size:12px;";
        list.append(empty);
    } else {
        for (const candidate of candidates) {
            const scope = candidate.scope === "graph" ? "Graph fallback" : "Upstream";
            list.append(makeSeedTargetRow({
                label: seedCandidateLabel(candidate),
                value: `${scope} · current seed ${Math.floor(Number(candidate.widget?.value) || 0)}`,
                active: currentTarget === candidate.key,
                onClick: () => select(candidate.key, seedCandidateLabel(candidate)),
            }));
        }
    }

    closeButton.addEventListener("click", close);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) {
            close();
        }
    });
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    list.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });

    panel.append(header, hint, list);
    overlay.append(panel);
    document.body.append(overlay);
    closeButton.focus();
}

function makeSeedTargetRow({ label, value, active, onClick }) {
    const row = document.createElement("button");
    row.type = "button";
    row.style.cssText = [
        "width:100%",
        "box-sizing:border-box",
        "display:flex",
        "flex-direction:column",
        "align-items:flex-start",
        "gap:4px",
        "padding:11px 12px",
        "border-radius:7px",
        `border:1px solid ${active ? "rgba(126,255,166,0.95)" : "rgba(126,255,166,0.32)"}`,
        `background:${active ? "rgba(24,96,48,0.82)" : "rgba(0,0,0,0.34)"}`,
        "color:#eaffef",
        "cursor:pointer",
        "text-align:left",
        "font-family:'Segoe UI',Arial,sans-serif",
    ].join(";");
    const title = document.createElement("div");
    title.textContent = String(label || "Seed target");
    title.style.cssText = "font-size:13px;font-weight:600;color:#f0fff5;letter-spacing:0;";
    const sub = document.createElement("div");
    sub.textContent = String(value || "");
    sub.style.cssText = "font-size:11px;line-height:1.35;color:#b8d8c1;";
    row.append(title, sub);
    row.addEventListener("click", onClick);
    return row;
}

function buttonStyle(primary) {
    return [
        "height:34px",
        "min-width:76px",
        "padding:0 14px",
        "border-radius:6px",
        `border:1px solid ${primary ? "rgba(147,199,162,0.9)" : "rgba(116,156,130,0.52)"}`,
        `background:${primary ? "#245b3a" : "rgba(13,18,16,0.92)"}`,
        "color:#eef6f0",
        "font-family:'Segoe UI',Arial,sans-serif",
        "font-weight:600",
        "cursor:pointer",
    ].join(";");
}

function drawSmallButton(ctx, bounds, label, pressed) {
    drawRoundedRectangle(ctx, bounds[0], bounds[1] + (pressed ? 1 : 0), bounds[2], bounds[3], 5, pressed ? "#29382f" : "rgba(0, 0, 0, 0.38)", "rgba(157, 247, 186, 0.6)");
    ctx.save();
    ctx.fillStyle = "#9dffba";
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2 + (pressed ? 1 : 0));
    ctx.restore();
}

function drawRoundedRectangle(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [radius]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function fitString(ctx, text, maxWidth) {
    const value = String(text ?? "");
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

function isInsideBounds(pos, bounds) {
    return Boolean(
        bounds &&
            pos &&
            pos[0] >= bounds[0] &&
            pos[0] <= bounds[0] + bounds[2] &&
            pos[1] >= bounds[1] &&
            pos[1] <= bounds[1] + bounds[3],
    );
}
