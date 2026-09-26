"""Behavioral coverage for the independent top-bar resource and cleanup controls."""

from pathlib import Path
import shutil
import subprocess


def test_resource_monitor_frontend_coexistence_and_lifecycle():
    node = shutil.which("node")
    assert node, "node executable is required for the resource monitor frontend harness"
    repo_root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [node, str(repo_root / "tests/js/resource_monitor_harness.mjs")],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "resource monitor behavior harness passed" in result.stdout
