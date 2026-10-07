from pathlib import Path
import shutil
import subprocess

import pytest


def test_film_grain_frontend_contracts():
    node = shutil.which('node')
    if not node:
        pytest.skip('Node.js unavailable')
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run([node, str(root / 'tests/js/film_grain_harness.mjs')], cwd=root,
        capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
