import shutil
import subprocess
from pathlib import Path

import pytest

import deno_ideogram_director


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "web" / "js" / "deno_ideogram_director.js"
SCRIPT = SCRIPT_PATH.read_text(encoding="utf-8")


def test_ideogram_director_keeps_output_slots_and_adds_fedor_union_type():
    node_cls = deno_ideogram_director.DenoIdeogramDirector

    assert node_cls.RETURN_TYPES == (
        "STRING",
        "INT",
        "INT",
        "INT",
        "BBOX,BOUNDING_BOX",
    )
    assert node_cls.RETURN_NAMES == ("prompt", "width", "height", "seed", "bboxes")
    assert len(node_cls.RETURN_TYPES) == len(node_cls.RETURN_NAMES) == 5
    assert node_cls.RETURN_TYPES[-1].split(",") == ["BBOX", "BOUNDING_BOX"]


def test_ideogram_director_multilora_bridge_is_transient_and_wired_to_state_lifecycle():
    assert "function activeDirectorBoxes(sourceBoxes)" in SCRIPT
    assert "function publishDirectorActiveBoxes(node, sourceBoxes)" in SCRIPT
    assert 'Object.defineProperty(node, "_boxes"' in SCRIPT
    assert "enumerable: false" in SCRIPT

    serialize_body = SCRIPT.split("function serialize()", 1)[1].split("// ── undo/redo", 1)[0]
    render_body = SCRIPT.split("function renderBoxes()", 1)[1].split("function rel(e)", 1)[0]
    hydrate_body = SCRIPT.split("function hydrate()", 1)[1].split('chain(node, "onConfigure"', 1)[0]
    assert "publishActiveBoxes();" in serialize_body
    assert "publishActiveBoxes();" in render_body
    assert "publishActiveBoxes();" in hydrate_body

    caption_schema = serialize_body.split("const cd =", 1)[1].split('setW("caption_data"', 1)[0]
    assert "_boxes" not in caption_schema
    assert 'props.idd_size_rev' not in SCRIPT.split("function publishDirectorActiveBoxes", 1)[1].split(
        "if (typeof window", 1
    )[0]


def test_ideogram_director_multilora_bridge_harness():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")
    harness = ROOT / "tests" / "js" / "ideogram_director_multilora_bridge_harness.mjs"
    completed = subprocess.run(
        [node_bin, str(harness), str(ROOT)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "ideogram director MultiLoRA bridge harness passed" in completed.stdout
