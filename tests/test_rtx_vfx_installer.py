"""Exercise the shipped installer's checks without installing packages or using a GPU."""

import ast
import importlib.metadata
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import types
import zipfile

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
BAT_PATH = REPO_ROOT / "tools" / "install_rtx_vfx.bat"
ZIP_PATH = REPO_ROOT / "tools" / "install_rtx_vfx_bat.zip"
INSTALLER_README_PATH = REPO_ROOT / "tools" / "README_RTX_VFX_EASY_INSTALL.md"
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")


def _installer_text():
    return BAT_PATH.read_text(encoding="utf-8")


def _python_commands():
    return [
        match.group(1).replace("%%", "%")
        for match in re.finditer(
            r'^"%PYTHON_EXE%" -c "([^\r\n]+)" (?=[>])', _installer_text(), re.MULTILINE
        )
    ]


def _command_containing(marker):
    matches = [command for command in _python_commands() if marker in command]
    assert len(matches) == 1, f"Expected one installer check containing {marker!r}"
    return matches[0]


def _fake_runtime(
    monkeypatch,
    *,
    installed="0.2.0.0",
    loaded="0.2.0.0",
    sdk="1.3.0",
    module_path="/fake/nvvfx",
    cuda="13.0",
    available=True,
    load_error=False,
    run_error=False,
    output_shape=(3, 720, 1280),
    finite=True,
):
    """Every CUDA/native method here is a stub; the installer code runs unchanged."""
    torch = types.ModuleType("torch")
    torch.__version__ = "test+cu130"
    torch.version = types.SimpleNamespace(cuda=cuda)
    events = []
    torch.float32 = "FAKE FLOAT32"
    frame = types.SimpleNamespace(shape=(3, 360, 640))
    capsule = object()

    def zeros(shape, *, device, dtype):
        assert shape == (3, 360, 640)
        assert device == "cuda:0" and dtype == torch.float32
        events.append(("zeros", shape, device, dtype))
        return frame

    class Output:
        shape = output_shape

        def clone(self):
            events.append(("cloned",))
            return self

    def from_dlpack(value):
        assert value is capsule
        events.append(("from_dlpack",))
        return Output()

    torch.zeros = zeros
    torch.from_dlpack = from_dlpack
    torch.isfinite = lambda output: types.SimpleNamespace(
        all=lambda: types.SimpleNamespace(item=lambda: finite)
    )
    torch.cuda = types.SimpleNamespace(
        is_available=lambda: available,
        device_count=lambda: int(available),
        get_device_name=lambda index: "TEST GPU",
        synchronize=lambda device: events.append(("synchronized", device)),
    )

    class Effect:
        QualityLevel = types.SimpleNamespace(LOW=0, MEDIUM=1, HIGH=2, ULTRA=3)

        def __init__(self, quality, device):
            events.append(("created", quality, device))

        def close(self):
            events.append(("closed",))

        def load(self):
            assert self.output_width == 1280 and self.output_height == 720
            events.append(("loaded", self.output_width, self.output_height))
            if load_error:
                raise RuntimeError("simulated load failure")

        def run(self, input_frame):
            assert input_frame is frame
            events.append(("ran",))
            if run_error:
                raise RuntimeError("simulated run failure")
            return types.SimpleNamespace(image=capsule)

    nvvfx = types.ModuleType("nvvfx")
    nvvfx.__version__ = loaded
    nvvfx.__path__ = [module_path]
    nvvfx.get_sdk_version = lambda: sdk
    nvvfx.VideoSuperRes = Effect
    loader = types.ModuleType("nvvfx._lib_loader")
    loader.get_libs_directory = lambda: "FAKE BUNDLED LIBRARIES"
    nvvfx._lib_loader = loader
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "nvvfx", nvvfx)
    monkeypatch.setitem(sys.modules, "nvvfx._lib_loader", loader)
    monkeypatch.setattr(importlib.metadata, "version", lambda name: installed)
    return events


def _run_check(code):
    exec(compile(code, str(BAT_PATH), "exec"), {})


def test_all_embedded_python_commands_parse():
    commands = _python_commands()
    assert len(commands) == 5
    for command in commands:
        ast.parse(command)


@pytest.mark.parametrize(
    "cuda, available, rejection",
    [
        (None, True, "CPU-only PyTorch"),
        ("13.0", False, "CUDA is not available"),
        ("13.0", True, None),
    ],
)
def test_cuda_preflight_requires_existing_working_pytorch(monkeypatch, cuda, available, rejection):
    _fake_runtime(monkeypatch, cuda=cuda, available=available)
    code = _command_containing("This ComfyUI Python has CPU-only PyTorch")
    if rejection:
        with pytest.raises(AssertionError, match=re.escape(rejection)):
            _run_check(code)
    else:
        _run_check(code)


@pytest.mark.parametrize("fallback", [False, True], ids=["normal", "fallback"])
@pytest.mark.parametrize(
    "installed, loaded, sdk, rejection",
    [
        ("0.2.0.0", "0.2.0.0", "1.3.0", None),
        ("0.1.0.1", "0.1.0.1", "1.2.0", "must be 0.2.0.0"),
        ("0.2.0.0", "0.1.0.1", "1.3.0", "does not match"),
        ("0.2.0.0", "0.2.0.0", "1.2.0", "must be 1.3.0"),
        ("0.3.0.0", "0.3.0.0", "1.4.0", None),
    ],
    ids=["current", "old-installation", "stale-module", "stale-sdk", "newer-stable"],
)
def test_runtime_verification_rejects_old_or_mismatched_copies(
    monkeypatch, tmp_path, fallback, installed, loaded, sdk, rejection
):
    runtime = tmp_path / "runtime" / "py313" / "nvidia_vfx_0_2_0_0_test"
    monkeypatch.setenv("DENO_NVVFX_RUNTIME_PATH", str(runtime))
    events = _fake_runtime(
        monkeypatch, installed=installed, loaded=loaded, sdk=sdk,
        module_path=str(runtime / "nvvfx"),
    )
    # The shipped fallback prepends sys.path. Restore it when this test ends.
    monkeypatch.setattr(sys, "path", sys.path.copy())
    marker = "DENO ASCII nvvfx runtime ready" if fallback else "Native nvvfx runtime ready"
    code = _command_containing(marker)
    if rejection:
        with pytest.raises(AssertionError, match=re.escape(rejection)):
            _run_check(code)
        assert events == [], "An old or mismatched runtime must fail before creating effects"
    else:
        _run_check(code)
        assert events == [event for quality in range(4)
                          for event in (("created", quality, 0), ("closed",))] + [
            ("zeros", (3, 360, 640), "cuda:0", "FAKE FLOAT32"),
            ("created", 1, 0),
            ("loaded", 1280, 720),
            ("ran",),
            ("from_dlpack",),
            ("cloned",),
            ("closed",),
            ("synchronized", 0),
        ]


@pytest.mark.parametrize("fallback", [False, True], ids=["normal", "fallback"])
@pytest.mark.parametrize(
    "failure, error_type, message",
    [
        ({"load_error": True}, RuntimeError, "simulated load failure"),
        ({"run_error": True}, RuntimeError, "simulated run failure"),
        ({"output_shape": (3, 719, 1280)}, AssertionError, "unexpected output shape"),
        ({"finite": False}, AssertionError, "non-finite output"),
    ],
    ids=["load", "run", "shape", "non-finite"],
)
def test_runtime_smoke_fails_closed_and_releases_effect(monkeypatch, tmp_path, fallback, failure, error_type, message):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("DENO_NVVFX_RUNTIME_PATH", str(runtime))
    monkeypatch.setattr(sys, "path", sys.path.copy())
    events = _fake_runtime(monkeypatch, module_path=str(runtime / "nvvfx"), **failure)
    marker = "DENO ASCII nvvfx runtime ready" if fallback else "Native nvvfx runtime ready"
    with pytest.raises(error_type, match=message):
        _run_check(_command_containing(marker))
    assert events[-2:] == [("closed",), ("synchronized", 0)]


def test_fallback_verification_rejects_sibling_prefix_path(monkeypatch, tmp_path):
    runtime = tmp_path / "runtime"
    monkeypatch.setenv("DENO_NVVFX_RUNTIME_PATH", str(runtime))
    monkeypatch.setattr(sys, "path", sys.path.copy())
    events = _fake_runtime(monkeypatch, module_path=str(runtime / "nvvfx_stale"))
    with pytest.raises(AssertionError, match="path was not used during verification"):
        _run_check(_command_containing("DENO ASCII nvvfx runtime ready"))
    assert events == []


def test_fallback_copy_uses_installed_version_and_preserves_previous_copy(monkeypatch, tmp_path, capsys):
    source = tmp_path / "installed" / "nvvfx"
    source.mkdir(parents=True)
    (source / "__init__.py").write_text("# simulated nvvfx 0.2.0.0\n", encoding="utf-8")
    (source / "native.dll").write_bytes(b"SIMULATED NEW LIBRARY")
    root = tmp_path / "runtime"
    python_segment = f"py{sys.version_info.major}{sys.version_info.minor}"
    previous = root / python_segment / "nvidia_vfx_0_1_0_1"
    previous.mkdir(parents=True)
    (previous / "keep.txt").write_bytes(b"PRESERVE PREVIOUS COPY")
    distribution = types.SimpleNamespace(version="0.2.0.0", locate_file=lambda relative: source)
    monkeypatch.setattr(importlib.metadata, "distribution", lambda name: distribution)
    monkeypatch.setenv("DENO_NVVFX_RUNTIME_ROOT", str(root))
    code = _command_containing("dist=metadata.distribution('nvidia-vfx')")
    destinations = []
    for _ in range(2):
        _run_check(code)
        destination = Path(capsys.readouterr().out.strip())
        assert destination.parent == root / python_segment
        assert destination.name.startswith("nvidia_vfx_0_2_0_0_")
        assert (destination / "nvvfx" / "native.dll").read_bytes() == b"SIMULATED NEW LIBRARY"
        destinations.append(destination)
    assert destinations[0] != destinations[1]
    assert (previous / "keep.txt").read_bytes() == b"PRESERVE PREVIOUS COPY"


def test_fallback_copy_rejects_old_installed_package(monkeypatch, tmp_path):
    root = tmp_path / "runtime"
    distribution = types.SimpleNamespace(version="0.1.0.1")
    monkeypatch.setattr(importlib.metadata, "distribution", lambda name: distribution)
    monkeypatch.setenv("DENO_NVVFX_RUNTIME_ROOT", str(root))
    with pytest.raises(AssertionError, match="Fallback requires nvidia-vfx 0.2.0.0"):
        _run_check(_command_containing("dist=metadata.distribution('nvidia-vfx')"))
    assert not root.exists()


def test_installer_preserves_pytorch_and_requests_current_nvidia_package():
    text = _installer_text()
    args_match = re.search(r'^set "PIP_INSTALL_ARGS=([^\r\n]+)"$', text, re.MULTILINE)
    assert args_match is not None
    assert "--no-deps" in args_match.group(1).split()
    launch_line = next(line for line in text.splitlines() if "$installArgs=" in line)
    assert "'--upgrade'" in launch_line
    assert "'https://pypi.nvidia.com','nvidia-vfx>=0.2.0.0'" in launch_line


@pytest.mark.skipif(sys.platform != "win32" or not POWERSHELL, reason="Windows PowerShell launcher")
def test_powershell_launcher_keeps_requirement_comparator_and_no_deps(tmp_path):
    # This module shadows real pip in a fresh subprocess and only prints argv.
    # Running the whole installer or installing any dependency is unnecessary.
    (tmp_path / "pip.py").write_text(
        "import sys\nprint('DENO FAKE PIP ARGV', ' '.join(sys.argv[1:]))\n", encoding="ascii"
    )
    text = _installer_text()
    install_line = next(line for line in text.splitlines() if "$installArgs=" in line)
    powershell_code = re.search(r'-Command "(.*)"$', install_line).group(1)
    pip_args = re.search(r'^set "PIP_INSTALL_ARGS=([^\r\n]+)"$', text, re.MULTILINE).group(1)
    log = tmp_path / "pip-argv.txt"
    environment = os.environ.copy()
    environment.update(PYTHON_EXE=sys.executable, LOG=str(log), PYTHONPATH=str(tmp_path),
                       PIP_INSTALL_ARGS=pip_args)
    result = subprocess.run(
        [POWERSHELL, "-NoProfile", "-Command", powershell_code], env=environment,
        capture_output=True, text=True, timeout=20,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert result.returncode == 0, result.stderr
    logged_args = log.read_text(encoding="utf-8")
    assert "DENO FAKE PIP ARGV" in logged_args
    assert "--upgrade" in logged_args and "--force-reinstall" in logged_args
    assert "--no-deps" in logged_args
    assert "--index-url https://pypi.nvidia.com nvidia-vfx>=0.2.0.0" in logged_args


def test_zip_preserves_installer_readme_and_exact_source_bytes():
    with zipfile.ZipFile(ZIP_PATH) as archive:
        assert sorted(archive.namelist()) == ["README_RTX_VFX_EASY_INSTALL.md", "install_rtx_vfx.bat"]
        assert archive.read("install_rtx_vfx.bat") == BAT_PATH.read_bytes()
        assert archive.read("README_RTX_VFX_EASY_INSTALL.md") == INSTALLER_README_PATH.read_bytes()
