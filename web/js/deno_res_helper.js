import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoResolutionSetup";
const PRESET_MODE = "Preset Ratio";
const SUMMARY_HEIGHT = 158;
const MIN_NODE_WIDTH = 320;
const MIN_NODE_HEIGHT = 460;
const THEME = {
    cardFill: "rgba(3, 10, 7, 0.96)",
    cardStroke: "rgba(56, 255, 126, 0.7)",
    previewBg: "rgba(0, 0, 0, 0.92)",
    previewFill: "rgba(10, 42, 24, 0.96)",
    previewStroke: "rgba(79, 255, 142, 0.95)",
    gridStroke: "rgba(95, 255, 155, 0.22)",
    summaryText: "#d7ffe3",
};

app.registerExtension({
    name: "Deno.ResolutionHelper",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            enhanceResolutionNode(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            queueMicrotask(() => enhanceResolutionNode(this));
            return result;
        };
    },
});

function enhanceResolutionNode(node) {
    if (!node || node.type !== NODE_NAME) {
        return;
    }

    if (!node.__denoResolutionSetupPatched) {
        node.__denoResolutionSetupPatched = true;
        node.__denoOriginalComputeSize = node.computeSize?.bind(node);
        node.__denoOriginalDrawForeground = node.onDrawForeground?.bind(node);

        node.computeSize = function () {
            const size = node.__denoOriginalComputeSize
                ? node.__denoOriginalComputeSize(...arguments)
                : [MIN_NODE_WIDTH, 300];
            return [
                Math.max(size[0], MIN_NODE_WIDTH),
                Math.max(size[1] + SUMMARY_HEIGHT, MIN_NODE_HEIGHT),
            ];
        };

        node.onDrawForeground = function (ctx) {
            if (node.__denoOriginalDrawForeground) {
                node.__denoOriginalDrawForeground(ctx);
            }
            drawResolutionSummary(node, ctx);
        };
    }

    if (!node.__denoInitialSizeApplied) {
        node.__denoInitialSizeApplied = true;
        node.size = [
            Math.max(node.size?.[0] ?? 0, MIN_NODE_WIDTH),
            Math.max(node.size?.[1] ?? 0, MIN_NODE_HEIGHT),
        ];
    }

    wrapWidgetCallbacks(node);
    updateWidgetVisibility(node);
    requestNodeRedraw(node);
}

function wrapWidgetCallbacks(node) {
    for (const widget of node.widgets || []) {
        if (widget.__denoWrapped) {
            continue;
        }

        const originalCallback = widget.callback;
        widget.callback = function () {
            const result = originalCallback?.apply(this, arguments);
            updateWidgetVisibility(node);
            requestNodeRedraw(node);
            return result;
        };
        widget.__denoWrapped = true;
    }
}

function updateWidgetVisibility(node) {
    const modeWidget = getWidget(node, "mode");
    const ratioWidget = getWidget(node, "ratio_preset");
    const megapixelsWidget = getWidget(node, "megapixels");
    const widthWidget = getWidget(node, "width");
    const heightWidget = getWidget(node, "height");
    const divisibleByWidget = getWidget(node, "divisible_by");

    const presetMode = (modeWidget?.value ?? PRESET_MODE) === PRESET_MODE;

    toggleWidget(node, ratioWidget, presetMode);
    toggleWidget(node, megapixelsWidget, presetMode);
    toggleWidget(node, widthWidget, !presetMode);
    toggleWidget(node, heightWidget, !presetMode);
    if (divisibleByWidget) {
        divisibleByWidget.name = "divisible_by";
        divisibleByWidget.label = "divisible_by";
    }
}

function toggleWidget(node, widget, show) {
    if (!widget) {
        return;
    }

    if (show) {
        if (widget.__denoHidden) {
            widget.type = widget.__denoOriginalType;
            widget.computeSize = widget.__denoOriginalComputeSize;
            widget.__denoHidden = false;
        }
        return;
    }

    if (!widget.__denoHidden) {
        widget.__denoOriginalType = widget.type;
        widget.__denoOriginalComputeSize = widget.computeSize;
        widget.type = "converted-widget";
        widget.computeSize = () => [0, -4];
        widget.__denoHidden = true;
    }
}

function drawResolutionSummary(node, ctx) {
    if (!ctx || node.flags?.collapsed) {
        return;
    }

    const info = calculateDisplayInfo(node);
    const lastWidget = (node.widgets || [])
        .filter((widget) => widget.type !== "converted-widget" && widget.type !== "hidden")
        .at(-1);
    const widgetBottom = lastWidget
        ? (lastWidget.last_y ?? (LiteGraph.NODE_WIDGET_HEIGHT * (node.widgets.indexOf(lastWidget) + 1))) + 12
        : 170;
    const cardWidth = node.size[0] - 20;
    const x = 10;
    const y = Math.max(widgetBottom, 180);
    const availableHeight = Math.max(120, node.size[1] - y - 12);
    const previewHeight = Math.max(96, availableHeight - 42);
    const summaryHeight = 30;

    ctx.save();
    ctx.fillStyle = THEME.cardFill;
    ctx.strokeStyle = THEME.cardStroke;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardWidth, availableHeight, 12);
    ctx.fill();
    ctx.stroke();

    drawAspectPreview(ctx, x, y, cardWidth, previewHeight, info.width, info.height);

    ctx.fillStyle = THEME.summaryText;
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(info.text, x + 10, y + previewHeight + 24);
    ctx.restore();
}

function calculateDisplayInfo(node) {
    const mode = getWidget(node, "mode")?.value ?? PRESET_MODE;
    const width = Number.parseInt(getWidget(node, "width")?.value ?? 1024, 10);
    const height = Number.parseInt(getWidget(node, "height")?.value ?? 1024, 10);
    const ratioPreset = getWidget(node, "ratio_preset")?.value ?? "16:9";
    const megapixels = Number.parseFloat(getWidget(node, "megapixels")?.value ?? 1.0);
    const divisibleBy = Number.parseInt(String(getWidget(node, "divisible_by")?.value ?? "64"), 10);

    let targetWidth = width;
    let targetHeight = height;

    if (mode === PRESET_MODE) {
        const [ratioX, ratioY] = ratioPreset.split(":").map(Number);
        const totalPixels = Math.max(0.01, megapixels) * 1_000_000;
        const baseWidth = Math.sqrt(totalPixels * ratioX / ratioY);
        const baseHeight = Math.sqrt(totalPixels * ratioY / ratioX);
        const roundDown = (value, multiple) =>
            Math.max(multiple, Math.floor(value / multiple) * multiple);

        const widthCandidates = [...new Set([roundUp(baseWidth, divisibleBy), roundDown(baseWidth, divisibleBy)])];
        const heightCandidates = [...new Set([roundUp(baseHeight, divisibleBy), roundDown(baseHeight, divisibleBy)])];

        const candidates = new Map();

        for (const widthCandidate of widthCandidates) {
            const exactHeight = (widthCandidate * ratioY) / ratioX;
            candidates.set(`${widthCandidate}x${roundUp(exactHeight, divisibleBy)}`, [widthCandidate, roundUp(exactHeight, divisibleBy)]);
            candidates.set(`${widthCandidate}x${roundDown(exactHeight, divisibleBy)}`, [widthCandidate, roundDown(exactHeight, divisibleBy)]);
        }

        for (const heightCandidate of heightCandidates) {
            const exactWidth = (heightCandidate * ratioX) / ratioY;
            candidates.set(`${roundUp(exactWidth, divisibleBy)}x${heightCandidate}`, [roundUp(exactWidth, divisibleBy), heightCandidate]);
            candidates.set(`${roundDown(exactWidth, divisibleBy)}x${heightCandidate}`, [roundDown(exactWidth, divisibleBy), heightCandidate]);
        }

        [targetWidth, targetHeight] = [...candidates.values()].reduce((best, current) => {
            const score = getCandidateScore(current[0], current[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);
            const bestScore = getCandidateScore(best[0], best[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);

            for (let i = 0; i < score.length; i += 1) {
                if (score[i] < bestScore[i]) return current;
                if (score[i] > bestScore[i]) return best;
            }
            return best;
        });
    } else {
        targetWidth = roundUp(width, divisibleBy);
        targetHeight = roundUp(height, divisibleBy);
    }

    const finalRatio = mode === PRESET_MODE ? ratioPreset : simplifyRatio(targetWidth, targetHeight);
    const finalMegapixels = ((targetWidth * targetHeight) / 1_000_000).toFixed(2);
    return {
        width: targetWidth,
        height: targetHeight,
        ratioLabel: finalRatio,
        text: `${targetWidth} x ${targetHeight}  |  ${finalRatio}  |  ${finalMegapixels} MP  |  divisible by ${divisibleBy}`,
    };
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function requestNodeRedraw(node) {
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function roundUp(value, multiple) {
    return Math.ceil(Math.max(value, multiple) / multiple) * multiple;
}

function getCandidateScore(width, height, baseWidth, baseHeight, totalPixels, targetRatio) {
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

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        [x, y] = [y, x % y];
    }
    return x || 1;
}

function simplifyRatio(width, height) {
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function drawAspectPreview(ctx, x, y, width, height, targetWidth, targetHeight) {
    const areaX = x + 10;
    const areaY = y + 10;
    const areaWidth = width - 20;
    const areaHeight = height - 14;

    ctx.save();
    ctx.fillStyle = THEME.previewBg;
    roundRect(ctx, areaX, areaY, areaWidth, areaHeight, 8);
    ctx.fill();

    const ratio = Math.max(targetWidth / Math.max(targetHeight, 1), 0.001);
    let previewWidth = areaWidth - 28;
    let previewHeight = previewWidth / ratio;

    if (previewHeight > areaHeight - 20) {
        previewHeight = areaHeight - 20;
        previewWidth = previewHeight * ratio;
    }

    const previewX = areaX + (areaWidth - previewWidth) / 2;
    const previewY = areaY + (areaHeight - previewHeight) / 2;

    ctx.fillStyle = THEME.previewFill;
    ctx.strokeStyle = THEME.previewStroke;
    ctx.lineWidth = 2;
    roundRect(ctx, previewX, previewY, previewWidth, previewHeight, 6);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = THEME.gridStroke;
    ctx.beginPath();
    ctx.moveTo(previewX + previewWidth / 2, previewY);
    ctx.lineTo(previewX + previewWidth / 2, previewY + previewHeight);
    ctx.moveTo(previewX, previewY + previewHeight / 2);
    ctx.lineTo(previewX + previewWidth, previewY + previewHeight / 2);
    ctx.stroke();
    ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}
