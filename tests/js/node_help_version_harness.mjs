import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_node_help.js");
const VERSION_CACHE_KEY = "denoCustomNodes.versionStatus.v2";

function makeHarness({ now = 1_000_000, payload = { version: "0.7.68" } } = {}) {
  const storage = new Map();
  const fetchCalls = [];
  let currentPayload = payload;
  let registeredExtension = null;

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
    AbortController,
    setTimeout,
    clearTimeout,
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    document: {
      querySelectorAll() { return []; },
    },
    app: {
      graph: { setDirtyCanvas() {} },
      registerExtension(extension) {
        registeredExtension = extension;
      },
    },
    async fetch(url, options = {}) {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        async json() { return currentPayload; },
        async text() { return ""; },
      };
    },
  };
  context.window = context;
  context.globalThis = context;

  let source = fs.readFileSync(scriptPath, "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  source += `
globalThis.__hooks = {
  getNodeKey,
  loadCachedVersionStatus,
  refreshDenoVersionStatus,
  setCurrentVersionFromDescription,
  getVersionStatus: () => ({ ...denoVersionStatus }),
};
`;
  vm.runInNewContext(source, context, { filename: scriptPath });
  assert.equal(registeredExtension?.name, "Deno.NodeHelp");

  return {
    hooks: context.__hooks,
    fetchCalls,
    setNow(value) { now = value; },
    setPayload(value) { currentPayload = value; },
    setCachedStatus(value) { storage.set(VERSION_CACHE_KEY, JSON.stringify(value)); },
  };
}

{
  const harness = makeHarness();
  const first = { id: 7, type: "DenoImageCompare" };
  const second = { id: 7, type: "DenoImageCompare" };
  assert.equal(harness.hooks.getNodeKey(first), harness.hooks.getNodeKey(first));
  assert.notEqual(
    harness.hooks.getNodeKey(first),
    harness.hooks.getNodeKey(second),
    "popup ownership must follow the node object, not a reused numeric id",
  );
}

{
  const harness = makeHarness({ now: 1_000_000 });
  harness.setCachedStatus({
    status: "latest",
    current_version: "0.7.68",
    latest_version: "0.7.68",
    checked_at: 1_000_001,
  });
  assert.equal(
    harness.hooks.loadCachedVersionStatus("0.7.68"),
    null,
    "a future cache timestamp must not be treated as fresh",
  );
}

{
  const harness = makeHarness({ payload: { status: "ok" } });
  harness.hooks.setCurrentVersionFromDescription("DENO Custom Nodes v0.7.68");
  const status = await harness.hooks.refreshDenoVersionStatus();
  assert.equal(status.status, "unknown");
  assert.equal(status.update_available, false);
  assert.equal(status.latest_version, "");
  assert.match(status.message, /valid version/i);
  assert.equal(harness.fetchCalls.length, 1);
  assert.ok(harness.fetchCalls[0].options.signal, "version requests must be abortable");
}

console.log("node-help version harness passed");
