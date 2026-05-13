import { app } from "../../scripts/app.js";

const DENO_HELP_EXTENSION = "Deno.NodeHelp";
const HELP_CLASS = "deno-node-help-popup";
const HELP_BUTTON_CLASS = "deno-node-help-button";
const HELP_ICON_SIZE = 15;
const HELP_ICON_MARGIN = 7;

const nodeHelpDescriptions = new Map();
const popupState = new Map();

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
            width: min(360px, calc(100vw - 32px));
            max-height: min(420px, calc(100vh - 32px));
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
            max-height: 340px;
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
    popup.append(head, content);
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

function patchCanvasHelpButton(nodeType, nodeData) {
    const originalDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
        const result = originalDraw?.apply(this, arguments);
        if (this.flags?.collapsed) {
            return result;
        }

        const x = (Number(this.size?.[0]) || 0) - HELP_ICON_SIZE - HELP_ICON_MARGIN;
        const y = -25;
        const centerX = x + (HELP_ICON_SIZE / 2);
        const centerY = y + (HELP_ICON_SIZE / 2);

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, HELP_ICON_SIZE / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10, 65, 28, 0.96)";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(72, 255, 132, 0.86)";
        ctx.stroke();
        ctx.fillStyle = "#dfffea";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("i", centerX, centerY + 0.2);
        ctx.restore();

        if (popupState.has(getNodeKey(this))) {
            positionPopupNearNode(popupState.get(getNodeKey(this)).element, this, ctx);
        }

        return result;
    };

    const originalMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (event, localPos) {
        const x = (Number(this.size?.[0]) || 0) - HELP_ICON_SIZE - HELP_ICON_MARGIN;
        const y = -25;
        if (
            Array.isArray(localPos)
            && localPos[0] >= x
            && localPos[0] <= x + HELP_ICON_SIZE
            && localPos[1] >= y
            && localPos[1] <= y + HELP_ICON_SIZE
        ) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            openCanvasHelpPopup(this, nodeData, app.canvas?.ctx);
            return true;
        }

        return originalMouseDown?.apply(this, arguments);
    };

    const originalRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
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
    button.textContent = "i";
    button.title = "Node info";
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
        nodeHelpDescriptions.set(nodeData.name, nodeData.description);
        patchCanvasHelpButton(nodeType, nodeData);
    },
    nodeCreated(node) {
        const description = getNodeDescription(node);
        if (description) {
            node.__denoHelpDescription = description;
        }
    },
    setup() {
        setupDomHelpObserver();
    },
});
