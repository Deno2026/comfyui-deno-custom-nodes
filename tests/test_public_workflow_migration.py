"""Regression guard for public DENO workflow compatibility.

Background: audited 2026-06-10 (see the migration audit under tmp/). Public
Google-Drive workflows were saved across many DENO versions. The highest risk
was `DenoLTXPromptGuide v0.3.8`, whose saved layout serialized two extra
display-widget slots:

    ["", positive_prompt, language, frame_rate, "", show_negative_prompt, negative_prompt]

The current node keeps those display widgets as `serialize:false`, so it only
expects the 5 real widget values. Without a configure-time normalizer the saved
values drift by position and the prompt / frame rate are lost. This test locks
in:

1. the JS migration exists and is wired into configure(),
2. the pure normalizer maps legacy 7-value -> 5-value and leaves current arrays
   untouched (exercised through `node`),
3. the bundled public workflow fixtures keep resolving against current nodes
   (node types registered, output slots a prefix of RETURN_NAMES),
4. a legacy DenoLTXPromptGuide layout is actually present in the fixtures, so
   the migration stays covered,
5. paused WIP nodes never leak into a public fixture.

Like the rest of this repo's tests, node metadata is read by AST-parsing
sources (importing __init__.py would pull in torch / comfy).
"""
from pathlib import Path
import ast
import json
import re
import shutil
import subprocess

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
INIT_PATH = REPO_ROOT / "__init__.py"
JS_PATH = REPO_ROOT / "web" / "js" / "deno_ltx_prompt_guide.js"
EXTRA_JS_PATH = REPO_ROOT / "web" / "js" / "deno_extra_nodes.js"
BERNINI_JS_PATH = REPO_ROOT / "web" / "js" / "deno_bernini_prompt_guide.js"
RTX_FINISHER_JS_PATH = REPO_ROOT / "web" / "js" / "deno_rtx_vfx_video_finisher.js"
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "public_workflows"
FIXTURES = sorted(FIXTURE_DIR.glob("*.json"))
PUBLIC_WORKFLOWS = [
    *sorted((REPO_ROOT / "docs" / "workflows").glob("*.json")),
    *FIXTURES,
]


# --------------------------------------------------------------------------
# AST helpers (mirror tests/test_registry_metadata.py: no heavy imports).
# --------------------------------------------------------------------------
def _init_tree():
    return ast.parse(INIT_PATH.read_text(encoding="utf-8"))


def _registered_node_ids():
    ids = set()
    for node in ast.walk(_init_tree()):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, ast.Name):
                continue
            if target.id == "NODE_CLASS_MAPPINGS" and isinstance(node.value, ast.Dict):
                for key in node.value.keys:
                    if isinstance(key, ast.Constant) and isinstance(key.value, str):
                        ids.add(key.value)
            elif target.id == "_OPTIONAL_NODES" and isinstance(node.value, (ast.Tuple, ast.List)):
                for item in node.value.elts:
                    if isinstance(item, (ast.Tuple, ast.List)) and len(item.elts) >= 2:
                        class_id = item.elts[1]
                        if isinstance(class_id, ast.Constant) and isinstance(class_id.value, str):
                            ids.add(class_id.value)
    return ids


def _optional_module_for_class():
    mapping = {}
    for node in ast.walk(_init_tree()):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "_OPTIONAL_NODES":
                    for item in node.value.elts:
                        if isinstance(item, (ast.Tuple, ast.List)) and len(item.elts) >= 2:
                            module, class_id = item.elts[0], item.elts[1]
                            if (
                                isinstance(module, ast.Constant)
                                and isinstance(class_id, ast.Constant)
                            ):
                                mapping[class_id.value] = module.value
    return mapping


def _node_replacement_specs():
    for node in ast.walk(_init_tree()):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "DENO_NODE_REPLACEMENTS":
                    return tuple(ast.literal_eval(node.value))
    return ()


def _node_replacements():
    replacements = _node_replacement_specs()
    if replacements:
        return {r["old_node_id"]: r["new_node_id"] for r in replacements}
    return {}


REGISTERED_IDS = _registered_node_ids()
OPTIONAL_MODULES = _optional_module_for_class()
REPLACEMENTS = _node_replacements()


def _module_file_for_class(class_id):
    if class_id in OPTIONAL_MODULES:
        return REPO_ROOT / f"{OPTIONAL_MODULES[class_id]}.py"
    if class_id == "DenoResolutionSetup":
        return INIT_PATH
    return None


def _return_names(class_id):
    """Current RETURN_NAMES for a DENO class, AST-parsed from its source file.

    Returns a tuple, or () when the class exists but declares no RETURN_NAMES
    (e.g. output-only download helper), or None when the class is unresolved.
    """
    path = _module_file_for_class(class_id)
    if path is None or not path.exists():
        return None
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_id:
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    for target in stmt.targets:
                        if isinstance(target, ast.Name) and target.id == "RETURN_NAMES":
                            try:
                                return tuple(ast.literal_eval(stmt.value))
                            except (ValueError, SyntaxError):
                                return None
            return ()
    return None


def _deno_nodes(graph):
    for node in graph.get("nodes", []):
        if isinstance(node, dict):
            node_type = node.get("type")
            if isinstance(node_type, str) and node_type.startswith("Deno"):
                yield node


def _load(fixture):
    return json.loads(fixture.read_text(encoding="utf-8"))


def test_fixtures_present():
    assert FIXTURES, f"no public workflow fixtures found under {FIXTURE_DIR}"


def _walk_json(value, location="$"):
    yield location, None, value
    if isinstance(value, dict):
        for key, item in value.items():
            yield from _walk_json(item, f"{location}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _walk_json(item, f"{location}[{index}]")


def test_public_workflows_do_not_publish_local_paths_or_workspace_state():
    assert PUBLIC_WORKFLOWS

    raw_windows_path = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]")
    encoded_windows_path = re.compile(r"[A-Za-z]%3A%5C", re.IGNORECASE)
    file_url = re.compile(r"file:///+[A-Za-z]:", re.IGNORECASE)
    unix_user_home = re.compile(r"(?:^|[\s\"'=])/(?:home|Users)/[^/\s]+/")
    local_preview_url = re.compile(
        r"^/(?:api/)?(?:vhs/)?view(?:video)?\?",
        re.IGNORECASE,
    )
    runtime_preview_query = re.compile(
        r"(?:^|[?&])(?:timestamp|rand|force_size|deadline)=",
        re.IGNORECASE,
    )

    violations = []
    for workflow in PUBLIC_WORKFLOWS:
        graph = _load(workflow)
        for location, _key, value in _walk_json(graph):
            key = location.rsplit(".", 1)[-1]
            if key in {"workspace_info", "fullpath", "lastSrc"}:
                violations.append(f"{workflow.relative_to(REPO_ROOT)}:{location}")
                continue
            if not isinstance(value, str):
                continue
            if (
                raw_windows_path.search(value)
                or encoded_windows_path.search(value)
                or file_url.search(value)
                or unix_user_home.search(value)
                or re.search(r"(?:[?&])fullpath=", value, re.IGNORECASE)
                or local_preview_url.search(value)
                or runtime_preview_query.search(value)
            ):
                violations.append(f"{workflow.relative_to(REPO_ROOT)}:{location}")

    assert violations == []


# --------------------------------------------------------------------------
# 1. JS migration exists and is wired into configure().
# --------------------------------------------------------------------------
def test_prompt_guide_js_has_legacy_configure_migration():
    src = JS_PATH.read_text(encoding="utf-8")

    assert "function getNormalizedLtxPromptGuideSerializedValues" in src
    assert "function normalizeLtxPromptGuideLegacyWidgetValues" in src
    assert "function getLtxPromptGuideConfigureWidgetValues" in src
    assert "function applyLtxPromptGuideSerializedValuesToWidgets" in src
    assert "ltx-prompt-guide-save-reload-v1" in src
    # Normalization must run inside configure(), before LiteGraph restores
    # widget values (not only in the post-restore onConfigure callback).
    assert "nodeType.prototype.configure = function" in src
    assert "normalizeLtxPromptGuideLegacyWidgetValues(info)" in src
    assert "this.__denoLtxPromptGuideConfiguredWidgetValues = [...normalized]" in src
    assert "info.widgets_values = getLtxPromptGuideConfigureWidgetValues(this, normalized)" in src
    assert "delete this.__denoLtxPromptGuideConfiguredWidgetValues" in src
    # Display widgets must stay non-serializing, and the existing post-restore
    # setup path must remain intact.
    assert "serialize: false" in src
    assert "queueMicrotask(() => {" in src
    assert "setupNode(this);" in src


def test_ltx_model_loader_has_shift_repair_gate():
    src = EXTRA_JS_PATH.read_text(encoding="utf-8")

    assert "function repairShiftedLtxGgufWidgetValues" in src
    assert 'node.properties.__deno_ltx_shift_repair = "gguf-visible-values-v1"' in src
    assert "let changed = repairShiftedLtxGgufWidgetValues(node)" in src
    # Configure-time combo restore can clamp an external extra_model_paths value
    # before setup runs. Keep the normalized saved array and reapply it after
    # setup so F5/reload preserves user-selected model paths.
    assert "this.__denoLtxConfiguredWidgetValues = [...normalized]" in src
    assert "node.__denoLtxConfiguredWidgetValues || node.widgets_values" in src
    assert "delete node.__denoLtxConfiguredWidgetValues" in src


def test_bernini_prompt_guide_has_legacy_configure_migration():
    src = BERNINI_JS_PATH.read_text(encoding="utf-8")

    assert "function getNormalizedBerniniPromptGuideSerializedValues" in src
    assert "function normalizeBerniniPromptGuideLegacyWidgetValues" in src
    assert "function getBerniniPromptGuideConfigureWidgetValues" in src
    assert "function applyBerniniPromptGuideSerializedValuesToWidgets" in src
    assert "bernini-prompt-guide-save-reload-v1" in src
    assert "nodeType.prototype.configure = function" in src
    assert "normalizeBerniniPromptGuideLegacyWidgetValues(info)" in src
    assert "this.__denoBerniniPromptGuideConfiguredWidgetValues = [...normalized]" in src
    assert "info.widgets_values = getBerniniPromptGuideConfigureWidgetValues(this, normalized)" in src
    assert "syncBerniniPromptGuideSerializedValues(this)" in src
    assert "delete this.__denoBerniniPromptGuideConfiguredWidgetValues" in src


def test_rtx_finisher_syncs_repaired_legacy_widget_values():
    src = RTX_FINISHER_JS_PATH.read_text(encoding="utf-8")

    assert "function repairShiftedBackendWidgetValues" in src
    assert "function syncFinisherSerializedValues" in src
    assert "rtx-finisher-save-reload-v1" in src
    assert "node.widgets_values = BACKEND_WIDGET_NAMES.map" in src
    assert "node.properties.__deno_rtx_finisher_save_restore = FINISHER_SAVE_RESTORE_REV" in src


# --------------------------------------------------------------------------
# 2. Pure normalizer behaviour, exercised through node on the real JS source.
# --------------------------------------------------------------------------
def _extract_js_function(src, name):
    marker = f"function {name}("
    start = src.index(marker)
    depth = 0
    i = src.index("{", start)
    while i < len(src):
        char = src[i]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    raise AssertionError(f"unbalanced braces extracting {name}")


def _extract_js_const_line(src, name):
    for line in src.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"const {name}") and stripped.endswith(";"):
            return stripped
    raise AssertionError(f"const {name} not found")


def _extract_js_declaration(src, name):
    marker = f"const {name}"
    start = src.index(marker)
    end = src.index(";", start)
    return src[start:end + 1]


def test_prompt_guide_normalizer_behaviour_in_node(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = JS_PATH.read_text(encoding="utf-8")
    const_line = _extract_js_const_line(src, "LTX_PROMPT_GUIDE_SERIALIZED_WIDGET_COUNT")
    fn = _extract_js_function(src, "getNormalizedLtxPromptGuideSerializedValues")

    harness = const_line + "\n" + fn + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

// legacy v0.3.8 7-value -> 5 real widget values (drop index 0 and 4)
check(eq(
    getNormalizedLtxPromptGuideSerializedValues(["", "POS", "Korean", 24, "", true, "NEG"]),
    ["POS", "Korean", 24, true, "NEG"]
), "legacy 7 -> 5");

// null display slots are treated like empty
check(eq(
    getNormalizedLtxPromptGuideSerializedValues([null, "P", "English", 30, null, false, "N"]),
    ["P", "English", 30, false, "N"]
), "legacy null slots");

// current 5-value layout is returned unchanged
check(eq(
    getNormalizedLtxPromptGuideSerializedValues(["POS", "Korean", 24, true, "NEG"]),
    ["POS", "Korean", 24, true, "NEG"]
), "current passthrough");

// a *current* 5-value array with an empty positive prompt must NOT be reshuffled
check(eq(
    getNormalizedLtxPromptGuideSerializedValues(["", "Auto", 25, false, ""]),
    ["", "Auto", 25, false, ""]
), "empty positive prompt preserved");

// non-arrays -> null (leave restore untouched)
check(getNormalizedLtxPromptGuideSerializedValues(null) === null, "null -> null");
check(getNormalizedLtxPromptGuideSerializedValues(undefined) === null, "undefined -> null");
check(getNormalizedLtxPromptGuideSerializedValues("nope") === null, "string -> null");

console.log("OK");
"""

    harness_path = tmp_path / "ltx_prompt_guide_migration.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


def test_prompt_guide_configure_expands_saved_values_around_generated_widgets(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = JS_PATH.read_text(encoding="utf-8")
    snippets = [
        _extract_js_const_line(src, "GENERATED_PREFIX"),
        _extract_js_const_line(src, "LTX_PROMPT_GUIDE_SERIALIZED_WIDGET_COUNT"),
        _extract_js_function(src, "getNormalizedLtxPromptGuideSerializedValues"),
        _extract_js_function(src, "hasGeneratedPromptGuideWidgets"),
        _extract_js_function(src, "getLtxPromptGuideConfigureWidgetValues"),
        _extract_js_function(src, "getWidget"),
        _extract_js_function(src, "applyLtxPromptGuideSerializedValuesToWidgets"),
    ]

    harness = "\n".join(snippets) + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

const core = ["POSITIVE SAVE", "Korean", 24, true, "NEGATIVE SAVE"];
const legacy = ["", "POSITIVE SAVE", "Korean", 24, "", true, "NEGATIVE SAVE"];
const nodeWithGenerated = {
    widgets: [
        { name: GENERATED_PREFIX + "dialogue_summary", value: "" },
        { name: "positive_prompt", value: "" },
        { name: "language", value: "Auto" },
        { name: "frame_rate", value: 25 },
        { name: GENERATED_PREFIX + "negative_toggle", value: "" },
        { name: "show_negative_prompt", value: false },
        { name: "negative_prompt", value: "" },
    ],
};
const nodeWithoutGenerated = {
    widgets: [
        { name: "positive_prompt", value: "" },
        { name: "language", value: "Auto" },
        { name: "frame_rate", value: 25 },
        { name: "show_negative_prompt", value: false },
        { name: "negative_prompt", value: "" },
    ],
};

check(eq(getNormalizedLtxPromptGuideSerializedValues(legacy), core), "legacy normalizes to core");
check(eq(getLtxPromptGuideConfigureWidgetValues(nodeWithGenerated, core), legacy), "core expands around generated widgets");
check(eq(getLtxPromptGuideConfigureWidgetValues(nodeWithoutGenerated, core), core), "core stays compact without generated widgets");

applyLtxPromptGuideSerializedValuesToWidgets(nodeWithGenerated, core);
check(nodeWithGenerated.widgets[1].value === "POSITIVE SAVE", "positive applied by name");
check(nodeWithGenerated.widgets[2].value === "Korean", "language applied by name");
check(nodeWithGenerated.widgets[3].value === 24, "frame rate applied by name");
check(nodeWithGenerated.widgets[5].value === true, "show negative applied by name");
check(nodeWithGenerated.widgets[6].value === "NEGATIVE SAVE", "negative applied by name");

console.log("OK");
"""

    harness_path = tmp_path / "ltx_prompt_guide_configure_expand.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


def test_ltx_model_loader_normalizer_keeps_current_gguf_extra_widget_layout(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = EXTRA_JS_PATH.read_text(encoding="utf-8")
    snippets = [
        _extract_js_declaration(src, "LTX_MODE_NAMES"),
        _extract_js_const_line(src, "LTX_SERIALIZED_WIDGET_COUNT"),
        _extract_js_declaration(src, "LTX_NONE_VALUE"),
        _extract_js_function(src, "getNormalizedLtxSerializedValues"),
        _extract_js_function(src, "isEmptyLtxSerializedSlot"),
        _extract_js_function(src, "scoreLtxSerializedCandidate"),
        _extract_js_function(src, "isNonNoneLtxValue"),
        _extract_js_function(src, "hasLtxExtension"),
        _extract_js_function(src, "looksLikeLtxVaeValue"),
        _extract_js_function(src, "isLtxDeviceValue"),
    ]

    harness = "\n".join(snippets) + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

const legacyPlaceholder = [
    "GGUF Style",
    "",
    "ltx-2.3-22b-dev-fp8.safetensors",
    "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
    "OtherDrive/LTX/custom-model-Q4_K_M.gguf",
    "LTX23_video_vae_bf16.safetensors",
    "LTX23_audio_vae_bf16.safetensors",
    "gemma_3_12B_it_fp8_scaled.safetensors",
    "ltx-2.3_text_projection_bf16.safetensors",
    "default",
    "default",
];
check(eq(
    getNormalizedLtxSerializedValues(legacyPlaceholder),
    [
        "GGUF Style",
        "ltx-2.3-22b-dev-fp8.safetensors",
        "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
        "OtherDrive/LTX/custom-model-Q4_K_M.gguf",
        "LTX23_video_vae_bf16.safetensors",
        "LTX23_audio_vae_bf16.safetensors",
        "gemma_3_12B_it_fp8_scaled.safetensors",
        "ltx-2.3_text_projection_bf16.safetensors",
        "default",
        "default",
    ]
), "legacy placeholder should be dropped");

const currentExtraWidget = [
    "GGUF Style",
    "",
    "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
    "OtherDrive/LTX/custom-model-Q4_K_M.gguf",
    "LTX23_video_vae_bf16.safetensors",
    "LTX23_audio_vae_bf16.safetensors",
    "gemma_3_12B_it_fp8_scaled.safetensors",
    "ltx-2.3_text_projection_bf16.safetensors",
    "default",
    "default",
    "default",
];
check(eq(
    getNormalizedLtxSerializedValues(currentExtraWidget),
    currentExtraWidget.slice(0, 10)
), "current 11-value layout with empty hidden checkpoint should keep gguf row");
check(
    getNormalizedLtxSerializedValues(currentExtraWidget)[3] === "OtherDrive/LTX/custom-model-Q4_K_M.gguf",
    "custom external gguf must stay on gguf row"
);

console.log("OK");
"""

    harness_path = tmp_path / "ltx_model_loader_normalizer.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


def test_ltx_model_loader_repairs_shifted_gguf_rows_in_node(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = EXTRA_JS_PATH.read_text(encoding="utf-8")
    snippets = [
        _extract_js_declaration(src, "LTX_MODE_NAMES"),
        _extract_js_declaration(src, "LTX_SERIALIZED_WIDGET_NAMES"),
        _extract_js_declaration(src, "LTX_NONE_VALUE"),
        _extract_js_declaration(src, "LTX_MODEL_WIDGET_NAMES"),
        "function getWidget(node, name) { return (node.widgets || []).find((widget) => widget.name === name); }",
        _extract_js_function(src, "getComboValues"),
        _extract_js_function(src, "chooseLtxFallbackValue"),
        _extract_js_function(src, "shouldPreserveStaleLtxModelValue"),
        _extract_js_function(src, "isNonNoneLtxValue"),
        _extract_js_function(src, "hasLtxExtension"),
        _extract_js_function(src, "looksLikeLtxVaeValue"),
        _extract_js_function(src, "isLtxDeviceValue"),
        _extract_js_function(src, "repairShiftedLtxGgufWidgetValues"),
        _extract_js_function(src, "sanitizeLtxWidgetValues"),
    ]

    harness = "\n".join(snippets) + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }
function combo(name, value, values) {
    return { name, value, options: { values } };
}

const node = {
    properties: {},
    widgets: [
        combo("pipeline_mode", "GGUF Style", ["Checkpoint Style", "KJ Style", "GGUF Style"]),
        combo("checkpoint_name", "ltx-2.3-22b-dev-fp8.safetensors", ["ltx-2.3-22b-dev-fp8.safetensors"]),
        combo("diffusion_model_name", "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors", ["ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors"]),
        combo("gguf_unet_name", "LTX23_video_vae_bf16.safetensors", ["__none__", "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"]),
        combo("video_vae_name", "LTX23_audio_vae_bf16.safetensors", ["__none__", "LTX23_video_vae_bf16.safetensors", "LTX23_audio_vae_bf16.safetensors"]),
        combo("audio_vae_name", "gemma_3_12B_it_fp8_scaled.safetensors", ["__none__", "LTX23_video_vae_bf16.safetensors", "LTX23_audio_vae_bf16.safetensors"]),
        combo("text_encoder_name", "ltx-2.3_text_projection_bf16.safetensors", ["__none__", "gemma_3_12B_it_fp8_scaled.safetensors"]),
        combo("text_projection_name", "default", ["__none__", "ltx-2.3_text_projection_bf16.safetensors"]),
        combo("clip_device", "default", ["default", "cpu"]),
        combo("weight_dtype", "default", ["default", "fp16", "bf16"]),
    ],
};

check(sanitizeLtxWidgetValues(node) === true, "shifted node should be changed");
const byName = Object.fromEntries(node.widgets.map((widget) => [widget.name, widget.value]));
check(byName.gguf_unet_name === "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf", "gguf repaired");
check(byName.video_vae_name === "LTX23_video_vae_bf16.safetensors", "video vae repaired");
check(byName.audio_vae_name === "LTX23_audio_vae_bf16.safetensors", "audio vae repaired");
check(byName.text_encoder_name === "gemma_3_12B_it_fp8_scaled.safetensors", "text encoder repaired");
check(byName.text_projection_name === "ltx-2.3_text_projection_bf16.safetensors", "text projection repaired");
check(node.properties.__deno_ltx_shift_repair === "gguf-visible-values-v1", "repair marker set");
check(eq(node.widgets_values, [
    "GGUF Style",
    "ltx-2.3-22b-dev-fp8.safetensors",
    "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
    "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf",
    "LTX23_video_vae_bf16.safetensors",
    "LTX23_audio_vae_bf16.safetensors",
    "gemma_3_12B_it_fp8_scaled.safetensors",
    "ltx-2.3_text_projection_bf16.safetensors",
    "default",
    "default",
]), "serialized values repaired");

const cleanNode = {
    properties: {},
    widgets: [
        combo("pipeline_mode", "GGUF Style", ["Checkpoint Style", "KJ Style", "GGUF Style"]),
        combo("checkpoint_name", "ltx-2.3-22b-dev-fp8.safetensors", ["ltx-2.3-22b-dev-fp8.safetensors"]),
        combo("diffusion_model_name", "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors", ["ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors"]),
        combo("gguf_unet_name", "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf", ["__none__", "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"]),
        combo("video_vae_name", "LTX23_video_vae_bf16.safetensors", ["__none__", "LTX23_video_vae_bf16.safetensors", "LTX23_audio_vae_bf16.safetensors"]),
        combo("audio_vae_name", "LTX23_audio_vae_bf16.safetensors", ["__none__", "LTX23_video_vae_bf16.safetensors", "LTX23_audio_vae_bf16.safetensors"]),
        combo("text_encoder_name", "gemma_3_12B_it_fp8_scaled.safetensors", ["__none__", "gemma_3_12B_it_fp8_scaled.safetensors"]),
        combo("text_projection_name", "ltx-2.3_text_projection_bf16.safetensors", ["__none__", "ltx-2.3_text_projection_bf16.safetensors"]),
        combo("clip_device", "default", ["default", "cpu"]),
        combo("weight_dtype", "default", ["default", "fp16", "bf16"]),
    ],
};
check(sanitizeLtxWidgetValues(cleanNode) === false, "clean node should not be changed");
check(!cleanNode.properties.__deno_ltx_shift_repair, "clean node should not get marker");

console.log("OK");
"""

    harness_path = tmp_path / "ltx_model_loader_shift_repair.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


def test_bernini_prompt_guide_normalizes_legacy_generated_widget_slots(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = BERNINI_JS_PATH.read_text(encoding="utf-8")
    snippets = [
        _extract_js_const_line(src, "GENERATED_PREFIX"),
        _extract_js_const_line(src, "NEGATIVE_PRESET_OFFICIAL"),
        _extract_js_const_line(src, "TASK_TYPE_CUSTOM_LEGACY"),
        _extract_js_declaration(src, "TASK_TYPE_LABELS"),
        _extract_js_declaration(src, "TASK_LABEL_TO_TYPE"),
        _extract_js_declaration(src, "SYSTEM_PROMPTS"),
        _extract_js_const_line(src, "BERNINI_PROMPT_GUIDE_SERIALIZED_WIDGET_COUNT"),
        _extract_js_function(src, "getNormalizedBerniniPromptGuideSerializedValues"),
        _extract_js_function(src, "hasGeneratedBerniniPromptGuideWidgets"),
        _extract_js_function(src, "getBerniniPromptGuideConfigureWidgetValues"),
        _extract_js_function(src, "normalizeTaskType"),
        _extract_js_function(src, "getWidget"),
        _extract_js_function(src, "getWidgetValue"),
        _extract_js_function(src, "setWidgetValue"),
        _extract_js_function(src, "applyBerniniPromptGuideSerializedValuesToWidgets"),
        _extract_js_function(src, "getBerniniPromptGuideSerializedValuesFromWidgets"),
        _extract_js_function(src, "syncBerniniPromptGuideSerializedValues"),
    ]

    harness = "\n".join(snippets) + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

const core = [
    "Reference Video Edit",
    "Replace the jacket with the shirt from image0.",
    true,
    "Official Wan2.2",
    true,
    "watermark, bad hands",
];
const legacy = [
    "Reference Video Edit",
    "",
    "Replace the jacket with the shirt from image0.",
    true,
    "",
    "Official Wan2.2",
    true,
    "watermark, bad hands",
];
const nodeWithGenerated = {
    widgets: [
        { name: "task_type", value: "Default" },
        { name: GENERATED_PREFIX + "system_summary", value: "" },
        { name: "positive_prompt", value: "" },
        { name: "reference_prompt_helper", value: false },
        { name: GENERATED_PREFIX + "negative_toggle", value: "" },
        { name: "negative_preset", value: "Empty" },
        { name: "show_negative_prompt", value: false },
        { name: "negative_prompt", value: "" },
    ],
};
const nodeWithoutGenerated = {
    widgets: [
        { name: "task_type", value: "Default" },
        { name: "positive_prompt", value: "" },
        { name: "reference_prompt_helper", value: false },
        { name: "negative_preset", value: "Empty" },
        { name: "show_negative_prompt", value: false },
        { name: "negative_prompt", value: "" },
    ],
};

check(eq(getNormalizedBerniniPromptGuideSerializedValues(legacy), core), "legacy 8 -> 6");
check(eq(getNormalizedBerniniPromptGuideSerializedValues(core), core), "current passthrough");
check(eq(
    getNormalizedBerniniPromptGuideSerializedValues(["Text to Video", "", false, "Empty", false, ""]),
    ["Text to Video", "", false, "Empty", false, ""]
), "current empty positive prompt preserved");
check(getNormalizedBerniniPromptGuideSerializedValues(null) === null, "null -> null");

check(eq(getBerniniPromptGuideConfigureWidgetValues(nodeWithGenerated, core), legacy), "core expands around generated widgets");
check(eq(getBerniniPromptGuideConfigureWidgetValues(nodeWithoutGenerated, core), core), "core stays compact without generated widgets");

applyBerniniPromptGuideSerializedValuesToWidgets(nodeWithGenerated, core);
check(nodeWithGenerated.widgets[0].value === "Reference Video Edit", "task type applied");
check(nodeWithGenerated.widgets[2].value === "Replace the jacket with the shirt from image0.", "positive applied");
check(nodeWithGenerated.widgets[3].value === true, "reference helper applied");
check(nodeWithGenerated.widgets[5].value === "Official Wan2.2", "negative preset applied");
check(nodeWithGenerated.widgets[6].value === true, "negative visibility applied");
check(nodeWithGenerated.widgets[7].value === "watermark, bad hands", "negative prompt applied");
syncBerniniPromptGuideSerializedValues(nodeWithGenerated);
check(eq(nodeWithGenerated.widgets_values, core), "synced back to compact serialized values");

console.log("OK");
"""

    harness_path = tmp_path / "bernini_prompt_guide_migration.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


def test_rtx_finisher_repairs_public_legacy_leading_blank_values(tmp_path):
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    src = RTX_FINISHER_JS_PATH.read_text(encoding="utf-8")
    snippets = [
        "const app = { graph: { setDirtyCanvas() {} } };",
        _extract_js_const_line(src, "FINISHER_SAVE_RESTORE_REV"),
        _extract_js_declaration(src, "FIRST_PASS_CHOICES"),
        _extract_js_declaration(src, "UPSCALE_PASS_CHOICES"),
        _extract_js_declaration(src, "QUALITY_CHOICES"),
        _extract_js_declaration(src, "RESIZE_TYPES"),
        _extract_js_declaration(src, "DIVISIBLE_BY_VALUES"),
        _extract_js_declaration(src, "BACKEND_DEFAULTS"),
        _extract_js_declaration(src, "BACKEND_WIDGET_NAMES"),
        "function getWidget(node, name) { return (node.widgets || []).find((widget) => widget.name === name); }",
        _extract_js_function(src, "requestNodeRedraw"),
        _extract_js_function(src, "setWidgetValue"),
        _extract_js_function(src, "syncFinisherSerializedValues"),
        _extract_js_function(src, "repairShiftedBackendWidgetValues"),
    ]

    harness = "\n".join(snippets) + r"""
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }
function widget(name, value) { return { name, value }; }

const shifted = ["", "Deblur", "Ultra", "High Bitrate", "High", "Scale", 2, 4, 3840, 2160, "32", "16:9", "Center Crop (Fill)"];
const node = {
    properties: {},
    setDirtyCanvas() {},
    widgets: BACKEND_WIDGET_NAMES.map((name, index) => widget(name, shifted[index])),
};

check(repairShiftedBackendWidgetValues(node) === true, "legacy leading blank should be repaired");
const byName = Object.fromEntries(node.widgets.map((w) => [w.name, w.value]));
check(byName.first_pass === "Deblur", "first pass");
check(byName.first_quality === "Ultra", "first quality");
check(byName.upscale_pass === "High Bitrate", "upscale pass");
check(byName.upscale_quality === "High", "upscale quality");
check(byName.resize_type === "Scale", "resize type");
check(byName.scale === 2, "scale");
check(byName.megapixels === 4, "megapixels");
check(byName.width === 3840, "width");
check(byName.height === 2160, "height");
check(byName.divisible_by === "32", "divisible_by");
check(byName.ratio_preset === "16:9", "ratio preset");
check(byName.resize_method === "Center Crop (Fill)", "resize method");
check(node.properties.__deno_rtx_finisher_save_restore === "rtx-finisher-save-reload-v1", "repair marker");
check(eq(node.widgets_values, [
    "Deblur",
    "Ultra",
    "High Bitrate",
    "High",
    "Scale",
    2,
    4,
    3840,
    2160,
    "32",
    "16:9",
    "Center Crop (Fill)",
]), "repaired compact widgets_values");

const clean = {
    properties: {},
    setDirtyCanvas() {},
    widgets: BACKEND_WIDGET_NAMES.map((name, index) => widget(name, node.widgets_values[index])),
};
check(repairShiftedBackendWidgetValues(clean) === false, "clean values should not be repaired again");

console.log("OK");
"""

    harness_path = tmp_path / "rtx_finisher_legacy_repair.mjs"
    harness_path.write_text(harness, encoding="utf-8")

    result = subprocess.run(
        [node_bin, str(harness_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "OK" in result.stdout


# --------------------------------------------------------------------------
# 3. Fixtures keep resolving against current nodes.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda p: p.name)
def test_fixture_deno_node_types_are_registered(fixture):
    graph = _load(fixture)
    for node in _deno_nodes(graph):
        node_type = node["type"]
        assert node_type in REGISTERED_IDS or node_type in REPLACEMENTS, (
            f"{fixture.name}: DENO node '{node_type}' is neither registered in "
            f"NODE_CLASS_MAPPINGS nor in DENO_NODE_REPLACEMENTS"
        )


def test_legacy_ltx_step_fused_sampler_replacement_contract_is_complete():
    specs = {
        spec["old_node_id"]: spec for spec in _node_replacement_specs()
    }
    replacement = specs["DenoLTXStepFusedTiledSampler"]

    assert replacement["new_node_id"] == "DenoLTXAVStepFusedTiledSampler"
    assert replacement["old_widget_ids"] == [
        "horizontal_tiles",
        "vertical_tiles",
        "overlap",
        "blend_mode",
        "aggressive_memory_cleanup",
        "debug",
    ]
    assert replacement["input_mapping"] == [
        {"new_id": "noise", "old_id": "noise"},
        {"new_id": "guider", "old_id": "guider"},
        {"new_id": "sampler", "old_id": "sampler"},
        {"new_id": "sigmas", "old_id": "sigmas"},
        {"new_id": "latent_image", "old_id": "latent_image"},
        {"new_id": "horizontal_tiles", "old_id": "horizontal_tiles"},
        {"new_id": "vertical_tiles", "old_id": "vertical_tiles"},
        {"new_id": "overlap", "old_id": "overlap"},
        {"new_id": "audio_mode", "set_value": "freeze"},
        {"new_id": "blend_mode", "old_id": "blend_mode"},
        {
            "new_id": "aggressive_memory_cleanup",
            "old_id": "aggressive_memory_cleanup",
        },
        {"new_id": "debug", "old_id": "debug"},
        {"new_id": "_deno_legacy_video_compat", "set_value": True},
    ]
    assert replacement["output_mapping"] == [
        {"old_idx": 0, "new_idx": 0},
        {"old_idx": 1, "new_idx": 1},
    ]
    assert "DenoLTXStepFusedTiledSampler" not in REGISTERED_IDS


def test_legacy_ltx_step_fused_sampler_fixture_locks_saved_widget_order():
    fixture = FIXTURE_DIR / "legacy_ltx_step_fused_sampler_v0762.json"
    graph = _load(fixture)
    nodes = [
        node
        for node in graph.get("nodes", [])
        if node.get("type") == "DenoLTXStepFusedTiledSampler"
    ]
    assert len(nodes) == 1
    assert nodes[0]["widgets_values"] == [1, 2, 8, "hann", False, False]
    assert [slot["name"] for slot in nodes[0]["outputs"]] == [
        "output",
        "denoised_output",
    ]
    assert [slot["link"] for slot in nodes[0]["inputs"][:5]] == [1, 2, 3, 4, 5]
    assert nodes[0]["inputs"][8]["name"] == "blend_mode"
    assert nodes[0]["inputs"][8]["link"] == 6
    assert nodes[0]["outputs"][0]["links"] == [7]
    assert nodes[0]["outputs"][1]["links"] == [8]
    assert graph["links"] == [
        [1, 10, 0, 1, 0, "NOISE"],
        [2, 11, 0, 1, 1, "GUIDER"],
        [3, 12, 0, 1, 2, "SAMPLER"],
        [4, 13, 0, 1, 3, "SIGMAS"],
        [5, 14, 0, 1, 4, "LATENT"],
        [6, 15, 0, 1, 8, "COMBO"],
        [7, 1, 0, 20, 0, "LATENT"],
        [8, 1, 1, 21, 0, "LATENT"],
    ]


def test_legacy_ltx_step_fused_sampler_frontend_replacement_preserves_values_and_links():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node is required for the frontend replacement harness")

    replacement = next(
        spec
        for spec in _node_replacement_specs()
        if spec["old_node_id"] == "DenoLTXStepFusedTiledSampler"
    )
    fixture = FIXTURE_DIR / "legacy_ltx_step_fused_sampler_v0762.json"
    harness = REPO_ROOT / "tests" / "js" / "ltx_legacy_replacement_harness.mjs"
    result = subprocess.run(
        [node_bin, str(harness), json.dumps(replacement), str(fixture)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"node replacement harness failed:\n{result.stdout}\n{result.stderr}"
    )
    assert "ltx_legacy_replacement_harness: ok" in result.stdout


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda p: p.name)
def test_fixture_output_slots_are_prefix_of_return_names(fixture):
    graph = _load(fixture)
    for node in _deno_nodes(graph):
        resolved = REPLACEMENTS.get(node["type"], node["type"])
        current = _return_names(resolved)
        assert current is not None, (
            f"{fixture.name}: cannot resolve RETURN_NAMES for {node['type']}"
        )
        saved = [
            slot.get("name")
            for slot in (node.get("outputs") or [])
            if isinstance(slot, dict)
        ]
        assert saved == list(current[:len(saved)]), (
            f"{fixture.name} node {node.get('id')} {node['type']}: saved output "
            f"slots {saved} are not a prefix of current RETURN_NAMES {current}"
        )


# --------------------------------------------------------------------------
# 4. Legacy DenoLTXPromptGuide layout is actually covered by a fixture.
# --------------------------------------------------------------------------
def _is_legacy_prompt_guide_values(values):
    return (
        isinstance(values, list)
        and len(values) >= 7
        and values[0] in ("", None)
        and values[4] in ("", None)
    )


def test_legacy_ltx_prompt_guide_layout_present_in_fixtures():
    legacy_hits = []
    for fixture in FIXTURES:
        graph = _load(fixture)
        for node in graph.get("nodes", []):
            if isinstance(node, dict) and node.get("type") == "DenoLTXPromptGuide":
                if _is_legacy_prompt_guide_values(node.get("widgets_values")):
                    legacy_hits.append((fixture.name, node.get("id")))
    assert legacy_hits, (
        "no legacy 7-value DenoLTXPromptGuide node found in fixtures; the "
        "configure-time migration would be untested. Keep a v0.3.8 workflow "
        "(e.g. ltx23_8gb_vram.json) in tests/fixtures/public_workflows/."
    )


# --------------------------------------------------------------------------
# 5. Paused / WIP nodes must never ship inside a public fixture.
# --------------------------------------------------------------------------
@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda p: p.name)
def test_no_paused_wip_nodes_in_fixture(fixture):
    graph = _load(fixture)
    types = {
        node.get("type")
        for node in graph.get("nodes", [])
        if isinstance(node, dict)
    }
    assert "DenoRandomPromptBox" not in types, (
        f"{fixture.name}: paused WIP node DenoRandomPromptBox must not appear "
        f"in a public workflow fixture"
    )
