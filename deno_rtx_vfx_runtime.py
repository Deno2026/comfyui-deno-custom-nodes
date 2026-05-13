import os
import sys
from pathlib import Path
from typing import Optional


RUNTIME_MARKER_NAME = "DENO_RTX_VFX_runtime_path.txt"


def runtime_marker_path(package_dir: Optional[Path] = None) -> Path:
    root = Path(package_dir) if package_dir is not None else Path(__file__).resolve().parent
    return root / "tools" / RUNTIME_MARKER_NAME


def read_rtx_vfx_runtime_path(package_dir: Optional[Path] = None) -> Optional[Path]:
    marker = runtime_marker_path(package_dir)
    try:
        raw_path = marker.read_text(encoding="utf-8").strip().strip('"')
    except OSError:
        return None

    if not raw_path:
        return None

    runtime_path = Path(os.path.expandvars(raw_path))
    if not (runtime_path / "nvvfx").is_dir():
        return None

    return runtime_path


def _norm_path(path: Path) -> str:
    return os.path.normcase(os.path.abspath(str(path)))


def _is_relative_to(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
    except (OSError, ValueError):
        return False
    return True


def current_nvvfx_package_path() -> Optional[Path]:
    module = sys.modules.get("nvvfx")
    if module is None:
        return None

    module_paths = getattr(module, "__path__", None)
    if module_paths:
        for module_path in module_paths:
            return Path(module_path)

    module_file = getattr(module, "__file__", None)
    if module_file:
        return Path(module_file).parent

    return None


def _purge_nvvfx_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "nvvfx" or module_name.startswith("nvvfx."):
            del sys.modules[module_name]


def _move_to_front(runtime_path: Path) -> None:
    runtime_path_text = str(runtime_path)
    runtime_key = _norm_path(runtime_path)
    sys.path[:] = [entry for entry in sys.path if _norm_path(Path(entry or os.curdir)) != runtime_key]
    sys.path.insert(0, runtime_path_text)


def prefer_rtx_vfx_runtime_path(
    package_dir: Optional[Path] = None,
    reload_existing: bool = False,
) -> Optional[Path]:
    runtime_path = read_rtx_vfx_runtime_path(package_dir)
    if runtime_path is None:
        return None

    _move_to_front(runtime_path)
    os.environ["DENO_NVVFX_RUNTIME_PATH"] = str(runtime_path)

    loaded_path = current_nvvfx_package_path()
    expected_package_path = runtime_path / "nvvfx"
    if reload_existing and loaded_path is not None and not _is_relative_to(loaded_path, expected_package_path):
        _purge_nvvfx_modules()

    return runtime_path
