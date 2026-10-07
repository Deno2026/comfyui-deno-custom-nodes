import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "Deno.ResourceMonitor";
const SETTING_MODE = "DENO.ResourceMonitor.Mode";
const SETTING_CLEANUP_MODE = "DENO.ResourceMonitor.CleanupMode";
const SETTING_PLACEMENT = "DENO.ResourceMonitor.Placement";
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
const PLACEMENT_TOP = "Top";
const PLACEMENT_FLOATING = "Floating";
const FLOATING_CLASS = "deno-resource-floating";
const VERTICAL_CLASS = "deno-resource-vertical";
const DOCK_CUE_ID = "deno-resource-monitor-dock-cue";
const POSITION_STORAGE_KEY = "DENO.ResourceMonitor.FloatingPosition.v1";

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
let gripEl = null;
let rotateButtonEl = null;
let dockCueEl = null;
let placementMode = PLACEMENT_TOP;
let floatingPosition = null;
let floatingOrientation = "horizontal";
let dragSession = null;

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

function normalizedPlacement(value = getSettingValue(SETTING_PLACEMENT, PLACEMENT_TOP)) {
    return value === PLACEMENT_FLOATING ? PLACEMENT_FLOATING : PLACEMENT_TOP;
}

function localized(ko, en) {
    return String(getSettingValue("Comfy.Locale", "en")).toLowerCase().startsWith("ko") ? ko : en;
}

function readFloatingPosition() {
    try {
        const saved = JSON.parse(window.localStorage?.getItem(POSITION_STORAGE_KEY) || "null");
        if (saved?.version !== 1 || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
        floatingPosition = { x: saved.x, y: saved.y };
        floatingOrientation = saved.orientation === "vertical" ? "vertical" : "horizontal";
    } catch (_error) {
        // Private browsing and malformed saved coordinates must not hide the bar.
    }
}

function saveFloatingPosition() {
    if (!floatingPosition) return;
    try {
        window.localStorage?.setItem(POSITION_STORAGE_KEY, JSON.stringify({
            version: 1, ...floatingPosition, orientation: floatingOrientation,
        }));
    } catch (_error) {
        // Movement remains available when browser storage is disabled.
    }
}

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Horizontal meter appearance adapted from MIT-licensed Crystools 1.27.4.
    // Keep DENO selectors/lifecycle separate; see THIRD_PARTY_NOTICES.md.
    style.textContent = `
        #${ROOT_ID} {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
            gap: 5px;
            height: 30px;
            min-width: 0;
            font-family: inherit;
            line-height: normal;
            color: inherit;
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
            width: 60px;
            height: 30px;
            flex: 0 0 60px;
            overflow: hidden;
            border-radius: 0;
            background: var(--comfy-input-bg, #202024);
            cursor: crosshair;
        }
        #${ROOT_ID} .deno-resource-grip + .deno-resource-meter {
            border-top-left-radius: 4px;
            border-bottom-left-radius: 4px;
        }
        #${ROOT_ID} .deno-resource-meter:not(:has(~ .deno-resource-meter:not(.deno-resource-unavailable))) {
            border-top-right-radius: 4px;
            border-bottom-right-radius: 4px;
        }
        #${ROOT_ID} .deno-resource-fill {
            position: absolute;
            inset: 0 auto 0 0;
            width: 0%;
            background: var(--deno-resource-color);
            box-shadow: inset 2px 2px 10px rgba(0, 0, 0, 0.2);
            transition: width 0.5s;
        }
        #${ROOT_ID} .deno-resource-label,
        #${ROOT_ID} .deno-resource-value {
            position: absolute;
            z-index: 1;
            line-height: normal;
            pointer-events: none;
        }
        #${ROOT_ID} .deno-resource-label {
            left: 3px;
            bottom: 2px;
            font-size: 10px;
            font-weight: 100;
        }
        #${ROOT_ID} .deno-resource-value {
            top: 2px;
            right: 2px;
            width: 100%;
            text-align: right;
            font-size: 11px;
            font-weight: 500;
            color: var(--input-text, #ddd);
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
        #${ROOT_ID} .deno-resource-grip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 18px;
            width: 18px;
            height: 30px;
            padding: 0;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: var(--input-text, #ddd);
            opacity: 0.7;
            cursor: grab;
            touch-action: none;
        }
        #${ROOT_ID} .deno-resource-grip span {
            width: 10px;
            height: 15px;
            background: radial-gradient(circle, currentColor 1px, transparent 1.3px) 0 0 / 5px 5px;
            pointer-events: none;
        }
        #${ROOT_ID} .deno-resource-grip:hover,
        #${ROOT_ID} .deno-resource-grip:focus-visible {
            opacity: 1;
            background: var(--comfy-input-bg, #202024);
        }
        #${ROOT_ID} .deno-resource-grip:focus-visible {
            outline: 2px solid var(--p-primary-color, #0c86f4);
            outline-offset: 1px;
        }
        #${ROOT_ID}.deno-resource-dragging,
        #${ROOT_ID}.deno-resource-dragging .deno-resource-grip { cursor: grabbing; }
        #${ROOT_ID}.${FLOATING_CLASS} {
            z-index: 1300;
            max-width: calc(100vw - 16px);
            max-height: calc(100vh - 16px);
            overflow: auto;
            user-select: none;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            align-items: stretch;
            width: 44px;
            padding: 4px;
            gap: 3px;
            border-radius: 4px;
            box-shadow: none;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-grip {
            grid-column: 1 / -1;
            width: 100%;
            height: 14px;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-grip span {
            width: 15px;
            height: 10px;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-meter {
            grid-column: 1 / -1;
            width: 100%;
            height: 30px;
            border-radius: 0;
            background: transparent;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-meter::before {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 2px;
            border-radius: 2px;
            background: rgba(163, 166, 173, 0.18);
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-fill {
            inset: auto auto 0 0;
            height: 2px;
            border-radius: 2px;
            box-shadow: none;
            z-index: 1;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-label {
            top: 0;
            left: 0;
            right: 0;
            bottom: auto;
            font-size: 8px;
            font-weight: 500;
            line-height: 10px;
            letter-spacing: 0.04em;
            text-align: center;
            text-transform: uppercase;
            opacity: 0.74;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-value {
            top: 11px;
            left: 0;
            right: 0;
            width: 100%;
            font-size: 12px;
            font-weight: 600;
            line-height: 14px;
            text-align: center;
            font-variant-numeric: tabular-nums;
            display: flex;
            justify-content: center;
            align-items: baseline;
            gap: 1px;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-number {
            font: inherit;
            line-height: 14px;
            font-variant-numeric: inherit;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-unit {
            font-size: 8px;
            font-weight: 400;
            line-height: 12px;
            opacity: 0.70;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-unit:empty { display: none; }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-free,
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-rotate {
            grid-column: 1 / -1;
            justify-self: center;
            width: 28px;
            height: 26px;
            margin-top: 0;
            border-color: transparent;
            background: transparent;
        }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-free .mdi,
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-rotate .mdi { font-size: 16px; }
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-free:hover:not(:disabled),
        #${ROOT_ID}.${VERTICAL_CLASS} .deno-resource-rotate:hover {
            background: var(--comfy-input-bg, #202024);
        }
        #${ROOT_ID} .deno-resource-rotate {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 30px;
            width: 30px;
            height: 30px;
            padding: 0;
            border: 1px solid rgba(232, 230, 225, 0.24);
            border-radius: 4px;
            background: var(--comfy-input-bg, #202024);
            color: var(--input-text, #ddd);
            cursor: pointer;
        }
        #${ROOT_ID} .deno-resource-rotate .mdi { font-size: 18px; }
        #${ROOT_ID} .deno-resource-rotate[hidden] { display: none; }
        #${ROOT_ID} .deno-resource-rotate:hover,
        #${ROOT_ID} .deno-resource-rotate:focus-visible {
            border-color: var(--p-primary-color, #0c86f4);
            outline: none;
        }
        #${DOCK_CUE_ID} {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            min-height: 30px;
            box-sizing: border-box;
            border: 2px dashed var(--p-primary-color, #0c86f4);
            border-radius: 6px;
            color: var(--input-text, #ddd);
            font-family: inherit;
            font-size: 12px;
            white-space: nowrap;
            pointer-events: none;
            z-index: 1299;
        }
        #${DOCK_CUE_ID}.deno-resource-dock-active {
            background: color-mix(in srgb, var(--p-primary-color, #0c86f4) 22%, var(--comfy-menu-bg, #202024));
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-primary-color, #0c86f4) 35%, transparent);
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
    const valueEl = makeElement("span", "deno-resource-value");
    const numberEl = makeElement("span", "deno-resource-number", "--");
    const unitEl = makeElement("span", "deno-resource-unit");
    valueEl.append(numberEl, unitEl);
    meter.append(fill, labelEl, valueEl);
    meterElements.set(key, { meter, fill, valueEl, numberEl, unitEl });
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
    gripEl = makeElement("button", "deno-resource-grip");
    gripEl.type = "button";
    const dots = makeElement("span");
    dots.setAttribute("aria-hidden", "true");
    gripEl.appendChild(dots);
    gripEl.addEventListener("pointerdown", beginDrag);
    gripEl.addEventListener("keydown", handleGripKey);
    gripEl.addEventListener("lostpointercapture", cancelDrag);
    rootEl.appendChild(gripEl);
    rotateButtonEl = makeElement("button", "deno-resource-rotate");
    rotateButtonEl.type = "button";
    const rotateIcon = makeElement("i", "mdi mdi-rotate-right");
    rotateIcon.setAttribute("aria-hidden", "true");
    rotateButtonEl.appendChild(rotateIcon);
    rotateButtonEl.addEventListener("click", rotateFloatingLayout);
    rootEl.appendChild(rotateButtonEl);
    updatePlacementControls();
    return rootEl;
}

function addMeters() {
    if (meterElements.size) return;
    const fragment = document.createDocumentFragment();
    fragment.append(
        createMeter("cpu", "CPU", "#0AA015"),
        createMeter("ram", "RAM", "#07630D"),
        createMeter("gpu", "GPU", "#0C86F4"),
        createMeter("vram", "VRAM", "#176EC7"),
        createMeter("temperature", "Temp", "#00ff00"),
    );
    rootEl.insertBefore(fragment, freeButtonEl || rotateButtonEl);
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
    rootEl.insertBefore(freeButtonEl, rotateButtonEl);
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

function updatePlacementControls() {
    const floating = placementMode === PLACEMENT_FLOATING || Boolean(dragSession?.started);
    rootEl?.classList.toggle(FLOATING_CLASS, floating);
    rootEl?.classList.toggle(VERTICAL_CLASS, floating && floatingOrientation === "vertical");
    if (gripEl) {
        gripEl.setAttribute("aria-label", localized("리소스 모니터 이동", "Move resource monitor"));
        gripEl.setAttribute("aria-pressed", String(floating));
        gripEl.title = floating
            ? localized("끌어서 이동 · Enter로 상단에 고정", "Drag to move · Enter to dock to top")
            : localized("끌어서 이동 · Enter로 분리", "Drag to move · Enter to float");
    }
    if (rotateButtonEl) {
        rotateButtonEl.hidden = !floating;
        rotateButtonEl.title = localized("가로·세로 전환", "Rotate layout 90°");
        rotateButtonEl.setAttribute("aria-label", rotateButtonEl.title);
        rotateButtonEl.setAttribute("aria-pressed", String(floatingOrientation === "vertical"));
    }
}

function applyFloatingPosition() {
    if (!rootEl) return;
    rootEl.classList.add(DETACHED_CLASS);
    updatePlacementControls();
    if (rootEl.parentElement !== document.body) document.body.appendChild(rootEl);
    rootEl.style.removeProperty("right");
    if (!floatingPosition) floatingPosition = { x: Math.max(8, window.innerWidth - 400), y: 100 };
    rootEl.style.left = `${floatingPosition.x}px`;
    rootEl.style.top = `${floatingPosition.y}px`;
    const rect = rootEl.getBoundingClientRect();
    floatingPosition = {
        x: Math.min(Math.max(8, window.innerWidth - rect.width - 8), Math.max(8, floatingPosition.x)),
        y: Math.min(Math.max(8, window.innerHeight - rect.height - 8), Math.max(8, floatingPosition.y)),
    };
    rootEl.style.left = `${floatingPosition.x}px`;
    rootEl.style.top = `${floatingPosition.y}px`;
}

function setPlacement(value, position = null) {
    placementMode = normalizedPlacement(value);
    if (position) floatingPosition = { ...position };
    updatePlacementControls();
    attachRoot();
    if (placementMode === PLACEMENT_FLOATING) saveFloatingPosition();
    try {
        const settings = app?.ui?.settings;
        if (getSettingValue(SETTING_PLACEMENT, PLACEMENT_TOP) !== placementMode) {
            // Set our state first: ComfyUI may synchronously call onChange.
            const result = settings?.setSettingValue?.(SETTING_PLACEMENT, placementMode);
            result?.catch?.(() => {});
        }
    } catch (_error) {
        // Older frontends without a writable settings API still support movement.
    }
}

function updateDockCue() {
    if (!dragSession?.started || !rootEl) return;
    const mount = menuMountPoint();
    const scope = menuScope();
    if (!mount || !scope || !visiblyRendered(scope)) {
        dockCueEl?.remove();
        dragSession.dock = false;
        return;
    }
    if (!dockCueEl) {
        dockCueEl = makeElement("div");
        dockCueEl.id = DOCK_CUE_ID;
        dockCueEl.setAttribute("aria-hidden", "true");
    }
    dockCueEl.textContent = localized("상단에 고정", "Dock to top");
    const meterCount = [...meterElements.values()]
        .filter(({ meter }) => !meter.classList.contains("deno-resource-unavailable")).length;
    const controlCount = 1 + meterCount + (freeButtonEl ? 1 : 0);
    const width = Math.max(90, 18 + meterCount * 60 + (freeButtonEl ? 30 : 0) + (controlCount - 1) * 5);
    dockCueEl.style.width = `${Math.min(width, Math.max(90, window.innerWidth - 24))}px`;
    dockCueEl.style.removeProperty("position");
    dockCueEl.style.removeProperty("top");
    dockCueEl.style.removeProperty("right");
    if (dockCueEl.parentElement !== mount.parent) mount.parent.insertBefore(dockCueEl, mount.before);
    const cluster = scope.closest(".flex.items-start.gap-2") || scope;
    const clusterRect = cluster.getBoundingClientRect();
    const breadcrumb = document.querySelector(".subgraph-breadcrumb");
    const leftBoundary = Math.max(72, ...Array.from(breadcrumb?.children || [])
        .filter(visiblyRendered).map((element) => element.getBoundingClientRect().right + 12));
    if (window.innerWidth < DETACHED_VIEWPORT_WIDTH || clusterRect.right > window.innerWidth - 4
        || clusterRect.left < leftBoundary) {
        document.body.appendChild(dockCueEl);
        const rect = scope.getBoundingClientRect();
        dockCueEl.style.position = "fixed";
        dockCueEl.style.top = `${Math.max(12, rect.bottom + 12)}px`;
        dockCueEl.style.right = `${Math.max(12, window.innerWidth - Math.min(rect.right, window.innerWidth - 12))}px`;
    }
    updateDockHighlight(dragSession.lastX, dragSession.lastY);
}

function updateDockHighlight(x, y) {
    if (!dragSession) return;
    const rect = dockCueEl?.isConnected ? dockCueEl.getBoundingClientRect() : null;
    dragSession.dock = Boolean(rect && rect.width > 0 && x >= rect.left - 20 && x <= rect.right + 20
        && y >= rect.top - 20 && y <= rect.bottom + 20);
    dockCueEl?.classList.toggle("deno-resource-dock-active", dragSession.dock);
}

function beginDrag(event) {
    if (event.button !== 0 || event.isPrimary === false || dragSession || !rootEl) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const rect = rootEl.getBoundingClientRect();
    dragSession = {
        pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        lastX: event.clientX, lastY: event.clientY, x: rect.left, y: rect.top,
        placement: placementMode, position: floatingPosition ? { ...floatingPosition } : null,
        started: false, dock: false,
    };
    window.addEventListener("pointermove", moveDrag, true);
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", cancelDrag, true);
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("keydown", cancelDragKey, true);
}

function moveDrag(event) {
    const session = dragSession;
    if (!session || event.pointerId !== session.pointerId) return;
    session.lastX = event.clientX;
    session.lastY = event.clientY;
    if (!session.started && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 4) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!session.started) {
        session.started = true;
        floatingPosition = { x: session.x, y: session.y };
        // Reparent before capture: moving a captured node can lose its capture.
        applyFloatingPosition();
        rootEl.classList.add("deno-resource-dragging");
        try { gripEl?.setPointerCapture?.(session.pointerId); } catch (_error) { /* Window listeners remain active. */ }
        updateDockCue();
    }
    floatingPosition = { x: session.x + event.clientX - session.startX, y: session.y + event.clientY - session.startY };
    applyFloatingPosition();
    updateDockHighlight(event.clientX, event.clientY);
}

function clearDrag() {
    const session = dragSession;
    dragSession = null;
    window.removeEventListener("pointermove", moveDrag, true);
    window.removeEventListener("pointerup", finishDrag, true);
    window.removeEventListener("pointercancel", cancelDrag, true);
    window.removeEventListener("blur", cancelDrag);
    window.removeEventListener("keydown", cancelDragKey, true);
    rootEl?.classList.remove("deno-resource-dragging");
    dockCueEl?.remove();
    dockCueEl = null;
    // Clear the session first so the resulting lostpointercapture cannot cancel a completed move.
    try { if (session) gripEl?.releasePointerCapture?.(session.pointerId); } catch (_error) { /* Capture may already be lost. */ }
    return session;
}

function finishDrag(event) {
    if (!dragSession || event.pointerId !== dragSession.pointerId) return;
    if (dragSession.started) moveDrag(event);
    const session = clearDrag();
    if (!session?.started) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    setPlacement(session.dock ? PLACEMENT_TOP : PLACEMENT_FLOATING);
}

function cancelDrag(event) {
    if (!dragSession || (event?.pointerId !== undefined && event.pointerId !== dragSession.pointerId)) return;
    const session = clearDrag();
    floatingPosition = session.position;
    placementMode = session.placement;
    updatePlacementControls();
    attachRoot();
}

function cancelDragKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault?.();
    event.stopPropagation?.();
    cancelDrag();
}

function handleGripKey(event) {
    if (dragSession || !rootEl) return;
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault?.();
        event.stopPropagation?.();
        const rect = rootEl.getBoundingClientRect();
        setPlacement(placementMode === PLACEMENT_FLOATING ? PLACEMENT_TOP : PLACEMENT_FLOATING,
            placementMode === PLACEMENT_FLOATING ? null : { x: rect.left, y: rect.top });
        gripEl?.focus?.({ preventScroll: true });
        return;
    }
    if (placementMode !== PLACEMENT_FLOATING || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const step = event.shiftKey ? 30 : 10;
    floatingPosition.x += event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    floatingPosition.y += event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    applyFloatingPosition();
    saveFloatingPosition();
}

function rotateFloatingLayout() {
    if (placementMode !== PLACEMENT_FLOATING || dragSession) return;
    floatingOrientation = floatingOrientation === "vertical" ? "horizontal" : "vertical";
    applyFloatingPosition();
    saveFloatingPosition();
}

function attachRoot() {
    if (!rootEl) return false;
    // User placement takes priority over responsive mounting and menu observers.
    if (placementMode === PLACEMENT_FLOATING || dragSession?.started) {
        applyFloatingPosition();
        if (dragSession?.started) updateDockCue();
        return true;
    }
    updatePlacementControls();
    rootEl.style.removeProperty("left");
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
    refs.fill.style.width = `${available ? Math.floor(percent) : 0}%`;
    if (key === "temperature") {
        refs.fill.style.backgroundColor = `color-mix(in srgb, #ff0000 ${available ? percent : 0}%, #00ff00)`;
    }
    const numberText = available ? String(Math.floor(displayValue)) : "--";
    const unitText = available ? options.symbol || "%" : "";
    if (refs.numberEl.textContent !== numberText) refs.numberEl.textContent = numberText;
    if (refs.unitEl.textContent !== unitText) refs.unitEl.textContent = unitText;
    refs.meter.title = title || "Metric unavailable";
    if (available) {
        refs.meter.setAttribute("aria-valuenow", String(Math.floor(percent)));
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
    setMeter("cpu", cpuPercent, cpuPercent === null ? "CPU usage unavailable" : `CPU ${Math.floor(cpuPercent)}%`);
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
            ? `${gpuName} ${Math.floor(finiteNumber(gpu.temperature))}°C`
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
    return node?.nodeType === 1 && (node.id === ROOT_ID || node.id === DOCK_CUE_ID
        || Boolean(node.closest?.(`#${ROOT_ID}, #${DOCK_CUE_ID}`)));
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
    const session = clearDrag();
    if (session) {
        floatingPosition = session.position;
        placementMode = session.placement;
    }
    rootEl?.remove();
    rootEl = null;
    freeButtonEl = null;
    gripEl = null;
    rotateButtonEl = null;
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
    // Without Crystools, the complete DENO bar is the default even if another
    // extension also provides cleanup. Never remove or replace that control.
    const noCrystools = crystoolsState.known && !crystoolsState.loaded;
    const showCleanup = cleanupMode === CLEANUP_SHOW
        || (cleanupMode === MODE_AUTO && (noCrystools || !existingCleanupVisible()));
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
    if ((placementMode !== PLACEMENT_FLOATING && !menuMountPoint()) || (rootEl && !rootEl.isConnected)) scheduleAttach();
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
            tooltip: "Auto shows DENO cleanup when Crystools is absent. With Crystools loaded, it adds the button only when no visible full-cleanup button exists. Existing buttons are left unchanged. Show always adds DENO's button; Off hides it.",
            type: "combo",
            options: [MODE_AUTO, CLEANUP_SHOW, MODE_OFF],
            defaultValue: MODE_AUTO,
            onChange(value) {
                cleanupMode = normalizedCleanupMode(value);
                reconcileMonitor();
            },
        },
        {
            id: SETTING_PLACEMENT,
            name: "DENO resource monitor placement",
            category: ["DENO", "Tools", "Resource Monitor"],
            tooltip: "Top follows the responsive toolbar layout. Floating lets you drag the monitor freely; drag it to the highlighted top dock to attach it again.",
            type: "combo",
            options: [PLACEMENT_TOP, PLACEMENT_FLOATING],
            defaultValue: PLACEMENT_TOP,
            onChange(value) {
                const next = normalizedPlacement(value);
                if (next === placementMode) return;
                cancelDrag();
                const rect = rootEl?.getBoundingClientRect();
                setPlacement(next, next === PLACEMENT_FLOATING && rect ? { x: rect.left, y: rect.top } : null);
            },
        },
    ],
    setup() {
        setupComplete = true;
        meterMode = normalizedMode();
        cleanupMode = normalizedCleanupMode();
        placementMode = normalizedPlacement();
        readFloatingPosition();
        installRuntimeListeners();
        reconcileMonitor();
        void refreshCrystoolsDetection();
    },
});
