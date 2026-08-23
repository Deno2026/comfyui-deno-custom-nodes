import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(repoRoot, "web", "js", "deno_text_encoder_unload.js");
const fixturePath = path.join(
    repoRoot,
    "tests",
    "fixtures",
    "public_workflows",
    "text_encoder_unload_v0790.json",
);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertJsonEqual(actual, expected, message) {
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
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
context.__DENO_TEXT_ENCODER_UNLOAD_TEST_HOOK__ = (registered) => {
    hooks = registered;
};

const source = fs.readFileSync(sourcePath, "utf8").replace(/^import .*;\r?\n/gm, "");
vm.runInNewContext(source, context, { filename: sourcePath });
assert.ok(extension, "Text Encoder Unload extension should register");
assert.ok(hooks, "Text Encoder Unload migration helpers should be exposed");

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const legacyNode = fixture.nodes.find((node) => node.type === hooks.NODE_NAME);
assert.ok(legacyNode, "legacy fixture should contain DenoTextEncoderUnload");
assert.deepEqual(
    legacyNode.inputs.map((input) => input.name),
    ["value", "clip", "wait_for"],
    "fixture should lock the v0.7.90 input order",
);
assert.deepEqual(
    legacyNode.inputs.map((input) => input.link),
    [107, 108, 109],
    "fixture should lock the v0.7.90 input links",
);
assert.deepEqual(legacyNode.outputs[0].links, [110], "fixture should lock the positive output link");
assert.deepEqual(
    fixture.links.find((link) => link[0] === 111),
    [111, 58, 0, 53, 2, "CONDITIONING"],
    "the old negative branch should keep feeding the sampler directly",
);

const migrated = clone(legacyNode);
const originalNodeSnapshot = clone(legacyNode);
const originalInputObjects = [...migrated.inputs];
const originalPositiveOutput = migrated.outputs[0];
const originalPositiveLinks = migrated.outputs[0].links;
const originalUnrelatedFields = {
    id: migrated.id,
    pos: clone(migrated.pos),
    size: clone(migrated.size),
    flags: clone(migrated.flags),
    order: migrated.order,
    mode: migrated.mode,
    title: migrated.title,
    properties: clone(migrated.properties),
    widgets_values: clone(migrated.widgets_values),
    color: migrated.color,
    bgcolor: migrated.bgcolor,
};

assert.equal(hooks.isExactV0790SerializedSchema(migrated), true);
assert.equal(hooks.migrateLegacyTextEncoderUnloadInfo(migrated), true);
assert.deepEqual(
    migrated.inputs.map((input) => input.name),
    ["positive_conditioning", "text_encoder", "negative_conditioning"],
);
assert.deepEqual(
    migrated.inputs.map((input) => input.type),
    ["CONDITIONING", "CLIP", "CONDITIONING"],
);
assert.deepEqual(
    migrated.inputs.map((input) => input.localized_name),
    ["Positive Conditioning", "Text Encoder (CLIP)", "Negative Conditioning"],
);
assert.deepEqual(
    migrated.inputs.map((input) => input.label),
    ["Positive Conditioning", "Text Encoder (CLIP)", "Negative Conditioning"],
);
assert.deepEqual(
    migrated.inputs.map((input) => input.link),
    [107, 108, 109],
    "all legacy input link ids should be preserved",
);
assert.equal(
    migrated.inputs[2].shape,
    originalNodeSnapshot.inputs[2].shape,
    "the optional negative socket shape should be preserved",
);
assert.deepEqual(migrated.inputs, originalInputObjects, "legacy input objects should be migrated in place");

assert.equal(migrated.outputs.length, 2);
assert.deepEqual(
    migrated.outputs.map((output) => output.name),
    ["positive_conditioning", "negative_conditioning"],
);
assert.deepEqual(
    migrated.outputs.map((output) => output.type),
    ["CONDITIONING", "CONDITIONING"],
);
assert.deepEqual(
    migrated.outputs.map((output) => output.localized_name),
    ["Positive Conditioning", "Negative Conditioning"],
);
assert.equal(migrated.outputs[0], originalPositiveOutput, "the linked legacy output should migrate in place");
assert.equal(migrated.outputs[0].links, originalPositiveLinks, "the positive link array should be preserved");
assert.deepEqual(migrated.outputs[0].links, [110]);
assert.equal(Array.isArray(migrated.outputs[1].links), true);
assert.equal(migrated.outputs[1].links.length, 0, "the new negative output should start unlinked");
assert.deepEqual(
    {
        id: migrated.id,
        pos: migrated.pos,
        size: migrated.size,
        flags: migrated.flags,
        order: migrated.order,
        mode: migrated.mode,
        title: migrated.title,
        properties: migrated.properties,
        widgets_values: migrated.widgets_values,
        color: migrated.color,
        bgcolor: migrated.bgcolor,
    },
    originalUnrelatedFields,
    "unrelated serialized node fields should remain unchanged",
);

const onceMigrated = clone(migrated);
assert.equal(hooks.migrateLegacyTextEncoderUnloadInfo(migrated), false);
assertJsonEqual(migrated, onceMigrated, "a current schema should be a no-op");

const currentNode = clone(migrated);
const currentSnapshot = clone(currentNode);
assert.equal(hooks.isExactV0790SerializedSchema(currentNode), false);
assert.equal(hooks.migrateLegacyTextEncoderUnloadInfo(currentNode), false);
assertJsonEqual(currentNode, currentSnapshot, "fresh/current schemas should not be mutated");

const concreteLegacyTypes = clone(legacyNode);
concreteLegacyTypes.inputs[0].type = "CONDITIONING";
concreteLegacyTypes.inputs[2].type = "CONDITIONING";
concreteLegacyTypes.outputs[0].type = "CONDITIONING";
assert.equal(
    hooks.migrateLegacyTextEncoderUnloadInfo(concreteLegacyTypes),
    true,
    "exact legacy names/order should migrate even if linked wildcard sockets serialized concretely",
);

const unknownVariants = [
    {
        ...clone(legacyNode),
        inputs: [
            clone(legacyNode.inputs[0]),
            clone(legacyNode.inputs[2]),
            clone(legacyNode.inputs[1]),
        ],
    },
    {
        ...clone(legacyNode),
        outputs: [...clone(legacyNode.outputs), { name: "other", type: "*", links: [] }],
    },
    {
        ...clone(legacyNode),
        outputs: [{ ...clone(legacyNode.outputs[0]), name: "other" }],
    },
    {
        ...clone(legacyNode),
        inputs: [
            clone(legacyNode.inputs[0]),
            { ...clone(legacyNode.inputs[1]), type: "MODEL" },
            clone(legacyNode.inputs[2]),
        ],
    },
    {
        ...clone(legacyNode),
        outputs: [{ ...clone(legacyNode.outputs[0]), type: "MODEL" }],
    },
];

for (const [index, variant] of unknownVariants.entries()) {
    const snapshot = clone(variant);
    assert.equal(hooks.isExactV0790SerializedSchema(variant), false, `unknown variant ${index} detected`);
    assert.equal(hooks.migrateLegacyTextEncoderUnloadInfo(variant), false);
    assertJsonEqual(variant, snapshot, `unknown variant ${index} should not be mutated`);
}

class FakeNode {}
let configureCalls = 0;
let configuredInfo = null;
let configuredExtra = null;
const configureResult = { preserved: true };
FakeNode.prototype.configure = function (info, extra) {
    configureCalls += 1;
    configuredInfo = info;
    configuredExtra = extra;
    assert.deepEqual(
        info.inputs.map((input) => input.name),
        ["positive_conditioning", "text_encoder", "negative_conditioning"],
        "migration must run before the original configure",
    );
    return configureResult;
};

extension.beforeRegisterNodeDef(FakeNode, { name: hooks.NODE_NAME });
const wrapperInfo = clone(legacyNode);
const fakeNode = new FakeNode();
const extraArgument = { keep: "me" };
assert.equal(fakeNode.configure(wrapperInfo, extraArgument), configureResult);
assert.equal(configureCalls, 1, "the original configure should run exactly once");
assert.equal(configuredInfo, wrapperInfo, "the original configure should receive the same info object");
assert.equal(configuredExtra, extraArgument, "the wrapper should preserve additional configure arguments");

class OtherNode {}
const otherConfigure = function () { return "other"; };
OtherNode.prototype.configure = otherConfigure;
extension.beforeRegisterNodeDef(OtherNode, { name: "NotDenoTextEncoderUnload" });
assert.equal(OtherNode.prototype.configure, otherConfigure, "unrelated node definitions should not be wrapped");

console.log("text_encoder_unload_schema_harness passed");
