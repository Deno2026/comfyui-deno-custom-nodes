import assert from "node:assert/strict";
import {
    mergeLibraryByStableId,
    promoteLibraryItem,
    readVersionedJsonStorage,
    upsertLibraryItem,
    writeJsonStorage,
} from "../../web/js/deno_frontend_core/storage.js";
import { createLifecycleScope, getNodeLifecycleScope } from "../../web/js/deno_frontend_core/lifecycle.js";
import { createLatestRequest } from "../../web/js/deno_frontend_core/async_latest.js";

class FakeStorage {
    constructor(values = {}) {
        this.values = new Map(Object.entries(values));
    }
    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }
    setItem(key, value) {
        this.values.set(key, String(value));
    }
}

class FakeTarget {
    constructor() {
        this.listeners = new Map();
    }
    addEventListener(type, listener, options) {
        const key = `${type}:${Boolean(options?.capture || options === true)}`;
        const listeners = this.listeners.get(key) || new Set();
        listeners.add(listener);
        this.listeners.set(key, listeners);
    }
    removeEventListener(type, listener, options) {
        const key = `${type}:${Boolean(options?.capture || options === true)}`;
        this.listeners.get(key)?.delete(listener);
    }
    count(type, capture = false) {
        return this.listeners.get(`${type}:${capture}`)?.size || 0;
    }
}

class FakeMutationObserver {
    static instances = [];
    constructor(callback) {
        this.callback = callback;
        this.observeCount = 0;
        this.disconnectCount = 0;
        FakeMutationObserver.instances.push(this);
    }
    observe() {
        this.observeCount += 1;
    }
    disconnect() {
        this.disconnectCount += 1;
    }
}

globalThis.MutationObserver = FakeMutationObserver;

function normalizeLibrary(value = {}) {
    return {
        schema_version: 4,
        presets: Array.isArray(value.presets)
            ? value.presets.map((item) => ({ ...item, id: String(item.id), title: String(item.title || item.id) }))
            : [],
    };
}

function slugify(value) {
    const slug = String(value || "custom_preset")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/gi, "_")
        .replace(/^_+|_+$/g, "");
    return slug || "custom_preset";
}

function uniquePresetId(baseId, presets = []) {
    const safeBase = slugify(baseId || "custom_preset");
    const used = new Set(presets.map((item) => String(item?.id || "")).filter(Boolean));
    if (!used.has(safeBase)) {
        return safeBase;
    }
    let index = 2;
    while (used.has(`${safeBase}_${index}`)) {
        index += 1;
    }
    return `${safeBase}_${index}`;
}

function writePresetLibraryItemFromStorage(storage, packageValue) {
    const latestLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    const presets = upsertLibraryItem(latestLibrary.presets, packageValue);
    const nextLibrary = {
        schema_version: 4,
        presets,
    };
    writeJsonStorage(storage, "library_v4", nextLibrary);
    return nextLibrary;
}

function saveNewPresetFromLatestLibrary(storage, workflowPresets, title, payload) {
    const latestLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    const latestViewPresets = mergeLibraryByStableId(workflowPresets, latestLibrary.presets);
    const id = uniquePresetId(slugify(title), latestViewPresets);
    const packageValue = {
        ...payload,
        id,
        title,
    };
    writePresetLibraryItemFromStorage(storage, packageValue);
    return packageValue;
}

function testStorageContracts() {
    const workflowPresets = [{ id: "workflow_pack", title: "Workflow Pack" }];
    const libraryPresets = [{ id: "library_pack", title: "Library Pack" }];
    const workflowBytes = JSON.stringify({ active_preset_id: "workflow_pack", presets: workflowPresets });
    const storage = new FakeStorage({
        current_v4: "{bad json",
        legacy_v3: JSON.stringify({
            active_preset_id: "library_pack",
            presets: libraryPresets,
        }),
    });

    const library = readVersionedJsonStorage({
        storage,
        currentKey: "current_v4",
        legacyKeys: ["legacy_v3"],
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    const merged = mergeLibraryByStableId(workflowPresets, library.presets);
    assert.deepEqual(library.presets.map((item) => item.id), ["library_pack"]);
    assert.deepEqual(merged.map((item) => item.id), ["workflow_pack", "library_pack"]);
    assert.equal(workflowBytes, JSON.stringify({ active_preset_id: "workflow_pack", presets: workflowPresets }));

    const promoted = promoteLibraryItem(workflowPresets, library.presets[0]);
    assert.deepEqual(promoted.map((item) => item.id), ["workflow_pack", "library_pack"]);
    assert.equal(writeJsonStorage(storage, "current_v4", normalizeLibrary({ presets: promoted })), true);
    assert.match(storage.getItem("current_v4"), /library_pack/);

    const workflowOnlyPresets = [{ id: "workflow_only", title: "Workflow Only" }];
    const savedLibrary = upsertLibraryItem(libraryPresets, workflowOnlyPresets[0]);
    assert.deepEqual(savedLibrary.map((item) => item.id), ["library_pack", "workflow_only"]);
    assert.deepEqual(workflowOnlyPresets.map((item) => item.id), ["workflow_only"]);

    const updatedLibrary = upsertLibraryItem(savedLibrary, { id: "library_pack", title: "Library Pack Updated" });
    assert.deepEqual(updatedLibrary.map((item) => item.id), ["library_pack", "workflow_only"]);
    assert.equal(updatedLibrary[0].title, "Library Pack Updated");
    assert.equal(updatedLibrary[1].title, "Workflow Only");
}

function testConcurrentLibraryViewsPreservePresets() {
    const storage = new FakeStorage({
        library_v4: JSON.stringify({
            schema_version: 4,
            presets: [{ id: "library_a", title: "Library A" }],
        }),
    });
    const staleViewOneLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    const staleViewTwoLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });

    assert.deepEqual(staleViewOneLibrary.presets.map((item) => item.id), ["library_a"]);
    assert.deepEqual(staleViewTwoLibrary.presets.map((item) => item.id), ["library_a"]);

    writePresetLibraryItemFromStorage(storage, { id: "library_b", title: "Library B" });
    writePresetLibraryItemFromStorage(storage, { id: "library_c", title: "Library C" });
    const mergedLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    assert.deepEqual(mergedLibrary.presets.map((item) => item.id), ["library_a", "library_b", "library_c"]);

    writePresetLibraryItemFromStorage(storage, { id: "library_b", title: "Library B Updated" });
    const updatedLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    assert.deepEqual(updatedLibrary.presets.map((item) => item.id), ["library_a", "library_b", "library_c"]);
    assert.deepEqual(updatedLibrary.presets.map((item) => item.title), ["Library A", "Library B Updated", "Library C"]);
}

function testStaleViewsAllocateDistinctNewPresetIds() {
    const storage = new FakeStorage({
        library_v4: JSON.stringify({
            schema_version: 4,
            presets: [{ id: "library_a", title: "Library A", source: "initial" }],
        }),
    });
    const workflowPresets = [];
    const staleViewOneLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    const staleViewTwoLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });

    assert.deepEqual(staleViewOneLibrary.presets.map((item) => item.id), ["library_a"]);
    assert.deepEqual(staleViewTwoLibrary.presets.map((item) => item.id), ["library_a"]);

    const first = saveNewPresetFromLatestLibrary(storage, workflowPresets, "New Preset", { source: "view_1" });
    const second = saveNewPresetFromLatestLibrary(storage, workflowPresets, "New Preset", { source: "view_2" });
    const mergedLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });

    assert.equal(first.id, "new_preset");
    assert.equal(second.id, "new_preset_2");
    assert.deepEqual(mergedLibrary.presets.map((item) => item.id), ["library_a", "new_preset", "new_preset_2"]);
    assert.deepEqual(mergedLibrary.presets.map((item) => item.source), ["initial", "view_1", "view_2"]);

    writePresetLibraryItemFromStorage(storage, { id: "new_preset", title: "New Preset Updated", source: "view_1_updated" });
    const updatedLibrary = readVersionedJsonStorage({
        storage,
        currentKey: "library_v4",
        normalize: normalizeLibrary,
        fallback: normalizeLibrary(),
    });
    assert.deepEqual(updatedLibrary.presets.map((item) => item.id), ["library_a", "new_preset", "new_preset_2"]);
    assert.deepEqual(updatedLibrary.presets.map((item) => item.source), ["initial", "view_1_updated", "view_2"]);
}

function testLifecycleContracts() {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let timeoutCallback = null;
    let animationCallback = null;
    const clearedTimeouts = [];
    const canceledAnimationFrames = [];
    try {
        globalThis.setTimeout = (callback) => {
            timeoutCallback = callback;
            return 101;
        };
        globalThis.clearTimeout = (id) => {
            clearedTimeouts.push(id);
        };
        globalThis.requestAnimationFrame = (callback) => {
            animationCallback = callback;
            return 202;
        };
        globalThis.cancelAnimationFrame = (id) => {
            canceledAnimationFrames.push(id);
        };

        const node = {
            removed: 0,
            onRemoved() {
                this.removed += 1;
            },
        };
        const target = new FakeTarget();
        const scope = getNodeLifecycleScope(node, "model-downloader");
        const sameScope = getNodeLifecycleScope(node, "model-downloader");
        assert.equal(scope, sameScope);

        const listener = () => {};
        scope.addEventListener(target, "click", listener);
        scope.addEventListener(target, "wheel", listener, { capture: true });
        scope.observeMutation({}, () => {}, { childList: true });
        let timeoutFired = 0;
        let animationFrameFired = 0;
        scope.setTimeout(() => {
            timeoutFired += 1;
        }, 10);
        scope.requestAnimationFrame(() => {
            animationFrameFired += 1;
        });
        assert.equal(target.count("click"), 1);
        assert.equal(target.count("wheel", true), 1);
        assert.equal(FakeMutationObserver.instances.at(-1).observeCount, 1);

        node.onRemoved();
        assert.equal(node.removed, 1);
        assert.equal(scope.disposed, true);
        assert.equal(target.count("click"), 0);
        assert.equal(target.count("wheel", true), 0);
        assert.equal(FakeMutationObserver.instances.at(-1).disconnectCount, 1);
        assert.deepEqual(clearedTimeouts, [101]);
        assert.deepEqual(canceledAnimationFrames, [202]);
        timeoutCallback();
        animationCallback(0);
        assert.equal(timeoutFired, 0);
        assert.equal(animationFrameFired, 0);
        scope.dispose();
        assert.equal(FakeMutationObserver.instances.at(-1).disconnectCount, 1);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
}

async function testDisposedLifecycleDoesNotResurrect() {
    const node = {
        panelCount: 0,
        requestCount: 0,
        onRemoved() {},
    };
    const target = new FakeTarget();
    const initialScope = getNodeLifecycleScope(node, "ltx-model-downloader");
    let installedLatePanel = false;

    function scheduleSetupLikeConfigure() {
        const scope = getNodeLifecycleScope(node, "ltx-model-downloader");
        if (!scope.disposed) {
            queueMicrotask(() => {
                const lateScope = getNodeLifecycleScope(node, "ltx-model-downloader");
                if (lateScope.disposed) {
                    return;
                }
                installedLatePanel = true;
                node.panelCount += 1;
                lateScope.addEventListener(target, "click", () => {});
                lateScope.observeMutation({}, () => {}, { childList: true });
                lateScope.setTimeout(() => {
                    node.requestCount += 1;
                }, 0);
            });
        }
    }

    scheduleSetupLikeConfigure();
    node.onRemoved();
    const disposedScope = getNodeLifecycleScope(node, "ltx-model-downloader");
    assert.equal(initialScope.disposed, true);
    assert.equal(disposedScope.disposed, true);
    assert.notEqual(disposedScope, initialScope);
    assert.equal(disposedScope.pendingCleanupCount, 0);

    let disposedTimeoutFired = false;
    disposedScope.addEventListener(target, "click", () => {});
    disposedScope.observeMutation({}, () => {}, { childList: true });
    disposedScope.setTimeout(() => {
        disposedTimeoutFired = true;
    }, 0);
    disposedScope.requestAnimationFrame(() => {
        disposedTimeoutFired = true;
    });
    await Promise.resolve();

    assert.equal(installedLatePanel, false);
    assert.equal(node.panelCount, 0);
    assert.equal(node.requestCount, 0);
    assert.equal(target.count("click"), 0);
    assert.equal(disposedTimeoutFired, false);
}

function testDisposedScopeCleanupImmediate() {
    const node = {
        onRemoved() {},
    };
    const liveScope = getNodeLifecycleScope(node, "disposed-cleanup");
    node.onRemoved();
    assert.equal(liveScope.disposed, true);

    const disposedScope = getNodeLifecycleScope(node, "disposed-cleanup");
    let cleanupCount = 0;
    const unregister = disposedScope.onDispose(() => {
        cleanupCount += 1;
    });
    assert.equal(cleanupCount, 1);
    assert.equal(typeof unregister, "function");
    unregister();
    assert.equal(cleanupCount, 1);
}

function testLiveDisposedScopeCleanupRunsOnce() {
    const scope = createLifecycleScope();
    scope.dispose();
    let cleanupCount = 0;
    const unregister = scope.onDispose(() => {
        cleanupCount += 1;
    });
    assert.equal(cleanupCount, 1);
    assert.equal(typeof unregister, "function");
    unregister();
    assert.equal(cleanupCount, 1);
}

async function testCompletedCleanupCountsStayStable() {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const timers = [];
    const frames = [];
    let nextTimeoutId = 0;
    let nextFrameId = 1000;

    try {
        globalThis.setTimeout = (callback) => {
            const id = ++nextTimeoutId;
            timers.push({ id, callback });
            return id;
        };
        globalThis.clearTimeout = (id) => {
            const index = timers.findIndex((timer) => timer.id === id);
            if (index >= 0) {
                timers.splice(index, 1);
            }
        };
        globalThis.requestAnimationFrame = (callback) => {
            const id = ++nextFrameId;
            frames.push({ id, callback });
            return id;
        };
        globalThis.cancelAnimationFrame = (id) => {
            const index = frames.findIndex((frame) => frame.id === id);
            if (index >= 0) {
                frames.splice(index, 1);
            }
        };

        const scope = getNodeLifecycleScope({}, "cleanup-stability");
        const baseline = scope.pendingCleanupCount;
        for (let index = 0; index < 100; index += 1) {
            let timeoutFired = 0;
            let frameFired = 0;
            scope.setTimeout(() => {
                timeoutFired += 1;
            }, 0);
            timers.shift().callback();
            assert.equal(timeoutFired, 1);
            assert.equal(scope.pendingCleanupCount, baseline);

            scope.requestAnimationFrame(() => {
                frameFired += 1;
            });
            frames.shift().callback(index);
            assert.equal(frameFired, 1);
            assert.equal(scope.pendingCleanupCount, baseline);
        }

        const latest = createLatestRequest(scope);
        const afterLatestSetup = scope.pendingCleanupCount;
        assert.equal(afterLatestSetup, baseline + 1);
        const applied = [];
        for (let index = 0; index < 100; index += 1) {
            await latest.run(async () => index, {
                apply(value) {
                    applied.push(value);
                },
            });
            assert.equal(scope.pendingCleanupCount, afterLatestSetup);
        }
        assert.equal(applied.length, 100);
        scope.dispose();
        assert.equal(scope.pendingCleanupCount, 0);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function testLatestRequestContracts() {
    const scope = getNodeLifecycleScope({}, "async");
    const latest = createLatestRequest(scope);
    const first = deferred();
    const second = deferred();
    const applied = [];
    const errors = [];

    const firstRun = latest.run(async () => first.promise, {
        apply(value) {
            applied.push(value);
        },
        onError(error) {
            errors.push(error);
        },
    });
    const secondRun = latest.run(async () => second.promise, {
        apply(value) {
            applied.push(value);
        },
        onError(error) {
            errors.push(error);
        },
    });
    first.resolve("stale");
    second.resolve("fresh");
    await Promise.all([firstRun, secondRun]);
    assert.deepEqual(applied, ["fresh"]);
    assert.deepEqual(errors, []);

    const held = deferred();
    const disposedRun = latest.run(async () => held.promise, {
        apply(value) {
            applied.push(value);
        },
    });
    scope.dispose();
    held.resolve("disposed");
    await disposedRun;
    assert.deepEqual(applied, ["fresh"]);

    const abortScope = getNodeLifecycleScope({}, "abort");
    const abortLatest = createLatestRequest(abortScope);
    await abortLatest.run(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
    }, {
        onError(error) {
            throw error;
        },
    });
}

async function testDisposedLatestRequestDoesNotStart() {
    const scope = getNodeLifecycleScope({}, "async-disposed");
    const latest = createLatestRequest(scope);
    scope.dispose();

    let taskCalled = false;
    let applyCalled = false;
    let errorCalled = false;

    await latest.run(async () => {
        taskCalled = true;
        return "late";
    }, {
        apply() {
            applyCalled = true;
        },
        onError() {
            errorCalled = true;
        },
    });

    assert.equal(taskCalled, false);
    assert.equal(applyCalled, false);
    assert.equal(errorCalled, false);
    assert.equal(latest.begin(), null);
}

testStorageContracts();
testConcurrentLibraryViewsPreservePresets();
testStaleViewsAllocateDistinctNewPresetIds();
testLifecycleContracts();
await testDisposedLifecycleDoesNotResurrect();
testDisposedScopeCleanupImmediate();
testLiveDisposedScopeCleanupRunsOnce();
await testCompletedCleanupCountsStayStable();
await testLatestRequestContracts();
await testDisposedLatestRequestDoesNotStart();

console.log("ltx_model_downloader_foundation_harness PASS");
