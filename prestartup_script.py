import os
import re
import sys
from pathlib import Path
from typing import Optional


RUNTIME_MARKER_NAME = "DENO_RTX_VFX_runtime_path.txt"


def _expected_python_runtime_segment() -> str:
    return f"py{sys.version_info[0]}{sys.version_info[1]}"


def _runtime_path_matches_current_python(runtime_path: Path) -> bool:
    return runtime_path.parent.name.lower() == _expected_python_runtime_segment()


def _validated_runtime_path(raw_path: str) -> Optional[Path]:
    """Accept only an isolated package directory made by the DENO installer."""
    public_dir = os.getenv("PUBLIC", "")
    if not public_dir:
        return None
    try:
        runtime_path = Path(raw_path)
        public_path = Path(public_dir)
        if not runtime_path.is_absolute() or not public_path.is_absolute():
            return None
        if runtime_path.anchor.startswith("\\\\") or public_path.anchor.startswith("\\\\"):
            return None
        trusted_root = (public_path / "DENO" / "nvvfx_runtime").resolve(strict=True)
        runtime_path = runtime_path.resolve(strict=True)
        if runtime_path.parent.parent != trusted_root:
            return None
        if not _runtime_path_matches_current_python(runtime_path):
            return None
        if not re.fullmatch(r"nvidia_vfx_\d+(?:_\d+){1,3}(?:_[0-9a-f]{32})?", runtime_path.name):
            return None
        # The search root must expose nvvfx alone, never unrelated Python modules.
        if {entry.name for entry in runtime_path.iterdir()} != {"nvvfx"}:
            return None
        package_path = (runtime_path / "nvvfx").resolve(strict=True)
        if package_path.parent != runtime_path or package_path.name != "nvvfx":
            return None
        init_path = (package_path / "__init__.py").resolve(strict=True)
        if init_path.parent != package_path or not init_path.is_file():
            return None
        return runtime_path
    except (OSError, ValueError, RuntimeError):
        return None


def _runtime_path_from_marker(package_dir: Optional[Path] = None) -> Optional[Path]:
    root = Path(package_dir) if package_dir is not None else Path(__file__).resolve().parent
    marker = root / "tools" / RUNTIME_MARKER_NAME

    try:
        raw_path = marker.read_text(encoding="utf-8").strip().strip('"')
    except OSError:
        return None

    if not raw_path:
        return None

    runtime_path = _validated_runtime_path(raw_path)
    if runtime_path is None:
        print(
            "[DENO RTX VFX] Ignoring an invalid fallback runtime marker. "
            "Rerun the DENO RTX VFX installer to prepare an isolated runtime "
            f"for {_expected_python_runtime_segment()}."
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
