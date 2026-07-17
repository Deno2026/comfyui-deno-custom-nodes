from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "web" / "js" / "deno_advanced_image_source_loader.js"
HARNESS_PATH = REPO_ROOT / "tests" / "js" / "advanced_image_source_loader_harness.mjs"


def test_advanced_image_source_loader_frontend_harness() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the frontend harness")

    result = subprocess.run(
        [node, str(HARNESS_PATH)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "advanced_image_source_loader_harness passed" in result.stdout


def test_external_root_memory_is_runtime_only() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "node.__denoAdvancedLastExternalRoot" in source
    assert "node.properties.__denoAdvancedLastExternalRoot" not in source
    assert "localStorage" not in source
    assert "sessionStorage" not in source
