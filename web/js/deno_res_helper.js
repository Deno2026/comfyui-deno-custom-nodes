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
const PREVIEW_INSET_X = 18;
const PREVIEW_INSET_Y = 18;
const PREVIEW_BOTTOM_INSET = 12;
const ANCHOR_VISUAL_SIZE = 5;
const ANCHOR_HIT_EXTRA = 6;
const ANCHOR_VIRTUAL_PULL = 24;
const DRAG_GAIN = 1.18;
const SOURCE_PREVIEW_OPACITY = 0.52;
const THEME = {
    cardFill: "rgba(3, 10, 7, 0.96)",
    cardStroke: "rgba(56, 255, 126, 0.7)",
    previewBg: "rgba(0, 0, 0, 0.92)",
    previewFill: "rgba(10, 42, 24, 0.96)",
    previewStroke: "rgba(79, 255, 142, 0.95)",
    gridStroke: "rgba(95, 255, 155, 0.22)",
    sourceFill: "rgba(33, 25, 38, 0.98)",
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

    if (cropPositionEnabled && sourceState.size) {
        const cropViewport = fitAspectRect(
            info.width,
            info.height,
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
            cropY
        );
        const renderedSourceRect = calculateCropRenderRect(
            sourceState.size.width,
            sourceState.size.height,
            cropViewport,
            cropWindow
        );

        drawCroppedSourcePreview(ctx, cropViewport, renderedSourceRect, sourceState.previewImage);
        drawPreviewGrid(ctx, cropViewport);
        drawPreviewOutline(ctx, cropViewport);
        previewRect = cropViewport;

        if (cropWindow.axis) {
            drawCropPositionLabel(ctx, cropViewport, cropWindow.axis, cropX, cropY);
        }

        cropPreview = {
            interactive: Boolean(cropWindow.axis),
            axis: cropWindow.axis,
            sourceRect: cropViewport,
            cropRect: cropViewport,
            viewportRect: cropViewport,
            renderedSourceRect,
            pointMode: false,
            directPan: true,
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

    const anchorSize = ANCHOR_VISUAL_SIZE;
    const activeAnchor = node.__denoAnchorDrag?.active ? node.__denoAnchorDrag.anchor : null;
    const anchors = [
        { name: "nw", x: previewRect.x, y: previewRect.y, size: anchorSize },
        { name: "ne", x: previewRect.x + previewRect.width, y: previewRect.y, size: anchorSize },
        { name: "sw", x: previewRect.x, y: previewRect.y + previewRect.height, size: anchorSize },
        { name: "se", x: previewRect.x + previewRect.width, y: previewRect.y + previewRect.height, size: anchorSize },
    ];

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

function calculateCropWindow(sourceWidth, sourceHeight, targetWidth, targetHeight, cropX = 0.5, cropY = 0.5) {
    const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
    const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
    const safeTargetWidth = Math.max(1, Number(targetWidth) || 1);
    const safeTargetHeight = Math.max(1, Number(targetHeight) || 1);
    const sourceAspect = safeSourceWidth / safeSourceHeight;
    const targetAspect = safeTargetWidth / safeTargetHeight;
    const normalizedX = normalizedCropValue(cropX);
    const normalizedY = normalizedCropValue(cropY);

    if (Math.abs(sourceAspect - targetAspect) / Math.max(sourceAspect, targetAspect) < 0.0001) {
        return { x: 0, y: 0, width: safeSourceWidth, height: safeSourceHeight, axis: null };
    }
    if (sourceAspect > targetAspect) {
        const cropWidth = safeSourceHeight * targetAspect;
        return {
            x: (safeSourceWidth - cropWidth) * normalizedX,
            y: 0,
            width: cropWidth,
            height: safeSourceHeight,
            axis: "x",
        };
    }
    const cropHeight = safeSourceWidth / targetAspect;
    return {
        x: 0,
        y: (safeSourceHeight - cropHeight) * normalizedY,
        width: safeSourceWidth,
        height: cropHeight,
        axis: "y",
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

function drawCropPositionLabel(ctx, rect, axis, cropX, cropY) {
    const text = axis === "x"
        ? `CROP X ${Math.round(cropX * 100)}%`
        : axis === "y"
            ? `CROP Y ${Math.round(cropY * 100)}%`
            : `CROP X ${Math.round(cropX * 100)}% · Y ${Math.round(cropY * 100)}%`;
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
    const rect = preview.sourceRect;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function startAnchorDrag(node, anchorName) {
    const info = calculateDisplayInfo(node);
    const previewSize = previewSizeFromDisplayInfo(info);
    const previewRect = node.__denoPreviewRect;
    if (!previewRect) {
        return;
    }
    node.__denoAnchorDrag = {
        active: true,
        anchor: anchorName,
        startWidth: previewSize.width,
        startHeight: previewSize.height,
        startPreviewRect: { ...previewRect },
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
    if (preview.directPan) {
        node.__denoCropDrag = {
            active: true,
            preview,
            startMouseX: mouseX,
            startMouseY: mouseY,
            startCropX: normalizedCropValue(getWidget(node, "crop_x")?.value),
            startCropY: normalizedCropValue(getWidget(node, "crop_y")?.value),
        };
        bindGlobalDragGuards(node);
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

    if (preview.directPan) {
        const viewportRect = preview.viewportRect || sourceRect;
        const renderedSourceRect = preview.renderedSourceRect || viewportRect;
        const travelX = Math.max(0, renderedSourceRect.width - viewportRect.width);
        const travelY = Math.max(0, renderedSourceRect.height - viewportRect.height);
        if (preview.axis === "x" && travelX > 0) {
            const deltaX = mouseX - state.startMouseX;
            setWidgetValue(node, "crop_x", roundCropValue(state.startCropX - deltaX / travelX));
        } else if (preview.axis === "y" && travelY > 0) {
            const deltaY = mouseY - state.startMouseY;
            setWidgetValue(node, "crop_y", roundCropValue(state.startCropY - deltaY / travelY));
        }
        return;
    }

    if (preview.pointMode || preview.axis === "both") {
        const nextX = clamp((mouseX - sourceRect.x) / Math.max(1, sourceRect.width), 0, 1);
        const nextY = clamp((mouseY - sourceRect.y) / Math.max(1, sourceRect.height), 0, 1);
        setWidgetValue(node, "crop_x", roundCropValue(nextX));
        setWidgetValue(node, "crop_y", roundCropValue(nextY));
        return;
    }

    const cropRect = preview.cropRect;
    if (preview.axis === "x") {
        const travel = Math.max(0, sourceRect.width - cropRect.width);
        if (travel > 0) {
            const left = mouseX - state.pointerOffsetX;
            setWidgetValue(node, "crop_x", roundCropValue((left - sourceRect.x) / travel));
        }
    } else if (preview.axis === "y") {
        const travel = Math.max(0, sourceRect.height - cropRect.height);
        if (travel > 0) {
            const top = mouseY - state.pointerOffsetY;
            setWidgetValue(node, "crop_y", roundCropValue((top - sourceRect.y) / travel));
        }
    }
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

    const previewRect = state.startPreviewRect;
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
        return;
    }

    const minPreview = 20;
    let targetPreviewWidth = previewRect.width;
    let targetPreviewHeight = previewRect.height;

    if (state.anchor === "se") {
        targetPreviewWidth = applyDragGain(previewRect.width, withVirtualPull(mouseX - previewRect.x, previewRect.width));
        targetPreviewHeight = applyDragGain(previewRect.height, withVirtualPull(mouseY - previewRect.y, previewRect.height));
    } else if (state.anchor === "sw") {
        targetPreviewWidth = applyDragGain(
            previewRect.width,
            withVirtualPull(previewRect.x + previewRect.width - mouseX, previewRect.width)
        );
        targetPreviewHeight = applyDragGain(previewRect.height, withVirtualPull(mouseY - previewRect.y, previewRect.height));
    } else if (state.anchor === "ne") {
        targetPreviewWidth = applyDragGain(previewRect.width, withVirtualPull(mouseX - previewRect.x, previewRect.width));
        targetPreviewHeight = applyDragGain(
            previewRect.height,
            withVirtualPull(previewRect.y + previewRect.height - mouseY, previewRect.height)
        );
    } else if (state.anchor === "nw") {
        targetPreviewWidth = applyDragGain(
            previewRect.width,
            withVirtualPull(previewRect.x + previewRect.width - mouseX, previewRect.width)
        );
        targetPreviewHeight = applyDragGain(
            previewRect.height,
            withVirtualPull(previewRect.y + previewRect.height - mouseY, previewRect.height)
        );
    }

    targetPreviewWidth = clamp(targetPreviewWidth, minPreview, previewRect.width * 4);
    targetPreviewHeight = clamp(targetPreviewHeight, minPreview, previewRect.height * 4);

    const divisibleBy = Number.parseInt(String(getWidget(node, "divisible_by")?.value ?? "32"), 10) || 32;
    const mode = getWidget(node, "mode")?.value ?? PRESET_MODE;

    if (mode === PRESET_MODE || mode === KEEP_INPUT_RATIO_MODE) {
        const ratio = state.startWidth / Math.max(1, state.startHeight);
        const widthScale = targetPreviewWidth / Math.max(1, previewRect.width);
        const heightScale = targetPreviewHeight / Math.max(1, previewRect.height);
        const scale = clamp(Math.min(widthScale, heightScale), 0.1, 10);

        let nextWidth = roundUp(state.startWidth * scale, divisibleBy);
        let nextHeight = roundUp(nextWidth / Math.max(ratio, 0.001), divisibleBy);
        nextWidth = roundUp(nextHeight * ratio, divisibleBy);

        nextWidth = clamp(nextWidth, MIN_DIMENSION, MAX_DIMENSION);
        nextHeight = clamp(nextHeight, MIN_DIMENSION, MAX_DIMENSION);
        const nextMegapixels = Number(((nextWidth * nextHeight) / 1_000_000).toFixed(2));
        setWidgetValue(node, "megapixels", nextMegapixels);
    } else {
        const widthScale = targetPreviewWidth / Math.max(1, previewRect.width);
        const heightScale = targetPreviewHeight / Math.max(1, previewRect.height);
        const nextWidth = clamp(roundUp(state.startWidth * widthScale, divisibleBy), MIN_DIMENSION, MAX_DIMENSION);
        const nextHeight = clamp(roundUp(state.startHeight * heightScale, divisibleBy), MIN_DIMENSION, MAX_DIMENSION);
        setWidgetValue(node, "width", nextWidth);
        setWidgetValue(node, "height", nextHeight);
    }
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
    if (upstreamPreviewImage) {
        clearSourcePreviewImage(node);
    }
    const previewImage = upstreamPreviewImage || ensureSourcePreviewImage(node, previewUrl);

    const hintedSize = sourceNode.__denoOutputImageSize ?? sourceNode.properties?.__denoOutputImageSize;
    const hintedWidth = Number(hintedSize?.width);
    const hintedHeight = Number(hintedSize?.height);
    if (hintedWidth > 0 && hintedHeight > 0) {
        return { connected: true, size: { width: hintedWidth, height: hintedHeight }, previewImage, previewUrl };
    }

    if (previewImage) {
        const imgWidth = Number(previewImage?.naturalWidth ?? previewImage?.width ?? 0);
        const imgHeight = Number(previewImage?.naturalHeight ?? previewImage?.height ?? 0);
        if (imgWidth > 0 && imgHeight > 0) {
            return { connected: true, size: { width: imgWidth, height: imgHeight }, previewImage, previewUrl };
        }
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

function withVirtualPull(rawValue, baseValue) {
    if (!Number.isFinite(rawValue)) {
        return baseValue;
    }
    if (rawValue >= baseValue) {
        return rawValue + ANCHOR_VIRTUAL_PULL;
    }
    return rawValue;
}

function applyDragGain(baseValue, rawValue) {
    if (!Number.isFinite(baseValue) || !Number.isFinite(rawValue)) {
        return baseValue;
    }
    return baseValue + (rawValue - baseValue) * DRAG_GAIN;
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
        updateCropDrag,
    });
}
