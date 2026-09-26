import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "Deno.ResourceMonitor";
const SETTING_MODE = "DENO.ResourceMonitor.Mode";
const MANUAL_UNLOAD_SETTING = "Comfy.Memory.AllowManualUnload";
const ROOT_ID = "deno-resource-monitor-root";
const STYLE_ID = "deno-resource-monitor-style";
const FORCE_CLASS = "deno-resource-monitor-force";
const REFRESH_MS = 1000;
const CRYSTOOLS_ROOT_ID = "crystools-monitors-root";
const MODE_AUTO = "Auto";
const MODE_DENO = "DENO";
const MODE_OFF = "Off";

let rootEl = null;
let freeButtonEl = null;
let pollTimer = null;
let pollRevision = 0;
let attachTimer = null;
let activeRequest = null;
let reconcileRevision = 0;
let lastSnapshot = null;
let queueBusy = false;
let cleanupBusy = false;
let listenersInstalled = false;
let meterElements = new Map();

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
        @media (max-width: 760px) {
            #${ROOT_ID} .deno-resource-meter[data-key="cpu"],
            #${ROOT_ID} .deno-resource-meter[data-key="ram"] { display: none; }
        }
        @media (max-width: 600px) {
            #${ROOT_ID} .deno-resource-meter[data-key="gpu"] { display: none; }
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
    const icon = makeElement("i", "mdi mdi-vacuum-outline");
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
    rootEl.append(
        createMeter("cpu", "CPU", "#83a67a"),
        createMeter("ram", "RAM", "#47b95d"),
        createMeter("gpu", "GPU", "#3f91e8"),
        createMeter("vram", "VRAM", "#596fe1"),
        createMeter("temperature", "Temp", "#3abf78"),
    );

    freeButtonEl = makeElement("button", "deno-resource-free");
    freeButtonEl.type = "button";
    freeButtonEl.setAttribute("aria-label", "Unload models and clear execution cache");
    freeButtonEl.appendChild(cleanupIcon());
    freeButtonEl.addEventListener("click", freeModelsAndCache);
    rootEl.appendChild(freeButtonEl);
    updateFreeButton();
    return rootEl;
}

function attachRoot() {
    const root = createRoot();
    if (root.parentElement) return true;

    const menu = app?.menu?.element;
    const settingsGroup = app?.menu?.settingsGroup?.element;
    if (menu && settingsGroup?.parentElement === menu) {
        menu.insertBefore(root, settingsGroup);
        return true;
    }
    if (app?.menu?.actionsGroup?.element) {
        app.menu.actionsGroup.element.appendChild(root);
        return true;
    }
    return false;
}

function scheduleAttach(attempt = 0) {
    if (attachRoot() || attempt >= 40) return;
    window.clearTimeout(attachTimer);
    attachTimer = window.setTimeout(() => scheduleAttach(attempt + 1), 100);
}

function clampedPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function bytesToGiB(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number / (1024 ** 3) : null;
}

function setMeter(key, value, title, options = {}) {
    const refs = meterElements.get(key);
    if (!refs) return;
    const percent = clampedPercent(value);
    const available = percent !== null;
    refs.meter.classList.toggle("deno-resource-unavailable", !available && options.hideWhenUnavailable === true);
    refs.fill.style.width = `${available ? percent : 0}%`;
    refs.valueEl.textContent = available
        ? `${Math.round(percent)}${options.symbol || "%"}`
        : "--";
    refs.meter.title = title || "Metric unavailable";
    if (available) {
        refs.meter.setAttribute("aria-valuenow", String(Math.round(percent)));
        refs.meter.setAttribute("aria-valuetext", refs.valueEl.textContent);
    } else {
        refs.meter.removeAttribute("aria-valuenow");
        refs.meter.setAttribute("aria-valuetext", "Unavailable");
    }
}

function primaryGpu(snapshot) {
    const gpus = Array.isArray(snapshot?.gpus) ? snapshot.gpus : [];
    return gpus.find((gpu) => Number(gpu?.index) === 0) || gpus[0] || null;
}

function updateSnapshot(snapshot) {
    lastSnapshot = snapshot;
    const ramUsed = bytesToGiB(snapshot?.ram_used);
    const ramTotal = bytesToGiB(snapshot?.ram_total);
    setMeter("cpu", snapshot?.cpu_percent, `CPU ${Math.round(Number(snapshot?.cpu_percent) || 0)}%`);
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
        Number.isFinite(Number(gpu?.temperature))
            ? `${gpuName} ${Math.round(Number(gpu.temperature))}°C`
            : `${gpuName} temperature unavailable`,
        { symbol: "°", hideWhenUnavailable: true },
    );
}

async function fetchSnapshot() {
    if (!rootEl || document.visibilityState === "hidden") return null;
    if (!rootEl.parentElement) scheduleAttach();
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
        rootEl?.classList.remove("deno-resource-monitor-error");
        rootEl?.removeAttribute("title");
        updateSnapshot(snapshot);
        return snapshot;
    } catch (error) {
        if (error?.name !== "AbortError") {
            rootEl?.classList.add("deno-resource-monitor-error");
            if (rootEl) rootEl.title = "Resource readings are temporarily unavailable.";
        }
        return null;
    } finally {
        if (activeRequest === controller) activeRequest = null;
    }
}

function stopPolling() {
    pollRevision += 1;
    if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
    }
    activeRequest?.abort?.();
    activeRequest = null;
}

function startPolling() {
    stopPolling();
    if (document.visibilityState === "hidden") return;
    const revision = pollRevision;
    const poll = async () => {
        await fetchSnapshot();
        if (revision !== pollRevision || !rootEl || document.visibilityState === "hidden") return;
        pollTimer = window.setTimeout(poll, REFRESH_MS);
    };
    void poll();
}

async function readQueueBusy() {
    try {
        const response = await api.fetchApi("/queue", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const queue = await response.json();
        const running = Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0;
        const pending = Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0;
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

function currentVramUsed(snapshot = lastSnapshot) {
    const value = Number(primaryGpu(snapshot)?.vram_used);
    return Number.isFinite(value) ? value : null;
}

function cleanupResultText(before, after) {
    if (before === null || after === null) return "Memory cleanup request completed.";
    const beforeGiB = bytesToGiB(before);
    const afterGiB = bytesToGiB(after);
    const freedGiB = bytesToGiB(Math.max(0, before - after));
    return `VRAM ${beforeGiB.toFixed(1)} → ${afterGiB.toFixed(1)} GiB (${freedGiB.toFixed(1)} GiB freed)`;
}

async function freeModelsAndCache() {
    if (getSettingValue(MANUAL_UNLOAD_SETTING, true) === false) {
        updateFreeButton();
        showToast("warn", "Manual model unloading is disabled in ComfyUI settings.");
        return;
    }
    if (cleanupBusy || await readQueueBusy()) {
        showToast("warn", "Wait until the queue is idle before clearing memory.");
        return;
    }

    cleanupBusy = true;
    updateFreeButton();
    stopPolling();
    const before = currentVramUsed();
    try {
        const response = await api.fetchApi("/free", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unload_models: true, free_memory: true }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const afterSnapshot = await fetchSnapshot();
        showToast("success", cleanupResultText(before, currentVramUsed(afterSnapshot)));
    } catch (error) {
        showToast("error", `Memory cleanup failed: ${String(error?.message || error)}`);
    } finally {
        cleanupBusy = false;
        await readQueueBusy();
        updateFreeButton();
        if (rootEl && document.visibilityState !== "hidden") startPolling();
    }
}

function installRuntimeListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("visibilitychange", () => {
        if (!rootEl) return;
        if (document.visibilityState === "hidden") stopPolling();
        else startPolling();
    });
    api?.addEventListener?.("execution_start", () => {
        queueBusy = true;
        updateFreeButton();
    });
    api?.addEventListener?.("execution_success", () => void readQueueBusy());
    api?.addEventListener?.("execution_interrupted", () => void readQueueBusy());
    api?.addEventListener?.("status", (event) => {
        const remaining = Number(event?.detail?.exec_info?.queue_remaining ?? event?.detail?.status?.exec_info?.queue_remaining);
        if (!Number.isFinite(remaining)) return;
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

function destroyMonitor() {
    stopPolling();
    window.clearTimeout(attachTimer);
    attachTimer = null;
    rootEl?.remove();
    rootEl = null;
    freeButtonEl = null;
    meterElements = new Map();
    lastSnapshot = null;
}

async function reconcileMonitor(value) {
    const revision = ++reconcileRevision;
    const mode = normalizedMode(value);
    document.documentElement.classList.toggle(FORCE_CLASS, mode === MODE_DENO);

    if (mode === MODE_OFF) {
        destroyMonitor();
        return;
    }

    if (mode === MODE_AUTO) {
        const crystools = await detectCrystools();
        if (revision !== reconcileRevision) return;
        if (!crystools.known || crystools.loaded) {
            destroyMonitor();
            return;
        }
    }

    installRuntimeListeners();
    scheduleAttach();
    await readQueueBusy();
    startPolling();
}

app.registerExtension({
    name: EXTENSION_NAME,
    settings: [
        {
            id: SETTING_MODE,
            name: "DENO resource monitor",
            category: ["DENO", "Tools", "Resource Monitor"],
            tooltip: "Auto uses Crystools when it is loaded and shows DENO only when Crystools is absent. DENO forces this bar; Off hides it.",
            type: "combo",
            options: [MODE_AUTO, MODE_DENO, MODE_OFF],
            defaultValue: MODE_AUTO,
            onChange: reconcileMonitor,
        },
    ],
    setup() {
        queueMicrotask(() => void reconcileMonitor());
    },
});
