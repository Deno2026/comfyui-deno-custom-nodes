import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoResolutionSetup";
const PRESET_MODE = "Preset Ratio";
const MANUAL_MODE = "Manual Input";
const KEEP_INPUT_RATIO_MODE = "Keep Input Ratio";
const POSITION_CROP_METHOD = "Crop Position (Fill)";
const SUMMARY_HEIGHT = 158;
const MIN_NODE_WIDTH = 320;
const MIN_NODE_HEIGHT = 460;
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 8192;
const MAX_CROP_ZOOM = 32;
const PREVIEW_INSET_X = 18;
const PREVIEW_INSET_Y = 18;
const PREVIEW_BOTTOM_INSET = 12;
const ANCHOR_VISUAL_SIZE = 5;
const ANCHOR_HIT_EXTRA = 6;
const SOURCE_PREVIEW_OPACITY = 0.88;
const THEME = {
    cardFill: "rgba(3, 10, 7, 0.96)",
    cardStroke: "rgba(56, 255, 126, 0.7)",
    previewBg: "rgba(0, 0, 0, 0.92)",
    previewFill: "rgba(10, 42, 24, 0.96)",
    previewStroke: "rgba(79, 255, 142, 0.95)",
    gridStroke: "rgba(95, 255, 155, 0.22)",
    sourceFill: "rgba(33, 25, 38, 0.98)",
    cropOutsideFill: "rgba(0, 0, 0, 0.58)",
    cropPositionFill: "rgba(242, 255, 89, 0.96)",
    cropPositionStroke: "rgba(15, 14, 18, 0.95)",
    cropLabelFill: "rgba(15, 14, 18, 0.82)",
    cropLabelText: "#f0eee8",
    summaryText: "#d7ffe3",
    anchorFill: "rgba(8, 35, 18, 0.98)",
    anchorStroke: "rgba(79, 255, 142, 0.95)",
    anchorActiveFill: "rgba(79, 255, 142, 0.95)",
    anchorActiveStroke: "rgba(0, 0, 0, 0.95)",
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
            queueMicrotask(() => enhanceResolutionNode(this));
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

    if (!node.__denoResDragPatched) {
        node.__denoResDragPatched = true;
        node.__denoOriginalComputeSize = node.computeSize;
        node.__denoOriginalDrawForeground = node.onDrawForeground;
        node.__denoOriginalMouseDown = node.onMouseDown;
        node.__denoOriginalMouseMove = node.onMouseMove;
        node.__denoOriginalMouseUp = node.onMouseUp;
        node.__denoOriginalMouseLeave = node.onMouseLeave;
        node.__denoOriginalRemoved = node.onRemoved;

        node.computeSize = function () {
            const size = node.__denoOriginalComputeSize
                ? node.__denoOriginalComputeSize.apply(node, arguments)
                : [MIN_NODE_WIDTH, 300];
            return [
                Math.max(size[0], MIN_NODE_WIDTH),
                Math.max(size[1] + SUMMARY_HEIGHT, MIN_NODE_HEIGHT),
            ];
        };

        node.onDrawForeground = function (ctx) {
            if (node.__denoOriginalDrawForeground) {
                node.__denoOriginalDrawForeground.call(node, ctx);
            }
            drawResolutionSummary(node, ctx);
        };

        node.onMouseDown = function (event, pos) {
            const local = getNodeLocalPos(node, pos);
            if (isPrimaryPointerStart(event)) {
                const hit = getPreviewAnchorHit(node, local.x, local.y);
                if (hit) {
                    startAnchorDrag(node, hit.name);
                    requestNodeRedraw(node);
                    return true;
                }
                if (getCropPreviewHit(node, local.x, local.y)) {
                    startCropDrag(node, local.x, local.y);
                    requestNodeRedraw(node);
                    return true;
                }
            }
            return node.__denoOriginalMouseDown?.call(node, event, pos);
        };

        node.onMouseMove = function (event, pos) {
            if (node.__denoAnchorDrag?.active) {
                if (!isPrimaryPointerPressed(event)) {
                    endAnchorDrag(node);
                    requestNodeRedraw(node);
                    return true;
                }
                const local = getNodeLocalPos(node, pos);
                updateAnchorDrag(node, local.x, local.y);
                requestNodeRedraw(node);
                return true;
            }
            if (node.__denoCropDrag?.active) {
                if (!isPrimaryPointerPressed(event)) {
                    endCropDrag(node);
                    requestNodeRedraw(node);
                    return true;
                }
                const local = getNodeLocalPos(node, pos);
                updateCropDrag(node, local.x, local.y);
                requestNodeRedraw(node);
                return true;
            }
            return node.__denoOriginalMouseMove?.call(node, event, pos);
        };

        node.onMouseUp = function (event, pos) {
            if (node.__denoAnchorDrag?.active) {
                endAnchorDrag(node);
                requestNodeRedraw(node);
                return true;
            }
            if (node.__denoCropDrag?.active) {
                endCropDrag(node);
                requestNodeRedraw(node);
                return true;
            }
            return node.__denoOriginalMouseUp?.call(node, event, pos);
        };

        node.onMouseLeave = function (event, pos) {
            if (node.__denoAnchorDrag?.active) {
                endAnchorDrag(node);
                requestNodeRedraw(node);
            }
            if (node.__denoCropDrag?.active) {
                endCropDrag(node);
                requestNodeRedraw(node);
            }
            return node.__denoOriginalMouseLeave?.call(node, event, pos);
        };

        node.onRemoved = function () {
            if (node.__denoAnchorDrag?.active) {
                endAnchorDrag(node);
            }
            if (node.__denoCropDrag?.active) {
                endCropDrag(node);
            }
            unbindGlobalDragGuards(node);
            clearSourcePreviewImage(node);
            return node.__denoOriginalRemoved?.apply(node, arguments);
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

function getNodeLocalPos(node, pos) {
    if (Array.isArray(pos) && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
        return { x: pos[0], y: pos[1] };
    }

    const graphMouse = app.canvas?.graph_mouse || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0];
    return {
        x: graphMouse[0] - (node.pos?.[0] ?? 0),
        y: graphMouse[1] - (node.pos?.[1] ?? 0),
    };
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
    const cropXWidget = getWidget(node, "crop_x");
    const cropYWidget = getWidget(node, "crop_y");
    const cropZoomWidget = getWidget(node, "crop_zoom");

    const mode = modeWidget?.value ?? PRESET_MODE;
    const presetMode = mode === PRESET_MODE;
    const autoMode = mode === KEEP_INPUT_RATIO_MODE;
    const manualMode = mode === MANUAL_MODE;

    toggleWidget(node, ratioWidget, presetMode);
    toggleWidget(node, megapixelsWidget, presetMode || autoMode);
    toggleWidget(node, widthWidget, manualMode);
    toggleWidget(node, heightWidget, manualMode);
    toggleWidget(node, cropXWidget, false, true);
    toggleWidget(node, cropYWidget, false, true);
    toggleWidget(node, cropZoomWidget, false, true);
    if (divisibleByWidget) {
        divisibleByWidget.name = "divisible_by";
        divisibleByWidget.label = "divisible_by";
    }
}

function toggleWidget(node, widget, show, hardHide = false) {
    if (!widget) {
        return;
    }

    if (show) {
        if (widget.__denoHidden) {
            widget.type = widget.__denoOriginalType;
            widget.computeSize = widget.__denoOriginalComputeSize;
            if (widget.__denoHardHidden) {
                widget.hidden = widget.__denoOriginalHidden;
                widget.draw = widget.__denoOriginalDraw;
                if (widget.element) {
                    widget.element.style.display = "";
                }
            }
            widget.__denoHardHidden = false;
            widget.__denoHidden = false;
        }
        return;
    }

    if (!widget.__denoHidden) {
        widget.__denoOriginalType = widget.type;
        widget.__denoOriginalComputeSize = widget.computeSize;
        widget.computeSize = () => [0, -4];
        widget.__denoHardHidden = Boolean(hardHide);
        if (hardHide) {
            widget.__denoOriginalHidden = Boolean(widget.hidden);
            widget.__denoOriginalDraw = widget.draw;
            widget.hidden = true;
            widget.type = "hidden";
            widget.draw = () => {};
            if (widget.element) {
                widget.element.style.display = "none";
            }
        } else {
            // Preserve the original Resize Box mode-switch contract for the
            // existing ratio/size widgets. Only crop state uses hard hiding.
            widget.type = "converted-widget";
        }
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

    ctx.save();
    ctx.fillStyle = THEME.cardFill;
    ctx.strokeStyle = THEME.cardStroke;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardWidth, availableHeight, 12);
    ctx.fill();
    ctx.stroke();

    const previewMeta = drawAspectPreview(ctx, node, x, y, cardWidth, previewHeight, info);
    node.__denoPreviewRect = previewMeta.previewRect;
    node.__denoPreviewAnchors = previewMeta.anchors;
    node.__denoCropPreview = previewMeta.cropPreview;

    ctx.fillStyle = THEME.summaryText;
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(info.text, x + 10, y + previewHeight + 24);
    ctx.restore();
}

function drawAspectPreview(ctx, node, x, y, width, height, info) {
    const areaX = x + PREVIEW_INSET_X;
    const areaY = y + PREVIEW_INSET_Y;
    const areaWidth = width - PREVIEW_INSET_X * 2;
    const areaHeight = height - (PREVIEW_INSET_Y + PREVIEW_BOTTOM_INSET);
    const resizeMethod = getWidget(node, "resize_method")?.value ?? "Center Crop (Fill)";
    const cropX = normalizedCropValue(getWidget(node, "crop_x")?.value);
    const cropY = normalizedCropValue(getWidget(node, "crop_y")?.value);
    const cropZoom = normalizedCropZoom(getWidget(node, "crop_zoom")?.value);
    const sourceState = info.sourceState || { connected: false, size: null, previewImage: null };
    const cropPositionEnabled = resizeMethod === POSITION_CROP_METHOD && sourceState.connected;
    const previewSize = previewSizeFromDisplayInfo(info);

    ctx.save();
    ctx.fillStyle = THEME.previewBg;
    roundRect(ctx, areaX, areaY, areaWidth, areaHeight, 8);
    ctx.fill();

    let previewRect = fitAspectRect(
        previewSize.width,
        previewSize.height,
        areaX + 14,
        areaY + 10,
        areaWidth - 28,
        areaHeight - 20
    );
    let cropPreview = null;

    let anchors = [];

    if (cropPositionEnabled && sourceState.size) {
        const sourceRect = fitAspectRect(
            sourceState.size.width,
            sourceState.size.height,
            areaX + 14,
            areaY + 10,
            areaWidth - 28,
            areaHeight - 20
        );
        const cropWindow = calculateCropWindow(
            sourceState.size.width,
            sourceState.size.height,
            info.width,
            info.height,
            cropX,
            cropY,
            cropZoom
        );
        const scaleX = sourceRect.width / Math.max(1, sourceState.size.width);
        const scaleY = sourceRect.height / Math.max(1, sourceState.size.height);
        const cropRect = {
            x: sourceRect.x + cropWindow.x * scaleX,
            y: sourceRect.y + cropWindow.y * scaleY,
            width: cropWindow.width * scaleX,
            height: cropWindow.height * scaleY,
        };

        drawSourceCropPreview(ctx, sourceRect, sourceState.previewImage);
        drawCropOutsideMask(ctx, sourceRect, cropRect);
        drawPreviewGrid(ctx, cropRect);
        drawPreviewOutline(ctx, cropRect);
        drawCropPositionLabel(ctx, sourceRect, cropWindow.axis, cropX, cropY, cropZoom);
        previewRect = cropRect;

        anchors = makePreviewAnchors(cropRect);

        cropPreview = {
            interactive: true,
            axis: cropWindow.axis,
            sourceRect,
            cropRect,
            cropWindow,
            sourceSize: { ...sourceState.size },
            targetSize: { width: info.width, height: info.height },
            cropZoom,
            pointMode: false,
        };
    } else {
        drawPreviewFill(ctx, previewRect);
        drawPreviewGrid(ctx, previewRect);
        drawPreviewOutline(ctx, previewRect);

        if (cropPositionEnabled) {
            const markerX = previewRect.x + previewRect.width * cropX;
            const markerY = previewRect.y + previewRect.height * cropY;
            drawCropPositionMarker(ctx, markerX, markerY, node.__denoCropDrag?.active);
            drawCropPositionLabel(ctx, previewRect, "both", cropX, cropY);
            cropPreview = {
                interactive: true,
                axis: "both",
                sourceRect: previewRect,
                cropRect: { x: markerX, y: markerY, width: 0, height: 0 },
                pointMode: true,
            };
        }
    }

    const activeAnchor = node.__denoAnchorDrag?.active ? node.__denoAnchorDrag.anchor : null;
    for (const anchor of anchors) {
        const active = anchor.name === activeAnchor;
        ctx.fillStyle = active ? THEME.anchorActiveFill : THEME.anchorFill;
        ctx.strokeStyle = active ? THEME.anchorActiveStroke : THEME.anchorStroke;
        ctx.lineWidth = 1.5;
        roundRect(
            ctx,
            anchor.x - anchor.size,
            anchor.y - anchor.size,
            anchor.size * 2,
            anchor.size * 2,
            2
        );
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();

    return {
        previewRect: {
            ...previewRect,
        },
        anchors,
        cropPreview,
    };
}

function makePreviewAnchors(rect) {
    const size = ANCHOR_VISUAL_SIZE;
    return [
        { name: "nw", x: rect.x, y: rect.y, size },
        { name: "ne", x: rect.x + rect.width, y: rect.y, size },
        { name: "sw", x: rect.x, y: rect.y + rect.height, size },
        { name: "se", x: rect.x + rect.width, y: rect.y + rect.height, size },
    ];
}

function fitAspectRect(contentWidth, contentHeight, x, y, width, height) {
    const ratio = Math.max(Number(contentWidth) / Math.max(Number(contentHeight), 1), 0.001);
    let fittedWidth = width;
    let fittedHeight = fittedWidth / ratio;
    if (fittedHeight > height) {
        fittedHeight = height;
        fittedWidth = fittedHeight * ratio;
    }
    return {
        x: x + (width - fittedWidth) / 2,
        y: y + (height - fittedHeight) / 2,
        width: fittedWidth,
        height: fittedHeight,
    };
}

function calculateCropWindow(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    cropX = 0.5,
    cropY = 0.5,
    cropZoom = 1
) {
    const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
    const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
    const safeTargetWidth = Math.max(1, Number(targetWidth) || 1);
    const safeTargetHeight = Math.max(1, Number(targetHeight) || 1);
    const sourceAspect = safeSourceWidth / safeSourceHeight;
    const targetAspect = safeTargetWidth / safeTargetHeight;
    const normalizedX = normalizedCropValue(cropX);
    const normalizedY = normalizedCropValue(cropY);
    const normalizedZoom = normalizedCropZoom(cropZoom);

    let baseWidth;
    let baseHeight;
    if (sourceAspect > targetAspect) {
        baseWidth = safeSourceHeight * targetAspect;
        baseHeight = safeSourceHeight;
    } else {
        baseWidth = safeSourceWidth;
        baseHeight = safeSourceWidth / targetAspect;
    }

    const cropWidth = baseWidth / normalizedZoom;
    const cropHeight = baseHeight / normalizedZoom;
    const travelX = Math.max(0, safeSourceWidth - cropWidth);
    const travelY = Math.max(0, safeSourceHeight - cropHeight);
    const movesX = travelX > 0.0001;
    const movesY = travelY > 0.0001;
    return {
        x: travelX * normalizedX,
        y: travelY * normalizedY,
        width: cropWidth,
        height: cropHeight,
        axis: movesX && movesY ? "both" : movesX ? "x" : movesY ? "y" : null,
        zoom: normalizedZoom,
    };
}

function calculateCropRenderRect(sourceWidth, sourceHeight, viewportRect, cropWindow) {
    const safeCropWidth = Math.max(1, Number(cropWindow?.width) || 1);
    const safeCropHeight = Math.max(1, Number(cropWindow?.height) || 1);
    const scale = Math.max(
        viewportRect.width / safeCropWidth,
        viewportRect.height / safeCropHeight
    );
    return {
        x: viewportRect.x - (Number(cropWindow?.x) || 0) * scale,
        y: viewportRect.y - (Number(cropWindow?.y) || 0) * scale,
        width: Math.max(1, Number(sourceWidth) || 1) * scale,
        height: Math.max(1, Number(sourceHeight) || 1) * scale,
        scale,
    };
}

function drawSourceCropPreview(ctx, sourceRect, previewImage) {
    ctx.save();
    roundRect(ctx, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, 6);
    ctx.clip();
    ctx.fillStyle = THEME.sourceFill;
    ctx.fillRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
    if (previewImage && typeof ctx.drawImage === "function") {
        ctx.globalAlpha = SOURCE_PREVIEW_OPACITY;
        ctx.drawImage(previewImage, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
        ctx.globalAlpha = 1;
    } else {
        ctx.globalAlpha = SOURCE_PREVIEW_OPACITY;
        ctx.fillStyle = THEME.previewFill;
        ctx.fillRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
    }
    ctx.restore();
}

function drawCropOutsideMask(ctx, sourceRect, cropRect) {
    const sourceRight = sourceRect.x + sourceRect.width;
    const sourceBottom = sourceRect.y + sourceRect.height;
    const cropRight = cropRect.x + cropRect.width;
    const cropBottom = cropRect.y + cropRect.height;
    ctx.fillStyle = THEME.cropOutsideFill;
    ctx.fillRect(sourceRect.x, sourceRect.y, sourceRect.width, Math.max(0, cropRect.y - sourceRect.y));
    ctx.fillRect(sourceRect.x, cropBottom, sourceRect.width, Math.max(0, sourceBottom - cropBottom));
    ctx.fillRect(sourceRect.x, cropRect.y, Math.max(0, cropRect.x - sourceRect.x), cropRect.height);
    ctx.fillRect(cropRight, cropRect.y, Math.max(0, sourceRight - cropRight), cropRect.height);
}

function drawCroppedSourcePreview(ctx, viewportRect, renderedSourceRect, previewImage) {
    ctx.save();
    roundRect(ctx, viewportRect.x, viewportRect.y, viewportRect.width, viewportRect.height, 6);
    ctx.clip();
    ctx.fillStyle = THEME.sourceFill;
    ctx.fillRect(viewportRect.x, viewportRect.y, viewportRect.width, viewportRect.height);
    if (previewImage && typeof ctx.drawImage === "function") {
        ctx.globalAlpha = SOURCE_PREVIEW_OPACITY;
        ctx.drawImage(
            previewImage,
            renderedSourceRect.x,
            renderedSourceRect.y,
            renderedSourceRect.width,
            renderedSourceRect.height
        );
        ctx.globalAlpha = 1;
    } else {
        ctx.globalAlpha = SOURCE_PREVIEW_OPACITY;
        ctx.fillStyle = THEME.previewFill;
        ctx.fillRect(
            renderedSourceRect.x,
            renderedSourceRect.y,
            renderedSourceRect.width,
            renderedSourceRect.height
        );
    }
    ctx.restore();
}

function drawPreviewFill(ctx, rect) {
    ctx.fillStyle = THEME.previewFill;
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 6);
    ctx.fill();
}

function drawPreviewOutline(ctx, rect) {
    ctx.strokeStyle = THEME.previewStroke;
    ctx.lineWidth = 2;
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 6);
    ctx.stroke();
}

function drawPreviewGrid(ctx, rect) {
    ctx.strokeStyle = THEME.gridStroke;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.width / 2, rect.y);
    ctx.lineTo(rect.x + rect.width / 2, rect.y + rect.height);
    ctx.moveTo(rect.x, rect.y + rect.height / 2);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
    ctx.stroke();
}

function drawCropPositionMarker(ctx, x, y, active) {
    ctx.fillStyle = active ? THEME.cropPositionStroke : THEME.cropPositionFill;
    ctx.strokeStyle = active ? THEME.cropPositionFill : THEME.cropPositionStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, active ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawCropPositionLabel(ctx, rect, axis, cropX, cropY, cropZoom = 1) {
    const zoomText = `ZOOM ${normalizedCropZoom(cropZoom).toFixed(2)}×`;
    const positionText = axis === "x"
        ? `X ${Math.round(cropX * 100)}%`
        : axis === "y"
            ? `Y ${Math.round(cropY * 100)}%`
            : `X ${Math.round(cropX * 100)}% · Y ${Math.round(cropY * 100)}%`;
    const text = `${zoomText} · ${positionText}`;
    ctx.font = "10px sans-serif";
    const labelWidth = Math.min(rect.width - 12, ctx.measureText(text).width + 12);
    const labelX = rect.x + 6;
    const labelY = rect.y + 6;
    ctx.fillStyle = THEME.cropLabelFill;
    roundRect(ctx, labelX, labelY, labelWidth, 18, 5);
    ctx.fill();
    ctx.fillStyle = THEME.cropLabelText;
    ctx.textBaseline = "middle";
    ctx.fillText(text, labelX + 6, labelY + 9, Math.max(0, labelWidth - 12));
}

function getPreviewAnchorHit(node, x, y) {
    const anchors = node.__denoPreviewAnchors || [];
    for (const anchor of anchors) {
        const hitRadius = anchor.size + ANCHOR_HIT_EXTRA;
        if (x >= anchor.x - hitRadius && x <= anchor.x + hitRadius && y >= anchor.y - hitRadius && y <= anchor.y + hitRadius) {
            return anchor;
        }
    }
    return null;
}

function getCropPreviewHit(node, x, y) {
    const preview = node.__denoCropPreview;
    if (!preview?.interactive || !preview.sourceRect) {
        return false;
    }
    const rect = preview.pointMode ? preview.sourceRect : preview.cropRect;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function startAnchorDrag(node, anchorName) {
    const preview = node.__denoCropPreview;
    if (!preview?.interactive || preview.pointMode || !preview.cropRect || !preview.sourceSize) {
        return;
    }
    const cropRect = preview.cropRect;
    const opposite = {
        nw: { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
        ne: { x: cropRect.x, y: cropRect.y + cropRect.height },
        sw: { x: cropRect.x + cropRect.width, y: cropRect.y },
        se: { x: cropRect.x, y: cropRect.y },
    }[anchorName];
    if (!opposite) {
        return;
    }
    node.__denoAnchorDrag = {
        active: true,
        anchor: anchorName,
        preview,
        opposite,
        aspect: cropRect.width / Math.max(1, cropRect.height),
    };
    bindGlobalDragGuards(node);
}

function endAnchorDrag(node) {
    if (node.__denoAnchorDrag) {
        node.__denoAnchorDrag.active = false;
    }
    unbindGlobalDragGuards(node);
}

function startCropDrag(node, mouseX, mouseY) {
    const preview = node.__denoCropPreview;
    if (!preview?.interactive) {
        return;
    }
    const cropRect = preview.cropRect;
    const insideCrop = !preview.pointMode
        && mouseX >= cropRect.x
        && mouseX <= cropRect.x + cropRect.width
        && mouseY >= cropRect.y
        && mouseY <= cropRect.y + cropRect.height;
    node.__denoCropDrag = {
        active: true,
        preview,
        startMouseX: mouseX,
        startMouseY: mouseY,
        startCropRect: cropRect ? { ...cropRect } : null,
        pointerOffsetX: insideCrop ? mouseX - cropRect.x : cropRect.width / 2,
        pointerOffsetY: insideCrop ? mouseY - cropRect.y : cropRect.height / 2,
    };
    bindGlobalDragGuards(node);
    updateCropDrag(node, mouseX, mouseY);
}

function updateCropDrag(node, mouseX, mouseY) {
    const state = node.__denoCropDrag;
    if (!state?.active) {
        return;
    }
    const { preview } = state;
    const sourceRect = preview.sourceRect;

    if (preview.pointMode || preview.axis === "both") {
        if (preview.pointMode) {
            const nextX = clamp((mouseX - sourceRect.x) / Math.max(1, sourceRect.width), 0, 1);
            const nextY = clamp((mouseY - sourceRect.y) / Math.max(1, sourceRect.height), 0, 1);
            setWidgetValue(node, "crop_x", roundCropValue(nextX));
            setWidgetValue(node, "crop_y", roundCropValue(nextY));
            return;
        }
    }

    const startRect = state.startCropRect || preview.cropRect;
    const left = clamp(
        startRect.x + (mouseX - state.startMouseX),
        sourceRect.x,
        sourceRect.x + sourceRect.width - startRect.width
    );
    const top = clamp(
        startRect.y + (mouseY - state.startMouseY),
        sourceRect.y,
        sourceRect.y + sourceRect.height - startRect.height
    );
    const cropState = cropStateFromPreviewRect(preview, {
        x: left,
        y: top,
        width: startRect.width,
        height: startRect.height,
    });
    setWidgetValue(node, "crop_x", roundCropValue(cropState.cropX));
    setWidgetValue(node, "crop_y", roundCropValue(cropState.cropY));
}

function endCropDrag(node) {
    if (node.__denoCropDrag) {
        node.__denoCropDrag.active = false;
    }
    unbindGlobalDragGuards(node);
}

function bindGlobalDragGuards(node) {
    if (node.__denoGlobalDragGuardBound) {
        return;
    }

    node.__denoGlobalDragGuard = () => {
        if (node.__denoAnchorDrag?.active) {
            endAnchorDrag(node);
            requestNodeRedraw(node);
        }
        if (node.__denoCropDrag?.active) {
            endCropDrag(node);
            requestNodeRedraw(node);
        }
    };

    window.addEventListener("mouseup", node.__denoGlobalDragGuard, true);
    window.addEventListener("blur", node.__denoGlobalDragGuard, true);
    node.__denoGlobalDragGuardBound = true;
}

function unbindGlobalDragGuards(node) {
    if (!node.__denoGlobalDragGuardBound || !node.__denoGlobalDragGuard) {
        return;
    }
    window.removeEventListener("mouseup", node.__denoGlobalDragGuard, true);
    window.removeEventListener("blur", node.__denoGlobalDragGuard, true);
    node.__denoGlobalDragGuardBound = false;
}

function isPrimaryPointerPressed(event) {
    if (!event) {
        return true;
    }
    if (typeof event.buttons === "number") {
        return (event.buttons & 1) === 1;
    }
    if (typeof event.which === "number") {
        return event.which === 1;
    }
    return true;
}

function isPrimaryPointerStart(event) {
    if (!event) {
        return true;
    }
    if (typeof event.buttons === "number" && event.buttons !== 0) {
        return (event.buttons & 1) === 1;
    }
    if (typeof event.button === "number") {
        return event.button === 0;
    }
    if (typeof event.which === "number") {
        return event.which === 1;
    }
    return true;
}

function updateAnchorDrag(node, mouseX, mouseY) {
    const state = node.__denoAnchorDrag;
    if (!state?.active) {
        return;
    }

    const preview = state.preview;
    const sourceRect = preview?.sourceRect;
    const cropRect = preview?.cropRect;
    if (!sourceRect || !cropRect || !preview.sourceSize || !preview.targetSize) {
        return;
    }

    const direction = {
        nw: { x: -1, y: -1 },
        ne: { x: 1, y: -1 },
        sw: { x: -1, y: 1 },
        se: { x: 1, y: 1 },
    }[state.anchor];
    if (!direction) {
        return;
    }

    const aspect = Math.max(0.001, state.aspect);
    const horizontalDistance = (mouseX - state.opposite.x) * direction.x;
    const verticalDistance = (mouseY - state.opposite.y) * direction.y;
    const projectedHeight = (
        horizontalDistance * aspect + verticalDistance
    ) / (aspect * aspect + 1);

    const horizontalBound = direction.x < 0
        ? state.opposite.x - sourceRect.x
        : sourceRect.x + sourceRect.width - state.opposite.x;
    const verticalBound = direction.y < 0
        ? state.opposite.y - sourceRect.y
        : sourceRect.y + sourceRect.height - state.opposite.y;
    const baseWindow = calculateCropWindow(
        preview.sourceSize.width,
        preview.sourceSize.height,
        preview.targetSize.width,
        preview.targetSize.height,
        0.5,
        0.5,
        1
    );
    const baseHeight = baseWindow.height * sourceRect.height / preview.sourceSize.height;
    const minHeight = Math.max(1, baseHeight / MAX_CROP_ZOOM);
    const maxHeight = Math.max(
        minHeight,
        Math.min(baseHeight, horizontalBound / aspect, verticalBound)
    );
    const nextHeight = clamp(projectedHeight, minHeight, maxHeight);
    const nextWidth = nextHeight * aspect;
    const nextRect = {
        x: direction.x < 0 ? state.opposite.x - nextWidth : state.opposite.x,
        y: direction.y < 0 ? state.opposite.y - nextHeight : state.opposite.y,
        width: nextWidth,
        height: nextHeight,
    };
    const cropState = cropStateFromPreviewRect(preview, nextRect);
    setWidgetValue(node, "crop_zoom", roundCropZoom(cropState.cropZoom));
    setWidgetValue(node, "crop_x", roundCropValue(cropState.cropX));
    setWidgetValue(node, "crop_y", roundCropValue(cropState.cropY));
}

function cropStateFromPreviewRect(preview, rect) {
    const sourceRect = preview.sourceRect;
    const sourceSize = preview.sourceSize;
    const targetSize = preview.targetSize;
    const scaleX = sourceSize.width / Math.max(1, sourceRect.width);
    const scaleY = sourceSize.height / Math.max(1, sourceRect.height);
    const sourceCrop = {
        x: (rect.x - sourceRect.x) * scaleX,
        y: (rect.y - sourceRect.y) * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
    };
    const baseWindow = calculateCropWindow(
        sourceSize.width,
        sourceSize.height,
        targetSize.width,
        targetSize.height,
        0.5,
        0.5,
        1
    );
    const cropZoom = normalizedCropZoom(baseWindow.width / Math.max(sourceCrop.width, 0.0001));
    const travelX = Math.max(0, sourceSize.width - sourceCrop.width);
    const travelY = Math.max(0, sourceSize.height - sourceCrop.height);
    return {
        cropX: travelX > 0.0001
            ? clamp(sourceCrop.x / travelX, 0, 1)
            : normalizedCropValue(getWidgetValueFromPreview(preview, "crop_x", 0.5)),
        cropY: travelY > 0.0001
            ? clamp(sourceCrop.y / travelY, 0, 1)
            : normalizedCropValue(getWidgetValueFromPreview(preview, "crop_y", 0.5)),
        cropZoom,
    };
}

function getWidgetValueFromPreview(preview, name, fallback) {
    if (name === "crop_x" && Number.isFinite(preview.cropWindow?.x)) {
        const travel = Math.max(0, preview.sourceSize.width - preview.cropWindow.width);
        return travel > 0 ? preview.cropWindow.x / travel : fallback;
    }
    if (name === "crop_y" && Number.isFinite(preview.cropWindow?.y)) {
        const travel = Math.max(0, preview.sourceSize.height - preview.cropWindow.height);
        return travel > 0 ? preview.cropWindow.y / travel : fallback;
    }
    return fallback;
}

function setWidgetValue(node, name, value) {
    const widget = getWidget(node, name);
    if (!widget) {
        return;
    }
    if (widget.value === value) {
        return;
    }
    widget.value = value;
    node.properties = node.properties || {};
    node.properties[name] = value;
    widget.callback?.(value);
}

function calculateDisplayInfo(node) {
    const mode = getWidget(node, "mode")?.value ?? PRESET_MODE;
    const width = Number.parseInt(getWidget(node, "width")?.value ?? 1024, 10);
    const height = Number.parseInt(getWidget(node, "height")?.value ?? 1024, 10);
    const ratioPreset = getWidget(node, "ratio_preset")?.value ?? "16:9";
    const megapixels = Number.parseFloat(getWidget(node, "megapixels")?.value ?? 1.0);
    const divisibleBy = Number.parseInt(String(getWidget(node, "divisible_by")?.value ?? "32"), 10);
    const sourceState = getLinkedImageState(node);

    let targetWidth = width;
    let targetHeight = height;
    let previewWidth = null;
    let previewHeight = null;
    let summaryText = null;

    if (mode === PRESET_MODE) {
        const [ratioX, ratioY] = ratioPreset.split(":").map(Number);
        [targetWidth, targetHeight] = computePresetDims(ratioX, ratioY, megapixels, divisibleBy);
    } else if (mode === KEEP_INPUT_RATIO_MODE) {
        if (!sourceState.connected) {
            [previewWidth, previewHeight] = computeKeepInputRatioDims(
                width,
                height,
                megapixels,
                divisibleBy
            );
            targetWidth = roundUp(width, divisibleBy);
            targetHeight = roundUp(height, divisibleBy);
        } else {
            const sourceSize = sourceState.size || { width, height };
            [targetWidth, targetHeight] = computeKeepInputRatioDims(
                sourceSize.width,
                sourceSize.height,
                megapixels,
                divisibleBy
            );
            if (!sourceState.size) {
                const targetMegapixels = Number.isFinite(megapixels) ? megapixels.toFixed(2) : "1.00";
                summaryText = `Input-dependent  |  target ${targetMegapixels} MP  |  divisible by ${divisibleBy}`;
            }
        }
    } else {
        targetWidth = roundUp(width, divisibleBy);
        targetHeight = roundUp(height, divisibleBy);
    }

    const finalRatio = mode === PRESET_MODE ? ratioPreset : simplifyRatio(targetWidth, targetHeight);
    const finalMegapixels = ((targetWidth * targetHeight) / 1_000_000).toFixed(2);
    return {
        width: targetWidth,
        height: targetHeight,
        previewWidth: previewWidth ?? targetWidth,
        previewHeight: previewHeight ?? targetHeight,
        ratioLabel: finalRatio,
        text: summaryText || `${targetWidth} x ${targetHeight}  |  ${finalRatio}  |  ${finalMegapixels} MP  |  divisible by ${divisibleBy}`,
        sourceState,
    };
}

function previewSizeFromDisplayInfo(info) {
    return {
        width: Number(info?.previewWidth ?? info?.width ?? 1),
        height: Number(info?.previewHeight ?? info?.height ?? 1),
    };
}

function getWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name);
}

function requestNodeRedraw(node) {
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function computePresetDims(ratioX, ratioY, megapixels, divisibleBy) {
    const totalPixels = Math.max(0.01, megapixels) * 1_000_000;
    const baseWidth = Math.sqrt(totalPixels * ratioX / ratioY);
    const baseHeight = Math.sqrt(totalPixels * ratioY / ratioX);

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

    return [...candidates.values()].reduce((best, current) => {
        const score = getPresetCandidateScore(current[0], current[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);
        const bestScore = getPresetCandidateScore(best[0], best[1], baseWidth, baseHeight, totalPixels, ratioX / ratioY);

        for (let i = 0; i < score.length; i += 1) {
            if (score[i] < bestScore[i]) return current;
            if (score[i] > bestScore[i]) return best;
        }
        return best;
    });
}

function computeKeepInputRatioDims(sourceWidth, sourceHeight, megapixels, divisibleBy) {
    const safeSourceWidth = Math.max(divisibleBy, Number(sourceWidth) || 1024);
    const safeSourceHeight = Math.max(divisibleBy, Number(sourceHeight) || 1024);
    const totalPixels = Math.max(0.01, megapixels) * 1_000_000;
    const sourceAspect = safeSourceWidth / safeSourceHeight;
    const sourceArea = safeSourceWidth * safeSourceHeight;

    const scale = Math.sqrt(totalPixels / Math.max(1, sourceArea));
    const baseWidth = Math.max(divisibleBy, safeSourceWidth * scale);
    const baseHeight = Math.max(divisibleBy, safeSourceHeight * scale);

    const rounders = [roundDown, roundNearest, roundUp];
    const candidates = new Map();

    for (const widthRounder of rounders) {
        const widthCandidate = widthRounder(baseWidth, divisibleBy);
        const exactHeight = widthCandidate / sourceAspect;
        for (const heightRounder of rounders) {
            const heightCandidate = heightRounder(exactHeight, divisibleBy);
            candidates.set(`${widthCandidate}x${heightCandidate}`, [widthCandidate, heightCandidate]);
        }
    }

    for (const heightRounder of rounders) {
        const heightCandidate = heightRounder(baseHeight, divisibleBy);
        const exactWidth = heightCandidate * sourceAspect;
        for (const widthRounder of rounders) {
            const widthCandidate = widthRounder(exactWidth, divisibleBy);
            candidates.set(`${widthCandidate}x${heightCandidate}`, [widthCandidate, heightCandidate]);
        }
    }

    candidates.set(
        `${roundNearest(baseWidth, divisibleBy)}x${roundNearest(baseHeight, divisibleBy)}`,
        [roundNearest(baseWidth, divisibleBy), roundNearest(baseHeight, divisibleBy)]
    );

    return [...candidates.values()].reduce((best, current) => {
        const score = getAutoCandidateScore(current[0], current[1], baseWidth, baseHeight, totalPixels, sourceAspect);
        const bestScore = getAutoCandidateScore(best[0], best[1], baseWidth, baseHeight, totalPixels, sourceAspect);

        for (let i = 0; i < score.length; i += 1) {
            if (score[i] < bestScore[i]) return current;
            if (score[i] > bestScore[i]) return best;
        }
        return best;
    });
}

function targetGraphForNode(node) {
    return node?.graph || app?.graph || app?.rootGraph || null;
}

function graphLinkByIdForNode(node, linkId) {
    const links = targetGraphForNode(node)?.links || {};
    if (links && links[linkId]) {
        return links[linkId];
    }
    if (Array.isArray(links)) {
        return links.find((link) => String(link?.id ?? link?.[0]) === String(linkId)) || null;
    }
    return null;
}

function graphNodeByIdForNode(node, nodeId) {
    const graph = targetGraphForNode(node);
    const direct = graph?.getNodeById?.(nodeId) || graph?.getNodeById?.(+nodeId);
    if (direct) {
        return direct;
    }
    return (graph?._nodes || []).find((candidate) => String(candidate?.id) === String(nodeId)) || null;
}

function linkOriginId(link) {
    return link?.origin_id ?? link?.originId ?? link?.origin ?? link?.[1] ?? null;
}

function isRerouteNode(node) {
    return String(node?.type || node?.comfyClass || node?.constructor?.nodeData?.name || "").trim() === "Reroute";
}

function linkedImageSourceNode(node, imageInput) {
    const seenLinks = new Set();
    const seenNodes = new Set();
    let linkId = imageInput?.link;
    while (linkId != null && !seenLinks.has(String(linkId))) {
        seenLinks.add(String(linkId));
        const linkInfo = graphLinkByIdForNode(node, linkId);
        const originId = linkOriginId(linkInfo);
        if (originId == null) {
            return null;
        }
        const sourceNode = graphNodeByIdForNode(node, originId);
        if (!sourceNode) {
            return null;
        }
        if (!isRerouteNode(sourceNode)) {
            return sourceNode;
        }
        if (seenNodes.has(String(sourceNode.id))) {
            return null;
        }
        seenNodes.add(String(sourceNode.id));
        const upstreamInput = (sourceNode.inputs || []).find((candidate) => candidate?.link != null);
        if (!upstreamInput) {
            return null;
        }
        linkId = upstreamInput.link;
    }
    return null;
}

function getLinkedImageState(node) {
    const imageInput = (node.inputs || []).find((input) => input.name === "image");
    if (!imageInput || imageInput.link == null) {
        clearSourcePreviewImage(node);
        return { connected: false, size: null, previewImage: null, previewUrl: null };
    }

    const sourceNode = linkedImageSourceNode(node, imageInput);
    if (!sourceNode) {
        clearSourcePreviewImage(node);
        return { connected: true, size: null, previewImage: null, previewUrl: null };
    }

    const previewUrl = sourcePreviewUrl(sourceNode);
    const upstreamPreviewImage = Array.isArray(sourceNode.imgs) && sourceNode.imgs.length > 0
        ? sourceNode.imgs[0]
        : null;
    const embeddedPreviewMedia = sourcePreviewMedia(sourceNode);
    if (upstreamPreviewImage || embeddedPreviewMedia) {
        clearSourcePreviewImage(node);
    }
    const previewImage = upstreamPreviewImage || embeddedPreviewMedia || ensureSourcePreviewImage(node, previewUrl);

    const hintedSize = sourceNode.__denoOutputImageSize ?? sourceNode.properties?.__denoOutputImageSize;
    const hintedWidth = Number(hintedSize?.width);
    const hintedHeight = Number(hintedSize?.height);
    if (hintedWidth > 0 && hintedHeight > 0) {
        return { connected: true, size: { width: hintedWidth, height: hintedHeight }, previewImage, previewUrl };
    }

    const previewSize = previewMediaSize(previewImage);
    if (previewSize) {
        return { connected: true, size: previewSize, previewImage, previewUrl };
    }

    const widthWidget = getWidget(sourceNode, "width");
    const heightWidget = getWidget(sourceNode, "height");
    const widthValue = Number(widthWidget?.value);
    const heightValue = Number(heightWidget?.value);
    if (widthValue > 0 && heightValue > 0) {
        return { connected: true, size: { width: widthValue, height: heightValue }, previewImage, previewUrl };
    }

    return { connected: true, size: null, previewImage, previewUrl };
}

function sourcePreviewMedia(sourceNode) {
    const widgets = sourceNode?.widgets || [];
    const previewWidget = widgets.find((widget) => widget?.name === "videopreview")
        || widgets.find((widget) => widget?.videoEl || widget?.imgEl);
    const candidates = [previewWidget?.videoEl, previewWidget?.imgEl];
    return candidates.find((candidate) => previewMediaSize(candidate)) || null;
}

function previewMediaSize(media) {
    if (!media) {
        return null;
    }
    const width = Number(media.videoWidth || media.naturalWidth || media.width || 0);
    const height = Number(media.videoHeight || media.naturalHeight || media.height || 0);
    return width > 0 && height > 0 ? { width, height } : null;
}

function sourcePreviewUrl(sourceNode) {
    const widgets = sourceNode?.widgets || [];
    const imageWidget = widgets.find((widget) => widget.name === "image" && typeof widget.value === "string")
        || widgets.find((widget) => typeof widget.value === "string" && /\.(png|jpe?g|webp|gif|bmp)$/i.test(widget.value));
    const rawValue = String(imageWidget?.value || "").trim().replaceAll("\\", "/");
    if (!rawValue) {
        return null;
    }
    const parts = rawValue.split("/").filter(Boolean);
    const filename = parts.pop();
    if (!filename) {
        return null;
    }
    const subfolder = parts.join("/");
    return "/view?" + new URLSearchParams({ filename, subfolder, type: "input" }).toString();
}

function ensureSourcePreviewImage(node, previewUrl) {
    if (!previewUrl || typeof Image !== "function") {
        if (!previewUrl) {
            clearSourcePreviewImage(node);
        }
        return null;
    }
    const current = node.__denoSourcePreviewImage;
    if (current?.url === previewUrl) {
        return current.loaded ? current.image : null;
    }

    clearSourcePreviewImage(node);
    const image = new Image();
    const state = { url: previewUrl, image, loaded: false };
    node.__denoSourcePreviewImage = state;
    image.onload = () => {
        if (node.__denoSourcePreviewImage !== state) {
            return;
        }
        state.loaded = true;
        requestNodeRedraw(node);
    };
    image.onerror = () => {
        if (node.__denoSourcePreviewImage === state) {
            state.loaded = false;
            requestNodeRedraw(node);
        }
    };
    image.src = previewUrl;
    return null;
}

function clearSourcePreviewImage(node) {
    const state = node?.__denoSourcePreviewImage;
    if (!state) {
        return;
    }
    if (state.image) {
        state.image.onload = null;
        state.image.onerror = null;
    }
    delete node.__denoSourcePreviewImage;
}

function getLinkedImageSize(node) {
    return getLinkedImageState(node).size;
}

function roundUp(value, multiple) {
    return Math.ceil(Math.max(value, multiple) / multiple) * multiple;
}

function roundDown(value, multiple) {
    return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

function roundNearest(value, multiple) {
    return Math.max(multiple, Math.floor(value / multiple + 0.5) * multiple);
}

function getPresetCandidateScore(width, height, baseWidth, baseHeight, totalPixels, targetRatio) {
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

function getAutoCandidateScore(width, height, baseWidth, baseHeight, totalPixels, sourceRatio) {
    const areaError = Math.abs((width * height) - totalPixels) / totalPixels;
    const ratioError = Math.abs((width / height) - sourceRatio) / sourceRatio;
    const distanceError =
        Math.abs(width - baseWidth) / baseWidth +
        Math.abs(height - baseHeight) / baseHeight;
    return [areaError, ratioError, distanceError];
}

function simplifyRatio(width, height) {
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        [x, y] = [y, x % y];
    }
    return x || 1;
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

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizedCropValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 0.5;
}

function roundCropValue(value) {
    return Number(normalizedCropValue(value).toFixed(3));
}

function normalizedCropZoom(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 1, MAX_CROP_ZOOM) : 1;
}

function roundCropZoom(value) {
    return Number(normalizedCropZoom(value).toFixed(3));
}

if (typeof window !== "undefined" && typeof window.__DENO_RES_HELPER_TEST_HOOK__ === "function") {
    window.__DENO_RES_HELPER_TEST_HOOK__({
        calculateDisplayInfo,
        calculateCropRenderRect,
        calculateCropWindow,
        computeKeepInputRatioDims,
        getCropPreviewHit,
        getLinkedImageSize,
        getLinkedImageState,
        isPrimaryPointerStart,
        previewSizeFromDisplayInfo,
        roundUp,
        sourcePreviewUrl,
        updateAnchorDrag,
        updateCropDrag,
    });
}
