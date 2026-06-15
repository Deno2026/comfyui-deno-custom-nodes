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
import shutil
import subprocess

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
INIT_PATH = REPO_ROOT / "__init__.py"
JS_PATH = REPO_ROOT / "web" / "js" / "deno_ltx_prompt_guide.js"
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "public_workflows"
FIXTURES = sorted(FIXTURE_DIR.glob("*.json"))


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


def _node_replacements():
    for node in ast.walk(_init_tree()):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "DENO_NODE_REPLACEMENTS":
                    replacements = ast.literal_eval(node.value)
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


# --------------------------------------------------------------------------
# 1. JS migration exists and is wired into configure().
# --------------------------------------------------------------------------
def test_prompt_guide_js_has_legacy_configure_migration():
    src = JS_PATH.read_text(encoding="utf-8")

    assert "function getNormalizedLtxPromptGuideSerializedValues" in src
    assert "function normalizeLtxPromptGuideLegacyWidgetValues" in src
    # Normalization must run inside configure(), before LiteGraph restores
    # widget values (not only in the post-restore onConfigure callback).
    assert "nodeType.prototype.configure = function" in src
    assert "normalizeLtxPromptGuideLegacyWidgetValues(info)" in src
    # Display widgets must stay non-serializing, and the existing post-restore
    # setup path must remain intact.
    assert "serialize: false" in src
    assert "queueMicrotask(() => setupNode(this))" in src


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
