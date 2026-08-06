import assert from "node:assert/strict";
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

const localStorageState = new Map();
let localStorageWrites = 0;
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
    TextEncoder,
    app: {
        graph: { _nodes: [], getNodeById() { return null; }, setDirtyCanvas() {} },
        canvas: { graph: { _nodes: [], getNodeById() { return null; } } },
        registerExtension() {},
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
    localStorage: {
        getItem(key) { return localStorageState.get(String(key)) ?? null; },
        setItem(key, value) {
            localStorageWrites += 1;
            localStorageState.set(String(key), String(value));
        },
    },
    LiteGraph: {
        NODE_WIDGET_HEIGHT: 24,
        WIDGET_BGCOLOR: "#222",
        WIDGET_OUTLINE_COLOR: "#555",
    },
    Image: class {},
    capturedApi: null,
};
context.globalThis = context;
context.__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__ = (testApi) => {
    context.capturedApi = testApi;
};

vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const hooks = context.capturedApi;
assert(hooks, "Local LLM preset-storage test API was not exposed");

function jsonResponse(payload, status = 200) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() { return text; },
    };
}

class FakeUserDataApi {
    constructor(initialFile = null) {
        this.file = initialFile;
        this.getCalls = [];
        this.storeCalls = [];
        this.storeStatus = 200;
        this.throwOnStore = null;
    }

    async getUserData(file, options) {
        this.getCalls.push({ file, options });
        return this.file === null ? jsonResponse("", 404) : jsonResponse(this.file, 200);
    }

    async storeUserData(file, data, options) {
        this.storeCalls.push({ file, data, options });
        if (this.throwOnStore) throw this.throwOnStore;
        if (this.storeStatus === 200) this.file = String(data);
        return jsonResponse({}, this.storeStatus);
    }
}

const legacyValid = { id: "user_legacy_a", label: "Legacy A", text: "legacy text" };
localStorageState.set(hooks.SYSTEM_PROMPT_PRESET_STORAGE_KEY, JSON.stringify([
    legacyValid,
    { id: "user_legacy_duplicate", label: "legacy a", text: "duplicate" },
    { id: "../escape", label: "Bad id", text: "bad" },
    { id: "user_too_large", label: "Too large", text: "x".repeat(64 * 1024 + 1) },
]));
const legacyState = hooks.readLegacySystemPromptUserPresetState(context.localStorage);
assert.deepEqual(JSON.parse(JSON.stringify(legacyState.presets)), [legacyValid]);
assert.equal(legacyState.rejectedCount, 3, "invalid, duplicate, and oversized legacy entries must be ignored visibly");
assert.equal(localStorageWrites, 0, "reading or normalizing legacy presets must never rewrite browser storage");

assert.equal(hooks.durableSystemPromptPresetApiAvailable({}), false);
assert.deepEqual(
    JSON.parse(JSON.stringify(await hooks.readDurableSystemPromptUserPresets({}))),
    { status: "unavailable", presets: [] },
    "missing core userdata methods must produce the safe read-only fallback state",
);

const missingApi = new FakeUserDataApi();
const missing = await hooks.readDurableSystemPromptUserPresets(missingApi);
assert.equal(missing.status, "missing");
assert.deepEqual(JSON.parse(JSON.stringify(missing.presets)), []);
assert.equal(missingApi.getCalls[0].file, hooks.SYSTEM_PROMPT_PRESET_USERDATA_FILE);

const durableA = { id: "user_durable_a", label: "Durable A", text: "first" };
const durableApi = new FakeUserDataApi(JSON.stringify({ version: 1, presets: [durableA] }));
const loaded = await hooks.readDurableSystemPromptUserPresets(durableApi);
assert.equal(loaded.status, "loaded");
assert.deepEqual(JSON.parse(JSON.stringify(loaded.presets)), [durableA]);

const malformedApi = new FakeUserDataApi("{bad json");
await assert.rejects(
    hooks.readDurableSystemPromptUserPresets(malformedApi),
    /malformed JSON/,
    "malformed durable JSON must fail instead of becoming an empty preset list",
);
const oversizedFileApi = new FakeUserDataApi("x".repeat(hooks.SYSTEM_PROMPT_PRESET_MAX_FILE_BYTES + 1));
await assert.rejects(hooks.readDurableSystemPromptUserPresets(oversizedFileApi), /exceeds/);
assert.throws(
    () => hooks.normalizeSystemPromptPresetEnvelope({
        version: 1,
        presets: [{ id: "user_large", label: "Large", text: "x".repeat(64 * 1024 + 1) }],
    }),
    /text exceeds/,
);

const saveApi = new FakeUserDataApi();
const saved = await hooks.writeDurableSystemPromptUserPresets([durableA], saveApi);
assert.deepEqual(JSON.parse(JSON.stringify(saved)), [durableA]);
assert.equal(saveApi.storeCalls.length, 1);
assert.equal(saveApi.storeCalls[0].file, hooks.SYSTEM_PROMPT_PRESET_USERDATA_FILE);
assert.equal(saveApi.storeCalls[0].options.stringify, false);
assert.deepEqual(JSON.parse(saveApi.file), { version: 1, presets: [durableA] });

const updatedA = { ...durableA, text: "updated" };
await hooks.writeDurableSystemPromptUserPresets([updatedA], saveApi);
assert.deepEqual(JSON.parse(saveApi.file), { version: 1, presets: [updatedA] }, "Save Preset must replace durable content");
await hooks.writeDurableSystemPromptUserPresets([], saveApi);
assert.deepEqual(JSON.parse(saveApi.file), { version: 1, presets: [] }, "Delete must persist the remaining durable list");

const failedApi = new FakeUserDataApi(JSON.stringify({ version: 1, presets: [durableA] }));
failedApi.storeStatus = 500;
const beforeFailure = failedApi.file;
await assert.rejects(hooks.writeDurableSystemPromptUserPresets([], failedApi), /HTTP 500/);
assert.equal(failedApi.file, beforeFailure, "a failed save must leave the prior durable file untouched");

const legacyNew = { id: "user_legacy_new", label: "Legacy New", text: "new" };
const merge = hooks.mergeSystemPromptPresetLists(
    [durableA],
    [
        { id: durableA.id, label: "Different label", text: "id conflict" },
        { id: "user_label_conflict", label: "durable a", text: "label conflict" },
        legacyNew,
    ],
);
assert.deepEqual(JSON.parse(JSON.stringify(merge.presets)), [durableA, legacyNew]);
assert.equal(merge.importedCount, 1);
assert.equal(merge.skippedCount, 2);
const importApi = new FakeUserDataApi(JSON.stringify({ version: 1, presets: [durableA] }));
await hooks.writeDurableSystemPromptUserPresets(merge.presets, importApi);
const secondMerge = hooks.mergeSystemPromptPresetLists(JSON.parse(importApi.file).presets, [legacyNew]);
assert.equal(secondMerge.importedCount, 0, "the unchanged browser backup must not be imported twice");
assert.equal(localStorageWrites, 0, "durable save/delete/import must leave browser storage untouched");

const describe = (text, presets = [], status = "ready") =>
    JSON.parse(JSON.stringify(hooks.describeSystemPromptPreset(text, presets, status)));
assert.equal(describe("   \n\t").label, "Empty", "whitespace-only prompts are execution-equivalent to Empty");
const promptOnly = JSON.parse(JSON.stringify(hooks.BUILTIN_SYSTEM_PROMPT_PRESETS)).find(
    (preset) => preset.id === "prompt_only",
);
assert.equal(describe(promptOnly.text).label, "Prompt Only", "built-in presets must be identified without durable data");
const testPreset = { id: "user_test", label: "Test", text: "line one\nline two" };
assert.equal(describe("line one\r\nline two", [testPreset]).label, "Test", "CRLF and LF must compare equally");
assert.equal(describe(" line one\nline two", [testPreset]).label, "Custom", "meaningful surrounding whitespace must not be normalized away");
assert.equal(describe("unmatched", [], "loading").label, "Checking...", "unknown text must not be called Custom before durable presets load");
assert.equal(
    describe(testPreset.text, [testPreset, { id: "user_test_copy", label: "Test Copy", text: testPreset.text }]).label,
    "2 matches",
    "duplicate exact preset bodies must not claim one arbitrary active name",
);
assert.equal(describe("unmatched", [], "error").label, "Custom", "preset-read failure must leave prompt use available as Custom");

hooks.systemPromptPresetPageCache.status = "idle";
hooks.systemPromptPresetPageCache.presets = [];
hooks.systemPromptPresetPageCache.promise = null;
hooks.systemPromptPresetPageCache.readStatus = "idle";
hooks.systemPromptPresetPageCache.error = "";
let pageCacheReads = 0;
let resolvePageCacheRead;
context.api.getUserData = async () => {
    pageCacheReads += 1;
    return await new Promise((resolve) => {
        resolvePageCacheRead = resolve;
    });
};
context.api.storeUserData = async () => jsonResponse({}, 200);
const firstPageCacheLoad = hooks.loadSystemPromptPresetPageCache();
const secondPageCacheLoad = hooks.loadSystemPromptPresetPageCache();
assert.equal(pageCacheReads, 1, "concurrent Local LLM nodes must share one durable preset read");
resolvePageCacheRead(jsonResponse({ version: 1, presets: [testPreset] }, 200));
const [firstPageCacheResult, secondPageCacheResult] = await Promise.all([firstPageCacheLoad, secondPageCacheLoad]);
assert.deepEqual(JSON.parse(JSON.stringify(firstPageCacheResult.presets)), [testPreset]);
assert.deepEqual(JSON.parse(JSON.stringify(secondPageCacheResult.presets)), [testPreset]);
assert.equal(hooks.systemPromptPresetPageCache.status, "ready");
assert.equal(hooks.describeSystemPromptPreset(testPreset.text).label, "Test", "canvas status must use the loaded page cache");

hooks.setSystemPromptPresetPageCache([{ ...testPreset, label: "Renamed Test" }]);
assert.equal(hooks.describeSystemPromptPreset(testPreset.text).label, "Renamed Test", "verified preset renames must update applied status immediately");
hooks.setSystemPromptPresetPageCache([]);
assert.equal(hooks.describeSystemPromptPreset(testPreset.text).label, "Custom", "deleting a preset must preserve node text and reclassify it as Custom");

console.log("local_llm_preset_storage_harness: ok");
