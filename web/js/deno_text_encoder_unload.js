import { app } from "../../scripts/app.js";

const NODE_NAME = "DenoTextEncoderUnload";

const LEGACY_INPUT_NAMES = Object.freeze(["value", "clip", "wait_for"]);
const LEGACY_INPUT_TYPES = Object.freeze([
    Object.freeze(["*", "CONDITIONING"]),
    Object.freeze(["CLIP"]),
    Object.freeze(["*", "CONDITIONING"]),
]);
const LEGACY_OUTPUT_TYPES = Object.freeze(["*", "CONDITIONING"]);

const CURRENT_INPUT_SCHEMA = Object.freeze([
    Object.freeze({
        name: "positive_conditioning",
        type: "CONDITIONING",
        label: "Positive Conditioning",
    }),
    Object.freeze({
        name: "text_encoder",
        type: "CLIP",
        label: "Text Encoder (CLIP)",
    }),
    Object.freeze({
        name: "negative_conditioning",
        type: "CONDITIONING",
        label: "Negative Conditioning",
    }),
]);

const CURRENT_OUTPUT_SCHEMA = Object.freeze([
    Object.freeze({
        name: "positive_conditioning",
        type: "CONDITIONING",
        label: "Positive Conditioning",
    }),
    Object.freeze({
        name: "negative_conditioning",
        type: "CONDITIONING",
        label: "Negative Conditioning",
    }),
]);

function slotNameMatches(slot, expectedName) {
    return Boolean(slot && typeof slot === "object" && slot.name === expectedName);
}

function slotTypeMatches(slot, allowedTypes) {
    return Boolean(slot && typeof slot === "object" && allowedTypes.includes(slot.type));
}

function isExactV0790SerializedSchema(info) {
    if (
        !info ||
        !Array.isArray(info.inputs) ||
        info.inputs.length !== LEGACY_INPUT_NAMES.length ||
        !Array.isArray(info.outputs) ||
        info.outputs.length !== 1
    ) {
        return false;
    }

    if (
        !LEGACY_INPUT_NAMES.every(
            (expected, index) =>
                slotNameMatches(info.inputs[index], expected) &&
                slotTypeMatches(info.inputs[index], LEGACY_INPUT_TYPES[index]),
        )
    ) {
        return false;
    }

    return (
        slotNameMatches(info.outputs[0], "value") &&
        slotTypeMatches(info.outputs[0], LEGACY_OUTPUT_TYPES)
    );
}

function applyCurrentSlotSchema(slot, schema, slotIndex = null) {
    slot.name = schema.name;
    slot.type = schema.type;
    slot.localized_name = schema.label;
    slot.label = schema.label;
    if (slotIndex !== null) {
        slot.slot_index = slotIndex;
    }
}

function migrateLegacyTextEncoderUnloadInfo(info) {
    if (!isExactV0790SerializedSchema(info)) {
        return false;
    }

    for (let index = 0; index < CURRENT_INPUT_SCHEMA.length; index += 1) {
        applyCurrentSlotSchema(info.inputs[index], CURRENT_INPUT_SCHEMA[index]);
    }

    applyCurrentSlotSchema(info.outputs[0], CURRENT_OUTPUT_SCHEMA[0], 0);
    info.outputs.push({
        localized_name: CURRENT_OUTPUT_SCHEMA[1].label,
        name: CURRENT_OUTPUT_SCHEMA[1].name,
        type: CURRENT_OUTPUT_SCHEMA[1].type,
        slot_index: 1,
        links: [],
        label: CURRENT_OUTPUT_SCHEMA[1].label,
    });
    return true;
}

app.registerExtension({
    name: "Deno.TextEncoderUnloadSavedWorkflowCompatibility",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_NAME) {
            return;
        }

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            migrateLegacyTextEncoderUnloadInfo(info);
            return configure?.apply(this, arguments);
        };
    },
});

if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.__DENO_TEXT_ENCODER_UNLOAD_TEST_HOOK__ === "function"
) {
    globalThis.__DENO_TEXT_ENCODER_UNLOAD_TEST_HOOK__({
        CURRENT_INPUT_SCHEMA,
        CURRENT_OUTPUT_SCHEMA,
        LEGACY_INPUT_NAMES,
        NODE_NAME,
        isExactV0790SerializedSchema,
        migrateLegacyTextEncoderUnloadInfo,
    });
}
