import {
    applyOrderedWidgetValues,
    canonicalOrderedSerializationValues,
    findWidget,
} from "../../web/js/deno_frontend_core/widget_state.js";
import {
    createExactWidgetValueShapeMigration,
    expandCanonicalValuesForGeneratedSlots,
    installWorkflowWidgetMigration,
} from "../../web/js/deno_frontend_core/workflow_migration.js";

const NODE_NAME = "DenoLTXPromptGuide";
const GENERATED_PREFIX = "deno_ltx_prompt_guide_";
const GENERATED_SLOTS = [0, 4];
const WIDGET_SPECS = [
    { name: "positive_prompt", defaultValue: "" },
    { name: "language", defaultValue: "Auto", normalize: (value) => String(value || "Auto") },
    { name: "frame_rate", defaultValue: 25, normalize: (value) => Number(value) || 25 },
    { name: "show_negative_prompt", defaultValue: false, normalize: (value) => Boolean(value) },
    { name: "negative_prompt", defaultValue: "" },
];
const missingCanonicalWidgetWarnings = new WeakSet();

function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function eq(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    check(actualJson === expectedJson, `${message}\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
}

function hostConfigure(info) {
    this.__hostConfigureCalls = (this.__hostConfigureCalls || 0) + 1;
    this.__hostConfigureReceived = [...(info.widgets_values || [])];
    if (this.__throwOnConfigure) {
        throw new Error("host configure throw sentinel");
    }
    let valueIndex = 0;
    for (const widget of this.widgets || []) {
        if (widget.serialize === false) {
            continue;
        }
        if (valueIndex >= info.widgets_values.length) {
            break;
        }
        widget.value = info.widgets_values[valueIndex++];
    }
}

function hostSerialize(node) {
    const serialized = {};
    if (node.widgets && node.serialize_widgets) {
        serialized.widgets_values = [];
        for (const [index, widget] of node.widgets.entries()) {
            if (widget.serialize === false) {
                continue;
            }
            serialized.widgets_values[index] = widget.value ?? null;
        }
    }
    node.onSerialize?.(serialized);
    return serialized;
}

function makePromptGuideNode({ generated = true } = {}) {
    const realWidgets = [
        { name: "positive_prompt", value: "" },
        { name: "language", value: "Auto" },
        { name: "frame_rate", value: 25 },
        { name: "show_negative_prompt", value: false },
        { name: "negative_prompt", value: "" },
    ];
    const widgets = generated
        ? [
              { name: `${GENERATED_PREFIX}dialogue_summary`, value: "" },
              realWidgets[0],
              realWidgets[1],
              realWidgets[2],
              { name: `${GENERATED_PREFIX}negative_toggle`, value: "" },
              realWidgets[3],
              realWidgets[4],
          ]
        : realWidgets;
    return {
        type: NODE_NAME,
        widgets,
        serialize_widgets: true,
        properties: {},
    };
}

function installPromptGuideAdapter(nodeType) {
    const normalize = createExactWidgetValueShapeMigration({
        canonicalCount: WIDGET_SPECS.length,
        legacyGeneratedSlots: GENERATED_SLOTS,
    });

    return installWorkflowWidgetMigration(nodeType, { name: NODE_NAME }, {
        nodeName: NODE_NAME,
        pendingValuesKey: "__denoLtxPromptGuideConfiguredWidgetValues",
        normalizeSerializedValues: normalize,
        getConfigureWidgetValues(node, canonicalValues) {
            const hasGenerated = (node.widgets || []).some((widget) => String(widget?.name || "").startsWith(GENERATED_PREFIX));
            return hasGenerated
                ? expandCanonicalValuesForGeneratedSlots(canonicalValues, GENERATED_SLOTS)
                : canonicalValues;
        },
        applyCanonicalValues(node, canonicalValues) {
            applyOrderedWidgetValues(node, WIDGET_SPECS, canonicalValues);
            node.properties.__deno_ltx_prompt_guide_save_restore = "ltx-prompt-guide-save-reload-v2";
        },
        getCanonicalSerializationValues(node) {
            const missing = WIDGET_SPECS.map((spec) => spec.name).filter((name) => !findWidget(node, name));
            if (missing.length) {
                missingCanonicalWidgetWarnings.add(node);
                return null;
            }
            return canonicalOrderedSerializationValues(node, WIDGET_SPECS);
        },
    });
}

function testShapeClassifier() {
    const normalize = createExactWidgetValueShapeMigration({
        canonicalCount: 5,
        legacyGeneratedSlots: GENERATED_SLOTS,
    });

    eq(normalize(["POS", "Korean", 24, true, "NEG"]), ["POS", "Korean", 24, true, "NEG"], "exact current 5 passes unchanged");
    eq(normalize(["", "POS", "Korean", 24, "", true, "NEG"]), ["POS", "Korean", 24, true, "NEG"], "legacy 7 maps to canonical 5");
    eq(normalize([null, "POS", "English", 30, null, false, "NEG"]), ["POS", "English", 30, false, "NEG"], "null generated slots map as empty");
    check(normalize(["", "POS", "Korean", 24, "not empty", true, "NEG"]) === null, "non-empty generated slot is unknown");
    check(normalize(["POS", "Korean", 24, true, "NEG", "extra"]) === null, "6-slot shape is unknown");
    check(normalize(["", "POS", "Korean", 24, "", true, "NEG", "extra"]) === null, "8-slot shape is unknown");
    check(normalize("not-array") === null, "non-array shape is unknown");
}

function testHostContractWithGeneratedWidgets() {
    let priorSerializeCalls = 0;
    const nodeType = {
        prototype: {
            configure: hostConfigure,
            onSerialize(info) {
                priorSerializeCalls += 1;
                info.priorCallbackWasCalled = true;
            },
        },
    };
    check(installPromptGuideAdapter(nodeType) === true, "adapter installed");

    const node = makePromptGuideNode({ generated: true });
    Object.setPrototypeOf(node, nodeType.prototype);
    nodeType.prototype.configure.call(node, {
        widgets_values: ["", "POSITIVE SAVE", "Korean", 24, "", true, "NEGATIVE SAVE"],
    });

    eq(
        node.__hostConfigureReceived,
        ["", "POSITIVE SAVE", "Korean", 24, "", true, "NEGATIVE SAVE"],
        "host configure receives generated-slot shape",
    );
    check(node.__hostConfigureCalls === 1, "prior configure called once");
    check(findWidget(node, "positive_prompt").value === "POSITIVE SAVE", "positive prompt restored");
    check(findWidget(node, "negative_prompt").value === "NEGATIVE SAVE", "negative prompt restored");

    const rawHostShape = [];
    for (const [index, widget] of node.widgets.entries()) {
        if (widget.serialize === false) {
            continue;
        }
        rawHostShape[index] = widget.value ?? null;
    }
    eq(
        rawHostShape,
        ["", "POSITIVE SAVE", "Korean", 24, "", true, "NEGATIVE SAVE"],
        "unadapted host serialization reproduces the 7-slot failure",
    );

    const serialized = hostSerialize(node);
    check(priorSerializeCalls === 1, "prior onSerialize called once");
    check(serialized.priorCallbackWasCalled === true, "prior onSerialize mutation preserved");
    eq(
        serialized.widgets_values,
        ["POSITIVE SAVE", "Korean", 24, true, "NEGATIVE SAVE"],
        "adapter compacts host serialization to canonical 5",
    );
    eq(node.widgets_values, serialized.widgets_values, "node mirror follows canonical values without being the authority");
}

function testConfigureTemporarilyExpandsAndRestoresCallerInfo() {
    const nodeType = { prototype: { configure: hostConfigure } };
    installPromptGuideAdapter(nodeType);

    const currentNode = makePromptGuideNode({ generated: true });
    Object.setPrototypeOf(currentNode, nodeType.prototype);
    const currentValues = ["POS", "Korean", 24, true, "NEG"];
    const currentInfo = { widgets_values: currentValues };
    nodeType.prototype.configure.call(currentNode, currentInfo);
    eq(
        currentNode.__hostConfigureReceived,
        ["", "POS", "Korean", 24, "", true, "NEG"],
        "host receives expanded 7-slot shape for current canonical input",
    );
    check(currentInfo.widgets_values === currentValues, "current caller info keeps exact original 5-value array reference");
    eq(currentInfo.widgets_values, ["POS", "Korean", 24, true, "NEG"], "current caller info values remain unchanged");

    const legacyNode = makePromptGuideNode({ generated: true });
    Object.setPrototypeOf(legacyNode, nodeType.prototype);
    const legacyValues = ["", "LEGACY POS", "English", 30, "", false, "LEGACY NEG"];
    const legacyInfo = { widgets_values: legacyValues };
    nodeType.prototype.configure.call(legacyNode, legacyInfo);
    eq(
        legacyNode.__hostConfigureReceived,
        ["", "LEGACY POS", "English", 30, "", false, "LEGACY NEG"],
        "host receives generated 7-slot shape for legacy input",
    );
    check(legacyInfo.widgets_values === legacyValues, "legacy caller info keeps exact original 7-value array reference");
    eq(legacyInfo.widgets_values, legacyValues, "legacy caller info values remain unchanged");

    const throwingNode = makePromptGuideNode({ generated: true });
    throwingNode.__throwOnConfigure = true;
    Object.setPrototypeOf(throwingNode, nodeType.prototype);
    const throwingValues = ["THROW POS", "Korean", 25, true, "THROW NEG"];
    const throwingInfo = { widgets_values: throwingValues };
    let threw = false;
    try {
        nodeType.prototype.configure.call(throwingNode, throwingInfo);
    } catch (error) {
        threw = error.message === "host configure throw sentinel";
    }
    check(threw, "throwing host configure propagates the original error");
    check(throwingInfo.widgets_values === throwingValues, "throwing caller info keeps exact original array reference");
    eq(throwingInfo.widgets_values, throwingValues, "throwing caller info values are restored");
}

function testHostContractWithCurrentShapeAndNoGeneratedWidgets() {
    const nodeType = { prototype: { configure: hostConfigure } };
    installPromptGuideAdapter(nodeType);
    const node = makePromptGuideNode({ generated: false });
    Object.setPrototypeOf(node, nodeType.prototype);
    nodeType.prototype.configure.call(node, {
        widgets_values: ["POS", "English", 30, false, "NEG"],
    });

    eq(node.__hostConfigureReceived, ["POS", "English", 30, false, "NEG"], "host receives current 5 unchanged");
    eq(hostSerialize(node).widgets_values, ["POS", "English", 30, false, "NEG"], "no-generated save remains canonical 5");
}

function testUnknownShapePassesThroughConfigureAndDoesNotRewriteSerialization() {
    const nodeType = { prototype: { configure: hostConfigure } };
    installPromptGuideAdapter(nodeType);
    const node = makePromptGuideNode({ generated: true });
    Object.setPrototypeOf(node, nodeType.prototype);
    const unknown = ["POS", "English", 30, false, "NEG", "extra"];
    nodeType.prototype.configure.call(node, { widgets_values: unknown });

    eq(node.__hostConfigureReceived, unknown, "unknown configure shape is passed through");
    check(node.__denoLtxPromptGuideConfiguredWidgetValues === undefined, "unknown shape does not create pending migration");
    eq(
        hostSerialize(node).widgets_values,
        ["POS", "English", 30, false, "NEG", "extra", ""],
        "unknown-configured node preserves host serialization instead of inventing canonical values",
    );

    const recognized = ["KNOWN POS", "Korean", 31, true, "KNOWN NEG"];
    nodeType.prototype.configure.call(node, { widgets_values: recognized });
    eq(
        hostSerialize(node).widgets_values,
        recognized,
        "later recognized configure clears unknown state and re-enables canonical serialization",
    );
}

function testDoubleInstallIsNoopForSameInstallKey() {
    let priorConfigureCalls = 0;
    let priorSerializeCalls = 0;
    let applyCalls = 0;
    let canonicalSerializeCalls = 0;
    const normalize = createExactWidgetValueShapeMigration({
        canonicalCount: WIDGET_SPECS.length,
        legacyGeneratedSlots: GENERATED_SLOTS,
    });
    const nodeType = {
        prototype: {
            configure() {
                priorConfigureCalls += 1;
            },
            onSerialize(info) {
                priorSerializeCalls += 1;
                info.priorSerialize = true;
            },
        },
    };
    const spec = {
        nodeName: NODE_NAME,
        installKey: "prompt-guide-r2-double-install",
        normalizeSerializedValues: normalize,
        getConfigureWidgetValues(_node, canonicalValues) {
            return canonicalValues;
        },
        applyCanonicalValues() {
            applyCalls += 1;
        },
        getCanonicalSerializationValues() {
            canonicalSerializeCalls += 1;
            return ["SER", "Korean", 24, false, "NEG"];
        },
    };

    check(installWorkflowWidgetMigration(nodeType, { name: NODE_NAME }, spec) === true, "first install succeeds");
    check(installWorkflowWidgetMigration(nodeType, { name: NODE_NAME }, spec) === false, "second install for same key is a noop");

    const node = makePromptGuideNode({ generated: false });
    Object.setPrototypeOf(node, nodeType.prototype);
    nodeType.prototype.configure.call(node, { widgets_values: ["POS", "English", 30, true, "NEG"] });
    const serialized = {};
    nodeType.prototype.onSerialize.call(node, serialized);

    check(priorConfigureCalls === 1, "prior configure called exactly once after double install");
    check(priorSerializeCalls === 1, "prior onSerialize called exactly once after double install");
    check(applyCalls === 1, "applyCanonicalValues called exactly once after double install");
    check(canonicalSerializeCalls === 1, "getCanonicalSerializationValues called exactly once after double install");
    eq(serialized.widgets_values, ["SER", "Korean", 24, false, "NEG"], "double install does not duplicate serialization hook");
    check(Object.keys(nodeType.prototype).every((key) => !key.includes("workflow_widget_migration")), "install marker is non-enumerable");
}

function testMissingRequiredWidgetLeavesHostSerializationUntouched() {
    const nodeType = { prototype: { configure: hostConfigure } };
    installPromptGuideAdapter(nodeType);
    const node = makePromptGuideNode({ generated: true });
    node.widgets = node.widgets.filter((widget) => widget.name !== "negative_prompt");
    Object.setPrototypeOf(node, nodeType.prototype);
    nodeType.prototype.configure.call(node, {
        widgets_values: ["POS", "Korean", 24, true, "NEG"],
    });

    const serialized = hostSerialize(node);
    check(missingCanonicalWidgetWarnings.has(node), "missing required widget was detected");
    eq(
        serialized.widgets_values,
        ["", "POS", "Korean", 24, "", true],
        "missing required widget leaves host serialization untouched instead of serializing defaults",
    );
}

testShapeClassifier();
testHostContractWithGeneratedWidgets();
testConfigureTemporarilyExpandsAndRestoresCallerInfo();
testHostContractWithCurrentShapeAndNoGeneratedWidgets();
testUnknownShapePassesThroughConfigureAndDoesNotRewriteSerialization();
testDoubleInstallIsNoopForSameInstallKey();
testMissingRequiredWidgetLeavesHostSerializationUntouched();
console.log("OK ltx_prompt_guide_workflow_migration_harness");
