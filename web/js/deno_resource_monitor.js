import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "Deno.ResourceMonitor";
const SETTING_MODE = "DENO.ResourceMonitor.Mode";
const SETTING_CLEANUP_MODE = "DENO.ResourceMonitor.CleanupMode";
const MANUAL_UNLOAD_SETTING = "Comfy.Memory.AllowManualUnload";
const ROOT_ID = "deno-resource-monitor-root";
const STYLE_ID = "deno-resource-monitor-style";
const FORCE_CLASS = "deno-resource-monitor-force";
const REFRESH_MS = 1000;
const CRYSTOOLS_ROOT_ID = "crystools-monitors-root";
const MODE_AUTO = "Auto";
const MODE_DENO = "DENO";
const MODE_OFF = "Off";
const CLEANUP_SHOW = "Show";
const CLEANUP_COMMAND = "Comfy.Memory.UnloadModelsAndExecutionCache";
const DETACHED_CLASS = "deno-resource-detached";
const DETACHED_VIEWPORT_WIDTH = 1100;

let rootEl = null;
let freeButtonEl = null;
let pollTimer = null;
let pollRevision = 0;
let attachTimer = null;
let attachAttempts = 0;
let activeRequest = null;
let reconcileTimer = null;
let queueBusy = true;
let cleanupBusy = false;
let listenersInstalled = false;
let meterElements = new Map();
let metersEnabled = false;
let cleanupEnabled = false;
let polling = false;
let setupComplete = false;
let meterMode = MODE_AUTO;
let cleanupMode = MODE_AUTO;
let crystoolsState = { known: false, loaded: false };
let detectionRevision = 0;
let detectionPending = false;
let menuObserver = null;
let mountObserver = null;
let observedScope = null;
let observedAncestors = [];

function getSettingValue(id, fallback) {
    try {
        const value = app?.ui?.settings?.getSettingValue?.(id);
        return value === undefined || value === null ? fallback : value;
    } catch (_error) {
        return fallback;
    }
}

function normalizedMode(value = getSettingValue(SETTING_MODE, MODE_AUTO)) {
    const text = String(value || MODE_AUTO).trim().toLowerCase();
    if (text === MODE_DENO.toLowerCase()) return MODE_DENO;
    if (text === MODE_OFF.toLowerCase()) return MODE_OFF;
    return MODE_AUTO;
}

function normalizedCleanupMode(value = getSettingValue(SETTING_CLEANUP_MODE, MODE_AUTO)) {
    const text = String(value || MODE_AUTO).trim().toLowerCase();
    if (text === CLEANUP_SHOW.toLowerCase()) return CLEANUP_SHOW;
    if (text === MODE_OFF.toLowerCase()) return MODE_OFF;
    return MODE_AUTO;
}

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${ROOT_ID} {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            gap: 3px;
            height: 30px;
            min-width: 0;
            font-family: var(--font-family, Arial, sans-serif);
            color: var(--input-text, #eee);
        }
        #${ROOT_ID}.deno-resource-monitor-error .deno-resource-meter {
            opacity: 0.58;
        }
        #${ROOT_ID}.${DETACHED_CLASS} {
            position: fixed;
            z-index: 60;
            width: max-content;
            max-width: calc(100vw - 24px);
            height: auto;
            min-height: 30px;
            flex-wrap: wrap;
            padding: 6px;
            box-sizing: border-box;
            border: 1px solid var(--border-color, #555);
            border-radius: 6px;
            background: var(--comfy-menu-bg, #202024);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            pointer-events: auto;
        }
        #${ROOT_ID} .deno-resource-meter {
            --deno-resource-color: #a3a6ad;
            position: relative;
            width: 55px;
            height: 30px;
            flex: 0 0 55px;
            overflow: hidden;
            border-radius: 3px;
            background: var(--comfy-input-bg, #202024);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        #${ROOT_ID} .deno-resource-fill {
            position: absolute;
            inset: 0 auto 0 0;
            width: 0%;
            background: var(--deno-resource-color);
            opacity: 0.72;
            transition: width 300ms ease-out;
        }
        #${ROOT_ID} .deno-resource-meter[data-key="temperature"] .deno-resource-fill {
            background: linear-gradient(90deg, #3abf78 0%, #e1bd46 62%, #ef665b 100%);
            opacity: 0.82;
        }
        #${ROOT_ID} .deno-resource-label,
        #${ROOT_ID} .deno-resource-value {
            position: absolute;
            z-index: 1;
            line-height: 1;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
            pointer-events: none;
        }
        #${ROOT_ID} .deno-resource-label {
            left: 4px;
            bottom: 3px;
            font-size: 9px;
            font-weight: 500;
            color: rgba(240, 238, 232, 0.82);
        }
        #${ROOT_ID} .deno-resource-value {
            top: 3px;
            right: 4px;
            font-size: 10px;
            font-variant-numeric: tabular-nums;
            font-weight: 650;
            color: #f5f3ee;
        }
        #${ROOT_ID} .deno-resource-meter.deno-resource-unavailable {
            display: none;
        }
        #${ROOT_ID} .deno-resource-free {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            flex: 0 0 30px;
            padding: 0;
            border: 1px solid rgba(232, 230, 225, 0.24);
            border-radius: 4px;
            color: var(--input-text, #e8e6e1);
            background: var(--comfy-input-bg, #202024);
            cursor: pointer;
        }
        #${ROOT_ID} .deno-resource-free:hover:not(:disabled),
        #${ROOT_ID} .deno-resource-free:focus-visible:not(:disabled) {
            border-color: #f2ff59;
            color: #f2ff59;
            outline: none;
        }
        #${ROOT_ID} .deno-resource-free:disabled {
            cursor: not-allowed;
            opacity: 0.46;
        }
        #${ROOT_ID} .deno-resource-free .mdi {
            font-size: 18px;
            line-height: 1;
        }
        #${ROOT_ID} .deno-resource-free.deno-resource-cleaning .mdi {
            animation: deno-resource-cleaning 750ms linear infinite;
        }
        html.${FORCE_CLASS} #${CRYSTOOLS_ROOT_ID} {
            display: none !important;
        }
        @keyframes deno-resource-cleaning {
            to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
            #${ROOT_ID} .deno-resource-fill { transition: none; }
            #${ROOT_ID} .deno-resource-free.deno-resource-cleaning .mdi { animation: none; }
        }
    `;
    document.head.appendChild(style);
}

function makeElement(tag, className, text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createMeter(key, label, color) {
    const meter = makeElement("div", "deno-resource-meter");
    meter.dataset.key = key;
    meter.style.setProperty("--deno-resource-color", color);
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", label);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");

    const fill = makeElement("div", "deno-resource-fill");
    const labelEl = makeElement("span", "deno-resource-label", label);
    const valueEl = makeElement("span", "deno-resource-value", "--");
    meter.append(fill, labelEl, valueEl);
    meterElements.set(key, { meter, fill, valueEl });
    return meter;
}

function cleanupIcon() {
    const icon = makeElement("i", "mdi mdi-vacuum");
    icon.setAttribute("aria-hidden", "true");
    return icon;
}

function createRoot() {
    if (rootEl) return rootEl;
    installStyles();
    meterElements = new Map();
    rootEl = makeElement("div");
    rootEl.id = ROOT_ID;
    rootEl.setAttribute("aria-label", "DENO resource monitor");
    return rootEl;
}

function addMeters() {
    if (meterElements.size) return;
    const fragment = document.createDocumentFragment();
    fragment.append(
        createMeter("cpu", "CPU", "#83a67a"),
        createMeter("ram", "RAM", "#47b95d"),
        createMeter("gpu", "GPU", "#3f91e8"),
        createMeter("vram", "VRAM", "#596fe1"),
        createMeter("temperature", "Temp", "#3abf78"),
    );
    rootEl.insertBefore(fragment, freeButtonEl);
    // GPU fields stay absent until the backend supplies actual readings.
    updateSnapshot(null);
}

function addCleanupButton() {
    if (freeButtonEl) return;
    freeButtonEl = makeElement("button", "deno-resource-free");
    freeButtonEl.type = "button";
    freeButtonEl.setAttribute("aria-label", "Unload models and clear execution cache");
    freeButtonEl.appendChild(cleanupIcon());
    freeButtonEl.addEventListener("click", freeModelsAndCache);
    rootEl.appendChild(freeButtonEl);
    updateFreeButton();
}

function menuMountPoint() {
    const menu = app?.menu?.element;
    const settingsGroup = app?.menu?.settingsGroup?.element;
    if (menu?.isConnected) {
        return { parent: menu, before: settingsGroup?.parentElement === menu ? settingsGroup : null };
    }
    const actions = app?.menu?.actionsGroup?.element;
    if (actions?.isConnected) return { parent: actions, before: null };
    return null;
}

function menuScope() {
    const mount = menuMountPoint();
    if (!mount) return null;
    // Current frontends keep the extension menu inside the native top bar.
    // Include that bar's core buttons without inspecting the canvas or dialogs.
    return mount.parent.closest('.actionbar-container, .comfyui-body-top, [data-testid="topbar"], [role="toolbar"]') || mount.parent;
}

function attachRoot() {
    if (!rootEl) return false;
    const mount = menuMountPoint();
    if (!mount) return false;
    const scope = menuScope();
    const cluster = scope.closest(".flex.items-start.gap-2") || scope;
    const clusterRect = cluster.getBoundingClientRect();
    const breadcrumb = document.querySelector(".subgraph-breadcrumb");
    // The breadcrumb wrapper stretches through empty space. Only its rendered
    // controls (workflow actions and any subgraph pills) are actual obstacles.
    const leftBoundary = Math.max(72, ...Array.from(breadcrumb?.children || [])
        .filter(visiblyRendered).map((element) => element.getBoundingClientRect().right + 12));
    const detached = rootEl.classList.contains(DETACHED_CLASS);
    const hostVisible = visiblyRendered(scope);
    const inlineRoom = window.innerWidth - leftBoundary - 12;
    const neededRoom = clusterRect.width + (detached ? rootEl.getBoundingClientRect().width + 16 : 0);
    // Narrow bars have native controls with their own responsive breakpoints.
    // Move only our root below them, leaving their DOM, spacing and input intact.
    // The extra margin prevents repeatedly docking/undocking near the boundary.
    const separateRow = hostVisible && (window.innerWidth < DETACHED_VIEWPORT_WIDTH
        || neededRoom + (detached ? 24 : 0) > inlineRoom
        || clusterRect.right > window.innerWidth - 4
        || clusterRect.left < leftBoundary);
    if (separateRow) {
        rootEl.classList.add(DETACHED_CLASS);
        if (rootEl.parentElement !== document.body) document.body.appendChild(rootEl);
        const rect = scope.getBoundingClientRect();
        rootEl.style.top = `${Math.max(12, rect.bottom + 12)}px`;
        rootEl.style.right = `${Math.max(12, window.innerWidth - Math.min(rect.right, window.innerWidth - 12))}px`;
    } else {
        rootEl.classList.remove(DETACHED_CLASS);
        rootEl.style.removeProperty("top");
        rootEl.style.removeProperty("right");
        if (rootEl.parentElement !== mount.parent) {
            mount.parent.insertBefore(rootEl, mount.before);
        }
    }
    // A first attachment changes the native cluster width. Check it once with
    // the root present, rather than waiting for a resize or an external update.
    if (hostVisible && !separateRow && !detached) {
        const attachedRect = cluster.getBoundingClientRect();
        if (attachedRect.right > window.innerWidth - 4 || attachedRect.left < leftBoundary) {
            rootEl.classList.add(DETACHED_CLASS);
            document.body.appendChild(rootEl);
            const rect = scope.getBoundingClientRect();
            rootEl.style.top = `${Math.max(12, rect.bottom + 12)}px`;
            rootEl.style.right = `${Math.max(12, window.innerWidth - Math.min(rect.right, window.innerWidth - 12))}px`;
        }
    }
    return true;
}

function scheduleAttach() {
    if (attachTimer !== null || attachAttempts >= 40) return;
    attachTimer = window.setTimeout(() => {
        attachTimer = null;
        attachAttempts += 1;
        reconcileMonitor();
    }, 250);
}

function stopAttachRetries() {
    window.clearTimeout(attachTimer);
    attachTimer = null;
    attachAttempts = 0;
}

function finiteNumber(value) {
    if ((typeof value !== "number" && typeof value !== "string")
        || (typeof value === "string" && value.trim() === "")) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clampedPercent(value) {
    const number = finiteNumber(value);
    return number !== null ? Math.min(100, Math.max(0, number)) : null;
}

function bytesToGiB(value) {
    const number = finiteNumber(value);
    return number !== null ? number / (1024 ** 3) : null;
}

function setMeter(key, value, title, options = {}) {
    const refs = meterElements.get(key);
    if (!refs) return;
    const percent = clampedPercent(value);
    const available = percent !== null;
    const displayValue = options.rawValue ? finiteNumber(value) : percent;
    const unavailable = !available && options.hideWhenUnavailable === true;
    const availabilityChanged = refs.meter.classList.contains("deno-resource-unavailable") !== unavailable;
    refs.meter.classList.toggle("deno-resource-unavailable", unavailable);
    refs.fill.style.width = `${available ? percent : 0}%`;
    refs.valueEl.textContent = available
        ? `${Math.round(displayValue)}${options.symbol || "%"}`
        : "--";
    refs.meter.title = title || "Metric unavailable";
    if (available) {
        refs.meter.setAttribute("aria-valuenow", String(Math.round(percent)));
        refs.meter.setAttribute("aria-valuetext", refs.valueEl.textContent);
    } else {
        refs.meter.removeAttribute("aria-valuenow");
        refs.meter.setAttribute("aria-valuetext", "Unavailable");
    }
    if (availabilityChanged) requestReconcile();
}

function primaryGpu(snapshot) {
    const gpus = Array.isArray(snapshot?.gpus) ? snapshot.gpus : [];
    return gpus.find((gpu) => finiteNumber(gpu?.index) === 0) || gpus[0] || null;
}

function updateSnapshot(snapshot) {
    const ramUsed = bytesToGiB(snapshot?.ram_used);
    const ramTotal = bytesToGiB(snapshot?.ram_total);
    const cpuPercent = clampedPercent(snapshot?.cpu_percent);
    setMeter("cpu", cpuPercent, cpuPercent === null ? "CPU usage unavailable" : `CPU ${Math.round(cpuPercent)}%`);
    setMeter(
        "ram",
        snapshot?.ram_percent,
        ramUsed !== null && ramTotal !== null
            ? `RAM ${ramUsed.toFixed(1)} / ${ramTotal.toFixed(1)} GiB`
            : "RAM usage unavailable",
    );

    const gpu = primaryGpu(snapshot);
    const gpuName = String(gpu?.name || "GPU");
    const vramUsed = bytesToGiB(gpu?.vram_used);
    const vramTotal = bytesToGiB(gpu?.vram_total);
    setMeter("gpu", gpu?.gpu_percent, `${gpuName} utilization`, { hideWhenUnavailable: true });
    setMeter(
        "vram",
        gpu?.vram_percent,
        vramUsed !== null && vramTotal !== null
            ? `${gpuName} VRAM ${vramUsed.toFixed(1)} / ${vramTotal.toFixed(1)} GiB`
            : `${gpuName} VRAM unavailable`,
        { hideWhenUnavailable: true },
    );
    setMeter(
        "temperature",
        gpu?.temperature,
        finiteNumber(gpu?.temperature) !== null
            ? `${gpuName} ${Math.round(finiteNumber(gpu.temperature))}°C`
            : `${gpuName} temperature unavailable`,
        { symbol: "°", rawValue: true, hideWhenUnavailable: true },
    );
}

async function fetchSnapshot() {
    if (!metersEnabled || !rootEl?.isConnected || document.visibilityState === "hidden") return null;
    const revision = pollRevision;
    activeRequest?.abort?.();
    const controller = new AbortController();
    activeRequest = controller;
    try {
        const response = await api.fetchApi("/deno/resource-monitor", {
            cache: "no-store",
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = await response.json();
        if (controller.signal.aborted || revision !== pollRevision || !metersEnabled) return null;
        rootEl?.classList.remove("deno-resource-monitor-error");
        rootEl?.removeAttribute("title");
        updateSnapshot(snapshot);
        return snapshot;
    } catch (error) {
        if (error?.name !== "AbortError" && revision === pollRevision && metersEnabled) {
            rootEl?.classList.add("deno-resource-monitor-error");
            if (rootEl) rootEl.title = "Resource readings are temporarily unavailable.";
        }
        return null;
    } finally {
        if (activeRequest === controller) activeRequest = null;
    }
}

function stopPolling() {
    polling = false;
    pollRevision += 1;
    if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
    }
    activeRequest?.abort?.();
    activeRequest = null;
}

function startPolling() {
    if (polling || cleanupBusy || !metersEnabled || !rootEl?.isConnected || document.visibilityState === "hidden") return;
    polling = true;
    const revision = pollRevision;
    const poll = async () => {
        await fetchSnapshot();
        if (revision !== pollRevision || !metersEnabled || !rootEl?.isConnected || document.visibilityState === "hidden") {
            if (revision === pollRevision) polling = false;
            return;
        }
        pollTimer = window.setTimeout(poll, REFRESH_MS);
    };
    void poll();
}

async function readQueueBusy() {
    try {
        const response = await api.fetchApi("/queue", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const queue = await response.json();
        if (!Array.isArray(queue?.queue_running) || !Array.isArray(queue?.queue_pending)) throw new Error("Invalid queue response");
        const running = queue.queue_running.length;
        const pending = queue.queue_pending.length;
        queueBusy = running + pending > 0;
    } catch (_error) {
        queueBusy = true;
    }
    updateFreeButton();
    return queueBusy;
}

function updateFreeButton() {
    if (!freeButtonEl) return;
    const manualUnloadAllowed = getSettingValue(MANUAL_UNLOAD_SETTING, true) !== false;
    freeButtonEl.disabled = queueBusy || cleanupBusy || !manualUnloadAllowed;
    freeButtonEl.classList.toggle("deno-resource-cleaning", cleanupBusy);
    if (cleanupBusy) {
        freeButtonEl.title = "Unloading models and clearing execution cache…";
    } else if (queueBusy) {
        freeButtonEl.title = "Wait until the queue is idle.";
    } else if (!manualUnloadAllowed) {
        freeButtonEl.title = "Manual model unloading is disabled in ComfyUI settings.";
    } else {
        freeButtonEl.title = "Unload models and clear execution cache.";
    }
}

function showToast(severity, detail) {
    try {
        app?.extensionManager?.toast?.add?.({
            severity,
            summary: "DENO Resource Monitor",
            detail,
            life: 4200,
        });
    } catch (_error) {
        // The action remains fully usable on older frontends without toasts.
    }
}

async function freeModelsAndCache() {
    if (cleanupBusy) return;
    if (getSettingValue(MANUAL_UNLOAD_SETTING, true) === false) {
        updateFreeButton();
        showToast("warn", "Manual model unloading is disabled in ComfyUI settings.");
        return;
    }
    // Lock before the asynchronous preflight so a double click cannot dispatch twice.
    cleanupBusy = true;
    updateFreeButton();
    stopPolling();
    try {
        if (await readQueueBusy()) {
            showToast("warn", "Wait until the queue is idle before clearing memory.");
            return;
        }
        if (getSettingValue(MANUAL_UNLOAD_SETTING, true) === false) {
            showToast("warn", "Manual model unloading is disabled in ComfyUI settings.");
            return;
        }
        const response = await api.fetchApi("/free", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unload_models: true, free_memory: true }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // /free acknowledges a request; memory is released by the execution loop.
        // A standalone button must never start resource sampling for this toast.
        showToast("success", "Model and execution cache cleanup requested.");
    } catch (error) {
        showToast("error", `Memory cleanup failed: ${String(error?.message || error)}`);
    } finally {
        cleanupBusy = false;
        updateFreeButton();
        startPolling();
    }
}

function installRuntimeListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") stopPolling();
        else requestReconcile();
    });
    window.addEventListener("resize", requestReconcile);
    app?.ui?.settings?.addEventListener?.(`${MANUAL_UNLOAD_SETTING}.change`, updateFreeButton);
    api?.addEventListener?.("reconnected", () => {
        crystoolsState = { known: false, loaded: false };
        reconcileMonitor();
        void refreshCrystoolsDetection();
        if (cleanupEnabled) void readQueueBusy();
    });
    api?.addEventListener?.("execution_start", () => {
        queueBusy = true;
        updateFreeButton();
    });
    api?.addEventListener?.("execution_success", () => { if (cleanupEnabled) void readQueueBusy(); });
    api?.addEventListener?.("execution_interrupted", () => { if (cleanupEnabled) void readQueueBusy(); });
    api?.addEventListener?.("status", (event) => {
        const remaining = finiteNumber(event?.detail?.exec_info?.queue_remaining ?? event?.detail?.status?.exec_info?.queue_remaining);
        if (remaining === null) return;
        queueBusy = remaining > 0;
        updateFreeButton();
    });
}

async function detectCrystools() {
    if (document.getElementById(CRYSTOOLS_ROOT_ID)) return { known: true, loaded: true };
    try {
        const response = await api.fetchApi("/extensions", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const extensions = await response.json();
        if (!Array.isArray(extensions)) throw new Error("Invalid extension list");
        const loaded = extensions.some((path) => /\/extensions\/(?:comfyui-)?crystools\//i.test(String(path)));
        return { known: true, loaded };
    } catch (_error) {
        // Auto mode favors non-interference. An unknown result must not create
        // a duplicate bar on top of an existing Crystools installation.
        return { known: false, loaded: false };
    }
}

async function refreshCrystoolsDetection() {
    const revision = ++detectionRevision;
    detectionPending = true;
    const result = await detectCrystools();
    if (revision !== detectionRevision) return;
    detectionPending = false;
    crystoolsState = crystoolsState.loaded || document.getElementById(CRYSTOOLS_ROOT_ID)
        ? { known: true, loaded: true }
        : result;
    reconcileMonitor();
}

function isDenoNode(node) {
    return node?.nodeType === 1 && (node.id === ROOT_ID || Boolean(node.closest?.(`#${ROOT_ID}`)));
}

function visiblyRendered(element) {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0
        || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = window.getComputedStyle(ancestor);
        if (ancestor.hidden || style.display === "none" || style.visibility === "hidden"
            || style.visibility === "collapse" || style.opacity === "0") return false;
    }
    return true;
}

function existingCleanupVisible(scope = menuScope()) {
    if (!scope) return false;
    const candidates = scope.querySelectorAll('button, [role="button"], [data-command-id], [data-command]');
    for (const candidate of candidates) {
        if (isDenoNode(candidate)) continue;
        const command = candidate.getAttribute("data-command-id") || candidate.getAttribute("data-command");
        const tooltip = `${candidate.getAttribute("title") || ""} ${candidate.getAttribute("aria-label") || ""}`;
        const fullCleanup = command === CLEANUP_COMMAND
            || /free model and node cache|unload models and (?:clear )?(?:the )?execution cache/i.test(tooltip)
            || candidate.matches(".mdi-vacuum") || Boolean(candidate.querySelector(".mdi-vacuum"));
        // The outline icon only unloads models; it is not a full-cache counterpart.
        if (fullCleanup && visiblyRendered(candidate)) return true;
    }
    return false;
}

function requestReconcile() {
    if (!setupComplete || reconcileTimer !== null) return;
    attachAttempts = 0;
    reconcileTimer = window.setTimeout(() => {
        reconcileTimer = null;
        reconcileMonitor();
    }, 60);
}

function observeMenu() {
    const scope = menuScope();
    const ancestors = [];
    for (let element = scope?.parentElement; element; element = element.parentElement) {
        ancestors.push(element);
        if (element === document.body) break;
    }
    if (scope === observedScope && ancestors.length === observedAncestors.length
        && ancestors.every((element, index) => element === observedAncestors[index])) return;

    menuObserver?.disconnect();
    mountObserver?.disconnect();
    observedScope = scope;
    observedAncestors = ancestors;
    if (!scope) return;

    menuObserver = new MutationObserver((records) => {
        const relevant = records.some((record) => {
            if (isDenoNode(record.target) || record.target.closest?.(`#${CRYSTOOLS_ROOT_ID}`)) return false;
            if (record.type === "attributes") return true;
            return [...record.addedNodes, ...record.removedNodes]
                .some((node) => node.nodeType === 1 && (!isDenoNode(node)
                    || (node === rootEl && !node.isConnected && (metersEnabled || cleanupEnabled))));
        });
        if (relevant) requestReconcile();
    });
    menuObserver.observe(scope, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "title", "aria-label", "data-command-id", "data-command"],
    });

    // Watch only the ancestry's direct children, not the whole app subtree. This
    // catches menu replacement while ignoring canvas updates and meter text.
    mountObserver = new MutationObserver((records) => {
        const relevant = records.some((record) => record.type === "attributes"
            || [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1
                && (node === scope || node.contains(scope) || node.contains(app?.menu?.element)
                    || (node === rootEl && !node.isConnected && (metersEnabled || cleanupEnabled)))));
        if (relevant) requestReconcile();
    });
    for (const ancestor of ancestors) {
        mountObserver.observe(ancestor, {
            childList: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden"],
        });
    }
}

function destroyMonitor() {
    stopPolling();
    rootEl?.remove();
    rootEl = null;
    freeButtonEl = null;
    meterElements = new Map();
}

function reconcileMonitor() {
    if (!setupComplete) return;
    const force = meterMode === MODE_DENO;
    if (document.documentElement.classList.contains(FORCE_CLASS) !== force) {
        document.documentElement.classList.toggle(FORCE_CLASS, force);
    }
    if (document.getElementById(CRYSTOOLS_ROOT_ID)) crystoolsState = { known: true, loaded: true };
    observeMenu();
    const showMeters = force || (meterMode === MODE_AUTO && crystoolsState.known && !crystoolsState.loaded);
    const showCleanup = cleanupMode === CLEANUP_SHOW || (cleanupMode === MODE_AUTO && !existingCleanupVisible());
    const previouslyHadCleanup = cleanupEnabled;
    metersEnabled = showMeters;
    cleanupEnabled = showCleanup;
    if (!showMeters && !showCleanup) {
        destroyMonitor();
    } else {
        createRoot();
        if (showMeters) addMeters();
        else {
            stopPolling();
            for (const { meter } of meterElements.values()) meter.remove();
            meterElements.clear();
            rootEl.classList.remove("deno-resource-monitor-error");
            rootEl.removeAttribute("title");
        }
        if (showCleanup) addCleanupButton();
        else {
            freeButtonEl?.remove();
            freeButtonEl = null;
        }
        rootEl.setAttribute("aria-label", showMeters ? "DENO resource monitor" : "DENO memory cleanup");
        attachRoot();
        updateFreeButton();
        if (showCleanup && !previouslyHadCleanup) void readQueueBusy();
        startPolling();
    }
    if (!menuMountPoint() || (rootEl && !rootEl.isConnected)) scheduleAttach();
    else stopAttachRetries();
}

app.registerExtension({
    name: EXTENSION_NAME,
    settings: [
        {
            id: SETTING_MODE,
            name: "DENO resource monitor",
            category: ["DENO", "Tools", "Resource Monitor"],
            tooltip: "Auto keeps Crystools when loaded and shows DENO meters only when absent. DENO explicitly replaces its meters; Off hides DENO meters. The cleanup button has a separate setting.",
            type: "combo",
            options: [MODE_AUTO, MODE_DENO, MODE_OFF],
            defaultValue: MODE_AUTO,
            onChange(value) {
                meterMode = normalizedMode(value);
                reconcileMonitor();
                if (setupComplete && meterMode === MODE_AUTO && !crystoolsState.known && !detectionPending) {
                    void refreshCrystoolsDetection();
                }
            },
        },
        {
            id: SETTING_CLEANUP_MODE,
            name: "DENO memory cleanup button",
            category: ["DENO", "Tools", "Resource Monitor"],
            tooltip: "Auto adds a cleanup button only when no visible full model-and-cache cleanup button exists in the top bar. Show always adds DENO's button; Off hides it. Independent of resource meters.",
            type: "combo",
            options: [MODE_AUTO, CLEANUP_SHOW, MODE_OFF],
            defaultValue: MODE_AUTO,
            onChange(value) {
                cleanupMode = normalizedCleanupMode(value);
                reconcileMonitor();
            },
        },
    ],
    setup() {
        setupComplete = true;
        meterMode = normalizedMode();
        cleanupMode = normalizedCleanupMode();
        installRuntimeListeners();
        reconcileMonitor();
        void refreshCrystoolsDetection();
    },
});
