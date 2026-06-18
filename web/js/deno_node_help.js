import { app } from "../../scripts/app.js";

const DENO_HELP_EXTENSION = "Deno.NodeHelp";
const HELP_CLASS = "deno-node-help-popup";
const HELP_BUTTON_CLASS = "deno-node-help-button";
const HELP_ICON_SIZE = 15;
const HELP_ICON_MARGIN = 7;
const UPDATE_BADGE_RADIUS = 5;
const UPDATE_BADGE_OFFSET_X = 6;
const UPDATE_BADGE_OFFSET_Y = -5;
const REGISTRY_INSTALL_URL = "https://api.comfy.org/nodes/deno-custom-nodes/install";
const CHANGELOG_URL = "https://raw.githubusercontent.com/Deno2026/comfyui-deno-custom-nodes/main/CHANGELOG.md";
const RELEASE_BASE_URL = "https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/tag";
const VERSION_CACHE_KEY = "denoCustomNodes.versionStatus.v2";
const VERSION_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_RELEASE_NOTES = 4;

const nodeHelpDescriptions = new Map();
const popupState = new Map();
let versionStatusPromise = null;
let canvasHelpCursorTicket = 0;
let denoVersionStatus = {
    status: "unknown",
    current_version: "",
    latest_version: "",
    update_available: false,
    message: "Version check unavailable.",
    release_notes: [],
    release_url: "",
};

function isDenoNode(nodeData) {
    const category = String(nodeData?.category || "");
    const displayName = String(nodeData?.display_name || "");
    return category.startsWith("Deno/") || displayName.startsWith("(Deno");
}

function getNodeKey(node) {
    return String(node?.id ?? node?.type ?? node?.comfyClass ?? "");
}

function getNodeDescription(node) {
    return nodeHelpDescriptions.get(node?.comfyClass) || nodeHelpDescriptions.get(node?.type) || "";
}

function parseCurrentVersion(description) {
    const match = String(description || "").match(/DENO Custom Nodes v([0-9]+(?:\.[0-9]+){1,3})/);
    return match ? match[1] : "";
}

function compareVersions(left, right) {
    const a = String(left || "").split(".").map((part) => Number.parseInt(part, 10));
    const b = String(right || "").split(".").map((part) => Number.parseInt(part, 10));
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const av = Number.isFinite(a[index]) ? a[index] : 0;
        const bv = Number.isFinite(b[index]) ? b[index] : 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function normalizeVersion(version) {
    return String(version || "").trim().replace(/^v/i, "");
}

function releaseUrl(version) {
    const normalized = normalizeVersion(version);
    return normalized ? `${RELEASE_BASE_URL}/v${normalized}` : "https://github.com/Deno2026/comfyui-deno-custom-nodes/releases";
}

function latestVersionFromRegistryPayload(payload) {
    return String(
        payload?.version
        || payload?.latest_version?.version
        || payload?.node_version?.version
        || ""
    );
}

function parseChangelogNotes(markdown, version) {
    const wanted = normalizeVersion(version);
    if (!wanted) return [];

    const notes = [];
    let inSection = false;
    for (const rawLine of String(markdown || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        const heading = line.match(/^##\s+v?([0-9]+(?:\.[0-9]+){1,3})(?:\s+|$)/i);
        if (heading) {
            if (inSection) break;
            inSection = normalizeVersion(heading[1]) === wanted;
            continue;
        }
        if (!inSection) continue;
        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet?.[1]) {
            notes.push(bullet[1].trim());
        }
        if (notes.length >= MAX_RELEASE_NOTES) {
            break;
        }
    }
    return notes;
}

async function fetchReleaseNotes(version) {
    try {
        const response = await fetch(`${CHANGELOG_URL}?t=${Date.now()}`, {
            method: "GET",
            headers: { "Accept": "text/plain" },
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`GitHub returned HTTP ${response.status}`);
        }
        return parseChangelogNotes(await response.text(), version);
    } catch (_error) {
        return [];
    }
}

function setCurrentVersionFromDescription(description) {
    const current = parseCurrentVersion(description);
    if (current && !denoVersionStatus.current_version) {
        denoVersionStatus = { ...denoVersionStatus, current_version: current };
    }
}

function loadCachedVersionStatus(currentVersion) {
    try {
        const cached = JSON.parse(localStorage.getItem(VERSION_CACHE_KEY) || "null");
        if (!cached || cached.current_version !== currentVersion) return null;
        if ((Date.now() - Number(cached.checked_at || 0)) > VERSION_CACHE_MS) return null;
        return cached;
    } catch (_error) {
        return null;
    }
}

function saveCachedVersionStatus(status) {
    try {
        localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify({ ...status, checked_at: Date.now() }));
    } catch (_error) {
        // Cache failure should never affect the node UI.
    }
}

function markVersionStatus(status) {
    denoVersionStatus = { ...denoVersionStatus, ...status };
    updateAllDomHelpButtons();
    updateOpenVersionCards();
    app.graph?.setDirtyCanvas?.(true, true);
}

async function refreshDenoVersionStatus() {
    if (versionStatusPromise) return versionStatusPromise;

    const currentVersion = denoVersionStatus.current_version;
    if (!currentVersion) return null;

    const cached = loadCachedVersionStatus(currentVersion);
    if (cached) {
        markVersionStatus(cached);
        return cached;
    }

    versionStatusPromise = (async () => {
        try {
            const response = await fetch(REGISTRY_INSTALL_URL, {
                method: "GET",
                headers: { "Accept": "application/json" },
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`Comfy Registry returned HTTP ${response.status}`);
            }
            const payload = await response.json();
            const latestVersion = latestVersionFromRegistryPayload(payload) || currentVersion;
            const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
            const releaseNotes = updateAvailable ? await fetchReleaseNotes(latestVersion) : [];
            const status = {
                status: updateAvailable ? "update_available" : "latest",
                current_version: currentVersion,
                latest_version: latestVersion,
                update_available: updateAvailable,
                release_notes: releaseNotes,
                release_url: releaseUrl(latestVersion),
                message: updateAvailable
                    ? `Update available: v${currentVersion} -> v${latestVersion}`
                    : `Latest version: v${currentVersion}`,
            };
            saveCachedVersionStatus(status);
            markVersionStatus(status);
            return status;
        } catch (error) {
            const status = {
                status: "unknown",
                current_version: currentVersion,
                latest_version: "",
                update_available: false,
                release_notes: [],
                release_url: "",
                message: `Version check unavailable: ${String(error?.message || error || "network error")}`,
            };
            markVersionStatus(status);
            return status;
        } finally {
            versionStatusPromise = null;
        }
    })();

    return versionStatusPromise;
}

function versionVisualState() {
    if (denoVersionStatus.update_available) {
        return {
            label: "i",
            badgeLabel: "!",
            className: "deno-node-update-available",
            title: denoVersionStatus.message || "Update available",
            fill: "rgba(134, 92, 0, 0.98)",
            stroke: "rgba(255, 214, 74, 0.95)",
            color: "#fff5bf",
            badgeFill: "#ffd64a",
            badgeStroke: "rgba(38, 24, 0, 0.96)",
            badgeColor: "#171000",
        };
    }
    if (denoVersionStatus.status === "latest") {
        return {
            label: "i",
            badgeLabel: "",
            className: "deno-node-latest",
            title: denoVersionStatus.message || "Latest version",
            fill: "rgba(10, 65, 28, 0.96)",
            stroke: "rgba(72, 255, 132, 0.86)",
            color: "#dfffea",
        };
    }
    return {
        label: "i",
        badgeLabel: "",
        className: "deno-node-status-unknown",
        title: denoVersionStatus.message || "Version check unavailable.",
        fill: "rgba(10, 65, 28, 0.92)",
        stroke: "rgba(72, 255, 132, 0.62)",
        color: "#dfffea",
    };
}

function applyVersionButtonState(button) {
    if (!button) return;
    const visual = versionVisualState();
    button.textContent = visual.label;
    button.classList.remove("deno-node-update-available", "deno-node-latest", "deno-node-status-unknown");
    button.classList.add(visual.className);
    button.setAttribute("aria-label", visual.title);
    button.removeAttribute("title");
}

function updateAllDomHelpButtons() {
    document.querySelectorAll(`.${HELP_BUTTON_CLASS}`).forEach(applyVersionButtonState);
}

function updateOpenVersionCards() {
    document.querySelectorAll(".deno-node-help-release").forEach((card) => {
        card.replaceWith(createVersionCard());
    });
}

function ensureHelpStyles() {
    if (document.getElementById("deno-node-help-style")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "deno-node-help-style";
    style.textContent = `
        .${HELP_CLASS} {
            position: absolute;
            z-index: 10020;
            width: min(430px, calc(100vw - 32px));
            max-height: min(540px, calc(100vh - 32px));
            box-sizing: border-box;
            padding: 12px 13px 13px;
            border-radius: 12px;
            border: 1px solid rgba(72, 255, 132, 0.48);
            background: linear-gradient(180deg, rgba(3, 12, 8, 0.98), rgba(1, 6, 4, 0.98));
            color: #dfffea;
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.42);
            font: 12px/1.45 sans-serif;
            overflow: hidden;
            pointer-events: auto;
            display: flex;
            flex-direction: column;
        }
        .${HELP_CLASS} .deno-node-help-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 8px;
            color: #9dffba;
            font-weight: 800;
        }
        .${HELP_CLASS} .deno-node-help-close {
            width: 22px;
            height: 22px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid rgba(72, 255, 132, 0.36);
            background: rgba(0, 0, 0, 0.38);
            color: #b8ffd0;
            cursor: pointer;
            user-select: none;
        }
        .${HELP_CLASS} .deno-node-help-content {
            flex: 1;
            min-height: 72px;
            overflow: auto;
            padding-right: 3px;
            color: #d7ffe3;
        }
        .${HELP_CLASS} .deno-node-help-content p {
            margin: 0 0 8px;
        }
        .${HELP_CLASS} .deno-node-help-content ul {
            margin: 0 0 9px 18px;
            padding: 0;
        }
        .${HELP_CLASS} .deno-node-help-content li {
            margin: 0 0 4px;
        }
        .${HELP_CLASS} .deno-node-help-content code {
            color: #9dffba;
            background: rgba(72, 255, 132, 0.08);
            border: 1px solid rgba(72, 255, 132, 0.18);
            border-radius: 5px;
            padding: 1px 4px;
        }
        .${HELP_BUTTON_CLASS} {
            position: relative;
            width: 17px;
            height: 17px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid rgba(72, 255, 132, 0.8);
            background: rgba(10, 65, 28, 0.92);
            color: #dfffea;
            font: 800 11px/1 sans-serif;
            cursor: pointer;
            user-select: none;
            box-shadow: 0 0 0 1px rgba(72, 255, 132, 0.14) inset;
        }
        .${HELP_BUTTON_CLASS}:hover {
            background: rgba(32, 120, 56, 0.96);
            color: #ffffff;
        }
        .${HELP_BUTTON_CLASS}.deno-node-update-available {
            border-color: rgba(255, 214, 74, 0.95);
            background: rgba(134, 92, 0, 0.98);
            color: #fff5bf;
            box-shadow: 0 0 0 1px rgba(255, 214, 74, 0.18) inset, 0 0 12px rgba(255, 214, 74, 0.16);
        }
        .${HELP_BUTTON_CLASS}.deno-node-update-available::after {
            content: "!";
            position: absolute;
            top: -7px;
            right: -7px;
            width: 12px;
            height: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid rgba(38, 24, 0, 0.96);
            background: #ffd64a;
            color: #171000;
            font: 900 9px/1 sans-serif;
            box-shadow: 0 0 0 1px rgba(255, 246, 172, 0.18) inset, 0 3px 8px rgba(0, 0, 0, 0.38);
        }
        .${HELP_BUTTON_CLASS}.deno-node-latest {
            border-color: rgba(72, 255, 132, 0.86);
            background: rgba(10, 65, 28, 0.96);
            color: #dfffea;
        }
        .${HELP_CLASS} .deno-node-help-release {
            margin: 0 0 10px;
            padding: 8px 9px 9px;
            border-radius: 8px;
            border: 1px solid rgba(72, 255, 132, 0.28);
            background: rgba(0, 0, 0, 0.32);
            color: #dfffea;
        }
        .${HELP_CLASS} .deno-node-help-release.deno-node-update-available {
            border-color: rgba(255, 214, 74, 0.58);
            background: rgba(83, 54, 0, 0.44);
        }
        .${HELP_CLASS} .deno-node-help-release-title {
            color: #9dffba;
            font-weight: 850;
            margin-bottom: 3px;
        }
        .${HELP_CLASS} .deno-node-help-release.deno-node-update-available .deno-node-help-release-title {
            color: #fff1a8;
        }
        .${HELP_CLASS} .deno-node-help-release-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 5px 8px;
            margin-bottom: 7px;
            color: #a6c8b0;
            font-size: 11px;
        }
        .${HELP_CLASS} .deno-node-help-release-note-title {
            margin: 8px 0 4px;
            color: #c7ffd8;
            font-weight: 800;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .${HELP_CLASS} .deno-node-help-release ul {
            margin: 0 0 8px 17px;
            padding: 0;
        }
        .${HELP_CLASS} .deno-node-help-release li {
            margin: 0 0 3px;
        }
        .${HELP_CLASS} .deno-node-help-release-empty {
            margin: 0 0 8px;
            color: #a6c8b0;
        }
        .${HELP_CLASS} .deno-node-help-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
            margin-top: 6px;
        }
        .${HELP_CLASS} .deno-node-help-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 24px;
            padding: 0 9px;
            border-radius: 7px;
            border: 1px solid rgba(72, 255, 132, 0.32);
            background: rgba(11, 42, 22, 0.72);
            color: #b8ffd0;
            text-decoration: none;
            font-weight: 800;
        }
        .${HELP_CLASS} .deno-node-help-actions a:hover {
            border-color: rgba(72, 255, 132, 0.62);
            background: rgba(26, 89, 45, 0.8);
            color: #ffffff;
        }
    `;
    document.head.appendChild(style);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderDescription(description) {
    if (app.extensionManager?.renderMarkdownToHtml) {
        return app.extensionManager.renderMarkdownToHtml(description);
    }

    const lines = String(description || "").trim().split(/\r?\n/);
    const html = [];
    let inList = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            continue;
        }

        const listMatch = line.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
            if (!inList) {
                html.push("<ul>");
                inList = true;
            }
            html.push(`<li>${formatInline(listMatch[1])}</li>`);
            continue;
        }

        if (inList) {
            html.push("</ul>");
            inList = false;
        }
        html.push(`<p>${formatInline(line)}</p>`);
    }

    if (inList) {
        html.push("</ul>");
    }

    return html.join("");
}

function formatInline(value) {
    return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function closeHelpPopup(key) {
    const state = popupState.get(key);
    if (!state) {
        return;
    }
    state.element?.remove();
    if (state.raf) {
        cancelAnimationFrame(state.raf);
    }
    popupState.delete(key);
}

function closeAllHelpPopups() {
    for (const key of [...popupState.keys()]) {
        closeHelpPopup(key);
    }
}

function canvasEventToGraphPoint(event) {
    const canvas = app.canvas;
    const canvasEl = canvas?.canvas;
    const rect = canvasEl?.getBoundingClientRect?.();
    if (!rect) {
        return null;
    }
    const offset = [
        Number(event?.clientX || 0) - rect.left,
        Number(event?.clientY || 0) - rect.top,
    ];
    if (typeof canvas.convertOffsetToCanvas === "function") {
        return canvas.convertOffsetToCanvas(offset);
    }
    const scale = canvas.ds?.scale || 1;
    const dsOffset = canvas.ds?.offset || [0, 0];
    return [
        (offset[0] / scale) - (dsOffset[0] || 0),
        (offset[1] / scale) - (dsOffset[1] || 0),
    ];
}

function isCanvasHelpButtonEvent(event) {
    if (event?.target !== app.canvas?.canvas) {
        return false;
    }
    const graphPoint = canvasEventToGraphPoint(event);
    if (!Array.isArray(graphPoint)) {
        return false;
    }
    const nodes = app.graph?._nodes || [];
    return nodes.some((node) => {
        const description = getNodeDescription(node) || node.__denoHelpDescription;
        if (!description || node.flags?.collapsed || !Array.isArray(node.pos)) {
            return false;
        }
        return isCanvasHelpButtonHit(node, [
            graphPoint[0] - node.pos[0],
            graphPoint[1] - node.pos[1],
        ]);
    });
}

function isHelpPopupUiEvent(event) {
    const target = event?.target;
    if (typeof Node !== "undefined" && !(target instanceof Node)) {
        return false;
    }
    return Boolean(
        target?.closest?.(`.${HELP_CLASS}`)
        || target?.closest?.(`.${HELP_BUTTON_CLASS}`)
    );
}

function handleOutsideHelpPointerDown(event) {
    if (!popupState.size) {
        return;
    }
    if (isHelpPopupUiEvent(event) || isCanvasHelpButtonEvent(event)) {
        return;
    }
    closeAllHelpPopups();
    app.graph?.setDirtyCanvas?.(true, true);
}

function handleOutsideHelpWheel(event) {
    if (!popupState.size || isHelpPopupUiEvent(event)) {
        return;
    }
    closeAllHelpPopups();
    app.graph?.setDirtyCanvas?.(true, true);
}

function setupOutsidePopupClose() {
    if (setupOutsidePopupClose.ready) {
        return;
    }
    setupOutsidePopupClose.ready = true;
    document.addEventListener("pointerdown", handleOutsideHelpPointerDown, true);
    document.addEventListener("wheel", handleOutsideHelpWheel, true);
}

function appendText(parent, className, text) {
    const element = document.createElement("div");
    if (className) {
        element.className = className;
    }
    element.textContent = text;
    parent.appendChild(element);
    return element;
}

function createVersionCard() {
    const visual = versionVisualState();
    const card = document.createElement("div");
    card.className = `deno-node-help-release ${visual.className}`;

    appendText(card, "deno-node-help-release-title", visual.title);

    const meta = document.createElement("div");
    meta.className = "deno-node-help-release-meta";
    const current = denoVersionStatus.current_version ? `Installed v${denoVersionStatus.current_version}` : "Installed version unknown";
    const latest = denoVersionStatus.latest_version ? `Latest v${denoVersionStatus.latest_version}` : "Latest version unknown";
    appendText(meta, "", current);
    appendText(meta, "", latest);
    card.appendChild(meta);

    if (denoVersionStatus.update_available) {
        appendText(card, "deno-node-help-release-note-title", "What changed");
        const notes = Array.isArray(denoVersionStatus.release_notes) ? denoVersionStatus.release_notes : [];
        if (notes.length) {
            const list = document.createElement("ul");
            notes.slice(0, MAX_RELEASE_NOTES).forEach((note) => {
                const item = document.createElement("li");
                item.textContent = note;
                list.appendChild(item);
            });
            card.appendChild(list);
        } else {
            appendText(card, "deno-node-help-release-empty", "Release notes could not be loaded here. Open GitHub release notes for details.");
        }

        const actions = document.createElement("div");
        actions.className = "deno-node-help-actions";
        actions.appendChild(createHelpLink(denoVersionStatus.release_url || releaseUrl(denoVersionStatus.latest_version), "Release notes"));
        card.appendChild(actions);
    } else if (denoVersionStatus.status === "latest") {
        const actions = document.createElement("div");
        actions.className = "deno-node-help-actions";
        actions.appendChild(createHelpLink(denoVersionStatus.release_url || releaseUrl(denoVersionStatus.current_version), "Current release notes"));
        card.appendChild(actions);
    }

    return card;
}

function createHelpLink(url, label) {
    const link = document.createElement("a");
    link.href = url || "https://github.com/Deno2026/comfyui-deno-custom-nodes/releases";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    link.addEventListener("click", (event) => event.stopPropagation());
    return link;
}

function createPopupElement(title, description, onClose) {
    ensureHelpStyles();

    const popup = document.createElement("div");
    popup.className = HELP_CLASS;

    const head = document.createElement("div");
    head.className = "deno-node-help-head";

    const titleEl = document.createElement("div");
    titleEl.textContent = title || "DENO Node Info";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "deno-node-help-close";
    close.textContent = "x";
    close.title = "Close";
    close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
    });

    const content = document.createElement("div");
    content.className = "deno-node-help-content";
    content.innerHTML = renderDescription(description);

    head.append(titleEl, close);
    popup.append(head, createVersionCard(), content);
    document.body.appendChild(popup);
    return popup;
}

function positionPopupNearNode(popup, node, ctx) {
    const rect = app.canvas?.canvas?.getBoundingClientRect?.();
    if (!rect) {
        return;
    }

    const transform = ctx?.getTransform?.();
    const width = node?.size?.[0] || 240;
    let left = rect.left + 32;
    let top = rect.top + 32;

    if (transform && ctx?.canvas) {
        const scaleX = rect.width / ctx.canvas.width;
        const scaleY = rect.height / ctx.canvas.height;
        left = rect.left + ((transform.e + ((width + 12) * transform.a)) * scaleX);
        top = rect.top + ((transform.f - (28 * transform.d)) * scaleY);
    } else {
        const scale = app.canvas?.ds?.scale || 1;
        const offset = app.canvas?.ds?.offset || [0, 0];
        const x = node?.pos?.[0] || 0;
        const y = node?.pos?.[1] || 0;
        left = rect.left + ((x + offset[0] + width + 12) * scale);
        top = rect.top + ((y + offset[1] - 28) * scale);
    }

    popup.style.left = `${Math.min(left, window.innerWidth - popup.offsetWidth - 14)}px`;
    popup.style.top = `${Math.max(14, Math.min(top, window.innerHeight - popup.offsetHeight - 14))}px`;
}

function openCanvasHelpPopup(node, nodeData, ctx) {
    const key = getNodeKey(node);
    if (!key) {
        return;
    }
    if (popupState.has(key)) {
        closeHelpPopup(key);
        return;
    }

    closeAllHelpPopups();
    const popup = createPopupElement(nodeData.display_name || node.title || "DENO Node Info", nodeData.description, () => {
        closeHelpPopup(key);
        app.graph?.setDirtyCanvas?.(true, true);
    });

    popupState.set(key, { element: popup });
    positionPopupNearNode(popup, node, ctx);
}

function getCanvasHelpButtonFrame(node) {
    const visual = versionVisualState();
    return {
        x: (Number(node?.size?.[0]) || 0) - HELP_ICON_SIZE - HELP_ICON_MARGIN,
        y: -25,
        rightPad: visual.badgeLabel ? UPDATE_BADGE_RADIUS : 0,
        topPad: visual.badgeLabel ? UPDATE_BADGE_RADIUS : 0,
        visual,
    };
}

function isCanvasHelpButtonHit(node, localPos) {
    if (!Array.isArray(localPos)) {
        return false;
    }
    const frame = getCanvasHelpButtonFrame(node);
    return (
        localPos[0] >= frame.x
        && localPos[0] <= frame.x + HELP_ICON_SIZE + frame.rightPad
        && localPos[1] >= frame.y - frame.topPad
        && localPos[1] <= frame.y + HELP_ICON_SIZE
    );
}

function setCanvasHelpButtonHover(node, active) {
    const next = active === true;
    const changed = node.__denoHelpButtonHover !== next;
    node.__denoHelpButtonHover = next;
    const canvasEl = app.canvas?.canvas;
    if (canvasEl?.style) {
        if (next) {
            const ticket = ++canvasHelpCursorTicket;
            const forcePointer = () => {
                if (canvasHelpCursorTicket === ticket && node.__denoHelpButtonHover === true) {
                    canvasEl.style.cursor = "pointer";
                }
            };
            forcePointer();
            globalThis.requestAnimationFrame?.(forcePointer);
            globalThis.setTimeout?.(forcePointer, 0);
        } else if (canvasEl.style.cursor === "pointer") {
            canvasHelpCursorTicket += 1;
            canvasEl.style.cursor = "";
        }
    }
    if (changed) {
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function patchCanvasHelpButton(nodeType, nodeData) {
    const originalDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
        const result = originalDraw?.apply(this, arguments);
        if (this.flags?.collapsed) {
            return result;
        }

        const frame = getCanvasHelpButtonFrame(this);
        const { x, y, visual } = frame;
        const centerX = x + (HELP_ICON_SIZE / 2);
        const centerY = y + (HELP_ICON_SIZE / 2);
        const hovered = this.__denoHelpButtonHover === true;
        const hoverFill = visual.badgeLabel ? "rgba(160, 111, 0, 1)" : "rgba(32, 120, 56, 0.98)";
        const hoverStroke = visual.badgeLabel ? "rgba(255, 242, 135, 1)" : "rgba(151, 255, 180, 1)";

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, (HELP_ICON_SIZE / 2) + (hovered ? 1 : 0), 0, Math.PI * 2);
        ctx.fillStyle = hovered ? hoverFill : visual.fill;
        ctx.fill();
        ctx.lineWidth = hovered ? 2 : 1.2;
        ctx.strokeStyle = hovered ? hoverStroke : visual.stroke;
        ctx.stroke();
        ctx.fillStyle = visual.color;
        ctx.font = hovered ? "900 12px sans-serif" : "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(visual.label, centerX, centerY + 0.2);
        if (visual.badgeLabel) {
            const badgeX = centerX + UPDATE_BADGE_OFFSET_X;
            const badgeY = centerY + UPDATE_BADGE_OFFSET_Y;
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, UPDATE_BADGE_RADIUS + (hovered ? 0.7 : 0), 0, Math.PI * 2);
            ctx.fillStyle = visual.badgeFill;
            ctx.fill();
            ctx.lineWidth = hovered ? 1.4 : 1;
            ctx.strokeStyle = hovered ? hoverStroke : visual.badgeStroke;
            ctx.stroke();
            ctx.fillStyle = visual.badgeColor;
            ctx.font = hovered ? "900 9px sans-serif" : "900 8px sans-serif";
            ctx.fillText(visual.badgeLabel, badgeX, badgeY + 0.2);
        }
        ctx.restore();

        if (popupState.has(getNodeKey(this))) {
            positionPopupNearNode(popupState.get(getNodeKey(this)).element, this, ctx);
        }

        return result;
    };

    const originalMouseMove = nodeType.prototype.onMouseMove;
    nodeType.prototype.onMouseMove = function (event, localPos) {
        if (!this.flags?.collapsed && isCanvasHelpButtonHit(this, localPos)) {
            setCanvasHelpButtonHover(this, true);
            return true;
        }
        setCanvasHelpButtonHover(this, false);
        return originalMouseMove?.apply(this, arguments);
    };

    const originalMouseLeave = nodeType.prototype.onMouseLeave;
    nodeType.prototype.onMouseLeave = function () {
        setCanvasHelpButtonHover(this, false);
        return originalMouseLeave?.apply(this, arguments);
    };

    const originalMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (event, localPos) {
        if (isCanvasHelpButtonHit(this, localPos)) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            setCanvasHelpButtonHover(this, false);
            openCanvasHelpPopup(this, nodeData, app.canvas?.ctx);
            return true;
        }

        return originalMouseDown?.apply(this, arguments);
    };

    const originalRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
        setCanvasHelpButtonHover(this, false);
        closeHelpPopup(getNodeKey(this));
        return originalRemoved?.apply(this, arguments);
    };
}

function getGraphNodeByDom(nodeEl) {
    const nodeId = nodeEl?.dataset?.nodeId;
    if (!nodeId) {
        return null;
    }
    return app.graph?.getNodeById?.(Number(nodeId)) || app.graph?.getNodeById?.(nodeId);
}

function openDomHelpPopup(node, nodeEl) {
    const key = getNodeKey(node);
    const description = getNodeDescription(node);
    if (!key || !description) {
        return;
    }
    if (popupState.has(key)) {
        closeHelpPopup(key);
        return;
    }

    closeAllHelpPopups();
    const popup = createPopupElement(node.title || "DENO Node Info", description, () => closeHelpPopup(key));
    const state = { element: popup, raf: 0 };
    popupState.set(key, state);

    const update = () => {
        if (!popup.parentNode) {
            return;
        }
        const rect = nodeEl.getBoundingClientRect();
        popup.style.left = `${Math.min(rect.right + 10, window.innerWidth - popup.offsetWidth - 14)}px`;
        popup.style.top = `${Math.max(14, Math.min(rect.top, window.innerHeight - popup.offsetHeight - 14))}px`;
        state.raf = requestAnimationFrame(update);
    };
    state.raf = requestAnimationFrame(update);
}

function injectDomHelpButton(header) {
    if (header.querySelector(`.${HELP_BUTTON_CLASS}`)) {
        return;
    }

    const nodeEl = header.closest("[data-node-id]");
    const node = getGraphNodeByDom(nodeEl);
    const description = getNodeDescription(node);
    if (!nodeEl || !node || !description) {
        return;
    }

    const container = header.querySelector(":scope > div") || header;
    const button = document.createElement("button");
    button.type = "button";
    button.className = HELP_BUTTON_CLASS;
    applyVersionButtonState(button);
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDomHelpPopup(node, nodeEl);
    });

    container.appendChild(button);
}

function setupDomHelpObserver() {
    ensureHelpStyles();

    const injectExisting = () => {
        document.querySelectorAll(".lg-node-header").forEach(injectDomHelpButton);
    };
    injectExisting();

    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending) {
            return;
        }
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            injectExisting();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

app.registerExtension({
    name: DENO_HELP_EXTENSION,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!isDenoNode(nodeData) || !nodeData.description) {
            return;
        }
        setCurrentVersionFromDescription(nodeData.description);
        nodeHelpDescriptions.set(nodeData.name, nodeData.description);
        refreshDenoVersionStatus();
        patchCanvasHelpButton(nodeType, nodeData);
    },
    nodeCreated(node) {
        const description = getNodeDescription(node);
        if (description) {
            node.__denoHelpDescription = description;
        }
    },
    setup() {
        setupOutsidePopupClose();
        setupDomHelpObserver();
    },
});
