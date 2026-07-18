import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const sourcePath = path.join(repoRoot, "web", "js", "deno_local_llm_refiner.js");
const source = fs
    .readFileSync(sourcePath, "utf8")
    .replace(/^import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];\r?\n/gm, "");

const graph = {
    _nodes: [],
    getNodeById(id) {
        return this._nodes.find((node) => String(node?.id) === String(id)) || null;
    },
    setDirtyCanvas() {},
};

const context = {
    console,
    process,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    WeakMap,
    WeakSet,
    URL,
    URLSearchParams,
    AbortController,
    app: {
        graph,
        canvas: { graph },
        registerExtension(extension) {
            context.capturedExtension = extension;
        },
    },
    api: {
        addEventListener() {},
        apiURL(value) { return value; },
    },
    window: {
        addEventListener() {},
        setTimeout() { return 0; },
        requestAnimationFrame() { return 0; },
        cancelAnimationFrame() {},
    },
    queueMicrotask(callback) { callback(); },
    document: {
        addEventListener() {},
        querySelectorAll() { return []; },
        querySelector() { return null; },
    },
    LiteGraph: {
        NODE_WIDGET_HEIGHT: 24,
        WIDGET_BGCOLOR: "#222",
        WIDGET_OUTLINE_COLOR: "#555",
    },
    Image: class {},
    capturedApi: null,
    capturedExtension: null,
};
context.globalThis = context;
context.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__ = (api) => {
    context.capturedApi = api;
};

vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

const api = context.capturedApi;
assert(api, "Local LLM async-action test API was not exposed");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function response(payload, ok = true, status = 200) {
    return {
        ok,
        status,
        async json() { return payload; },
    };
}

function makeWidget(name, value, values = []) {
    return {
        name,
        label: name,
        value,
        type: values.length ? "combo" : "text",
        options: values.length ? { values: [...values], list: [...values] } : {},
    };
}

function makeNode(id) {
    const node = {
        id,
        type: "DenoLocalLLMRefiner",
        graph,
        properties: {},
        inputs: [],
        outputs: [],
        size: [560, 300],
        __denoLocalLLMRefreshing: true,
        widgets: [
            makeWidget("provider", "Ollama", ["Ollama", "LM Studio", "llama.cpp", "vLLM", "Custom"]),
            makeWidget("ollama_model", "qwen3", ["qwen3"]),
            makeWidget("lm_studio_model", "google/gemma", ["google/gemma"]),
            makeWidget("custom_server_url", "http://127.0.0.1:8000/v1"),
            makeWidget("custom_model", "custom-model"),
            makeWidget("model_memory", "Unload after run", ["Unload after run", "Keep for minutes", "Keep loaded"]),
            makeWidget("keep_minutes", 5),
        ],
        addWidget(type, name, value, callback, options = {}) {
            const widget = { type, name, label: name, value, callback, options };
            this.widgets.push(widget);
            return widget;
        },
        setDirtyCanvas() {},
    };
    return node;
}

const fetchCalls = [];
context.fetch = (url, options = {}) => {
    const pending = deferred();
    fetchCalls.push({ url, options, pending });
    return pending.promise;
};

const actionNode = makeNode(10);
graph._nodes = [actionNode];
const staleRefresh = api.refreshModels(actionNode);
assert(fetchCalls.length === 1 && fetchCalls[0].url.endsWith("/models"), "Refresh must start the model-list request");
const refreshSignal = fetchCalls[0].options.signal;
const newerUnload = api.unloadLocalModel(actionNode);
assert(fetchCalls.length === 2 && fetchCalls[1].url.endsWith("/unload"), "Unload must supersede the older refresh action");
assert(refreshSignal?.aborted === true, "A superseded read-only Refresh request must be aborted");
fetchCalls[1].pending.resolve(response({ ok: true, message: "newer unload finished" }));
await newerUnload;
assert(api.getLocalLLMNodeState(actionNode).status === "LLM unloaded", "The newer Unload response must own visible state");
fetchCalls[0].pending.resolve(response({ models: [{ id: "stale-model" }] }));
await staleRefresh;
assert(api.getLocalLLMNodeState(actionNode).status === "LLM unloaded", "A late Refresh response must not overwrite a newer action");
assert(
    !actionNode.properties.denoLocalLLMModelChoicesByProvider?.Ollama,
    "A late Refresh response must not mutate provider model choices",
);

const stopNode = makeNode(14);
graph._nodes = [stopNode];
const staleStop = api.stopLocalModel(stopNode);
const staleStopCall = fetchCalls.at(-1);
const newerStopRefresh = api.refreshModels(stopNode);
const newerStopRefreshCall = fetchCalls.at(-1);
assert(staleStopCall.options.signal?.aborted === false, "Superseding a Stop must not cancel its backend side effect");
newerStopRefreshCall.pending.resolve(response({ models: [{ id: "fresh-after-stop" }] }));
await newerStopRefresh;
assert(api.getLocalLLMNodeState(stopNode).status === "1 models found", "The newer Refresh must own state after Stop");
staleStopCall.pending.resolve(response({ ok: true, message: "late stop response" }));
await staleStop;
assert(api.getLocalLLMNodeState(stopNode).status === "1 models found", "A late Stop response must not overwrite a newer Refresh");

const unloadNode = makeNode(15);
graph._nodes = [unloadNode];
const staleUnload = api.unloadLocalModel(unloadNode);
const staleUnloadCall = fetchCalls.at(-1);
const newerUnloadRefresh = api.refreshModels(unloadNode);
const newerUnloadRefreshCall = fetchCalls.at(-1);
assert(staleUnloadCall.options.signal?.aborted === false, "Superseding Unload must not cancel its backend side effect");
newerUnloadRefreshCall.pending.resolve(response({ models: [{ id: "fresh-after-unload" }] }));
await newerUnloadRefresh;
assert(api.getLocalLLMNodeState(unloadNode).status === "1 models found", "The newer Refresh must own state after Unload");
staleUnloadCall.pending.resolve(response({ ok: true, message: "late unload response" }));
await staleUnload;
assert(api.getLocalLLMNodeState(unloadNode).status === "1 models found", "A late Unload response must not overwrite a newer Refresh");

const repeatedUnloadNode = makeNode(16);
graph._nodes = [repeatedUnloadNode];
const firstUnload = api.unloadLocalModel(repeatedUnloadNode);
const firstUnloadCall = fetchCalls.at(-1);
const fetchCountBeforeRepeat = fetchCalls.length;
await api.unloadLocalModel(repeatedUnloadNode);
assert(fetchCalls.length === fetchCountBeforeRepeat, "Clicking Unload again while it is pending must not duplicate the request");
assert(firstUnloadCall.options.signal?.aborted === false, "A repeated Unload click must let the original unload finish");
firstUnloadCall.pending.resolve(response({ ok: true, message: "original unload finished" }));
await firstUnload;
assert(api.getLocalLLMNodeState(repeatedUnloadNode).status === "LLM unloaded", "The in-flight Unload result must remain visible after a repeated click");

const providerNode = makeNode(11);
graph._nodes = [providerNode];
const providerRefresh = api.refreshModels(providerNode);
const providerRefreshCall = fetchCalls.at(-1);
api.wrapProviderCallback(providerNode);
const providerWidget = api.getWidget(providerNode, "provider");
providerWidget.value = "LM Studio";
providerWidget.callback?.("LM Studio");
assert(providerRefreshCall.options.signal?.aborted === true, "Changing provider must abort its stale Refresh request");
providerRefreshCall.pending.resolve(response({ models: [{ id: "old-ollama-model" }] }));
await providerRefresh;
assert(api.getLocalLLMNodeState(providerNode).provider === "LM Studio", "A late old-provider response must not restore the previous provider");
assert(
    !providerNode.properties.denoLocalLLMModelChoicesByProvider?.Ollama,
    "A late old-provider response must not update hidden old-provider choices",
);

const executionNode = makeNode(12);
const executionGraph = {
    _nodes: [executionNode],
    getNodeById(id) { return String(id) === "12" ? executionNode : null; },
};
executionNode.graph = executionGraph;
graph._nodes = [executionNode];
const executionRefresh = api.refreshModels(executionNode);
const executionRefreshCall = fetchCalls.at(-1);
api.rememberLocalLLMPromptGraph("prompt-12", executionGraph);
assert(
    api.invalidateLocalLLMAsyncActionsForExecutionDetail({ prompt_id: "prompt-12" }, "execution started") === 1,
    "Execution start must invalidate every Loader in the submitted workflow",
);
api.setLocalLLMNodeState(executionNode, { status: "running", provider: "Ollama", model: "qwen3" });
assert(executionRefreshCall.options.signal?.aborted === true, "Execution must abort a stale Refresh request");
executionRefreshCall.pending.resolve(response({ models: [{ id: "too-late" }] }));
await executionRefresh;
assert(api.getLocalLLMNodeState(executionNode).status === "running", "A late Refresh response must not overwrite execution state");

const removedNode = makeNode(13);
graph._nodes = [removedNode];
let previousRemovedCalls = 0;
removedNode.onRemoved = () => { previousRemovedCalls += 1; };
api.installLocalLLMNodeCleanup(removedNode);
const removedRefresh = api.refreshModels(removedNode);
const removedRefreshCall = fetchCalls.at(-1);
removedNode.onRemoved();
assert(previousRemovedCalls === 1, "Async cleanup must preserve the prior onRemoved callback");
assert(removedRefreshCall.options.signal?.aborted === true, "Removing a Loader must abort its stale Refresh request");
removedRefreshCall.pending.resolve(response({ models: [{ id: "removed-node-model" }] }));
await removedRefresh;
assert(
    !removedNode.properties.denoLocalLLMModelChoicesByProvider?.Ollama,
    "A removed node must ignore a late Refresh response",
);

const appQueueRequests = [];
context.app.queuePrompt = function () {
    const pending = deferred();
    appQueueRequests.push(pending);
    return pending.promise;
};
assert(
    api.installLocalLLMAppQueuePromptHook(context.app) === true,
    "The app-level queue hook must install at the pre-serialization boundary",
);

const queueRaceNode = makeNode(17);
graph._nodes = [queueRaceNode];
const queueRaceRefresh = api.refreshModels(queueRaceNode);
const queueRaceRefreshCall = fetchCalls.at(-1);
const queuedFailure = context.app.queuePrompt(0, 1, null).then(
    () => null,
    (error) => error,
);
assert(
    queueRaceRefreshCall.options.signal?.aborted === true,
    "Queue submission must abort stale Refresh before graph serialization and HTTP response",
);
queueRaceRefreshCall.pending.resolve(response({ models: [{ id: "queue-race-stale" }] }));
await queueRaceRefresh;
assert(
    !queueRaceNode.properties.denoLocalLLMModelChoicesByProvider?.Ollama,
    "A late Refresh response must not change model choices even when queue submission fails",
);
appQueueRequests.at(-1).reject(new Error("queue rejected"));
assert((await queuedFailure)?.message === "queue rejected", "The queue hook must preserve queue failures");

const queueStopNode = makeNode(18);
graph._nodes = [queueStopNode];
const queueStop = api.stopLocalModel(queueStopNode);
const queueStopCall = fetchCalls.at(-1);
const queuedSuccess = context.app.queuePrompt(0, 1, null);
assert(
    queueStopCall.options.signal?.aborted === false,
    "Queue submission must not cancel an in-flight Stop backend side effect",
);
queueStopCall.pending.resolve(response({ ok: true, message: "stop completed" }));
appQueueRequests.at(-1).resolve(true);
await Promise.all([queueStop, queuedSuccess]);

console.log("local_llm_async_action_harness: ok");
