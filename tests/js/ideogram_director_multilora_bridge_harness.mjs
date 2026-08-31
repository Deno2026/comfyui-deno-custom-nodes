import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repo = process.argv[2];
if (!repo) throw new Error("repo path argument is required");

const source = fs
  .readFileSync(path.join(repo, "web/js/deno_ideogram_director.js"), "utf8")
  .replaceAll("import.meta.url", "\"file:///deno_ideogram_director.js\"");

let helpers = null;
const app = {
  api: { addEventListener() {} },
  registerExtension() {},
  graph: null,
  rootGraph: null,
};
const classList = { add() {}, remove() {}, toggle() {} };
const document = {
  createElement() {
    return {
      classList,
      style: {},
      dataset: {},
      children: [],
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      remove() {},
    };
  },
  getElementById() { return null; },
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
};
const windowObj = {
  comfyAPI: { app: { app } },
  __DENO_IDEOGRAM_DIRECTOR_TEST_HOOK__(api) { helpers = api; },
  addEventListener() {},
  removeEventListener() {},
  setTimeout() {},
  clearTimeout() {},
  LiteGraph: { NEVER: 4 },
};
const context = {
  console,
  document,
  URL,
  window: windowObj,
  setTimeout() {},
  clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "deno_ideogram_director.js" });

if (!helpers?.activeDirectorBoxes || !helpers?.publishDirectorActiveBoxes) {
  throw new Error("Ideogram Director MultiLoRA bridge test hooks were not installed");
}

const active = helpers.activeDirectorBoxes;
const publish = helpers.publishDirectorActiveBoxes;
const same = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
};

same(active([]), [], "zero boxes");
same(active([{ id: 1, enabled: false }]), [], "zero active boxes excludes disabled entries");
same(
  active([
    { id: "only", x: 0.1, y: 0.2, w: 0.3, h: 0.4, enabled: true, desc: "kept private" },
    { id: "off", x: 0.5, y: 0.6, w: 0.2, h: 0.2, enabled: false },
  ]),
  [{ id: "only", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
  "one active box keeps the public integration fields only",
);

const threeSource = [
  { id: 30, x: 0.3, y: 0.1, w: 0.2, h: 0.4, enabled: true },
  { id: 99, x: 0.8, y: 0.8, w: 0.1, h: 0.1, enabled: false },
  { id: 10, x: 0.1, y: 0.2, w: 0.3, h: 0.3 },
  { id: 20, x: 0.6, y: 0.4, w: 0.2, h: 0.2, enabled: true },
];
const three = active(threeSource);
same(three.map((box) => box.id), [30, 10, 20], "three active boxes preserve active source order and stable IDs");
check(three[0] !== threeSource[0], "published boxes are copies, not editor-state references");
three[0].x = 123;
check(threeSource[0].x === 0.3, "downstream mutation cannot alter editor state");

const captionData = JSON.stringify({
  boxes: threeSource,
  stylePalette: ["#123456"],
  importSig: "saved-sig",
  mp: 1.5,
  railWide: true,
});
const parsedCaptionData = JSON.parse(captionData);
const properties = { idd_size_rev: "existing", unrelated: "stay" };
const widgetsValues = [1024, 768, captionData, 44];
const size = [850, 1000];
const node = { properties, widgets_values: widgetsValues, size, unrelatedRuntime: { warm: true } };

publish(node, parsedCaptionData.boxes);
same(node._boxes.map((box) => box.id), [30, 10, 20], "hydrate publishes active boxes");
check(Object.getOwnPropertyDescriptor(node, "_boxes")?.enumerable === false, "_boxes is non-enumerable");
check(!Object.keys(node).includes("_boxes"), "_boxes is absent from enumerable workflow fields");
check(!JSON.stringify(node).includes("_boxes"), "_boxes is absent from serialized workflow JSON");
check(JSON.stringify(parsedCaptionData) === captionData, "publishing does not change caption_data schema or values");

const sameCountEdited = [
  { id: 20, x: 0.61, y: 0.41, w: 0.21, h: 0.22, enabled: true },
  { id: 30, x: 0.31, y: 0.11, w: 0.23, h: 0.44, enabled: true },
  { id: 10, x: 0.11, y: 0.21, w: 0.33, h: 0.34, enabled: true },
];
publish(node, sameCountEdited);
same(node._boxes.map((box) => box.id), [20, 30, 10], "same-count reorder refreshes active order");
same(node._boxes[0], { id: 20, x: 0.61, y: 0.41, w: 0.21, h: 0.22 }, "same-count edit refreshes geometry");
check(node.properties === properties, "same-count sync does not replace unrelated properties");
check(node.widgets_values === widgetsValues, "same-count sync does not replace serialized widgets");
check(node.size === size, "same-count sync does not reset node geometry");
check(node.unrelatedRuntime.warm === true, "same-count sync does not reset unrelated runtime state");

same(publish(node, []), [], "serialize after deleting every box publishes an empty list");
same(node._boxes, [], "node integration surface is empty after delete");

console.log("ideogram director MultiLoRA bridge harness passed");
