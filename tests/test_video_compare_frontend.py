from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
HARNESS_PATH = REPO_ROOT / "tests" / "js" / "video_compare_split_position_harness.mjs"


def test_video_compare_split_position_harness() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the Video Compare frontend harness")

    result = subprocess.run(
        [node, str(HARNESS_PATH)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "video_compare_split_position_harness passed" in result.stdout
