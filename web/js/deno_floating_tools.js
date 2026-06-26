import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const DENO_FLOATING_TOOLS_MARKER = "r2026.06.27-floating-tools-hardening-b";
const EXTENSION_NAME = "Deno.FloatingTools";
const SETTING_ENABLED = "DENO.FloatingTools.Enabled";
const POSITION_KEY = "denoFloatingTools.position.v1";
const UPDATE_CACHE_KEY = "denoFloatingTools.updateStatus.v1";
const ICON_URL = new URL("./assets/deno_floating_tools_icon.png", import.meta.url).toString();
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
let dragState = null;
let queueBusy = false;
let queueTimer = null;
let updateBusy = false;
let updateStartupTimer = null;
let queuedUpdateForce = false;
let lastUpdateState = null;

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

.deno-floating-tools-action:hover:not(:disabled) {
    filter: brightness(1.08);
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
    const img = document.createElement("img");
    img.src = ICON_URL;
    img.alt = "";
    updateBadgeEl = document.createElement("span");
    updateBadgeEl.className = "deno-floating-tools-update-badge";
    orb.append(img);

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

    panelEl.append(title, freeButtonEl, note, updateSection);
    rootEl.append(orb, updateBadgeEl, panelEl);
    document.body.appendChild(rootEl);
    applyPosition(readSavedPosition(), false);
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
    updateBadgeEl = null;
    updateButtonEl = null;
    updateStatusEl = null;
    updateDetailsEl = null;
    updateHintEl = null;
    dragState = null;
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
        queueMicrotask(updateToolsVisibility);
    },
});
