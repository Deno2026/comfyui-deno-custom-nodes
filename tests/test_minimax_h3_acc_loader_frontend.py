from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
HARNESS_PATH = (
    REPO_ROOT / "tests" / "js" / "minimax_h3_acc_loader_migration_harness.mjs"
)
EXTRA_JS_PATH = REPO_ROOT / "web" / "js" / "deno_extra_nodes.js"


def test_minimax_h3_acc_loader_saved_workflow_migration_harness() -> None:
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
    assert result.returncode == 0, (
        f"MiniMax H3 migration harness failed:\n{result.stdout}\n{result.stderr}"
    )
    assert "minimax_h3_acc_loader_migration_harness passed" in result.stdout


def test_minimax_h3_acc_loader_migration_module_has_stable_bootstrap() -> None:
    source = EXTRA_JS_PATH.read_text(encoding="utf-8")
    assert 'import "./deno_minimax_h3_acc_loader_migration.js";' in source
