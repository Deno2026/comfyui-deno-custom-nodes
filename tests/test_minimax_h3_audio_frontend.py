from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


def test_minimax_h3_audio_frontend_harness() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the frontend harness")
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [node, str(root / "tests/js/minimax_h3_audio_harness.mjs")],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, f"H3 audio frontend harness failed:\n{result.stdout}\n{result.stderr}"
    assert "minimax_h3_audio_harness passed" in result.stdout
