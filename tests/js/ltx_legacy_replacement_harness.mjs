import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const replacement = JSON.parse(process.argv[2]);
const fixture = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const oldNode = fixture.nodes.find((node) => node.type === replacement.old_node_id);
assert(oldNode, "legacy fixture node is missing");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const compatSourcePath = path.join(repoRoot, "web", "js", "deno_ltx_tiled_sampler_compat.js");
const compatSource = fs
    .readFileSync(compatSourcePath, "utf8")
    .replace(/^import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];\r?\n/gm, "");

const context = {
    console,
    capturedCompatApi: null,
    capturedExtension: null,
    app: {
        registerExtension(extension) {
            context.capturedExtension = extension;
        },
    },
};
context.globalThis = context;
context.__DENO_LTX_TILED_COMPAT_TEST_HOOK__ = (api) => {
    context.capturedCompatApi = api;
};
vm.createContext(context);
vm.runInContext(compatSource, context, { filename: compatSourcePath });
assert(context.capturedCompatApi, "compatibility marker helper was not exposed");

const widgetNames = [
    "horizontal_tiles",
    "vertical_tiles",
    "overlap",
    "audio_mode",
    "blend_mode",
    "aggressive_memory_cleanup",
    "debug",
];
const widgetDefaults = [2, 2, 8, "freeze", "hann", true, false];
const newInputNames = [
    "noise",
    "guider",
    "sampler",
    "sigmas",
    "latent_image",
    "horizontal_tiles",
    "vertical_tiles",
    "overlap",
    "audio_mode",
    "blend_mode",
    "aggressive_memory_cleanup",
    "debug",
];

const newNode = {
    id: oldNode.id,
    type: replacement.new_node_id,
    pos: [...oldNode.pos],
    size: [...oldNode.size],
    order: oldNode.order,
    mode: oldNode.mode,
    flags: { ...(oldNode.flags || {}) },
    properties: { ...(oldNode.properties || {}) },
    inputs: newInputNames.map((name) => ({ name, link: null })),
    outputs: [
        { name: "output", links: [] },
        { name: "denoised_output", links: [] },
    ],
    widgets: widgetNames.map((name, index) => ({
        name,
        value: widgetDefaults[index],
        options: {},
    })),
    addWidget(type, name, value, callback, options = {}) {
        const widget = { type, name, value, callback, options };
        this.widgets.push(widget);
        return widget;
    },
};

const marker = context.capturedCompatApi.ensureLegacyCompatibilityMarker(newNode);
assert(marker?.value === false, "fresh current nodes must default the legacy marker to false");
assert(marker.hidden === true, "the compatibility marker must not alter visible controls");
assert(marker.computeSize()[1] < 0, "the compatibility marker must not consume node geometry");

const links = new Map(
    fixture.links.map(([id, originId, originSlot, targetId, targetSlot, type]) => [
        id,
        {
            id,
            origin_id: originId,
            origin_slot: originSlot,
            target_id: targetId,
            target_slot: targetSlot,
            type,
        },
    ]),
);

for (const inputMap of replacement.input_mapping) {
    if (Object.prototype.hasOwnProperty.call(inputMap, "old_id")) {
        const oldInputIndex = oldNode.inputs.findIndex((input) => input.name === inputMap.old_id);
        const newInputIndex = newNode.inputs.findIndex((input) => input.name === inputMap.new_id);
        if (oldInputIndex >= 0 && newInputIndex >= 0) {
            const linkId = oldNode.inputs[oldInputIndex].link;
            if (linkId != null) {
                const link = links.get(linkId);
                link.target_id = newNode.id;
                link.target_slot = newInputIndex;
                newNode.inputs[newInputIndex].link = linkId;
            }
        }

        const oldWidgetIndex = replacement.old_widget_ids.indexOf(inputMap.old_id);
        const newWidget = newNode.widgets.find((widget) => widget.name === inputMap.new_id);
        if (oldWidgetIndex >= 0 && newWidget && oldNode.widgets_values[oldWidgetIndex] !== undefined) {
            newWidget.value = oldNode.widgets_values[oldWidgetIndex];
            newWidget.callback?.(newWidget.value);
        }
    } else {
        const widget = newNode.widgets.find((candidate) => candidate.name === inputMap.new_id);
        if (widget) {
            widget.value = inputMap.set_value;
            widget.callback?.(widget.value);
        }
    }
}

for (const outputMap of replacement.output_mapping) {
    const oldLinks = oldNode.outputs[outputMap.old_idx]?.links || [];
    for (const linkId of oldLinks) {
        const link = links.get(linkId);
        link.origin_id = newNode.id;
        link.origin_slot = outputMap.new_idx;
    }
    newNode.outputs[outputMap.new_idx].links = [...oldLinks];
}

newNode.properties["Node name for S&R"] = replacement.new_node_id;

assert(
    JSON.stringify(newNode.widgets.map((widget) => widget.serializeValue?.() ?? widget.value)) ===
        JSON.stringify([1, 2, 8, "freeze", "hann", false, false, true]),
    "replacement must preserve six legacy values, insert audio freeze, and persist the hidden marker",
);
for (let linkId = 1; linkId <= 5; linkId += 1) {
    const link = links.get(linkId);
    assert(link.target_id === oldNode.id, `required input link ${linkId} target node changed`);
    assert(link.target_slot === linkId - 1, `required input link ${linkId} target slot changed`);
}
assert(links.get(6).target_slot === 9, "linked blend widget must move from slot 8 to slot 9");
assert(links.get(7).origin_slot === 0, "output link 0 must stay on output 0");
assert(links.get(8).origin_slot === 1, "output link 1 must stay on output 1");
assert(
    newNode.properties["Node name for S&R"] === replacement.new_node_id,
    "Node name for S&R must move to the current node ID",
);
assert(marker.value === true, "only replaced legacy nodes may enable video compatibility");

console.log("ltx_legacy_replacement_harness: ok");
