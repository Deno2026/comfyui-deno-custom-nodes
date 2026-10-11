"""Fallback trust boundaries and bounded, read-only module inspection."""
import sys
from pathlib import Path
import types

import pytest

import prestartup_script as startup
import deno_rtx_vfx_runtime as runtime


@pytest.fixture
def prepared_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("PUBLIC", str(tmp_path / "public"))
    root = tmp_path / "public" / "DENO" / "nvvfx_runtime"
    folder = root / startup._expected_python_runtime_segment() / "nvidia_vfx_0_1_0_1"
    (folder / "nvvfx").mkdir(parents=True)
    (folder / "nvvfx" / "__init__.py").write_text("# inert fixture\n", encoding="utf-8")
    package = tmp_path / "deno-custom-nodes"
    (package / "tools").mkdir(parents=True)
    marker = package / "tools" / startup.RUNTIME_MARKER_NAME
    marker.write_text(str(folder), encoding="utf-8")
    return folder, package, marker


@pytest.mark.parametrize("new_style", [False, True], ids=["legacy-copy", "versioned-copy"])
def test_valid_installer_copies_remain_compatible(prepared_runtime, new_style):
    folder, package, marker = prepared_runtime
    if new_style:
        folder = folder.rename(folder.with_name("nvidia_vfx_0_2_0_0_" + "a" * 32))
        marker.write_text(str(folder), encoding="utf-8")
    assert startup._runtime_path_from_marker(package) == folder
    assert runtime.read_rtx_vfx_runtime_path(package) == folder


@pytest.mark.parametrize("extra", ["torch.py", "os.py", "sitecustomize.py", "other_package"])
def test_fallback_cannot_shadow_unrelated_modules(prepared_runtime, extra, monkeypatch):
    folder, package, marker = prepared_runtime
    (folder / extra).write_text("# should never enter module search path\n", encoding="utf-8")
    before = sys.path.copy()
    monkeypatch.setattr(sys, "path", before.copy())
    assert startup._prefer_runtime_path(package) is None
    assert runtime.prefer_rtx_vfx_runtime_path(package) is None
    assert sys.path == before


@pytest.mark.parametrize("kind", ["outside-root", "wrong-python", "unknown-layout", "relative", "environment-expression", "unc", "missing-init"])
def test_untrusted_markers_are_rejected(prepared_runtime, tmp_path, kind):
    folder, package, marker = prepared_runtime
    if kind == "outside-root":
        moved = tmp_path / "elsewhere" / folder.parent.name / folder.name
        moved.parent.mkdir(parents=True)
        folder = folder.rename(moved)
        raw = str(folder)
    elif kind == "wrong-python":
        moved = folder.parent.parent / "py999" / folder.name
        moved.parent.mkdir()
        raw = str(folder.rename(moved))
    elif kind == "unknown-layout":
        raw = str(folder.rename(folder.with_name("arbitrary-import-root")))
    elif kind == "relative":
        raw = "relative/" + folder.parent.name + "/" + folder.name
    elif kind == "environment-expression":
        raw = "%PUBLIC%/DENO/nvvfx_runtime/" + folder.parent.name + "/" + folder.name
    elif kind == "unc":
        raw = "\\\\server\\share\\DENO\\nvvfx_runtime\\" + folder.parent.name + "\\" + folder.name
    else:
        (folder / "nvvfx" / "__init__.py").unlink()
        raw = str(folder)
    marker.write_text(raw, encoding="utf-8")
    assert startup._runtime_path_from_marker(package) is None
    assert runtime.read_rtx_vfx_runtime_path(package) is None


def test_package_symlink_cannot_escape_trusted_runtime(prepared_runtime, tmp_path):
    folder, package, marker = prepared_runtime
    target = tmp_path / "outside-nvvfx"
    (folder / "nvvfx").rename(target)
    try:
        (folder / "nvvfx").symlink_to(target, target_is_directory=True)
    except OSError:
        pytest.skip("Creating a directory symlink is unavailable")
    assert startup._runtime_path_from_marker(package) is None


def test_process_inspection_reads_only_current_process_images(monkeypatch):
    calls = []
    class CurrentProcess:
        def __init__(self):
            calls.append("current")

        def memory_maps(self, *, grouped):
            assert grouped is True
            return [types.SimpleNamespace(path=p) for p in [
                "C:/Windows/System32/kernel32.dll", "C:/Python/python.exe",
                "C:/Python/native.pyd", "C:/Windows/System32/kernel32.dll",
                "C:/data/file.bin", "",
            ]]
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setitem(sys.modules, "psutil", types.SimpleNamespace(Process=CurrentProcess))
    assert runtime.loaded_process_module_paths() == [
        "C:/Windows/System32/kernel32.dll", "C:/Python/python.exe", "C:/Python/native.pyd",
    ]
    assert calls == ["current"]


def test_unavailable_module_diagnostics_do_not_break_rtx(monkeypatch):
    def unavailable():
        raise OSError("access denied")
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setitem(sys.modules, "psutil", types.SimpleNamespace(Process=unavailable))
    assert runtime.loaded_process_module_paths() == []


def test_non_windows_never_inspects_process_maps(monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    def forbidden():
        pytest.fail("Non-Windows startup must not inspect Windows modules")
    monkeypatch.setitem(sys.modules, "psutil", types.SimpleNamespace(Process=forbidden))
    assert runtime.loaded_process_module_paths() == []
