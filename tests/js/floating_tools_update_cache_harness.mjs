import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_floating_tools.js");
const UPDATE_CACHE_KEY = "denoFloatingTools.updateStatus.v1";
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

function makeHarness({ system, latestVersions, failLatestMetadata = false, systemResponses = null }) {
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
        return makeResponse({ system: await responseSource });
      },
    },
    async fetch(url) {
      const textUrl = String(url);
      fetchCalls.push(textUrl);
      if (failLatestMetadata) {
        throw new Error("remote latest metadata offline");
      }
      if (textUrl.includes("/ComfyUI/releases/latest")) {
        return makeResponse({ tag_name: latestVersions.comfyui });
      }
      if (textUrl.includes("/comfyui-workflow-templates/json")) {
        return makeResponse({ info: { version: latestVersions.templates } });
      }
      if (textUrl.includes("/comfyui-frontend-package/json")) {
        return makeResponse({ info: { version: latestVersions.frontend } });
      }
      throw new Error(`Unexpected fetch URL: ${textUrl}`);
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
  latestVersionsFromState,
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
    setCachedState(state) {
      storage.set(UPDATE_CACHE_KEY, JSON.stringify(state));
    },
    getCachedState() {
      return JSON.parse(storage.get(UPDATE_CACHE_KEY));
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

const latestFetchedAt = 1_000_000;
const oneHourLater = latestFetchedAt + 60 * 60 * 1000;
const expiredTime = latestFetchedAt + UPDATE_CACHE_TTL_MS + 1;

{
  const harness = makeHarness({
    system: {
      comfyui_version: "0.25.1",
      installed_templates_version: "0.10.0",
      comfy_package_versions: [{ name: "comfyui-frontend-package", installed: "1.45.15" }],
    },
    latestVersions: {
      comfyui: "v0.26.1",
      templates: "0.10.7",
      frontend: "1.45.19",
    },
  });
  harness.setCachedState({
    status: "updates",
    checkedAt: latestFetchedAt,
    latestCheckedAt: latestFetchedAt,
    items: [
      { id: "comfyui", label: "ComfyUI", installed: "0.25.1", latest: "0.26.0", updateAvailable: true },
      { id: "templates", label: "Templates", installed: "0.10.0", latest: "0.10.7", updateAvailable: true },
      { id: "frontend", label: "Frontend", installed: "1.45.15", latest: "1.45.19", updateAvailable: true },
    ],
  });

  harness.setNow(oneHourLater);
  await harness.hooks.checkUpdates(false);
  let state = harness.getCachedState();
  assert.equal(harness.fetchCalls.length, 0, "fresh latest metadata should be reused");
  assert.equal(state.checkedAt, oneHourLater, "local sync timestamp should update");
  assert.equal(state.latestCheckedAt, latestFetchedAt, "latest metadata timestamp must not slide");
  assert.equal(harness.hooks.getLatestMetadataTime(state), latestFetchedAt);

  harness.setNow(expiredTime);
  await harness.hooks.checkUpdates(false);
  state = harness.getCachedState();
  assert.equal(harness.fetchCalls.length, 3, "expired latest metadata should be fetched");
  assert.equal(state.latestCheckedAt, expiredTime);
  assert.equal(state.items.find((item) => item.id === "comfyui").latest, "0.26.1");
}

{
  const harness = makeHarness({
    system: {
      comfyui_version: "0.26.2",
      installed_templates_version: "0.10.7",
      comfy_package_versions: [{ name: "comfyui-frontend-package", installed: "1.45.19" }],
    },
    latestVersions: {
      comfyui: "v0.26.2",
      templates: "0.10.7",
      frontend: "1.45.19",
    },
  });
  harness.setCachedState({
    status: "updates",
    checkedAt: latestFetchedAt,
    latestCheckedAt: latestFetchedAt,
    items: [
      { id: "comfyui", label: "ComfyUI", installed: "0.25.1", latest: "0.26.0", updateAvailable: true },
      { id: "templates", label: "Templates", installed: "0.10.0", latest: "0.10.0", updateAvailable: false },
      { id: "frontend", label: "Frontend", installed: "1.45.15", latest: "1.45.15", updateAvailable: false },
    ],
  });

  harness.setNow(oneHourLater);
  await harness.hooks.checkUpdates(false);
  const state = harness.getCachedState();
  assert.equal(harness.fetchCalls.length, 3, "installed newer than cached latest should force metadata fetch");
  assert.equal(state.latestCheckedAt, oneHourLater);
  assert.deepEqual(
    state.items.map((item) => [item.id, item.installed, item.latest, item.updateAvailable]),
    [
      ["comfyui", "0.26.2", "0.26.2", false],
      ["templates", "0.10.7", "0.10.7", false],
      ["frontend", "1.45.19", "1.45.19", false],
    ],
  );
}

{
  const harness = makeHarness({
    system: {
      comfyui_version: "0.26.2",
      installed_templates_version: "0.10.7",
      comfy_package_versions: [{ name: "comfyui-frontend-package", installed: "1.45.19" }],
    },
    latestVersions: {},
    failLatestMetadata: true,
  });

  harness.setNow(oneHourLater);
  await harness.hooks.checkUpdates(true);
  const state = harness.getCachedState();
  assert.equal(state.status, "error");
  assert.equal(state.items.length, 3);
  assert.deepEqual(
    state.items.map((item) => [item.id, item.installed, item.latest, item.updateAvailable]),
    [
      ["comfyui", "0.26.2", "", false],
      ["templates", "0.10.7", "", false],
      ["frontend", "1.45.19", "", false],
    ],
    "remote latest failure should keep live installed versions and mark latest values unknown",
  );
}

{
  const firstSystem = deferred();
  const liveSystem = {
    comfyui_version: "0.26.2",
    installed_templates_version: "0.10.7",
    comfy_package_versions: [{ name: "comfyui-frontend-package", installed: "1.45.19" }],
  };
  const harness = makeHarness({
    system: liveSystem,
    systemResponses: [firstSystem.promise, liveSystem],
    latestVersions: {
      comfyui: "v0.26.2",
      templates: "0.10.7",
      frontend: "1.45.19",
    },
  });

  harness.setNow(oneHourLater);
  const automaticCheck = harness.hooks.checkUpdates(false);
  await nextTick();
  assert.equal(harness.apiCalls.length, 1, "automatic check should be in flight");
  await harness.hooks.requestUpdateCheck(true);
  firstSystem.resolve(liveSystem);
  await automaticCheck;
  for (let attempt = 0; attempt < 10 && (harness.apiCalls.length < 2 || harness.fetchCalls.length < 6); attempt += 1) {
    await nextTick();
  }
  assert.equal(harness.apiCalls.length, 2, "manual force click should queue one extra check");
  assert.equal(harness.fetchCalls.length, 6, "queued force check should refetch public latest metadata");
}

console.log("floating-tools update cache harness passed");
