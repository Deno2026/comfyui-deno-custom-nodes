import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const DENO_FLOATING_TOOLS_MARKER = "r2026.06.30-sos-report-p";
const EXTENSION_NAME = "Deno.FloatingTools";
const SETTING_ENABLED = "DENO.FloatingTools.Enabled";
const POSITION_KEY = "denoFloatingTools.position.v1";
const UPDATE_CACHE_KEY = "denoFloatingTools.updateStatus.v1";
const ICON_URL = new URL("./assets/deno_floating_tools_icon.png", import.meta.url).toString();
const ERROR_ICON_URL = new URL("./assets/deno_floating_tools_error_icon.png", import.meta.url).toString();
const ROOT_ID = "deno-floating-tools-root";
const ICON_SIZE = 48;
const BADGE_TOP_PAD = 8;
const BADGE_RIGHT_PAD = 10;
const FLOATING_TOOLS_ROOT_WIDTH = ICON_SIZE + BADGE_RIGHT_PAD;
const FLOATING_TOOLS_ROOT_HEIGHT = ICON_SIZE + BADGE_TOP_PAD;
const PANEL_WIDTH = 268;
const VIEWPORT_MARGIN = 12;
const DEFAULT_POSITION = { x: 24, y: 140 };
const FLOATING_TOOLS_Z_INDEX = 999;
const SOS_ERROR_AUTO_CLEAR_GRACE_MS = 8000;
const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_FETCH_TIMEOUT_MS = 10000;
const COMFYUI_RELEASE_URL = "https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest";
const COMFYUI_TAGS_URL = "https://api.github.com/repos/comfyanonymous/ComfyUI/tags?per_page=10";
const PYPI_JSON_BASE = "https://pypi.org/pypi/";

let rootEl = null;
let panelEl = null;
let statusEl = null;
let freeButtonEl = null;
let updateBadgeEl = null;
let updateButtonEl = null;
let updateStatusEl = null;
let updateDetailsEl = null;
let updateHintEl = null;
let iconImgEl = null;
let sosButtonEl = null;
let sosStatusEl = null;
let dragState = null;
let queueBusy = false;
let queueTimer = null;
let updateBusy = false;
let updateStartupTimer = null;
let queuedUpdateForce = false;
let lastUpdateState = null;
let lastExecutionError = null;
let sosBusy = false;
let sosEventListenersInstalled = false;
let sosPromptApiWrapped = false;
let sosQueuePromptWrapped = false;
let sosValidationObserver = null;
let lastPromptFailureSignature = "";
let lastPromptFailureAt = 0;
let sosErrorStickyUntil = 0;
let sosToastHooksInstalled = false;
let sosToastHookTimer = null;

function getSettings() {
    return app?.ui?.settings || null;
}

function getSettingValue(id, fallback) {
    try {
        const value = getSettings()?.getSettingValue?.(id);
        return value === undefined || value === null ? fallback : value;
    } catch (_error) {
        return fallback;
    }
}

function isEnabled() {
    return getSettingValue(SETTING_ENABLED, false) === true;
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function readSavedPosition() {
    try {
        const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
        if (!saved || typeof saved !== "object") return { ...DEFAULT_POSITION };
        return {
            x: Number(saved.x),
            y: Number(saved.y),
        };
    } catch (_error) {
        return { ...DEFAULT_POSITION };
    }
}

function clampPosition(position) {
    const minY = VIEWPORT_MARGIN + BADGE_TOP_PAD;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - FLOATING_TOOLS_ROOT_WIDTH - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - ICON_SIZE - VIEWPORT_MARGIN);
    return {
        x: clamp(Number(position?.x), VIEWPORT_MARGIN, maxX),
        y: clamp(Number(position?.y), minY, maxY),
    };
}

function savePosition(position) {
    try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(clampPosition(position)));
    } catch (_error) {
        // Position persistence is a convenience. The tool should still work without it.
    }
}

function readStoredJson(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (_error) {
        return fallback;
    }
}

function writeStoredJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
        // Update status cache is optional.
    }
}

function applyPosition(position, shouldSave = false) {
    if (!rootEl) return;
    const next = clampPosition(position);
    rootEl.style.left = `${next.x}px`;
    rootEl.style.top = `${next.y - BADGE_TOP_PAD}px`;
    if (shouldSave) savePosition(next);
    updatePanelDirection();
}

function currentPosition() {
    if (!rootEl) return clampPosition(readSavedPosition());
    return clampPosition({
        x: Number.parseFloat(rootEl.style.left || `${DEFAULT_POSITION.x}`),
        y: Number.parseFloat(rootEl.style.top || `${DEFAULT_POSITION.y - BADGE_TOP_PAD}`) + BADGE_TOP_PAD,
    });
}

function ensureStyles() {
    if (document.getElementById("deno-floating-tools-style")) return;
    const style = document.createElement("style");
    style.id = "deno-floating-tools-style";
    style.textContent = `
#${ROOT_ID} {
    position: fixed;
    width: ${FLOATING_TOOLS_ROOT_WIDTH}px;
    height: ${FLOATING_TOOLS_ROOT_HEIGHT}px;
    z-index: ${FLOATING_TOOLS_Z_INDEX};
    pointer-events: auto;
    user-select: none;
    touch-action: none;
    font-family: Arial, Helvetica, sans-serif;
}

#${ROOT_ID}.deno-floating-tools-dragging {
    cursor: grabbing;
}

.deno-floating-tools-orb {
    position: absolute;
    left: 0;
    bottom: 0;
    width: ${ICON_SIZE}px;
    height: ${ICON_SIZE}px;
    border: 1px solid rgba(92, 255, 139, 0.72);
    border-radius: 13px;
    background: rgba(1, 7, 4, 0.88);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.72), 0 10px 26px rgba(0, 0, 0, 0.42);
    cursor: grab;
    padding: 0;
    overflow: visible;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 140ms ease, box-shadow 140ms ease;
}

.deno-floating-tools-orb:hover,
#${ROOT_ID}.deno-floating-tools-open .deno-floating-tools-orb {
    border-color: rgba(135, 255, 170, 0.95);
    box-shadow: 0 0 0 1px rgba(23, 255, 105, 0.3), 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(48, 255, 104, 0.2);
}

#${ROOT_ID}.deno-floating-tools-update-available .deno-floating-tools-orb,
#${ROOT_ID}.deno-floating-tools-update-available .deno-floating-tools-orb:hover,
#${ROOT_ID}.deno-floating-tools-update-available.deno-floating-tools-open .deno-floating-tools-orb {
    border-color: rgba(245, 200, 75, 0.98);
    box-shadow: 0 0 0 1px rgba(245, 200, 75, 0.5), 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(245, 200, 75, 0.32);
}

#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-orb,
#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-orb:hover,
#${ROOT_ID}.deno-floating-tools-sos-error.deno-floating-tools-open .deno-floating-tools-orb {
    border-color: rgba(255, 132, 91, 0.98);
    box-shadow: 0 0 0 1px rgba(255, 110, 72, 0.5), 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(255, 90, 56, 0.34);
}

.deno-floating-tools-orb img {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 12px;
    pointer-events: none;
}

.deno-floating-tools-update-badge {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 27px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: none;
    align-items: center;
    justify-content: center;
    background: #f5c84b;
    color: #071006;
    border: 1px solid rgba(255, 245, 170, 0.9);
    box-shadow: 0 0 14px rgba(245, 200, 75, 0.42);
    font-size: 9px;
    font-weight: 900;
    line-height: 18px;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 2;
}

.deno-floating-tools-update-badge.checking {
    display: flex;
    background: #2f9dff;
    color: #ffffff;
    border-color: rgba(170, 220, 255, 0.88);
    box-shadow: 0 0 14px rgba(47, 157, 255, 0.36);
}

.deno-floating-tools-update-badge.available {
    display: flex;
}

.deno-floating-tools-update-badge.error {
    display: flex;
    background: #69746d;
    color: #ffffff;
    border-color: rgba(210, 220, 214, 0.42);
    box-shadow: 0 0 12px rgba(120, 130, 124, 0.28);
}

.deno-floating-tools-panel {
    position: absolute;
    top: ${FLOATING_TOOLS_ROOT_HEIGHT + 10}px;
    left: 0;
    width: ${PANEL_WIDTH}px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    display: none;
    border-radius: 12px;
    padding: 10px;
    background: rgba(3, 10, 7, 0.98);
    color: #dfffea;
    border: 1px solid rgba(72, 255, 132, 0.42);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.56), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(10px);
    box-sizing: border-box;
}

#${ROOT_ID}.deno-floating-tools-open .deno-floating-tools-panel {
    display: block;
}

#${ROOT_ID}.deno-floating-tools-panel-left .deno-floating-tools-panel {
    left: auto;
    right: 0;
}

#${ROOT_ID}.deno-floating-tools-panel-up .deno-floating-tools-panel {
    top: auto;
    bottom: ${ICON_SIZE + 10}px;
}

.deno-floating-tools-title {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: #dfffea;
    margin: 0 0 8px;
    letter-spacing: 0;
}

.deno-floating-tools-status {
    font-size: 11px;
    font-weight: 600;
    color: #91dca4;
    max-width: 126px;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.deno-floating-tools-action {
    width: 100%;
    height: 36px;
    border: 1px solid rgba(72, 255, 132, 0.68);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(42, 199, 83, 0.92), rgba(12, 126, 46, 0.95));
    color: #031006;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-sizing: border-box;
}

.deno-floating-tools-action.secondary {
    margin-top: 8px;
    background: rgba(18, 28, 22, 0.95);
    color: #dfffea;
    border-color: rgba(126, 255, 166, 0.34);
}

.deno-floating-tools-action.deno-floating-tools-sos-action {
    width: auto;
    min-width: 0;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    border-radius: 7px;
    background: rgba(220, 231, 224, 0.13);
    color: #ecf7f0;
    border-color: rgba(220, 231, 224, 0.34);
    box-shadow: none;
    font-size: 12px;
    font-weight: 750;
}

.deno-floating-tools-action:hover:not(:disabled) {
    filter: brightness(1.08);
}

.deno-floating-tools-action.deno-floating-tools-sos-action:hover:not(:disabled) {
    background: rgba(220, 231, 224, 0.19);
    border-color: rgba(158, 220, 174, 0.54);
    filter: none;
}

.deno-floating-tools-action:active:not(:disabled) {
    transform: translateY(1px);
}

.deno-floating-tools-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
    background: rgba(40, 50, 45, 0.92);
    color: #9aa99d;
    border-color: rgba(150, 165, 154, 0.28);
}

.deno-floating-tools-note {
    margin-top: 8px;
    color: #91dca4;
    font-size: 11px;
    line-height: 1.35;
}

.deno-floating-tools-section {
    margin-top: 11px;
    padding-top: 10px;
    border-top: 1px solid rgba(126, 255, 166, 0.18);
}

#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-sos-section {
    margin-top: 10px;
    padding: 9px 10px 10px;
    border: 1px solid rgba(255, 105, 78, 0.92);
    border-radius: 9px;
    background: rgba(83, 18, 12, 0.36);
    box-shadow: 0 0 0 1px rgba(255, 105, 78, 0.2), 0 0 18px rgba(255, 92, 60, 0.24);
}

#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-sos-section .deno-floating-tools-section-title {
    color: #ffe1d9;
}

#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-sos-section .deno-floating-tools-update-status {
    color: #ffad98;
}

#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-sos-section .deno-floating-tools-sos-action {
    border-color: rgba(255, 150, 126, 0.72);
    background: rgba(255, 113, 82, 0.16);
    color: #fff1ec;
}

.deno-floating-tools-section-title {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    color: #dfffea;
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 7px;
}

.deno-floating-tools-update-status {
    color: #91dca4;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    text-align: right;
}

.deno-floating-tools-update-details {
    display: grid;
    gap: 5px;
    margin-top: 8px;
}

.deno-floating-tools-update-row {
    display: grid;
    grid-template-columns: 74px 1fr;
    gap: 7px;
    align-items: start;
    padding: 5px 6px;
    border-radius: 7px;
    background: rgba(0, 0, 0, 0.34);
    border: 1px solid rgba(126, 255, 166, 0.12);
}

.deno-floating-tools-update-row.available {
    border-color: rgba(245, 200, 75, 0.44);
    background: rgba(53, 42, 9, 0.45);
}

.deno-floating-tools-update-label {
    color: #91dca4;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
}

.deno-floating-tools-update-value {
    color: #dfffea;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: anywhere;
}

.deno-floating-tools-update-hint {
    margin-top: 7px;
    color: #91dca4;
    font-size: 10.5px;
    line-height: 1.35;
}

.deno-floating-tools-manual-copy {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(760px, calc(100vw - 48px));
    max-height: min(74vh, 680px);
    z-index: ${FLOATING_TOOLS_Z_INDEX + 20};
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 8px;
    background: rgba(8, 13, 11, 0.98);
    border: 1px solid rgba(255, 126, 92, 0.72);
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    box-sizing: border-box;
}

.deno-floating-tools-report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.deno-floating-tools-report-title {
    color: #fff1ec;
    font-size: 13px;
    font-weight: 850;
    line-height: 1.2;
}

.deno-floating-tools-report-close {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border-radius: 7px;
    border: 1px solid rgba(255, 153, 126, 0.34);
    background: rgba(255, 255, 255, 0.06);
    color: #fff1ec;
    font-size: 13px;
    font-weight: 850;
    cursor: pointer;
}

.deno-floating-tools-report-close:hover {
    background: rgba(255, 126, 92, 0.16);
    border-color: rgba(255, 153, 126, 0.62);
}

.deno-floating-tools-manual-copy textarea {
    width: 100%;
    height: min(48vh, 420px);
    min-height: 240px;
    max-height: calc(100vh - 176px);
    resize: vertical;
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid rgba(126, 255, 166, 0.24);
    background: #030806;
    color: #e2ebe5;
    padding: 10px;
    font: 11px/1.45 Consolas, "Courier New", monospace;
}

.deno-floating-tools-manual-copy button {
    margin-top: 0;
}

.deno-floating-tools-manual-copy-actions {
    display: flex;
    gap: 8px;
}

.deno-floating-tools-manual-copy-actions button {
    flex: 1 1 0;
}

`;
    document.head.appendChild(style);
}

function setPanelOpen(open) {
    if (!rootEl) return;
    rootEl.classList.toggle("deno-floating-tools-open", open);
    if (open) {
        refreshQueueState();
        startQueuePolling();
        checkUpdates(false);
    } else {
        stopQueuePolling();
    }
    updatePanelDirection();
}

function updatePanelDirection() {
    if (!rootEl) return;
    const position = currentPosition();
    rootEl.classList.toggle("deno-floating-tools-panel-left", position.x > window.innerWidth - PANEL_WIDTH - 28);
    rootEl.classList.toggle("deno-floating-tools-panel-up", position.y > window.innerHeight - 300);
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function updateFreeButton() {
    if (!freeButtonEl) return;
    freeButtonEl.disabled = queueBusy;
    freeButtonEl.title = queueBusy
        ? "Wait until the queue is idle before freeing ComfyUI VRAM."
        : "Unload ComfyUI models and clear ComfyUI memory cache.";
}

async function refreshQueueState() {
    try {
        const response = await api.fetchApi("/queue", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const running = Array.isArray(data?.queue_running) ? data.queue_running.length : 0;
        const pending = Array.isArray(data?.queue_pending) ? data.queue_pending.length : 0;
        queueBusy = (running + pending) > 0;
        setStatus(queueBusy ? "Queue busy" : "Ready");
    } catch (_error) {
        queueBusy = true;
        setStatus("Queue unknown");
    }
    updateFreeButton();
}

function startQueuePolling() {
    stopQueuePolling();
    queueTimer = window.setInterval(refreshQueueState, 2500);
}

function stopQueuePolling() {
    if (queueTimer) {
        window.clearInterval(queueTimer);
        queueTimer = null;
    }
}

async function freeComfyVram() {
    await refreshQueueState();
    if (queueBusy) return;

    freeButtonEl.disabled = true;
    setStatus("Freeing...");
    try {
        const response = await api.fetchApi("/free", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unload_models: true, free_memory: true }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatus("Request sent");
        window.setTimeout(refreshQueueState, 1000);
    } catch (error) {
        setStatus("Failed");
        freeButtonEl.title = String(error?.message || error || "Free VRAM failed.");
    } finally {
        updateFreeButton();
    }
}

function safeJsonClone(value, fallback = null) {
    try {
        if (value === undefined) return fallback;
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return { error: String(error?.message || error || "JSON clone failed.") };
    }
}

const ERROR_EVENT_TEXT_KEYS = [
    "received_at",
    "prompt_id",
    "node_id",
    "node_type",
    "exception_type",
    "exception_message",
];

function safeEventScalar(value) {
    return ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
}

function safeEventScalarList(value, maxItems = 80) {
    if (!Array.isArray(value)) {
        const scalar = safeEventScalar(value);
        return scalar ? [scalar] : [];
    }
    return value.slice(-maxItems).map(safeEventScalar).filter(Boolean);
}

function safeFrontendOrigin(value) {
    try {
        const parsed = new URL(String(value || ""));
        if (!["http:", "https:"].includes(parsed.protocol)) return "";
        return parsed.origin;
    } catch (error) {
        return "";
    }
}

function compactExecutionError(detail, promptId = null) {
    const data = safeJsonClone(detail, {});
    const result = {};
    const explicitPromptId = safeEventScalar(promptId);
    if (explicitPromptId) result.prompt_id = explicitPromptId;
    for (const key of ERROR_EVENT_TEXT_KEYS) {
        if (key === "prompt_id" && result.prompt_id) continue;
        const scalar = safeEventScalar(data?.[key]);
        if (scalar) result[key] = scalar;
    }
    const frontendOrigin = safeFrontendOrigin(data?.frontend_origin || data?.frontend_url || "");
    if (frontendOrigin) result.frontend_origin = frontendOrigin;
    const traceback = safeEventScalarList(data?.traceback);
    if (traceback.length) result.traceback = traceback;
    const executed = safeEventScalarList(data?.executed);
    if (executed.length) result.executed = executed;
    return result;
}

function getFirstNodeError(nodeErrors) {
    if (!nodeErrors || typeof nodeErrors !== "object" || Array.isArray(nodeErrors)) return {};
    for (const [nodeId, nodeInfo] of Object.entries(nodeErrors)) {
        if (!nodeInfo || typeof nodeInfo !== "object") continue;
        const firstError = Array.isArray(nodeInfo.errors) ? nodeInfo.errors[0] : null;
        if (!firstError || typeof firstError !== "object") continue;
        return {
            node_id: safeEventScalar(nodeId),
            node_type: safeEventScalar(nodeInfo.class_type),
            exception_type: safeEventScalar(firstError.type),
            exception_message: safeEventScalar(firstError.message),
            input_name: safeEventScalar(firstError?.extra_info?.input_name),
        };
    }
    return {};
}

function compactPromptFailure(error) {
    const data = safeJsonClone(error, {});
    const topError = data?.error && typeof data.error === "object" ? data.error : {};
    const nodeErrors = data?.node_errors || topError?.node_errors || {};
    const firstNodeError = getFirstNodeError(nodeErrors);
    const messageParts = [
        firstNodeError.exception_message,
        firstNodeError.input_name ? `input: ${firstNodeError.input_name}` : "",
    ].filter(Boolean);
    const result = compactExecutionError({
        prompt_id: data?.prompt_id,
        node_id: firstNodeError.node_id,
        node_type: firstNodeError.node_type,
        exception_type:
            firstNodeError.exception_type ||
            safeEventScalar(topError?.type) ||
            safeEventScalar(data?.type) ||
            safeEventScalar(error?.name) ||
            "PromptError",
        exception_message:
            messageParts.join(" / ") ||
            safeEventScalar(topError?.message) ||
            safeEventScalar(data?.message) ||
            safeEventScalar(error?.message) ||
            "Prompt failed before execution.",
        received_at: new Date().toISOString(),
        frontend_origin: String(window.location?.origin || ""),
    });
    return result;
}

function setSosStatus(text) {
    if (sosStatusEl) sosStatusEl.textContent = text;
}

function applySosIconState() {
    const hasError = Boolean(lastExecutionError);
    if (iconImgEl) iconImgEl.src = hasError ? ERROR_ICON_URL : ICON_URL;
    rootEl?.classList.toggle("deno-floating-tools-sos-error", hasError);
    setSosStatus(hasError ? "Error detected" : "Ready");
    if (sosButtonEl) {
        sosButtonEl.title = hasError
            ? "Copy the latest error and this ComfyUI environment for GPT/Gemini."
            : "Copy this ComfyUI environment for GPT/Gemini.";
    }
}

function markSosErrorSticky() {
    sosErrorStickyUntil = Date.now() + SOS_ERROR_AUTO_CLEAR_GRACE_MS;
}

function rememberExecutionError(detail) {
    lastExecutionError = compactExecutionError({
        ...safeJsonClone(detail, {}),
        received_at: new Date().toISOString(),
        frontend_origin: String(window.location?.origin || ""),
    });
    markSosErrorSticky();
    applySosIconState();
}

function rememberPromptFailure(error) {
    lastExecutionError = compactPromptFailure(error);
    markSosErrorSticky();
    applySosIconState();
}

function summarizePromptValidationText(text) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    const hasErrorHeader = /\b\d+\s+ERRORS?\b|\bERRORS?\b/i.test(compact);
    const hasPromptFailure = /Required input is missing|See Errors|Prompt outputs failed validation|Failed to validate prompt|invalid input|missing input/i.test(compact);
    if (!hasErrorHeader || !hasPromptFailure) return "";
    return compact.slice(0, 260);
}

function rememberFrontendPromptFailure(text) {
    const summary = summarizePromptValidationText(text);
    if (!summary) return false;
    const now = Date.now();
    const signature = summary.slice(0, 160);
    if (signature === lastPromptFailureSignature && now - lastPromptFailureAt < 3000) {
        if (!lastExecutionError) {
            rememberPromptFailure({
                type: "frontend_validation_error",
                message: summary,
                error: {
                    type: "frontend_validation_error",
                    message: summary,
                },
            });
        } else {
            applySosIconState();
        }
        return true;
    }
    lastPromptFailureSignature = signature;
    lastPromptFailureAt = now;
    rememberPromptFailure({
        type: "frontend_validation_error",
        message: summary,
        error: {
            type: "frontend_validation_error",
            message: summary,
        },
    });
    return true;
}

function promptFailureTextFromValue(value, depth = 0) {
    if (depth > 2 || value === null || value === undefined) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    if (Array.isArray(value)) {
        return value.slice(0, 8).map((item) => promptFailureTextFromValue(item, depth + 1)).filter(Boolean).join(" ");
    }
    if (typeof value !== "object") return "";
    return [
        value.summary,
        value.detail,
        value.message,
        value.title,
        value.description,
        value.content,
        value.error,
        value.errors,
    ].map((item) => promptFailureTextFromValue(item, depth + 1)).filter(Boolean).join(" ");
}

function rememberPromptFailureFromArgs(args) {
    return rememberFrontendPromptFailure(Array.from(args || []).map((item) => promptFailureTextFromValue(item)).filter(Boolean).join(" "));
}

function installSosToastHooks() {
    if (sosToastHooksInstalled) return true;
    const toast = app?.extensionManager?.toast;
    if (!toast || typeof toast !== "object") return false;
    let installed = false;
    for (const methodName of ["add", "addAlert"]) {
        if (typeof toast[methodName] !== "function" || toast[methodName].__denoSosWrapped) continue;
        const original = toast[methodName];
        const wrapped = function denoFloatingToolsToastHook() {
            rememberPromptFailureFromArgs(arguments);
            return original.apply(this, arguments);
        };
        wrapped.__denoSosWrapped = true;
        toast[methodName] = wrapped;
        installed = true;
    }
    sosToastHooksInstalled = installed;
    return installed;
}

function scheduleSosToastHooks() {
    if (installSosToastHooks() || sosToastHookTimer) return;
    let attempts = 0;
    sosToastHookTimer = window.setInterval(() => {
        attempts += 1;
        if (installSosToastHooks() || attempts >= 80) {
            window.clearInterval(sosToastHookTimer);
            sosToastHookTimer = null;
        }
    }, 125);
}

function clearExecutionErrorState(options = {}) {
    const force = options === true || options?.force === true;
    if (!force && lastExecutionError && Date.now() < sosErrorStickyUntil) {
        applySosIconState();
        return false;
    }
    lastExecutionError = null;
    sosErrorStickyUntil = 0;
    applySosIconState();
    return true;
}

function isPromptApiPath(path) {
    const raw = String(path || "");
    if (!raw) return false;
    try {
        return new URL(raw, window.location?.origin || "http://127.0.0.1").pathname.endsWith("/prompt");
    } catch (_error) {
        return raw.endsWith("/prompt");
    }
}

function installSosPromptFailureHooks() {
    if (!sosPromptApiWrapped && typeof api?.fetchApi === "function") {
        const originalFetchApi = api.fetchApi;
        api.fetchApi = async function denoFloatingToolsFetchApi(path, options) {
            const response = await originalFetchApi.apply(this, arguments);
            if (isPromptApiPath(path) && response && response.ok === false) {
                response.clone?.().json?.()
                    .then((data) => rememberPromptFailure(data))
                    .catch(() => rememberPromptFailure({ message: `Prompt request failed: HTTP ${response.status}` }));
            }
            return response;
        };
        sosPromptApiWrapped = true;
    }

    if (!sosQueuePromptWrapped && typeof app?.queuePrompt === "function") {
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function denoFloatingToolsQueuePrompt() {
            try {
                return await originalQueuePrompt.apply(this, arguments);
            } catch (error) {
                rememberPromptFailure(error);
                throw error;
            }
        };
        sosQueuePromptWrapped = true;
    }
}

function promptFailureTextFromNode(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    return node.innerText || node.textContent || "";
}

function inspectPromptFailureAlerts() {
    const selectors = [
        "[role='alert']",
        "[class*='toast']",
        "[class*='Toast']",
        "[class*='error']",
        "[class*='Error']",
        ".p-toast",
        ".p-dialog",
    ];
    const elements = Array.from(document.querySelectorAll(selectors.join(","))).slice(-40);
    for (const element of elements) {
        if (rememberFrontendPromptFailure(promptFailureTextFromNode(element))) return true;
    }
    return false;
}

function installSosValidationObserver() {
    if (sosValidationObserver || typeof MutationObserver !== "function" || !document?.body) return;
    sosValidationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) {
                if (rememberFrontendPromptFailure(promptFailureTextFromNode(node))) return;
            }
            if (rememberFrontendPromptFailure(promptFailureTextFromNode(mutation.target))) return;
            if (rememberFrontendPromptFailure(promptFailureTextFromNode(mutation.target?.parentElement))) return;
        }
        window.requestAnimationFrame?.(inspectPromptFailureAlerts);
    });
    sosValidationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
}

async function fetchOptionalJson(path) {
    try {
        const response = await api.fetchApi(path, { cache: "no-store" });
        if (!response.ok) return { error: `HTTP ${response.status}` };
        return await response.json();
    } catch (error) {
        return { error: String(error?.message || error || "request failed") };
    }
}

function currentWorkflowSnapshot() {
    const serialized = app?.graph?.serialize?.();
    return safeJsonClone(serialized, null);
}

function compactHistoryErrors(history) {
    if (!history || typeof history !== "object") return [];
    const errors = [];
    const entries = Object.entries(history).slice(-8);
    for (const [promptId, item] of entries) {
        const messages = Array.isArray(item?.status?.messages) ? item.status.messages : [];
        for (const message of messages) {
            if (!Array.isArray(message) || message.length < 2) continue;
            const [eventName, eventData] = message;
            if (eventName !== "execution_error") continue;
            errors.push(compactExecutionError(eventData, promptId));
        }
    }
    return errors.slice(-5);
}

function compactQueue(queue) {
    const running = Array.isArray(queue?.queue_running) ? queue.queue_running : [];
    const pending = Array.isArray(queue?.queue_pending) ? queue.queue_pending : [];
    const compactItem = (item) => {
        if (Array.isArray(item)) {
            return {
                number: item.length > 0 && ["string", "number", "boolean"].includes(typeof item[0]) ? item[0] : null,
                prompt_id: item.length > 1 && item[1] != null ? String(item[1]) : "",
            };
        }
        if (item && typeof item === "object") {
            return {
                number: ["string", "number", "boolean"].includes(typeof item.number) ? item.number : null,
                prompt_id: item.prompt_id != null ? String(item.prompt_id) : (item.id != null ? String(item.id) : ""),
            };
        }
        return {};
    };
    return {
        running_count: running.length,
        pending_count: pending.length,
        running: running.slice(0, 3).map(compactItem),
        pending: pending.slice(0, 5).map(compactItem),
    };
}

async function buildSosPayload() {
    const [systemStats, queue, history] = await Promise.all([
        fetchOptionalJson("/system_stats"),
        fetchOptionalJson("/queue"),
        fetchOptionalJson("/history?max_items=10"),
    ]);
    return {
        include_workflow: true,
        workflow: currentWorkflowSnapshot(),
        last_error: lastExecutionError ? compactExecutionError(lastExecutionError) : null,
        system_stats: systemStats,
        queue: compactQueue(queue),
        history_errors: compactHistoryErrors(history),
        frontend: {
            origin: String(window.location?.origin || ""),
            language: String(window.navigator?.language || ""),
            languages: Array.isArray(window.navigator?.languages) ? Array.from(window.navigator.languages).map(String) : [],
        },
    };
}

function selectTextareaForCopy(textarea) {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange?.(0, textarea.value.length);
}

function copyTextFromTextarea(textarea) {
    try {
        selectTextareaForCopy(textarea);
        return document.execCommand?.("copy") === true;
    } catch (_error) {
        return false;
    }
}

async function copyTextFromManualButton(textarea) {
    if (copyTextFromTextarea(textarea)) return true;
    try {
        if (window.navigator?.clipboard?.writeText) {
            await window.navigator.clipboard.writeText(String(textarea.value || ""));
            return true;
        }
    } catch (_error) {
        // Keep the report selected so Ctrl+C still works if the browser blocks clipboard access.
    }
    try {
        selectTextareaForCopy(textarea);
    } catch (_error) {
        // Ignore selection failures; the visible report remains available.
    }
    return false;
}

function showManualCopy(text) {
    document.querySelector(".deno-floating-tools-manual-copy")?.remove();
    const box = document.createElement("div");
    box.className = "deno-floating-tools-manual-copy";
    box.addEventListener("pointerdown", (event) => event.stopPropagation());
    box.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

    const header = document.createElement("div");
    header.className = "deno-floating-tools-report-header";
    const title = document.createElement("div");
    title.className = "deno-floating-tools-report-title";
    title.textContent = "Error Report";
    const headerCloseButton = makeButton("X", "deno-floating-tools-report-close");
    headerCloseButton.title = "Close";
    headerCloseButton.addEventListener("click", () => box.remove());
    header.append(title, headerCloseButton);

    const textarea = document.createElement("textarea");
    textarea.value = String(text || "");
    textarea.setAttribute("readonly", "readonly");

    const actionRow = document.createElement("div");
    actionRow.className = "deno-floating-tools-manual-copy-actions";
    const copyButton = makeButton("Copy Report", "deno-floating-tools-action");
    copyButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (await copyTextFromManualButton(textarea)) {
            clearExecutionErrorState({ force: true });
            setSosStatus("Copied");
            box.remove();
            return;
        }
        setSosStatus("Select text and copy");
    });

    const closeButton = makeButton("Close", "deno-floating-tools-action secondary");
    closeButton.addEventListener("click", () => box.remove());
    actionRow.append(copyButton, closeButton);

    box.append(header, textarea, actionRow);
    document.body.appendChild(box);
    selectTextareaForCopy(textarea);
}

async function copySosReport() {
    if (sosBusy) return;
    sosBusy = true;
    if (sosButtonEl) sosButtonEl.disabled = true;
    setSosStatus("Collecting");
    try {
        const payload = await buildSosPayload();
        const response = await api.fetchApi("/deno/sos/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const report = String(data?.report || "");
        if (!report.trim()) throw new Error("empty report");
        setSosStatus("Ready to copy");
        showManualCopy(report);
    } catch (error) {
        setSosStatus("Failed");
        if (sosButtonEl) {
            sosButtonEl.title = String(error?.message || error || "Error help copy failed.");
        }
    } finally {
        sosBusy = false;
        if (sosButtonEl) sosButtonEl.disabled = false;
    }
}

function normalizeVersion(value) {
    return String(value || "")
        .trim()
        .replace(/^v/i, "")
        .split("+")[0]
        .split("-")[0];
}

function compareVersions(left, right) {
    const leftParts = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10));
    const rightParts = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10));
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
        const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
        if (leftValue > rightValue) return 1;
        if (leftValue < rightValue) return -1;
    }
    return 0;
}

function isNewerVersion(latest, installed) {
    if (!normalizeVersion(latest) || !normalizeVersion(installed)) return false;
    return compareVersions(latest, installed) > 0;
}

function formatVersion(value) {
    return value ? String(value) : "unknown";
}

function compactVersion(value) {
    return normalizeVersion(value);
}

function packageVersion(system, packageName) {
    const target = packageName.toLowerCase().replace(/_/g, "-");
    const packages = Array.isArray(system?.comfy_package_versions) ? system.comfy_package_versions : [];
    const found = packages.find((item) => String(item?.name || "").toLowerCase().replace(/_/g, "-") === target);
    return found?.installed || found?.required || "";
}

async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            cache: "no-store",
            signal: controller.signal,
            headers: { "Accept": "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        window.clearTimeout(timeout);
    }
}

async function fetchPypiLatest(packageName) {
    const data = await fetchJsonWithTimeout(`${PYPI_JSON_BASE}${encodeURIComponent(packageName)}/json`);
    return data?.info?.version || "";
}

async function fetchComfyUiLatest() {
    try {
        const release = await fetchJsonWithTimeout(COMFYUI_RELEASE_URL);
        if (release?.tag_name) return release.tag_name;
    } catch (_error) {
        // Fall through to tags. Some mirrors or rate limits make releases less reliable.
    }
    const tags = await fetchJsonWithTimeout(COMFYUI_TAGS_URL);
    return Array.isArray(tags) && tags[0]?.name ? tags[0].name : "";
}

function setUpdateStatus(text) {
    if (updateStatusEl) updateStatusEl.textContent = text;
}

function setUpdateButtonState() {
    if (!updateButtonEl) return;
    updateButtonEl.disabled = false;
    updateButtonEl.textContent = updateBusy ? (queuedUpdateForce ? "Queued..." : "Checking...") : "Check Updates";
}

function setUpdateBadge(state) {
    if (!updateBadgeEl) return;
    updateBadgeEl.className = "deno-floating-tools-update-badge";
    updateBadgeEl.textContent = "";
    rootEl?.classList.remove(
        "deno-floating-tools-update-available",
        "deno-floating-tools-update-checking",
        "deno-floating-tools-update-error",
    );
    const status = state?.status || "idle";
    if (status === "checking") {
        rootEl?.classList.add("deno-floating-tools-update-checking");
        updateBadgeEl.classList.add("checking");
        updateBadgeEl.textContent = "...";
    } else if (status === "updates") {
        rootEl?.classList.add("deno-floating-tools-update-available");
        updateBadgeEl.classList.add("available");
        updateBadgeEl.textContent = "NEW";
    } else if (status === "error") {
        rootEl?.classList.add("deno-floating-tools-update-error");
        updateBadgeEl.classList.add("error");
        updateBadgeEl.textContent = "?";
    }
}

function renderUpdateDetails(state) {
    if (!updateDetailsEl) return;
    updateDetailsEl.replaceChildren();
    const items = Array.isArray(state?.items) ? state.items : [];
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "deno-floating-tools-note";
        empty.textContent = state?.error || "Run Check Updates to compare versions.";
        updateDetailsEl.appendChild(empty);
        return;
    }
    for (const item of items) {
        const row = document.createElement("div");
        row.className = "deno-floating-tools-update-row";
        if (item.updateAvailable) row.classList.add("available");

        const label = document.createElement("div");
        label.className = "deno-floating-tools-update-label";
        label.textContent = item.label;

        const value = document.createElement("div");
        value.className = "deno-floating-tools-update-value";
        const installed = formatVersion(item.installed);
        const latest = formatVersion(item.latest);
        value.textContent = item.updateAvailable ? `${installed} -> ${latest}` : `${installed} / latest ${latest}`;

        row.append(label, value);
        updateDetailsEl.appendChild(row);
    }
}

function renderUpdateState(state) {
    lastUpdateState = state;
    setUpdateButtonState();
    setUpdateBadge(state);
    if (state?.status === "checking") {
        setUpdateStatus("Checking");
    } else if (state?.status === "updates") {
        const count = state.items.filter((item) => item.updateAvailable).length;
        setUpdateStatus(`${count} update${count === 1 ? "" : "s"}`);
    } else if (state?.status === "latest") {
        setUpdateStatus("Latest");
    } else if (state?.status === "error") {
        setUpdateStatus("Offline");
    } else {
        setUpdateStatus("Not checked");
    }
    renderUpdateDetails(state);
    if (updateHintEl) {
        updateHintEl.textContent = state?.status === "updates" ? "New update available." : "";
    }
}

function readCachedUpdateState() {
    const cached = readStoredJson(UPDATE_CACHE_KEY, null);
    if (!cached || typeof cached !== "object") return null;
    if (!Number.isFinite(Number(cached.checkedAt)) && getLatestMetadataTime(cached) === null) return null;
    return cached;
}

function getLatestMetadataTime(state) {
    const value = Number(state?.latestCheckedAt ?? state?.checkedAt);
    return Number.isFinite(value) ? value : null;
}

function isLatestMetadataFresh(state) {
    const latestCheckedAt = getLatestMetadataTime(state);
    return Boolean(latestCheckedAt !== null && Date.now() - latestCheckedAt < UPDATE_CACHE_TTL_MS);
}

function latestVersionsFromState(state) {
    const items = Array.isArray(state?.items) ? state.items : [];
    const latest = {};
    for (const item of items) {
        if (item?.id) latest[item.id] = compactVersion(item.latest);
    }
    return latest;
}

function hasCompleteLatestVersions(latest) {
    return Boolean(
        compactVersion(latest?.comfyui)
        && compactVersion(latest?.templates)
        && compactVersion(latest?.frontend),
    );
}

function installedVersionsFromSystem(system) {
    return {
        comfyui: compactVersion(system.comfyui_version),
        templates: compactVersion(system.installed_templates_version || packageVersion(system, "comfyui-workflow-templates")),
        frontend: compactVersion(packageVersion(system, "comfyui-frontend-package") || system.required_frontend_version),
    };
}

function latestVersionsCoverInstalled(latest, installed) {
    return ["comfyui", "templates", "frontend"].every((id) => !isNewerVersion(installed?.[id], latest?.[id]));
}

function clearUpdateStartupTimer() {
    if (updateStartupTimer === null) return;
    window.clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
}

async function fetchLocalUpdateSystem() {
    const localResponse = await api.fetchApi("/system_stats", { cache: "no-store" });
    if (!localResponse.ok) throw new Error(`Local HTTP ${localResponse.status}`);
    const localData = await localResponse.json();
    return localData?.system || {};
}

async function fetchLatestUpdateVersions() {
    const [comfyLatest, templatesLatest, frontendLatest] = await Promise.all([
        fetchComfyUiLatest(),
        fetchPypiLatest("comfyui-workflow-templates"),
        fetchPypiLatest("comfyui-frontend-package"),
    ]);
    return {
        comfyui: comfyLatest,
        templates: templatesLatest,
        frontend: frontendLatest,
    };
}

function buildUpdateItems(system, latestVersions) {
    const installedVersions = installedVersionsFromSystem(system);
    return [
        {
            id: "comfyui",
            label: "ComfyUI",
            installed: installedVersions.comfyui,
            latest: compactVersion(latestVersions.comfyui),
        },
        {
            id: "templates",
            label: "Templates",
            installed: installedVersions.templates,
            latest: compactVersion(latestVersions.templates),
        },
        {
            id: "frontend",
            label: "Frontend",
            installed: installedVersions.frontend,
            latest: compactVersion(latestVersions.frontend),
        },
    ].map((item) => ({
        ...item,
        updateAvailable: isNewerVersion(item.latest, item.installed),
    }));
}

function buildUpdateState(system, latestVersions, latestCheckedAt) {
    const items = buildUpdateItems(system, latestVersions);
    const hasUpdates = items.some((item) => item.updateAvailable);
    return {
        status: hasUpdates ? "updates" : "latest",
        checkedAt: Date.now(),
        latestCheckedAt,
        system,
        items,
    };
}

function buildOfflineUpdateState(system, error) {
    return {
        status: "error",
        checkedAt: Date.now(),
        latestCheckedAt: null,
        system,
        error: String(error?.message || error || "Latest version check failed."),
        items: buildUpdateItems(system, {}),
    };
}

async function checkUpdates(force = false) {
    if (updateBusy) {
        if (force) queuedUpdateForce = true;
        setUpdateButtonState();
        return lastUpdateState;
    }
    const cached = readCachedUpdateState();
    updateBusy = true;
    queuedUpdateForce = false;
    renderUpdateState({ status: "checking", items: lastUpdateState?.items || [] });
    let system = null;
    try {
        system = await fetchLocalUpdateSystem();
        const installedVersions = installedVersionsFromSystem(system);
        let latestVersions = null;
        let latestCheckedAt = null;
        if (!force && isLatestMetadataFresh(cached)) {
            const cachedLatestVersions = latestVersionsFromState(cached);
            if (
                hasCompleteLatestVersions(cachedLatestVersions)
                && latestVersionsCoverInstalled(cachedLatestVersions, installedVersions)
            ) {
                latestVersions = cachedLatestVersions;
                latestCheckedAt = getLatestMetadataTime(cached);
            }
        }
        if (!latestVersions) {
            latestVersions = await fetchLatestUpdateVersions();
            latestCheckedAt = Date.now();
        }

        const state = buildUpdateState(system, latestVersions, latestCheckedAt);
        writeStoredJson(UPDATE_CACHE_KEY, state);
        renderUpdateState(state);
        return state;
    } catch (error) {
        const state = system ? buildOfflineUpdateState(system, error) : {
            status: "error",
            checkedAt: Date.now(),
            error: String(error?.message || error || "Update check failed."),
            items: lastUpdateState?.items || [],
        };
        if (system) writeStoredJson(UPDATE_CACHE_KEY, state);
        renderUpdateState(state);
        return state;
    } finally {
        updateBusy = false;
        const shouldRunQueuedForce = queuedUpdateForce;
        queuedUpdateForce = false;
        setUpdateButtonState();
        if (shouldRunQueuedForce) {
            void checkUpdates(true);
        }
    }
}

function requestUpdateCheck(force = false) {
    return checkUpdates(force);
}

function initializeUpdateWatch() {
    clearUpdateStartupTimer();
    const cached = readCachedUpdateState();
    if (cached) renderUpdateState({ ...cached, status: "checking" });
    else renderUpdateState({ status: "idle", items: [] });
    updateStartupTimer = window.setTimeout(() => {
        updateStartupTimer = null;
        requestUpdateCheck(false);
    }, 1200);
}

function makeButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = className;
    return button;
}

function createToolsRoot() {
    ensureStyles();

    rootEl = document.createElement("div");
    rootEl.id = ROOT_ID;
    rootEl.dataset.marker = DENO_FLOATING_TOOLS_MARKER;

    const orb = makeButton("", "deno-floating-tools-orb");
    orb.title = "DENO Tools";
    orb.setAttribute("aria-label", "DENO Tools");
    iconImgEl = document.createElement("img");
    iconImgEl.src = lastExecutionError ? ERROR_ICON_URL : ICON_URL;
    iconImgEl.alt = "";
    updateBadgeEl = document.createElement("span");
    updateBadgeEl.className = "deno-floating-tools-update-badge";
    orb.append(iconImgEl);

    panelEl = document.createElement("div");
    panelEl.className = "deno-floating-tools-panel";
    panelEl.addEventListener("pointerdown", (event) => event.stopPropagation());
    panelEl.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

    const title = document.createElement("div");
    title.className = "deno-floating-tools-title";
    title.textContent = "DENO Tools";
    statusEl = document.createElement("span");
    statusEl.className = "deno-floating-tools-status";
    statusEl.textContent = "Ready";
    title.appendChild(statusEl);

    freeButtonEl = makeButton("Free VRAM", "deno-floating-tools-action");
    freeButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        freeComfyVram();
    });

    const note = document.createElement("div");
    note.className = "deno-floating-tools-note";
    note.textContent = "Unloads ComfyUI models and clears memory cache.";

    const sosSection = document.createElement("div");
    sosSection.className = "deno-floating-tools-section deno-floating-tools-sos-section";

    const sosTitle = document.createElement("div");
    sosTitle.className = "deno-floating-tools-section-title";
    sosTitle.textContent = "Error Help";
    sosStatusEl = document.createElement("span");
    sosStatusEl.className = "deno-floating-tools-update-status";
    sosStatusEl.textContent = lastExecutionError ? "Error detected" : "Ready";
    sosTitle.appendChild(sosStatusEl);

    sosButtonEl = makeButton("Copy Error Report", "deno-floating-tools-action deno-floating-tools-sos-action");
    sosButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copySosReport();
    });

    sosSection.append(sosTitle, sosButtonEl);

    const updateSection = document.createElement("div");
    updateSection.className = "deno-floating-tools-section";

    const updateTitle = document.createElement("div");
    updateTitle.className = "deno-floating-tools-section-title";
    updateTitle.textContent = "Update Watch";
    updateStatusEl = document.createElement("span");
    updateStatusEl.className = "deno-floating-tools-update-status";
    updateStatusEl.textContent = "Not checked";
    updateTitle.appendChild(updateStatusEl);

    updateButtonEl = makeButton("Check Updates", "deno-floating-tools-action secondary");
    updateButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestUpdateCheck(true);
    });

    updateDetailsEl = document.createElement("div");
    updateDetailsEl.className = "deno-floating-tools-update-details";

    updateHintEl = document.createElement("div");
    updateHintEl.className = "deno-floating-tools-update-hint";
    updateHintEl.textContent = "";

    updateSection.append(updateTitle, updateButtonEl, updateDetailsEl, updateHintEl);

    panelEl.append(title, freeButtonEl, note, sosSection, updateSection);
    rootEl.append(orb, updateBadgeEl, panelEl);
    document.body.appendChild(rootEl);
    applyPosition(readSavedPosition(), false);
    applySosIconState();
    initializeUpdateWatch();

    orb.addEventListener("pointerdown", beginDrag);
    orb.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dragState?.moved) return;
        setPanelOpen(!rootEl.classList.contains("deno-floating-tools-open"));
    });

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("resize", handleWindowResize);
    refreshQueueState();
}

function destroyToolsRoot() {
    stopQueuePolling();
    clearUpdateStartupTimer();
    queuedUpdateForce = false;
    document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    window.removeEventListener("resize", handleWindowResize);
    rootEl?.remove();
    rootEl = null;
    panelEl = null;
    statusEl = null;
    freeButtonEl = null;
    iconImgEl = null;
    sosButtonEl = null;
    sosStatusEl = null;
    updateBadgeEl = null;
    updateButtonEl = null;
    updateStatusEl = null;
    updateDetailsEl = null;
    updateHintEl = null;
    dragState = null;
    document.querySelector(".deno-floating-tools-manual-copy")?.remove();
}

function beginDrag(event) {
    if (!rootEl || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const position = currentPosition();
    dragState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: position.x,
        startY: position.y,
        moved: false,
    };
    rootEl.classList.add("deno-floating-tools-dragging");
    setPanelOpen(false);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", handleDragMove, true);
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
}

function handleDragMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - dragState.startClientX;
    const dy = event.clientY - dragState.startClientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
        dragState.moved = true;
    }
    applyPosition({ x: dragState.startX + dx, y: dragState.startY + dy }, false);
}

function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    savePosition(currentPosition());
    rootEl?.classList.remove("deno-floating-tools-dragging");
    window.removeEventListener("pointermove", handleDragMove, true);
    window.removeEventListener("pointerup", endDrag, true);
    window.removeEventListener("pointercancel", endDrag, true);
    window.setTimeout(() => {
        if (dragState) dragState = null;
    }, 0);
}

function handleOutsidePointerDown(event) {
    if (!rootEl || !rootEl.classList.contains("deno-floating-tools-open")) return;
    if (rootEl.contains(event.target)) return;
    setPanelOpen(false);
}

function handleWindowResize() {
    if (!rootEl) return;
    applyPosition(currentPosition(), true);
}

function updateToolsVisibility(value) {
    const enabled = typeof value === "boolean" ? value : isEnabled();
    if (enabled) {
        if (!rootEl) createToolsRoot();
    } else if (rootEl) {
        destroyToolsRoot();
    }
}

function installSosEventListeners() {
    if (sosEventListenersInstalled) return;
    sosEventListenersInstalled = true;
    api?.addEventListener?.("execution_error", (event) => {
        rememberExecutionError(event?.detail || {});
    });
    api?.addEventListener?.("execution_start", () => {
        clearExecutionErrorState();
    });
    api?.addEventListener?.("execution_success", () => {
        clearExecutionErrorState({ force: true });
    });
}

app.registerExtension({
    name: EXTENSION_NAME,
    settings: [
        {
            id: SETTING_ENABLED,
            name: "Show DENO floating tools",
            category: ["DENO", "Tools", "Floating Tools"],
            tooltip: "Show a draggable DENO helper icon with ComfyUI utility actions.",
            type: "boolean",
            defaultValue: false,
            onChange: updateToolsVisibility,
        },
    ],
    setup() {
        installSosEventListeners();
        installSosPromptFailureHooks();
        scheduleSosToastHooks();
        installSosValidationObserver();
        queueMicrotask(updateToolsVisibility);
    },
});
