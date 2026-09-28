from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
HARNESS_PATH = REPO_ROOT / "tests" / "js" / "image_loader_enabled_harness.mjs"


def test_image_loader_enabled_frontend_harness() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the frontend harness")

    result = subprocess.run(
        [node, str(HARNESS_PATH)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"Image loader enabled-state harness failed:\n{result.stdout}\n{result.stderr}"
    )
    assert "image_loader_enabled_harness passed" in result.stdout
