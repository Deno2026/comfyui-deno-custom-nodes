import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoLTXAVStepFusedTiledSampler";
const LEGACY_COMPAT_WIDGET = "_deno_legacy_video_compat";

function ensureLegacyCompatibilityMarker(node) {
    if (!node || node.type !== NODE_NAME) {
        return null;
    }

    let widget = (node.widgets || []).find((candidate) => candidate?.name === LEGACY_COMPAT_WIDGET);
    if (!widget && typeof node.addWidget === "function") {
        widget = node.addWidget(
            "toggle",
            LEGACY_COMPAT_WIDGET,
            false,
            (value) => {
                widget.value = value === true;
            },
            { serialize: true },
        );
    }
    if (!widget) {
        return null;
    }

    widget.value = widget.value === true;
    widget.hidden = true;
    widget.type = "hidden";
    widget.options = { ...(widget.options || {}), serialize: true };
    widget.computeSize = () => [0, -4];
    widget.serializeValue = () => widget.value === true;
    if (widget.element) {
        widget.element.style.display = "none";
    }
    return widget;
}

app.registerExtension({
    name: "Deno.LTX.TiledSamplerSavedWorkflowCompatibility",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_NAME) {
            return;
        }

        const previousOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = previousOnNodeCreated?.apply(this, args);
            ensureLegacyCompatibilityMarker(this);
            return result;
        };

        const previousOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = previousOnConfigure?.apply(this, args);
            ensureLegacyCompatibilityMarker(this);
            return result;
        };
    },

    nodeCreated(node) {
        ensureLegacyCompatibilityMarker(node);
    },
});

if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.__DENO_LTX_TILED_COMPAT_TEST_HOOK__ === "function"
) {
    globalThis.__DENO_LTX_TILED_COMPAT_TEST_HOOK__({
        ensureLegacyCompatibilityMarker,
        LEGACY_COMPAT_WIDGET,
        NODE_NAME,
    });
}
