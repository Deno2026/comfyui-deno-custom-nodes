from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("harness_name", [
    "video_compare_split_position_harness.mjs",
    "video_compare_export_harness.cjs",
])
def test_video_compare_frontend_harness(harness_name: str) -> None:
    harness_path = REPO_ROOT / "tests" / "js" / harness_name
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the Video Compare frontend harness")

    result = subprocess.run(
        [node, str(harness_path)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert f"{harness_path.stem} passed" in result.stdout
