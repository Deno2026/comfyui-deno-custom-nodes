import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcePath = process.argv[2] || path.join(repoRoot, "web", "js", "deno_local_llm_refiner.js");
const source = fs.readFileSync(sourcePath, "utf8")
    .replace(/^import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];\r?\n/gm, "");
const graph = { _nodes: [], setDirtyCanvas() {} };
const context = {
    console, Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map,
    WeakMap, WeakSet, URL, URLSearchParams, AbortController,
    app: { graph, canvas: { graph }, registerExtension() {} },
    api: { addEventListener() {}, apiURL(value) { return value; } },
    window: {
        addEventListener() {}, setTimeout() { return 0; },
        requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    },
    document: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; } },
    LiteGraph: { NODE_WIDGET_HEIGHT: 24 },
    Image: class {},
    queueMicrotask(callback) { callback(); },
};
context.globalThis = context;
context.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__ = (api) => { context.testApi = api; };
context.fetch = async () => ({ ok: true, async json() { return { models: [{ id: "llama-a" }, { id: "llama-b" }] }; } });
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const api = context.testApi;
assert(api, "Local LLM test API must be exposed");

const pickerName = "deno_local_llm_model_picker";
const savedValues = [
    "llama.cpp", "qwen3", "google/gemma", "http://127.0.0.1:8080/v1", "saved/custom-model",
    "saved system prompt", true, 17, "fixed", "Keep loaded", 5,
    "Never unload before LLM call", "saved user prompt",
];
const savedNames = [
    "provider", "ollama_model", "lm_studio_model", "custom_server_url", "custom_model",
    "system_prompt", "thinking", "seed", "seed_mode", "model_memory", "keep_minutes",
    "comfy_vram_policy", "prompt",
];

function makeNode(id, storeBacked = true, removeApi = true) {
    // ComfyUI frontend v1.53.6 stores values after array removal and refuses
    // BaseWidget.name renames to an existing state. Model those public API
    // behaviors instead of letting POJO name assignment always succeed.
    // Sources: src/lib/litegraph/src/widgets/BaseWidget.ts and
    // src/stores/widgetValueStore.ts in Comfy-Org/ComfyUI_frontend/v1.53.6.
    const states = new Map();
    const node = {
        id, type: "DenoLocalLLMRefiner", graph, properties: {}, inputs: [], outputs: [], size: [560, 300],
        __denoLocalLLMRefreshing: true,
        widgets: savedNames.map((name, index) => ({ name, value: savedValues[index], type: "text", options: {} })),
        addWidget(type, name, value, callback, options = {}) {
            let currentName = name;
            let state = { value };
            let registered = false;
            const widget = { type, callback, options, label: name };
            Object.defineProperties(widget, {
                name: {
                    configurable: true,
                    get() { return currentName; },
                    set(next) {
                        if (next === currentName) return;
                        if (registered) {
                            if (storeBacked && states.has(next)) return;
                            states.delete(currentName);
                            states.set(next, state);
                        }
                        currentName = next;
                    },
                },
                value: { configurable: true, get() { return state.value; }, set(next) { state.value = next; } },
            });
            this.widgets.push(widget);
            if (storeBacked) {
                // BaseWidget.setNodeId uses ensureUniqueWidgetNames before
                // registration, generating the reported #1/#2 aliases.
                const reserved = new Set(this.widgets.map((candidate) => candidate.name));
                const used = new Set();
                for (const candidate of this.widgets) {
                    if (used.has(candidate.name)) {
                        let suffix = 1;
                        while (used.has(`${candidate.name}#${suffix}`) || reserved.has(`${candidate.name}#${suffix}`)) suffix++;
                        candidate.name = `${candidate.name}#${suffix}`;
                    }
                    used.add(candidate.name);
                }
            }
            state = states.get(currentName) || state;
            states.set(currentName, state);
            registered = true;
            return widget;
        },
        setDirtyCanvas() {},
    };
    if (removeApi) {
        node.removeWidget = function (widget) {
            const index = this.widgets.indexOf(widget);
            if (index < 0) return;
            if (!this.widgets.some((candidate) => candidate !== widget && candidate.name === widget.name)) {
                states.delete(widget.name);
            }
            widget.onRemove?.();
            this.widgets.splice(index, 1);
        };
    }
    node.states = states;
    graph._nodes.push(node);
    api.wrapProviderCallback(node);
    return node;
}

function pickerRows(node) {
    return node.widgets.filter((widget) => /^deno_local_llm_model_picker(?:#\d+)*$/.test(widget.name) || (/^Detected Models(?:#\d+)*$/.test(widget.name) && widget.type === "combo"));
}

function chooseProvider(node, provider) {
    const widget = api.getWidget(node, "provider");
    widget.value = provider;
    widget.callback?.(provider);
}

for (const [id, storeBacked, removeApi] of [[93, true, true], [94, true, false], [95, false, false]]) {
    const node = makeNode(id, storeBacked, removeApi);
    await api.refreshModels(node);
    assert.equal(pickerRows(node).length, 1, "First refresh creates one picker");
    const first = pickerRows(node)[0];
    assert.equal(first.name, pickerName, "The picker uses its stable internal name");
    assert.equal(first.label, "Detected Models", "The visible label remains unchanged");
    assert.equal(api.getWidget(node, "custom_model").value, "saved/custom-model", "Discovery preserves an unavailable custom model id");

    // A provider switch removes the row. The v1.53.6 store can still have its
    // canonical state, making create-then-rename fail when switching back.
    chooseProvider(node, "Ollama");
    assert.equal(pickerRows(node).length, 0, "Ollama has no OpenAI picker");
    chooseProvider(node, "llama.cpp");
    for (let count = 0; count < 8; count++) await api.refreshModels(node);
    assert.equal(pickerRows(node).length, 1, "Repeated refreshes after a provider switch must reuse one picker");
    assert.equal(pickerRows(node)[0].name, pickerName, "A retained store state cannot prevent canonical naming");
    assert.equal(pickerRows(node)[0].serialize, false, "The frontend's native serializer skips the generated picker");
    for (const [name, label] of [["refresh_models", "Refresh Models"], ["stop_llm", "Stop LLM"], ["unload_llm", "Unload LLM"]]) {
        const button = api.getWidget(node, `deno_local_llm_${name}`);
        assert(button, "Action buttons also use stable internal names after a provider switch");
        assert.equal(button.label, label, "Action button labels stay unchanged");
        assert.equal(button.serialize, false, "The frontend's native serializer skips action buttons");
    }

    const picker = pickerRows(node)[0];
    picker.value = "llama-b";
    picker.callback?.("llama-b");
    assert.equal(api.getWidget(node, "custom_model").value, "llama-b", "A picker selection updates the execution model");
    const serialized = api.localLLMLoaderSerializedValuesFromWidgets(node, savedValues);
    assert.equal(serialized.length, 13, "Picker state must not add a saved positional value");
    assert.equal(serialized[4], "llama-b", "The selected execution model is saved");
    assert.equal(serialized[5], savedValues[5], "System prompt stays at its saved position");
    assert.equal(serialized[12], savedValues[12], "User prompt stays at its saved position");

    // Reopen/configure may restore an older frontend's stale internal key.
    // Legacy public-name rows must be discarded without touching user input.
    const legacyA = node.addWidget("combo", "Detected Models", "legacy-a", () => {}, { values: ["legacy-a"] });
    const legacyB = node.addWidget("combo", "Detected Models", "legacy-b", () => {}, { values: ["legacy-b"] });
    const duplicate = node.addWidget("combo", pickerName, "duplicate", () => {}, { values: ["duplicate"] });
    const unrelated = node.addWidget("combo", "Other model source", "user-value", () => {}, { values: ["user-value"] });
    unrelated.label = "Detected Models";
    let removed = 0;
    for (const widget of [legacyA, legacyB, duplicate]) widget.onRemove = () => { removed++; };
    await api.refreshModels(node);
    assert.equal(pickerRows(node).length, 1, "Existing legacy and canonical duplicates are repaired on refresh");
    assert.equal(pickerRows(node)[0], picker, "The existing canonical picker is reused");
    assert(node.widgets.includes(unrelated), "A matching display label alone must not remove unrelated widgets");
    assert.equal(api.getWidget(node, "custom_model").value, "llama-b", "Duplicate cleanup preserves the selected model");
    if (removeApi) assert.equal(removed, 3, "Cleanup uses the frontend removal lifecycle when available");

    api.updateModelChoices(node, "llama.cpp", []);
    assert.equal(pickerRows(node).length, 0, "An empty authoritative list removes the generated picker");
    api.updateModelChoices(node, "llama.cpp", [{ id: "llama-b" }]);
    assert.equal(pickerRows(node).length, 1, "A list returning after empty refresh recreates just one picker");
    assert.equal(pickerRows(node)[0].name, pickerName, "Recreated pickers keep a stable internal name");
}

console.log("local_llm_model_picker_harness: ok");
