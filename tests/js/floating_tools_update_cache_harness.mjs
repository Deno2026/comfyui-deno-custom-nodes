import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_floating_tools.js");
const UPDATE_CACHE_KEY = "denoFloatingTools.comfyStableVersion.v2";
const LEGACY_UPDATE_CACHE_KEY = "denoFloatingTools.updateStatus.v1";
const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function makeResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHarness({
  system,
  tagPages,
  failLatestMetadata = false,
  systemResponses = null,
  systemStatus = 200,
}) {
  let now = 0;
  const storage = new Map();
  const fetchCalls = [];
  const apiCalls = [];
  let registeredExtension = null;
  let systemResponseIndex = 0;

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  const context = {
    console,
    Date: FakeDate,
    URL,
    AbortController: class {
      constructor() {
        this.signal = {};
      }

      abort() {}
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    queueMicrotask() {},
    document: {
      getElementById() {
        return null;
      },
      createElement() {
        return {
          append() {},
          appendChild() {},
          addEventListener() {},
          classList: { add() {}, remove() {}, toggle() {} },
          dataset: {},
          replaceChildren() {},
          setAttribute() {},
          style: {},
        };
      },
      head: { appendChild() {} },
      body: { appendChild() {} },
      addEventListener() {},
      removeEventListener() {},
    },
    app: {
      registerExtension(extension) {
        registeredExtension = extension;
      },
    },
    api: {
      async fetchApi(url) {
        apiCalls.push(url);
        assert.equal(url, "/system_stats");
        const responseSource = Array.isArray(systemResponses)
          ? systemResponses[Math.min(systemResponseIndex, systemResponses.length - 1)]
          : system;
        systemResponseIndex += 1;
        const resolved = await responseSource;
        if (resolved instanceof Error) throw resolved;
        return {
          ...makeResponse({ system: resolved }),
          ok: systemStatus >= 200 && systemStatus < 300,
          status: systemStatus,
        };
      },
    },
    async fetch(url) {
      const textUrl = String(url);
      fetchCalls.push(textUrl);
      assert.ok(
        textUrl.startsWith("https://api.github.com/repos/Comfy-Org/ComfyUI/tags?per_page=100&page="),
        `unexpected non-ComfyUI-Stable request: ${textUrl}`,
      );
      if (failLatestMetadata) throw new Error("remote stable metadata offline");
      const page = Number.parseInt(new URL(textUrl).searchParams.get("page"), 10) || 1;
      return makeResponse(tagPages?.[page - 1] || []);
    },
  };
  context.window = context;
  context.globalThis = context;

  let source = fs.readFileSync(scriptPath, "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  source = source.replace(/import\.meta\.url/g, '"file:///deno_floating_tools.js"');
  source += `
globalThis.__hooks = {
  checkUpdates,
  requestUpdateCheck,
  getLatestMetadataTime,
  isLatestMetadataFresh,
  latestComfyUiStableVersionFromTags,
  hasComfyUiStableUpdate,
};
`;
  vm.runInNewContext(source, context, { filename: scriptPath });
  assert.equal(registeredExtension?.name, "Deno.FloatingTools");

  return {
    fetchCalls,
    apiCalls,
    hooks: context.__hooks,
    setNow(value) {
      now = value;
    },
    setCachedMetadata(metadata) {
      storage.set(UPDATE_CACHE_KEY, JSON.stringify(metadata));
    },
    setLegacyState(state) {
      storage.set(LEGACY_UPDATE_CACHE_KEY, JSON.stringify(state));
    },
    getCachedMetadata() {
      const raw = storage.get(UPDATE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    getLegacyState() {
      const raw = storage.get(LEGACY_UPDATE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function assertSingleComfyUiItem(state, expected) {
  const normalized = plain(state);
  assert.equal(normalized.items.length, 1);
  assert.deepEqual(normalized.items[0], {
    id: "comfyui",
    label: "Version",
    installed: expected.installed,
    latest: expected.latest,
    updateAvailable: expected.updateAvailable,
  });
}

const latestFetchedAt = 1_000_000;
const oneHourLater = latestFetchedAt + 60 * 60 * 1000;
const expiredTime = latestFetchedAt + UPDATE_CACHE_TTL_MS + 1;

// Fresh metadata is reusable, but the installed version is always read live.
{
  const firstPage = [
    { name: "v0.28.0" },
    { name: "v0.99.0-rc1" },
    ...Array.from({ length: 98 }, () => ({ name: "v0.3.0" })),
  ];
  const harness = makeHarness({
    system: {
      comfyui_version: "0.27.0",
      installed_templates_version: "0.1.0",
      comfy_package_versions: [{ name: "comfyui-frontend-package", installed: "1.0.0" }],
    },
    tagPages: [firstPage, [{ name: "v0.28.1" }, { name: "latest" }]],
  });
  harness.setCachedMetadata({ latestVersion: "0.28.0", latestCheckedAt: latestFetchedAt });

  harness.setNow(oneHourLater);
  let state = await harness.hooks.checkUpdates(false);
  assert.equal(harness.fetchCalls.length, 0, "fresh stable metadata should be reused");
  assert.equal(harness.apiCalls.length, 1, "installed core must still be read live");
  assert.equal(state.status, "updates");
  assertSingleComfyUiItem(state, { installed: "0.27.0", latest: "0.28.0", updateAvailable: true });
  assert.equal(harness.hooks.hasComfyUiStableUpdate(state), true);
  assert.deepEqual(harness.getCachedMetadata(), {
    latestVersion: "0.28.0",
    latestCheckedAt: latestFetchedAt,
  }, "using a cache must not slide its freshness timestamp");

  harness.setNow(expiredTime);
  state = await harness.hooks.checkUpdates(false);
  assert.equal(harness.fetchCalls.length, 2, "all stable tag pages should be fetched after expiry");
  assert.equal(state.latestCheckedAt, expiredTime);
  assertSingleComfyUiItem(state, { installed: "0.27.0", latest: "0.28.1", updateAvailable: true });
  assert.deepEqual(Object.keys(harness.getCachedMetadata()).sort(), ["latestCheckedAt", "latestVersion"]);
}

// A local core newer than cached metadata forces a stable metadata refresh.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setCachedMetadata({ latestVersion: "0.28.0", latestCheckedAt: latestFetchedAt });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(false);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(state.status, "latest");
  assertSingleComfyUiItem(state, { installed: "0.28.1", latest: "0.28.1", updateAvailable: false });
}

// Frontend and template drift is ignored when the stable core is current.
{
  const harness = makeHarness({
    system: {
      comfyui_version: "0.28.1",
      installed_templates_version: "0.1.0",
      required_frontend_version: "1.0.0",
      comfy_package_versions: [
        { name: "comfyui-workflow-templates", installed: "0.1.0" },
        { name: "comfyui-frontend-package", installed: "1.0.0" },
      ],
    },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(true);
  assert.equal(state.status, "latest");
  assertSingleComfyUiItem(state, { installed: "0.28.1", latest: "0.28.1", updateAvailable: false });
  assert.equal(harness.hooks.hasComfyUiStableUpdate(state), false);
  assert.equal(harness.fetchCalls.length, 1);
}

// A legacy three-package cache cannot render or authorize NEW in the v2 contract.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  const legacyState = {
    status: "updates",
    checkedAt: latestFetchedAt,
    items: [
      { id: "comfyui", installed: "0.28.1", latest: "0.28.1", updateAvailable: false },
      { id: "templates", installed: "0.1.0", latest: "9.9.9", updateAvailable: true },
      { id: "frontend", installed: "1.0.0", latest: "9.9.9", updateAvailable: true },
    ],
  };
  harness.setLegacyState(legacyState);
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(false);
  assert.equal(harness.fetchCalls.length, 1, "v1 cache must be ignored");
  assert.equal(state.status, "latest");
  assertSingleComfyUiItem(state, { installed: "0.28.1", latest: "0.28.1", updateAvailable: false });
  assert.deepEqual(harness.getLegacyState(), legacyState, "legacy cache is inert, not migrated into v2");
}

// Remote failure is fail-closed: current core remains visible, latest and NEW do not.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [],
    failLatestMetadata: true,
  });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(true);
  assert.equal(state.status, "error");
  assertSingleComfyUiItem(state, { installed: "0.28.1", latest: "", updateAvailable: false });
  assert.equal(harness.hooks.hasComfyUiStableUpdate(state), false);
  assert.equal(harness.getCachedMetadata(), null, "failed metadata must not be cached");
}

// HTTP 200 metadata without a strict numeric stable tag cannot claim Latest.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [[
      { name: "v0.29.0-rc1" },
      { name: "v0.29.0+build" },
      { name: "V0.29.0" },
      { name: "latest" },
    ]],
  });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(true);
  assert.equal(state.status, "error");
  assert.match(state.error, /incomplete/i);
  assert.equal(harness.hooks.hasComfyUiStableUpdate(state), false);
}

// A tag listing that never reaches a terminal short page fails closed at the safety cap.
{
  const fullTagPage = Array.from({ length: 100 }, (_, index) => ({ name: `v0.1.${index}` }));
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: Array.from({ length: 20 }, () => fullTagPage),
  });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(true);
  assert.equal(state.status, "error");
  assert.match(state.error, /safe page limit/i);
  assert.equal(harness.fetchCalls.length, 20);
  assert.equal(harness.hooks.hasComfyUiStableUpdate(state), false);
  assert.equal(harness.getCachedMetadata(), null);
}

// An unavailable or prerelease local core is not silently reported as Latest.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1-rc1" },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(true);
  assert.equal(state.status, "error");
  assert.equal(state.items.length, 0);
  assert.equal(harness.fetchCalls.length, 0, "invalid local metadata should fail before remote fetch");
}

// A non-OK /system_stats response cannot reuse cached versions or reach the remote check.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    systemStatus: 503,
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setCachedMetadata({ latestVersion: "0.28.1", latestCheckedAt: latestFetchedAt });
  harness.setNow(oneHourLater);

  const state = await harness.hooks.checkUpdates(false);
  assert.equal(state.status, "error");
  assert.match(state.error, /local http 503/i);
  assert.equal(state.items.length, 0);
  assert.equal(harness.fetchCalls.length, 0);
}

// Future cache timestamps are rejected and force a refresh.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setCachedMetadata({ latestVersion: "0.28.1", latestCheckedAt: oneHourLater + 1 });
  harness.setNow(oneHourLater);

  await harness.hooks.checkUpdates(false);
  assert.equal(harness.fetchCalls.length, 1);
}

// A manual click during the automatic check queues exactly one forced stable refresh.
{
  const firstSystem = deferred();
  const liveSystem = { comfyui_version: "0.28.1" };
  const harness = makeHarness({
    system: liveSystem,
    systemResponses: [firstSystem.promise, liveSystem],
    tagPages: [[{ name: "v0.28.1" }]],
  });
  harness.setNow(oneHourLater);

  const automaticCheck = harness.hooks.checkUpdates(false);
  await nextTick();
  assert.equal(harness.apiCalls.length, 1, "automatic check should be in flight");
  await harness.hooks.requestUpdateCheck(true);
  firstSystem.resolve(liveSystem);
  await automaticCheck;
  for (let attempt = 0; attempt < 10 && (harness.apiCalls.length < 2 || harness.fetchCalls.length < 2); attempt += 1) {
    await nextTick();
  }
  assert.equal(harness.apiCalls.length, 2, "manual force click should queue one extra local check");
  assert.equal(harness.fetchCalls.length, 2, "queued force check should refetch stable metadata once");
}

// Defensive badge authority ignores template-only fabricated states.
{
  const harness = makeHarness({
    system: { comfyui_version: "0.28.1" },
    tagPages: [[{ name: "v0.28.1" }]],
  });
  assert.equal(harness.hooks.hasComfyUiStableUpdate({
    status: "updates",
    items: [{ id: "templates", installed: "0.1.0", latest: "9.9.9", updateAvailable: true }],
  }), false);
  assert.equal(harness.hooks.hasComfyUiStableUpdate({
    status: "updates",
    items: [{ id: "comfyui", installed: "0.28.0", latest: "0.28.1", updateAvailable: true }],
  }), true);
}

console.log("floating-tools ComfyUI Stable cache harness passed");
