import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "web/js/deno_extra_nodes.js");

let hooks = null;
let registeredExtension = null;
const context = {
  console,
  setTimeout(callback) {
    callback();
    return 1;
  },
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  clearInterval() {},
  requestAnimationFrame(callback) {
    callback();
  },
};
context.window = context;
context.globalThis = context;
context.LiteGraph = {
  NODE_WIDGET_HEIGHT: 20,
  vueNodesMode: false,
};
context.api = { addEventListener() {} };
context.app = {
  graph: { links: {} },
  registerExtension(extension) {
    registeredExtension = extension;
  },
};
context.__DENO_EXTRA_NODES_TEST_HOOK__ = (registered) => {
  hooks = registered;
};

let source = fs.readFileSync(scriptPath, "utf8");
source = source.replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: scriptPath });

assert.ok(hooks, "Deno extra nodes frontend did not expose test hooks");
assert.equal(registeredExtension?.name, "Deno.ExtraNodes");

const STATIC_INPUTS = [
  "positive",
  "negative",
  "vae",
  "latent",
  "multi_input",
  "num_images",
  "insert_mode",
  "frame_rate",
  "strength_sync",
  "bypass",
];

function makeInput(name, extra = {}) {
  return {
    name,
    type: "FLOAT",
    link: null,
    widget: null,
    ...extra,
  };
}

function makeWidget(name, value = 0) {
  return {
    name,
    value,
    type: "number",
    callback: null,
    computeSize() {
      return [200, 20];
    },
  };
}

function makeSequencerNode({ count = 1, mode = "frames", id = 101 } = {}) {
  const inputs = STATIC_INPUTS.map((name) => makeInput(name));
  const widgets = [
    { name: "num_images", value: count },
    { name: "insert_mode", value: mode },
    { name: "frame_rate", value: 24 },
    { name: "strength_sync", value: true },
    { name: "bypass", value: false },
  ];

  for (let index = 1; index <= 50; index += 1) {
    const frameWidget = makeWidget(`insert_frame_${index}`, 0);
    const secondWidget = makeWidget(`insert_second_${index}`, 0);
    const strengthWidget = makeWidget(`strength_${index}`, 1);
    inputs.push(makeInput(`insert_frame_${index}`, { type: "INT", widget: frameWidget }));
    inputs.push(makeInput(`insert_second_${index}`, { widget: secondWidget }));
    inputs.push(makeInput(`strength_${index}`, { widget: strengthWidget }));
    widgets.push(frameWidget, secondWidget, strengthWidget);
  }

  const graph = { links: {} };
  return {
    id,
    inputs,
    widgets,
    properties: {
      num_images: count,
      insert_mode: mode,
      frame_rate: 24,
      strength_sync: true,
      bypass: false,
    },
    graph,
    size: [360, 900],
    dirtyCalls: 0,
    arrangeCalls: 0,
    arrange() {
      this.arrangeCalls += 1;
    },
    setSize(size) {
      this.size = [...size];
      this.onResize?.(size);
    },
    setDirtyCanvas() {
      this.dirtyCalls += 1;
    },
    getInputPos(index) {
      const input = this.inputs?.[index];
      if (input?.pos) {
        return input.pos;
      }
      return [10, 80 + index * 20];
    },
    addWidget(type, name, value, callback, options) {
      const widget = makeWidget(name, value);
      widget.type = type;
      widget.callback = callback;
      widget.options = options;
      this.widgets.push(widget);
      return widget;
    },
  };
}

class HarnessSequencerNode {}

HarnessSequencerNode.prototype.configure = function (serializedNode) {
  if (Array.isArray(serializedNode?.inputs)) {
    this.inputs = JSON.parse(JSON.stringify(serializedNode.inputs));
  }
  if (Array.isArray(serializedNode?.size)) {
    this.size = Array.from(serializedNode.size);
  }
  this.properties ||= {};
  if (serializedNode?.properties && typeof serializedNode.properties === "object") {
    Object.assign(this.properties, serializedNode.properties);
  }
  restoreHarnessSequencerWidgetValues(this, serializedNode?.widgets_values);
  return this.onConfigure?.(serializedNode);
};

await registeredExtension.beforeRegisterNodeDef(HarnessSequencerNode, { name: "DenoLTXSequencer" });

function makeConfiguredSequencerNode(options = {}) {
  const node = makeSequencerNode(options);
  Object.setPrototypeOf(node, HarnessSequencerNode.prototype);
  return node;
}

function restoreHarnessSequencerWidgetValues(node, values) {
  if (!Array.isArray(values)) {
    return;
  }
  const staticWidgetNames = [
    "num_images",
    "insert_mode",
    "frame_rate",
    "strength_sync",
    "bypass",
  ];
  for (let index = 0; index < staticWidgetNames.length; index += 1) {
    const widget = node.widgets.find((candidate) => candidate.name === staticWidgetNames[index]);
    if (widget && index < values.length) {
      widget.value = values[index];
      widget.callback?.(values[index]);
    }
  }
  const dynamicStart = staticWidgetNames.length;
  const names = allDynamicNames();
  for (let offset = 0; offset < names.length; offset += 1) {
    const valueIndex = dynamicStart + offset;
    if (valueIndex >= values.length) {
      break;
    }
    const widget = dynamicWidgetByName(node, names[offset]) || node.widgets.find((candidate) => candidate.name === names[offset]);
    if (widget) {
      widget.value = values[valueIndex];
    }
  }
}

function makeFullSequencerWidgetsValues(overrides = {}) {
  const values = [
    overrides.num_images ?? 1,
    overrides.insert_mode ?? "frames",
    overrides.frame_rate ?? 24,
    overrides.strength_sync ?? true,
    overrides.bypass ?? false,
  ];
  for (const name of allDynamicNames()) {
    values.push(overrides[name] ?? (name.startsWith("strength_") ? 1 : 0));
  }
  return values;
}

function setCount(node, count) {
  node.properties.num_images = count;
  node.widgets.find((widget) => widget.name === "num_images").value = count;
  node._applyWidgetCount?.(count);
}

function setMode(node, mode) {
  node.properties.insert_mode = mode;
  node.widgets.find((widget) => widget.name === "insert_mode").value = mode;
  node._denoUpdateVisibility?.();
}

function allDynamicNames() {
  const names = [];
  for (let index = 1; index <= 50; index += 1) {
    names.push(`insert_frame_${index}`, `insert_second_${index}`, `strength_${index}`);
  }
  return names;
}

function dynamicInputs(node) {
  return node.inputs.filter((input) => hooks.getSequencerDynamicInputInfo(input.name));
}

function dynamicWidgetByName(node, name) {
  return hooks.getSequencerDynamicWidget(node, name);
}

function inputByName(node, name) {
  return node.inputs.find((input) => input?.name === name) || null;
}

function assertStaticInputsRemain(node) {
  const names = new Set(node.inputs.map((input) => input.name));
  for (const name of STATIC_INPUTS) {
    assert.ok(names.has(name), `${name} static input should remain active`);
  }
}

function assertActiveDynamicNames(node, expectedNames) {
  const actualNames = Array.from(dynamicInputs(node).map((input) => input.name));
  assert.deepEqual(
    actualNames,
    expectedNames,
    "active dynamic topology should contain only visible or linked rows",
  );
}

function assertDynamicMetadata(input, canonicalWidget) {
  assert.ok(input.widget, `${input.name} input.widget metadata should exist`);
  assert.equal(input.widget.name, input.name, `${input.name} input.widget.name should match input name`);
  assert.notEqual(input.widget, canonicalWidget, `${input.name} input.widget should be plain metadata, not the widget object`);
  assert.deepEqual(
    Object.keys(input.widget),
    ["name"],
    `${input.name} input.widget should serialize only the widget name`,
  );
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(input, "widget"),
    true,
    `${input.name} input.widget metadata must serialize into workflow JSON`,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(input, "_widgetRef"),
    false,
    `${input.name} must not create custom _widgetRef state`,
  );
  const serializedInput = input.toJSON ? input.toJSON() : { ...input };
  assert.equal(serializedInput.widget?.name, input.name, `${input.name} serialized input should keep widget.name`);
  assert.equal(
    Object.prototype.hasOwnProperty.call(serializedInput, "_widget"),
    false,
    `${input.name} serialization must not include the canonical widget object`,
  );
}

function visibleDynamicWidgetNames(node) {
  return new Set(
    (node.widgets || [])
      .filter((widget) => hooks.getSequencerDynamicInputInfo(widget?.name))
      .map((widget) => widget.name),
  );
}

function assertDynamicInputContract(node) {
  const count = Number(node.properties.num_images ?? 0);
  const mode = node.properties.insert_mode ?? "frames";
  const visibleNames = visibleDynamicWidgetNames(node);
  for (const name of allDynamicNames()) {
    const canonicalWidget = dynamicWidgetByName(node, name);
    assert.ok(canonicalWidget, `${name} should have a canonical dynamic widget`);
    const shouldShow =
      hooks.shouldShowSequencerDynamicWidget(node, name, count, mode) &&
      !canonicalWidget.hidden &&
      canonicalWidget.type !== "hidden";
    const activeInput = inputByName(node, name);
    const catalogInput = hooks.getSequencerInputByName(node, name);

    if (shouldShow) {
      assert.ok(activeInput, `${name} should be active when visible or linked`);
      assert.equal(catalogInput, activeInput, `${name} catalog should point at the active input object`);
      assert.ok(visibleNames.has(name), `${name} should have a visible or pinned widget row`);
      assertDynamicMetadata(activeInput, canonicalWidget);
      assert.equal(
        hooks.resolveSequencerInputWidget(activeInput),
        canonicalWidget,
        `${name} active input should bind to the canonical runtime widget`,
      );
      continue;
    }

    assert.equal(activeInput, null, `${name} inactive unlinked input should be pruned from active node.inputs`);
    assert.equal(visibleNames.has(name), false, `${name} inactive unlinked widget should be absent from node.widgets`);
    if (catalogInput) {
      assertDynamicMetadata(catalogInput, canonicalWidget);
      assert.equal(
        hooks.resolveSequencerInputWidget(catalogInput),
        null,
        `${name} inactive catalog input must not keep a live runtime widget`,
      );
      assert.equal(catalogInput.pos, undefined, `${name} inactive catalog input should not keep a socket position`);
    }
  }
}

function assertInputPinReasons(node, name, expectedReasons) {
  const actualReasons = Array.from(hooks.getSequencerInputPinReasons(node, name)).sort();
  assert.deepEqual(
    actualReasons,
    [...expectedReasons].sort(),
    `${name} pin reasons should match`,
  );
}

function simulateNativeArrangeFromRuntimeWidgets(node) {
  for (const input of dynamicInputs(node)) {
    const widget = hooks.resolveSequencerInputWidget(input);
    if (!widget) {
      continue;
    }
    const widgetY = Number.isFinite(widget.last_y) ? widget.last_y : widget.y;
    if (Number.isFinite(widgetY)) {
      input.pos = [10, widgetY + 10];
    }
  }
}

function assertNoGhostGeometryAfterNativeArrange(node) {
  simulateNativeArrangeFromRuntimeWidgets(node);
  assertDynamicInputContract(node);
  const outsideNode = [];
  const duplicatePositions = new Map();
  for (let index = 0; index < (node.inputs || []).length; index += 1) {
    const input = node.inputs[index];
    if (!hooks.getSequencerDynamicInputInfo(input?.name)) {
      continue;
    }
    const pos = input.pos ?? node.getInputPos(index);
    const y = Number(pos?.[1]);
    if (!Number.isFinite(y) || y < 0 || y > Number(node.size?.[1] ?? 0)) {
      outsideNode.push(`${input.name}:${y}`);
    }
    const key = `${Math.round(Number(pos?.[0] ?? 0))},${Math.round(y)}`;
    const existing = duplicatePositions.get(key);
    duplicatePositions.set(key, existing ? `${existing},${input.name}` : input.name);
  }
  const duplicateSocketPositions = [...duplicatePositions.entries()]
    .filter(([, names]) => names.includes(","))
    .map(([pos, names]) => `${pos}:${names}`);
  assert.deepEqual(outsideNode, [], "active dynamic sockets must stay inside the node after native arrange");
  assert.deepEqual(duplicateSocketPositions, [], "active dynamic sockets should not overlap after native arrange");
}

function assertNoDuplicateNames(items, label) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    if (!item?.name) {
      continue;
    }
    if (seen.has(item.name)) {
      dupes.add(item.name);
    }
    seen.add(item.name);
  }
  assert.deepEqual([...dupes], [], `${label} should not contain duplicate names`);
}

function assertLinkTargetsName(node, linkId, expectedName) {
  const link = node.graph.links[linkId];
  assert.ok(link, `${linkId} should exist`);
  const input = node.inputs[link.target_slot];
  assert.equal(input?.name, expectedName, `link ${linkId} target_slot should resolve to ${expectedName}`);
}

function resetSequencerPeerRegistry() {
  context.window.__denoLtxSequencerNodes = new Set();
}

function makeSequencerGraph(nodes = []) {
  const graph = {
    links: {},
    _nodes: nodes,
    getNodeById(id) {
      return this._nodes.find((node) => node.id === id) || null;
    },
  };
  for (const node of nodes) {
    node.graph = graph;
    node.comfyClass = "DenoLTXSequencer";
  }
  return graph;
}

function cloneSerializableInputs(node) {
  return JSON.parse(JSON.stringify(node.inputs));
}

const freshFrames = makeSequencerNode({ count: 1, mode: "frames" });
hooks.setupSequencer(freshFrames);
hooks.catalogSequencerInputSlots(freshFrames);
hooks.reconcileSequencerInputSlots(freshFrames);
assertStaticInputsRemain(freshFrames);
assertActiveDynamicNames(freshFrames, ["insert_frame_1", "strength_1"]);
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);
assertNoDuplicateNames(freshFrames.inputs, "fresh node inputs");
assertNoDuplicateNames(freshFrames.widgets, "fresh node widgets");

setCount(freshFrames, 0);
assertActiveDynamicNames(freshFrames, []);
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);

setCount(freshFrames, 50);
assert.equal(dynamicInputs(freshFrames).length, 100, "count=50 frames should expose 50 frame rows and 50 strength rows");
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);

setCount(freshFrames, 1);
assertActiveDynamicNames(freshFrames, ["insert_frame_1", "strength_1"]);
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);

setCount(freshFrames, 2);
assertActiveDynamicNames(freshFrames, [
  "insert_frame_1",
  "strength_1",
  "insert_frame_2",
  "strength_2",
]);
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);

setMode(freshFrames, "seconds");
assertActiveDynamicNames(freshFrames, [
  "insert_second_1",
  "strength_1",
  "insert_second_2",
  "strength_2",
]);
assertDynamicInputContract(freshFrames);
assertNoGhostGeometryAfterNativeArrange(freshFrames);

const linkedInactive = makeSequencerNode({ count: 1, mode: "frames", id: 202 });
const linkedSlotIndexBefore = linkedInactive.inputs.findIndex((input) => input.name === "insert_second_20");
const inactiveInput = linkedInactive.inputs[linkedSlotIndexBefore];
inactiveInput.link = 9001;
linkedInactive.graph.links[9001] = {
  id: 9001,
  origin_id: 10,
  origin_slot: 0,
  target_id: linkedInactive.id,
  target_slot: linkedSlotIndexBefore,
};
hooks.setupSequencer(linkedInactive);
hooks.catalogSequencerInputSlots(linkedInactive);
hooks.reconcileSequencerInputSlots(linkedInactive);
assertActiveDynamicNames(linkedInactive, ["insert_frame_1", "strength_1", "insert_second_20"]);
assert.notEqual(
  linkedInactive.graph.links[9001].target_slot,
  linkedSlotIndexBefore,
  "linked legacy target_slot should be remapped to the current active input index",
);
assertLinkTargetsName(linkedInactive, 9001, "insert_second_20");
assertDynamicInputContract(linkedInactive);
assertNoGhostGeometryAfterNativeArrange(linkedInactive);

setMode(linkedInactive, "seconds");
setCount(linkedInactive, 20);
assertLinkTargetsName(linkedInactive, 9001, "insert_second_20");
assertDynamicInputContract(linkedInactive);
assertNoGhostGeometryAfterNativeArrange(linkedInactive);

setMode(linkedInactive, "frames");
setCount(linkedInactive, 1);
assertActiveDynamicNames(linkedInactive, ["insert_frame_1", "strength_1", "insert_second_20"]);
assertLinkTargetsName(linkedInactive, 9001, "insert_second_20");
assertDynamicInputContract(linkedInactive);
assertNoGhostGeometryAfterNativeArrange(linkedInactive);
assertNoDuplicateNames(linkedInactive.inputs, "linked legacy inputs");
assertNoDuplicateNames(linkedInactive.widgets, "linked legacy widgets");
assert.doesNotThrow(
  () => JSON.stringify(linkedInactive.inputs),
  "workflow input serialization must not include circular widget references",
);

const uePinnedInactive = makeSequencerNode({ count: 1, mode: "frames", id: 207 });
uePinnedInactive.properties.ue_properties = {
  widget_ue_connectable: {
    insert_second_20: true,
  },
};
hooks.setupSequencer(uePinnedInactive);
hooks.catalogSequencerInputSlots(uePinnedInactive);
hooks.reconcileSequencerInputSlots(uePinnedInactive);
assertActiveDynamicNames(uePinnedInactive, ["insert_frame_1", "strength_1", "insert_second_20"]);
assertInputPinReasons(uePinnedInactive, "insert_second_20", ["use_everywhere_connectable"]);
assert.ok(
  uePinnedInactive.inputs.some((input) => input.name === "insert_second_20"),
  "explicit UE-connectable inactive input should remain available for Use Everywhere",
);
assert.equal(
  uePinnedInactive.inputs.some((input) => input.name === "insert_second_21"),
  false,
  "nearby inactive unpinned input should remain pruned",
);
assertDynamicInputContract(uePinnedInactive);
assertNoGhostGeometryAfterNativeArrange(uePinnedInactive);

const floatingPinnedInactive = makeSequencerNode({ count: 1, mode: "frames", id: 208 });
hooks.setupSequencer(floatingPinnedInactive);
const floatingInput = hooks.getSequencerInputByName(floatingPinnedInactive, "insert_second_20");
assert.ok(floatingInput, "floating-link setup should retain catalog input before pruning");
floatingInput._floatingLinks = new Set([{ id: "drag-preview" }]);
floatingPinnedInactive._denoUpdateVisibility?.();
hooks.reconcileSequencerInputSlots(floatingPinnedInactive);
assertActiveDynamicNames(floatingPinnedInactive, ["insert_frame_1", "strength_1", "insert_second_20"]);
assertInputPinReasons(floatingPinnedInactive, "insert_second_20", ["floating_link"]);
assertDynamicInputContract(floatingPinnedInactive);
assertNoGhostGeometryAfterNativeArrange(floatingPinnedInactive);
floatingInput._floatingLinks.clear();
floatingPinnedInactive._denoUpdateVisibility?.();
hooks.reconcileSequencerInputSlots(floatingPinnedInactive);
assertActiveDynamicNames(floatingPinnedInactive, ["insert_frame_1", "strength_1"]);
assert.equal(
  inputByName(floatingPinnedInactive, "insert_second_20"),
  null,
  "floating-link row should prune from active node.inputs after the floating link is removed",
);
assertDynamicInputContract(floatingPinnedInactive);
assertNoGhostGeometryAfterNativeArrange(floatingPinnedInactive);

const savedLinkedInputs = JSON.parse(JSON.stringify(linkedInactive.inputs));
const restoredLinked = makeSequencerNode({ count: 1, mode: "frames", id: 202 });
restoredLinked.inputs = savedLinkedInputs;
restoredLinked.graph.links[9001] = {
  id: 9001,
  origin_id: 10,
  origin_slot: 0,
  target_id: restoredLinked.id,
  target_slot: savedLinkedInputs.findIndex((input) => input.name === "insert_second_20"),
};
const restoredLinkedInput = restoredLinked.inputs.find((input) => input.name === "insert_second_20");
restoredLinkedInput.link = 9001;
hooks.setupSequencer(restoredLinked);
hooks.catalogSequencerInputSlots(restoredLinked);
hooks.reconcileSequencerInputSlots(restoredLinked);
assertActiveDynamicNames(restoredLinked, ["insert_frame_1", "strength_1", "insert_second_20"]);
assertLinkTargetsName(restoredLinked, 9001, "insert_second_20");
setMode(restoredLinked, "seconds");
setCount(restoredLinked, 20);
assertLinkTargetsName(restoredLinked, 9001, "insert_second_20");
assertDynamicInputContract(restoredLinked);
assertNoGhostGeometryAfterNativeArrange(restoredLinked);

const manualResizeNode = makeSequencerNode({ count: 1, mode: "frames", id: 303 });
hooks.setupSequencer(manualResizeNode);
const manualHeight = 720;
manualResizeNode.setSize([manualResizeNode.size[0], manualHeight]);
assert.equal(manualResizeNode.__denoSequencerManualSizeLocked, true, "manual resize should lock a base height");
assert.equal(manualResizeNode.properties.denoSequencerManualSizeLocked, true, "manual resize lock should persist in workflow properties");
assert.equal(manualResizeNode.properties.denoSequencerManualHeight, manualHeight, "manual base height should persist");
assert.equal(manualResizeNode.properties.denoSequencerLayoutVersion, 3, "layout version should persist in workflow properties");
setCount(manualResizeNode, 1);
setMode(manualResizeNode, "frames");
assert.equal(manualResizeNode.size[1], manualHeight, "count=1 should return to the manual base height");
setCount(manualResizeNode, 50);
assert.ok(manualResizeNode.size[1] > manualHeight, "count=50 should expand beyond the manual base height when content needs it");
assertDynamicInputContract(manualResizeNode);
assertNoGhostGeometryAfterNativeArrange(manualResizeNode);
setCount(manualResizeNode, 1);
assert.equal(manualResizeNode.size[1], manualHeight, "shrinking count should return to the manual base height");

const restoredManualSizeNode = makeSequencerNode({ count: 1, mode: "frames", id: 404 });
restoredManualSizeNode.properties.denoSequencerLayoutVersion = 3;
restoredManualSizeNode.properties.denoSequencerManualSizeLocked = true;
restoredManualSizeNode.properties.denoSequencerManualHeight = manualHeight;
restoredManualSizeNode.size = [360, 460];
hooks.setupSequencer(restoredManualSizeNode);
assert.equal(
  restoredManualSizeNode.size[1],
  manualHeight,
  "saved manual base height should restore even when the loaded size is smaller",
);

const configureExactNode = makeConfiguredSequencerNode({ count: 1, mode: "frames", id: 405 });
hooks.setupSequencer(configureExactNode);
configureExactNode.setSize([configureExactNode.size[0], 811]);
assert.equal(configureExactNode.__denoSequencerManualSizeLocked, true, "precondition should have a manual lock");
assert.equal(configureExactNode.__denoSequencerManualHeight, 811, "precondition should have a manual height");
const incomingUnlocked = makeSequencerNode({ count: 1, mode: "frames", id: 405 });
hooks.setupSequencer(incomingUnlocked);
hooks.reconcileSequencerInputSlots(incomingUnlocked);
configureExactNode.configure({
  id: 405,
  type: "DenoLTXSequencer",
  size: [360, 460],
  inputs: cloneSerializableInputs(incomingUnlocked),
  properties: {
    num_images: 1,
    insert_mode: "frames",
    denoSequencerManualSizeLocked: false,
  },
});
assert.equal(
  configureExactNode.__denoSequencerManualSizeLocked,
  false,
  "incoming workflow lock=false should exact-reset the internal manual lock",
);
assert.equal(
  configureExactNode.__denoSequencerManualHeight,
  null,
  "incoming workflow without manual height should exact-reset the internal manual height",
);
assert.equal(
  configureExactNode.properties.denoSequencerManualSizeLocked,
  false,
  "incoming workflow lock=false should normalize saved property to false",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(configureExactNode.properties, "denoSequencerManualHeight"),
  false,
  "incoming workflow without manual height should delete stale manual height property",
);
assert.ok(
  configureExactNode.size[1] < 811,
  "incoming unlocked workflow should compact auto-fit instead of keeping the previous manual height",
);
assertDynamicInputContract(configureExactNode);
assertNoGhostGeometryAfterNativeArrange(configureExactNode);

const callbackAfterConfigureNode = makeConfiguredSequencerNode({ count: 1, mode: "frames", id: 406 });
hooks.setupSequencer(callbackAfterConfigureNode);
const callbackIncomingNode = makeSequencerNode({ count: 1, mode: "frames", id: 406 });
hooks.setupSequencer(callbackIncomingNode);
hooks.reconcileSequencerInputSlots(callbackIncomingNode);
callbackAfterConfigureNode.configure({
  id: 406,
  type: "DenoLTXSequencer",
  size: [360, 460],
  inputs: cloneSerializableInputs(callbackIncomingNode),
  properties: {
    num_images: 1,
    insert_mode: "frames",
    denoSequencerManualSizeLocked: false,
  },
  widgets_values: makeFullSequencerWidgetsValues({ num_images: 0 }),
});
assert.equal(
  callbackAfterConfigureNode.properties.num_images,
  1,
  "configure-phase stale num_images callback must not overwrite incoming properties",
);
const callbackNumWidget = callbackAfterConfigureNode.widgets.find((widget) => widget.name === "num_images");
callbackNumWidget.value = 2;
callbackNumWidget.callback?.(2);
assert.equal(callbackNumWidget.value, 2, "actual user num_images callback after configure should update widget.value");
assert.equal(
  callbackAfterConfigureNode.properties.num_images,
  2,
  "actual user num_images callback after configure should update properties.num_images",
);
assertActiveDynamicNames(callbackAfterConfigureNode, [
  "insert_frame_1",
  "strength_1",
  "insert_frame_2",
  "strength_2",
]);
assertDynamicInputContract(callbackAfterConfigureNode);
assertNoGhostGeometryAfterNativeArrange(callbackAfterConfigureNode);

const dynamicExactNode = makeConfiguredSequencerNode({ count: 1, mode: "frames", id: 407 });
hooks.setupSequencer(dynamicExactNode);
dynamicExactNode.properties.insert_second_20 = 99.99;
const staleSecond20Widget = dynamicWidgetByName(dynamicExactNode, "insert_second_20");
staleSecond20Widget.value = 99.99;
const dynamicIncomingNode = makeSequencerNode({ count: 1, mode: "frames", id: 407 });
hooks.setupSequencer(dynamicIncomingNode);
hooks.reconcileSequencerInputSlots(dynamicIncomingNode);
dynamicExactNode.configure({
  id: 407,
  type: "DenoLTXSequencer",
  size: [360, 460],
  inputs: cloneSerializableInputs(dynamicIncomingNode),
  properties: {
    num_images: 1,
    insert_mode: "frames",
    denoSequencerManualSizeLocked: false,
  },
  widgets_values: makeFullSequencerWidgetsValues({ insert_second_20: 0 }),
});
assert.equal(
  dynamicExactNode.properties.insert_second_20,
  0,
  "missing incoming insert_second_20 property should rehydrate from widgets_values instead of stale properties",
);
assert.equal(
  dynamicWidgetByName(dynamicExactNode, "insert_second_20").value,
  0,
  "missing incoming insert_second_20 property should reset the canonical widget from widgets_values",
);
assertDynamicInputContract(dynamicExactNode);
assertNoGhostGeometryAfterNativeArrange(dynamicExactNode);

context.LiteGraph.vueNodesMode = true;
assert.equal(hooks.isSequencerVueNodesMode(), true, "Vue Nodes mode should follow LiteGraph.vueNodesMode");
context.LiteGraph.vueNodesMode = false;
assert.equal(hooks.isSequencerVueNodesMode(), false, "Vue Nodes mode should clear when LiteGraph.vueNodesMode is false");

resetSequencerPeerRegistry();
const peerManualHeight = 777;
const peerSource = makeSequencerNode({ count: 1, mode: "frames", id: 501 });
const peerCloneTarget = makeSequencerNode({ count: 1, mode: "frames", id: 502 });
makeSequencerGraph([peerSource, peerCloneTarget]);
hooks.setupSequencer(peerSource);
peerSource.setSize([peerSource.size[0], peerManualHeight]);
assert.equal(peerSource.properties.denoSequencerManualSizeLocked, true, "source manual layout lock should be set");
assert.equal(peerSource.properties.denoSequencerManualHeight, peerManualHeight, "source manual height should be set");
hooks.setupSequencer(peerCloneTarget);
assert.equal(peerCloneTarget.properties.num_images, peerSource.properties.num_images, "fresh peer clone should still copy executable count");
assert.equal(peerCloneTarget.properties.insert_mode, peerSource.properties.insert_mode, "fresh peer clone should still copy executable mode");
assert.notEqual(
  peerCloneTarget.properties.denoSequencerManualSizeLocked,
  true,
  "fresh peer clone must not inherit another node's manual size lock",
);
assert.equal(
  peerCloneTarget.properties.denoSequencerManualHeight,
  undefined,
  "fresh peer clone must not inherit another node's manual height",
);
const restoredPeerClone = makeSequencerNode({ count: 1, mode: "frames", id: 503 });
restoredPeerClone.properties = JSON.parse(JSON.stringify(peerCloneTarget.properties));
restoredPeerClone.inputs = cloneSerializableInputs(peerCloneTarget);
restoredPeerClone.size = Array.from(peerCloneTarget.size);
hooks.setupSequencer(restoredPeerClone);
assert.notEqual(
  restoredPeerClone.size[1],
  peerManualHeight,
  "Save/reload of a peer clone must not resurrect the source node's manual height",
);
assert.notEqual(
  restoredPeerClone.properties.denoSequencerManualSizeLocked,
  true,
  "Save/reload of a peer clone must not resurrect the source node's manual lock",
);

resetSequencerPeerRegistry();
const staleCatalogNode = makeConfiguredSequencerNode({ count: 1, mode: "frames", id: 601 });
const staleSlotIndex = staleCatalogNode.inputs.findIndex((input) => input.name === "insert_second_20");
staleCatalogNode.inputs[staleSlotIndex].link = 6060;
staleCatalogNode.graph.links[6060] = {
  id: 6060,
  origin_id: 1,
  origin_slot: 0,
  target_id: staleCatalogNode.id,
  target_slot: staleSlotIndex,
};
hooks.setupSequencer(staleCatalogNode);
hooks.reconcileSequencerInputSlots(staleCatalogNode);
assertActiveDynamicNames(staleCatalogNode, ["insert_frame_1", "strength_1", "insert_second_20"]);
assertLinkTargetsName(staleCatalogNode, 6060, "insert_second_20");

const cleanReconfiguredNode = makeSequencerNode({ count: 1, mode: "frames", id: 601 });
hooks.setupSequencer(cleanReconfiguredNode);
hooks.reconcileSequencerInputSlots(cleanReconfiguredNode);
staleCatalogNode.graph.links = {};
staleCatalogNode.configure({
  id: 601,
  type: "DenoLTXSequencer",
  size: [360, 460],
  inputs: cloneSerializableInputs(cleanReconfiguredNode),
  properties: {
    num_images: 1,
    insert_mode: "frames",
    denoSequencerManualSizeLocked: false,
  },
});
hooks.reconcileSequencerInputSlots(staleCatalogNode);
assertActiveDynamicNames(staleCatalogNode, ["insert_frame_1", "strength_1"]);
assert.equal(
  hooks.getSequencerInputByName(staleCatalogNode, "insert_second_20"),
  null,
  "same-instance configure must clear stale linked catalog rows that no longer exist in graph.links",
);
assertDynamicInputContract(staleCatalogNode);
assertNoGhostGeometryAfterNativeArrange(staleCatalogNode);

console.log("ltx_sequencer_input_slots_harness passed");
