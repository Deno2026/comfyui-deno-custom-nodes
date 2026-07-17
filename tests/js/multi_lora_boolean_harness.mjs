import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadHooks(relativePath, hookName) {
  let hooks = null;
  const context = {
    console,
    queueMicrotask() {},
    app: {
      graph: { setDirtyCanvas() {} },
      registerExtension() {},
    },
    api: {},
  };
  context.window = context;
  context.globalThis = context;
  context[hookName] = (registered) => {
    hooks = registered;
  };

  const scriptPath = path.join(repoRoot, relativePath);
  let source = fs.readFileSync(scriptPath, "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(source, context, { filename: scriptPath });
  assert.ok(hooks, `${relativePath} did not expose test hooks`);
  return hooks;
}

function verifyBooleanContract(hooks) {
  const falseValues = [false, 0, "", "0", " false ", "OFF", "No"];
  const trueValues = [true, 1, "1", " true ", "ON", "Yes", "legacy-nonempty"];

  for (const value of falseValues) {
    assert.equal(hooks.coerceBooleanValue(value), false, `expected false for ${JSON.stringify(value)}`);
  }
  for (const value of trueValues) {
    assert.equal(hooks.coerceBooleanValue(value), true, `expected true for ${JSON.stringify(value)}`);
  }
  assert.equal(hooks.coerceBooleanValue(null), false);
  assert.equal(hooks.coerceBooleanValue(undefined), false);

  const node = {
    widgets: [
      { name: "enabled_1", value: "false" },
      { name: "enabled_2", value: "1" },
      { name: "lora_1", value: "example.safetensors" },
    ],
  };
  const widgetNames = node.widgets.map((widget) => widget.name);
  hooks.normalizeBool(node, "enabled_1", true);
  hooks.normalizeBool(node, "enabled_2", true);
  assert.equal(node.widgets[0].value, false);
  assert.equal(node.widgets[1].value, true);
  assert.deepEqual(node.widgets.map((widget) => widget.name), widgetNames);
  assert.equal(node.widgets[2].value, "example.safetensors");
}

verifyBooleanContract(loadHooks(
  "web/js/deno_multi_lora.js",
  "__DENO_MULTI_LORA_TEST_HOOK__",
));
verifyBooleanContract(loadHooks(
  "web/js/deno_ltx_multi_lora.js",
  "__DENO_LTX_MULTI_LORA_TEST_HOOK__",
));

console.log("multi_lora_boolean_harness passed");
