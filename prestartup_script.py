import os
import sys
from pathlib import Path
from typing import Optional


RUNTIME_MARKER_NAME = "DENO_RTX_VFX_runtime_path.txt"


def _expected_python_runtime_segment() -> str:
    return f"py{sys.version_info[0]}{sys.version_info[1]}"


def _runtime_path_matches_current_python(runtime_path: Path) -> bool:
    expected_segment = _expected_python_runtime_segment()
    return any(part.lower() == expected_segment for part in runtime_path.parts)


def _runtime_path_from_marker(package_dir: Optional[Path] = None) -> Optional[Path]:
    root = Path(package_dir) if package_dir is not None else Path(__file__).resolve().parent
    marker = root / "tools" / RUNTIME_MARKER_NAME

    try:
        raw_path = marker.read_text(encoding="utf-8").strip().strip('"')
    except OSError:
        return None

    if not raw_path:
        return None

    runtime_path = Path(os.path.expandvars(raw_path))
    if not (runtime_path / "nvvfx").is_dir():
        return None
    if not _runtime_path_matches_current_python(runtime_path):
        print(
            "[DENO RTX VFX] Ignoring NVIDIA VFX runtime path for a different Python version: "
            f"{runtime_path} (expected folder {_expected_python_runtime_segment()})"
        )
        return None

    return runtime_path


def _norm_path(path: Path) -> str:
    return os.path.normcase(os.path.abspath(str(path)))


def _prefer_runtime_path(package_dir: Optional[Path] = None) -> Optional[Path]:
    runtime_path = _runtime_path_from_marker(package_dir)
    if runtime_path is None:
        return None

    runtime_path_text = str(runtime_path)
    runtime_key = _norm_path(runtime_path)
    sys.path[:] = [entry for entry in sys.path if _norm_path(Path(entry or os.curdir)) != runtime_key]
    sys.path.insert(0, runtime_path_text)
    print(f"[DENO RTX VFX] Preferred NVIDIA VFX runtime path: {runtime_path_text}")
    return runtime_path


_prefer_runtime_path()
