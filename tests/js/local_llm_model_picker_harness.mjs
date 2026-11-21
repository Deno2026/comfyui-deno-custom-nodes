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

const savedValues = [
    "llama.cpp", "qwen3", "google/gemma", "http://127.0.0.1:8080/v1", "saved/custom-model",
    "saved system prompt", true, 17, "fixed", "Keep loaded", 5,
    "Never unload before LLM call", "saved user prompt", false,
];
const savedNames = [
    "provider", "ollama_model", "lm_studio_model", "custom_server_url", "custom_model",
    "system_prompt", "thinking", "seed", "seed_mode", "model_memory", "keep_minutes",
    "comfy_vram_policy", "prompt", "save_result_in_files",
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
    assert.equal(api.getLocalLLMNodeState(node).status, "unsupported provider");
    assert.equal(api.getWidget(node, "provider").value, "llama.cpp");
    assert.deepEqual(Array.from(api.getWidget(node, "provider").options.values), ["Ollama", "LM Studio"]);
    assert.deepEqual(Array.from(api.localLLMLoaderSerializedValuesFromWidgets(node, savedValues)), savedValues);

    for (const provider of ["Ollama", "LM Studio", "Ollama"]) {
        chooseProvider(node, provider);
        await api.refreshModels(node);
        assert.deepEqual(Array.from(api.getWidget(node, "provider").options.values), ["Ollama", "LM Studio"]);
        assert.equal(api.getWidget(node, "custom_server_url").hidden, true);
        assert.equal(api.getWidget(node, "custom_model").hidden, true);
        assert.equal(api.getWidget(node, "ollama_model").hidden, provider !== "Ollama");
        assert.equal(api.getWidget(node, "lm_studio_model").hidden, provider !== "LM Studio");
        assert.equal(pickerRows(node).length, 0);
        for (const name of ["refresh_models", "stop_llm", "unload_llm"]) {
            const actions = node.widgets.filter((widget) => widget.name === `deno_local_llm_${name}`);
            assert.equal(actions.length, 1, "Each action remains available once after provider changes");
            assert.equal(actions[0].serialize, false);
        }
        const values = Array.from(api.localLLMLoaderSerializedValuesFromWidgets(node, savedValues));
        assert.deepEqual(values, [provider, ...savedValues.slice(1)], "Switching provider preserves all other positions");
        const restored = makeNode(id + 1000, storeBacked, removeApi);
        api.applyLocalLLMLoaderSavedWidgetValues(restored, values);
        assert.deepEqual(Array.from(api.localLLMLoaderSerializedValuesFromWidgets(restored, null)), values);
    }
}

console.log("local_llm_model_picker_harness: ok");
