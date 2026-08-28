import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(
    repoRoot,
    "web",
    "js",
    "deno_minimax_h3_acc_loader_migration.js",
);
const legacyFixturePath = path.join(
    repoRoot,
    "tests",
    "fixtures",
    "public_workflows",
    "minimax_h3_acc_loader_v0794_three_output.json",
);
const currentFixturePath = path.join(
    repoRoot,
    "tests",
    "fixtures",
    "public_workflows",
    "minimax_h3_acc_loader_v0796.json",
);
const previousCurrentFixturePath = path.join(
    repoRoot,
    "tests",
    "fixtures",
    "public_workflows",
    "minimax_h3_acc_loader_v0795.json",
);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertJsonEqual(actual, expected, message) {
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function loaderNode(graph, id = 2) {
    return graph.nodes.find((node) => node.id === id);
}

function linkById(graph, id) {
    return graph.links.find((link) => (Array.isArray(link) ? link[0] : link.id) === id);
}

function assertRootLinkIntegrity(graph) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const link of graph.links) {
        const [id, originId, originSlot, targetId, targetSlot] = Array.isArray(link)
            ? link
            : [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot];
        const originOutput = nodes.get(originId)?.outputs?.[originSlot];
        const targetInput = nodes.get(targetId)?.inputs?.[targetSlot];
        assert.ok(originOutput, `link ${id} must have an origin output`);
        assert.ok(targetInput, `link ${id} must have a target input`);
        assert.equal(
            originOutput.links.filter((linkId) => linkId === id).length,
            1,
            `link ${id} must appear exactly once on its origin output`,
        );
        assert.equal(targetInput.link, id, `link ${id} must match its target input`);
    }
}

function disconnectLegacyOutput(graph, slot, linkId, serializedLinks) {
    const loader = loaderNode(graph);
    loader.outputs[slot].links = serializedLinks;
    graph.links = graph.links.filter((link) => link[0] !== linkId);
    for (const node of graph.nodes) {
        for (const input of node.inputs || []) {
            if (input.link === linkId) {
                input.link = null;
            }
        }
    }
}

let hooks = null;
let extension = null;
const context = {
    console,
    app: {
        registerExtension(registered) {
            extension = registered;
        },
    },
};
context.window = context;
context.globalThis = context;
context.__DENO_MINIMAX_H3_ACC_MIGRATION_TEST_HOOK__ = (registered) => {
    hooks = registered;
};

const source = fs.readFileSync(sourcePath, "utf8").replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: sourcePath });

assert.ok(extension, "MiniMax H3 compatibility extension should register");
assert.ok(hooks, "MiniMax H3 migration helpers should be exposed");
assert.equal(hooks.NODE_NAME, "DenoMiniMaxH3AccLoader");
assert.equal(
    extension.name,
    "Deno.MiniMaxH3AccLoaderSavedWorkflowCompatibility",
);

const legacyFixture = JSON.parse(fs.readFileSync(legacyFixturePath, "utf8"));
const currentFixture = JSON.parse(fs.readFileSync(currentFixturePath, "utf8"));
const previousCurrentFixture = JSON.parse(
    fs.readFileSync(previousCurrentFixturePath, "utf8"),
);
assert.equal(hooks.isExactLegacyMiniMaxH3AccNode(loaderNode(legacyFixture)), true);
assert.equal(hooks.isExactLegacyMiniMaxH3AccNode(loaderNode(currentFixture)), false);
assert.equal(hooks.isExactLegacyMiniMaxH3AccNode(loaderNode(previousCurrentFixture)), false);

// The registered hook must run the same pure migration before graph configure.
const extensionGraph = clone(legacyFixture);
extension.beforeConfigureGraph(extensionGraph);
assert.equal(loaderNode(extensionGraph).outputs.length, 1);
assert.equal(extensionGraph.nodes.filter((node) => node.type === "KSamplerSelect").length, 1);
assert.equal(extensionGraph.nodes.filter((node) => node.type === "BasicScheduler").length, 1);

// Full legacy graph: preserve user state and existing link IDs while inserting stock controls.
const migrated = clone(legacyFixture);
const loaderReference = loaderNode(migrated);
const inputReference = loaderReference.inputs[0];
const modelOutputReference = loaderReference.outputs[0];
const modelLinksReference = modelOutputReference.links;
const unrelatedLoaderFields = {
    id: loaderReference.id,
    type: loaderReference.type,
    pos: clone(loaderReference.pos),
    size: clone(loaderReference.size),
    flags: clone(loaderReference.flags),
    order: loaderReference.order,
    mode: loaderReference.mode,
    title: loaderReference.title,
    properties: clone(loaderReference.properties),
    widgets_values: clone(loaderReference.widgets_values),
    widgets_values_named: clone(loaderReference.widgets_values_named),
    color: loaderReference.color,
    bgcolor: loaderReference.bgcolor,
};
const originalModelLink = clone(linkById(migrated, 2));

assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(migrated), 1);
const migratedLoader = loaderNode(migrated);
assert.equal(migratedLoader, loaderReference, "loader object should be preserved");
assert.equal(migratedLoader.inputs[0], inputReference, "loader input should be preserved");
assert.equal(migratedLoader.outputs.length, 1);
assert.equal(migratedLoader.outputs[0], modelOutputReference, "model output should be preserved");
assert.equal(migratedLoader.outputs[0].links, modelLinksReference, "model links array should be preserved");
assertJsonEqual(
    {
        id: migratedLoader.id,
        type: migratedLoader.type,
        pos: migratedLoader.pos,
        size: migratedLoader.size,
        flags: migratedLoader.flags,
        order: migratedLoader.order,
        mode: migratedLoader.mode,
        title: migratedLoader.title,
        properties: migratedLoader.properties,
        widgets_values: migratedLoader.widgets_values,
        widgets_values_named: migratedLoader.widgets_values_named,
        color: migratedLoader.color,
        bgcolor: migratedLoader.bgcolor,
    },
    unrelatedLoaderFields,
    "migration must preserve unrelated loader state",
);
assertJsonEqual(linkById(migrated, 2), originalModelLink, "existing model link should not change");

const samplerNode = migrated.nodes.find((node) => node.type === "KSamplerSelect");
const schedulerNode = migrated.nodes.find((node) => node.type === "BasicScheduler");
assert.ok(samplerNode);
assert.ok(schedulerNode);
assertJsonEqual(samplerNode.inputs.map((input) => input.name), ["sampler_name"]);
assertJsonEqual(samplerNode.widgets_values, ["euler"]);
assertJsonEqual(samplerNode.widgets_values_named, { sampler_name: "euler" });
assertJsonEqual(samplerNode.outputs[0].links, [3]);
assertJsonEqual(
    schedulerNode.inputs.map((input) => input.name),
    ["model", "scheduler", "steps", "denoise"],
);
assertJsonEqual(schedulerNode.widgets_values, ["simple", 8, 1]);
assertJsonEqual(
    schedulerNode.widgets_values_named,
    { scheduler: "simple", steps: 8, denoise: 1 },
);
assertJsonEqual(schedulerNode.outputs[0].links, [4]);
assertJsonEqual(linkById(migrated, 3), [3, samplerNode.id, 0, 5, 2, "SAMPLER"]);
assertJsonEqual(linkById(migrated, 4), [4, schedulerNode.id, 0, 5, 3, "SIGMAS"]);

const newModelLinkId = schedulerNode.inputs[0].link;
assertJsonEqual(
    linkById(migrated, newModelLinkId),
    [newModelLinkId, 2, 0, schedulerNode.id, 0, "MODEL"],
);
assertJsonEqual(migratedLoader.outputs[0].links, [2, newModelLinkId]);
assert.equal(migrated.last_node_id, Math.max(samplerNode.id, schedulerNode.id));
assert.equal(migrated.last_link_id, newModelLinkId);
assert.equal(samplerNode.order, 5);
assert.equal(schedulerNode.order, 6);
assertRootLinkIntegrity(migrated);

const onceMigrated = clone(migrated);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(migrated), 0);
assertJsonEqual(migrated, onceMigrated, "migration must be idempotent");

// After migration, all stock controls stay user-editable and are never reset.
samplerNode.widgets_values = ["dpmpp_2m"];
samplerNode.widgets_values_named = { sampler_name: "dpmpp_2m" };
schedulerNode.widgets_values = ["simple", 12, 0.85];
schedulerNode.widgets_values_named = { scheduler: "simple", steps: 12, denoise: 0.85 };
const customizedAfterMigration = clone(migrated);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(migrated), 0);
assertJsonEqual(
    migrated,
    customizedAfterMigration,
    "user sampler, scheduler, steps, and denoise changes must remain untouched",
);

// Current one-output workflows, including every current user field, are a byte-for-byte no-op.
const current = clone(currentFixture);
const currentSnapshot = clone(current);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(current), 0);
assertJsonEqual(current, currentSnapshot, "current single-output workflow must not be changed");

const currentWithSerializedCombo = clone(previousCurrentFixture);
loaderNode(currentWithSerializedCombo).inputs.push({
    localized_name: "acc_lora",
    name: "acc_lora",
    type: "COMBO",
    widget: { name: "acc_lora" },
    link: null,
});
loaderNode(currentWithSerializedCombo).widgets_values_named = {
    acc_lora: loaderNode(currentWithSerializedCombo).widgets_values[0],
};
const currentWithSerializedComboSnapshot = clone(currentWithSerializedCombo);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(currentWithSerializedCombo), 0);
assertJsonEqual(
    currentWithSerializedCombo,
    currentWithSerializedComboSnapshot,
    "current single-output workflow with a serialized combo input must not be changed",
);

const currentWithUnrelatedMalformedState = clone(currentFixture);
currentWithUnrelatedMalformedState.links = [["not-a-valid-link"]];
currentWithUnrelatedMalformedState.definitions = { subgraphs: "not-an-array" };
const currentWithUnrelatedMalformedStateSnapshot = clone(currentWithUnrelatedMalformedState);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(currentWithUnrelatedMalformedState), 0);
assertJsonEqual(
    currentWithUnrelatedMalformedState,
    currentWithUnrelatedMalformedStateSnapshot,
    "current workflows must return before inspecting unrelated malformed graph state",
);

const rawApiPrompt = {
    "2": {
        class_type: "DenoMiniMaxH3AccLoader",
        inputs: { model: ["1", 0], acc_lora: "MiniMax-H3-Ref2VA-Acc-8Step.safetensors" },
    },
    "5": {
        class_type: "SamplerCustomAdvanced",
        inputs: { sampler: ["2", 1], sigmas: ["2", 2] },
    },
};
const rawApiPromptSnapshot = clone(rawApiPrompt);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(rawApiPrompt), 0);
assertJsonEqual(rawApiPrompt, rawApiPromptSnapshot, "raw API prompts are not UI workflow graphs");

// Unknown or malformed variants must fail closed without partial mutation.
const unknownVariants = [];
{
    const graph = clone(legacyFixture);
    loaderNode(graph).type = "OtherLoader";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).inputs.push({ name: "other", type: "MODEL", link: null });
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).inputs[0].name = "MODEL";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs[1].name = "other";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs[2].type = "FLOAT";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs.reverse();
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs.push({ name: "other", type: "*", links: [] });
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.version = "0.4";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).id = "2";
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs[1].links = [999];
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    linkById(graph, 3)[1] = 99;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    linkById(graph, 2)[2] = 1;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.nodes[1].id = graph.nodes[0].id;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.links[1][0] = graph.links[0][0];
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).outputs[1].links = [];
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    const secondTarget = clone(graph.nodes.find((node) => node.id === 5));
    secondTarget.id = 8;
    secondTarget.inputs[2].link = 6;
    graph.nodes.push(secondTarget);
    graph.links.push([6, 2, 1, 8, 2, "SAMPLER"]);
    graph.last_node_id = 8;
    graph.last_link_id = 6;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    linkById(graph, 3)[4] = 99;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.nodes.find((node) => node.id === 5).inputs[2].link = null;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).inputs[0].link = null;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.nodes.find((node) => node.id === 1).outputs[0].links = [];
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.nodes.find((node) => node.id === 1).outputs[0].links.push(999);
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).mode = 2;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    loaderNode(graph).mode = 4;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.last_node_id = Number.MAX_SAFE_INTEGER + 1;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.last_node_id = Number.MAX_SAFE_INTEGER;
    graph.last_link_id = Number.MAX_SAFE_INTEGER;
    unknownVariants.push(graph);
}
{
    const graph = clone(legacyFixture);
    graph.links[1] = {
        id: graph.links[1][0],
        origin_id: graph.links[1][1],
        origin_slot: graph.links[1][2],
        target_id: graph.links[1][3],
        target_slot: graph.links[1][4],
        type: graph.links[1][5],
    };
    unknownVariants.push(graph);
}

for (const [index, graph] of unknownVariants.entries()) {
    const snapshot = clone(graph);
    assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(graph), 0, `variant ${index}`);
    assertJsonEqual(graph, snapshot, `unknown variant ${index} must remain untouched`);
}

// Localized labels, package metadata, and the user's selected file are not migration gates.
const localizedLegacy = clone(legacyFixture);
const localizedLoader = loaderNode(localizedLegacy);
localizedLoader.inputs[0].localized_name = "모델";
localizedLoader.outputs[0].localized_name = "모델";
localizedLoader.outputs[1].localized_name = "샘플러";
localizedLoader.outputs[2].localized_name = "시그마";
localizedLoader.properties.ver = "custom-build";
localizedLoader.widgets_values = ["custom/path/Ref2VA-Acc.safetensors"];
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(localizedLegacy), 1);

const oneInputLegacy = clone(legacyFixture);
loaderNode(oneInputLegacy).inputs = [loaderNode(oneInputLegacy).inputs[0]];
delete loaderNode(oneInputLegacy).widgets_values_named;
assert.equal(
    hooks.migrateLegacyMiniMaxH3AccGraph(oneInputLegacy),
    1,
    "older renderer layouts without a serialized combo input should still migrate",
);

const wildcardTargets = clone(legacyFixture);
wildcardTargets.nodes.find((node) => node.id === 5).inputs[2].type = "*";
wildcardTargets.nodes.find((node) => node.id === 5).inputs[3].type = "*";
assert.equal(
    hooks.migrateLegacyMiniMaxH3AccGraph(wildcardTargets),
    1,
    "wildcard reroute-style targets should stay supported",
);

// Unlinked legacy sockets are removed without creating unnecessary stock nodes.
const unlinked = clone(legacyFixture);
disconnectLegacyOutput(unlinked, 1, 3, null);
disconnectLegacyOutput(unlinked, 2, 4, []);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(unlinked), 1);
assert.equal(unlinked.nodes.some((node) => node.type === "KSamplerSelect"), false);
assert.equal(unlinked.nodes.some((node) => node.type === "BasicScheduler"), false);
assert.equal(loaderNode(unlinked).outputs.length, 1);

const samplerOnly = clone(legacyFixture);
disconnectLegacyOutput(samplerOnly, 2, 4, null);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(samplerOnly), 1);
assert.equal(samplerOnly.nodes.filter((node) => node.type === "KSamplerSelect").length, 1);
assert.equal(samplerOnly.nodes.some((node) => node.type === "BasicScheduler"), false);

const sigmasOnly = clone(legacyFixture);
disconnectLegacyOutput(sigmasOnly, 1, 3, []);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(sigmasOnly), 1);
assert.equal(sigmasOnly.nodes.some((node) => node.type === "KSamplerSelect"), false);
assert.equal(sigmasOnly.nodes.filter((node) => node.type === "BasicScheduler").length, 1);
assert.ok(linkById(sigmasOnly, sigmasOnly.last_link_id));

// Multiple outgoing sampler links reuse their IDs and share one stock sampler node.
const multiLink = clone(legacyFixture);
const secondTarget = clone(multiLink.nodes.find((node) => node.id === 5));
secondTarget.id = 8;
secondTarget.order = 7;
secondTarget.pos = [1500, 120];
secondTarget.inputs[2].link = 6;
secondTarget.inputs[3].link = null;
multiLink.nodes.push(secondTarget);
loaderNode(multiLink).outputs[1].links.push(6);
multiLink.links.push([6, 2, 1, 8, 2, "SAMPLER"]);
multiLink.last_node_id = 8;
multiLink.last_link_id = 6;
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(multiLink), 1);
const sharedSampler = multiLink.nodes.find((node) => node.type === "KSamplerSelect");
assertJsonEqual(sharedSampler.outputs[0].links, [3, 6]);
assert.equal(linkById(multiLink, 3)[1], sharedSampler.id);
assert.equal(linkById(multiLink, 6)[1], sharedSampler.id);
assertRootLinkIntegrity(multiLink);

// Current object-link serialization keeps object records and creates an object MODEL link.
const objectLinks = clone(legacyFixture);
objectLinks.links = objectLinks.links.map(
    ([id, origin_id, origin_slot, target_id, target_slot, type]) => ({
        id,
        origin_id,
        origin_slot,
        target_id,
        target_slot,
        type,
    }),
);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(objectLinks), 1);
assert.equal(objectLinks.links.every((link) => !Array.isArray(link)), true);
const objectScheduler = objectLinks.nodes.find((node) => node.type === "BasicScheduler");
assertJsonEqual(linkById(objectLinks, 3), {
    id: 3,
    origin_id: objectLinks.nodes.find((node) => node.type === "KSamplerSelect").id,
    origin_slot: 0,
    target_id: 5,
    target_slot: 2,
    type: "SAMPLER",
});
assertJsonEqual(linkById(objectLinks, objectScheduler.inputs[0].link), {
    id: objectScheduler.inputs[0].link,
    origin_id: 2,
    origin_slot: 0,
    target_id: objectScheduler.id,
    target_slot: 0,
    type: "MODEL",
});
assertRootLinkIntegrity(objectLinks);

// Allocation honors both actual and declared maxima.
const highDeclaredIds = clone(legacyFixture);
highDeclaredIds.last_node_id = 100;
highDeclaredIds.last_link_id = 200;
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(highDeclaredIds), 1);
assertJsonEqual(
    highDeclaredIds.nodes
        .filter((node) => ["KSamplerSelect", "BasicScheduler"].includes(node.type))
        .map((node) => node.id),
    [101, 102],
);
assert.equal(highDeclaredIds.last_link_id, 201);

const staleDeclaredIds = clone(legacyFixture);
staleDeclaredIds.last_node_id = 0;
staleDeclaredIds.last_link_id = 0;
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(staleDeclaredIds), 1);
assertJsonEqual(
    staleDeclaredIds.nodes
        .filter((node) => ["KSamplerSelect", "BasicScheduler"].includes(node.type))
        .map((node) => node.id),
    [6, 7],
);
assert.equal(staleDeclaredIds.last_link_id, 5);

// Root allocations stay above native subgraph IDs without changing the subgraph.
const nestedIds = clone(legacyFixture);
nestedIds.definitions = {
    subgraphs: [
        {
            id: "saved-subgraph",
            version: 1,
            state: { lastNodeId: 120, lastLinkId: 220 },
            nodes: [{ id: 110, type: "KSamplerSelect", inputs: [], outputs: [] }],
            links: [
                {
                    id: 210,
                    origin_id: -10,
                    origin_slot: 0,
                    target_id: 110,
                    target_slot: 0,
                    type: "SAMPLER",
                },
            ],
        },
    ],
};
const nestedSnapshot = clone(nestedIds.definitions);
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(nestedIds), 1);
assertJsonEqual(
    nestedIds.nodes
        .filter((node) => ["KSamplerSelect", "BasicScheduler"].includes(node.type))
        .map((node) => node.id),
    [121, 122],
);
assert.equal(nestedIds.last_link_id, 221);
assertJsonEqual(nestedIds.definitions, nestedSnapshot, "subgraph contents must not be mutated");
assertRootLinkIntegrity(nestedIds);

// Multiple exact legacy nodes migrate once each without ID collisions.
const multiple = clone(legacyFixture);
const second = clone(legacyFixture);
for (const node of second.nodes) {
    node.id += 10;
    node.order += 10;
    for (const input of node.inputs || []) {
        if (typeof input.link === "number") {
            input.link += 10;
        }
    }
    for (const output of node.outputs || []) {
        if (Array.isArray(output.links)) {
            output.links = output.links.map((id) => id + 10);
        }
    }
}
second.links = second.links.map(([id, origin, slot, target, targetSlot, type]) => [
    id + 10,
    origin + 10,
    slot,
    target + 10,
    targetSlot,
    type,
]);
multiple.nodes.push(...second.nodes);
multiple.links.push(...second.links);
multiple.last_node_id = 15;
multiple.last_link_id = 14;
assert.equal(hooks.migrateLegacyMiniMaxH3AccGraph(multiple), 2);
assert.equal(multiple.nodes.filter((node) => node.type === "KSamplerSelect").length, 2);
assert.equal(multiple.nodes.filter((node) => node.type === "BasicScheduler").length, 2);
assert.equal(new Set(multiple.nodes.map((node) => node.id)).size, multiple.nodes.length);
assert.equal(
    new Set(multiple.links.map((link) => link[0])).size,
    multiple.links.length,
);
assertRootLinkIntegrity(multiple);

console.log("minimax_h3_acc_loader_migration_harness passed");
