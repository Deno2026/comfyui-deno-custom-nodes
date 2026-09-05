from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


def test_frontend_review_regressions() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for frontend regression checks")
    repo = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [node, str(repo / "tests/js/frontend_review_regressions_harness.mjs")],
        cwd=repo, capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "frontend_review_regressions_harness passed" in result.stdout
