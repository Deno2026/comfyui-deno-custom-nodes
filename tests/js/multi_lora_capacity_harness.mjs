import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/js/deno_multi_lora.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
let hooks;
let extension;
const microtasks = [];
const context = {
    console,
    queueMicrotask(fn) { microtasks.push(fn); },
    app: { graph: { setDirtyCanvas() {} }, registerExtension(value) { extension = value; } },
    api: {},
    LiteGraph: { NODE_WIDGET_HEIGHT: 20 },
    addEventListener() {},
    __DENO_MULTI_LORA_TEST_HOOK__(value) { hooks = value; },
};
context.window = context;
vm.runInNewContext(source, context);
const names = Array.from(hooks.multiLoraSerializedWidgetNames());
assert.equal(names.length, 385);
const oldNames = Array.from(hooks.multiLoraSerializedWidgetNames(8));
assert.equal(oldNames.length, 49);
assert.deepEqual(names.slice(0, 49), oldNames);

function makeNode() {
    const node = {
        type: "DenoMultiLoraLoader", size: [450, 100], properties: {},
        widgets: names.map(name => ({ name, value: name === "active_loras" ? 1 :
            name.startsWith("lora_") ? "__none__" : name.startsWith("enabled_") ? true :
            /^(trigger|description)_/.test(name) ? "" : 1, options: {} })),
        addCustomWidget(widget) { this.widgets.push(widget); },
        computeSize() { return [450, this.widgets.filter(w => w.name.startsWith("deno_multi_lora_row_")).length * 24 + 100]; },
        setDirtyCanvas() {},
    };
    return node;
}
function value(node, name) { return node.widgets.find(w => w.name === name).value; }
function set(node, name, v) { node.widgets.find(w => w.name === name).value = v; }

for (const [length, trailingRows] of [[33, 0], [49, 0], [33, 11], [49, 11]]) {
    const saved = oldNames.slice(0, length).map(name => name === "active_loras" ? 8 :
        name.startsWith("enabled_") ? false : name.startsWith("model_strength_") ? 0.3 :
        name.startsWith("clip_strength_") ? -0.2 : `${name}-saved`);
    const restored = hooks.captureMultiLoraSerializedWidgetValues({ widgets_values: [...saved, ...Array(trailingRows).fill(null)] });
    const node = makeNode();
    // Native configure applies trailing custom-row nulls to the new widgets.
    for (const name of names.slice(49, 49 + trailingRows)) set(node, name, null);
    hooks.applyMultiLoraSerializedValuesToWidgets(node, restored);
    hooks.syncMultiLoraSerializedWidgetValues(node);
    assert.deepEqual(Array.from(node.widgets_values.slice(0, length)), saved);
    assert.equal(value(node, "lora_9"), "__none__");
    assert.equal(value(node, "enabled_9"), true);
    assert.equal(value(node, "model_strength_9"), 1);
    assert.equal(value(node, "clip_strength_9"), 1);
}

const node = makeNode();
set(node, "active_loras", 64);
for (let i = 1; i <= 64; i++) {
    set(node, `lora_${i}`, `missing-${i}.safetensors`);
    set(node, `trigger_${i}`, `trigger-${i}`);
    set(node, `description_${i}`, `note-${i}`);
    set(node, `model_strength_${i}`, i / 10);
    set(node, `clip_strength_${i}`, -i / 10);
}
set(node, "enabled_64", false);
hooks.moveLoraSlot(node, 64, 63);
assert.equal(value(node, "lora_63"), "missing-64.safetensors");
assert.equal(value(node, "enabled_63"), false);
assert.equal(value(node, "description_63"), "note-64");
hooks.removeLoraSlot(node, 8);
assert.equal(value(node, "active_loras"), 63);
assert.equal(value(node, "lora_8"), "missing-9.safetensors");
assert.equal(value(node, "trigger_8"), "trigger-9");
assert.equal(value(node, "lora_64"), "__none__");
hooks.syncMultiLoraSerializedWidgetValues(node);
const reopened = makeNode();
hooks.applyMultiLoraSerializedValuesToWidgets(reopened,
    hooks.captureMultiLoraSerializedWidgetValues(JSON.parse(JSON.stringify({widgets_values: node.widgets_values}))));
hooks.syncMultiLoraSerializedWidgetValues(reopened);
assert.deepEqual(Array.from(reopened.widgets_values), Array.from(node.widgets_values));
assert.equal(value(reopened, "enabled_62"), false);
const add = new hooks.DenoAddLoraWidget();
set(reopened, "active_loras", 64);
add.onMouseClick({}, [], reopened);
assert.equal(hooks.activeCount(reopened), 64);
add.onMouseClick({shiftKey: true}, [], reopened);
assert.equal(hooks.activeCount(reopened), 63);
const oldServer = makeNode();
oldServer.widgets = oldServer.widgets.filter(w => oldNames.includes(w.name));
set(oldServer, "active_loras", 8);
add.onMouseClick({}, [], oldServer);
assert.equal(hooks.activeCount(oldServer), 8);
assert.ok(extension);
console.log("multi_lora_capacity_harness passed");
