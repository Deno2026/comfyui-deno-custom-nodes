from pathlib import Path
import importlib.util
import tomllib
import re
import sys
import tempfile


REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"
PUBLISH_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "publish_registry.yml"
COMFYIGNORE_PATH = REPO_ROOT / ".comfyignore"
PRESTARTUP_PATH = REPO_ROOT / "prestartup_script.py"
INSTALL_BAT_PATH = REPO_ROOT / "tools" / "install_rtx_vfx.bat"
README_PATH = REPO_ROOT / "README.md"
RTX_INSTALL_GUIDE_PATH = REPO_ROOT / "tools" / "README_RTX_VFX_EASY_INSTALL.md"
DIRECT_INSTALLER_URL = "https://github.com/Deno2026/comfyui-deno-custom-nodes/raw/refs/heads/main/tools/install_rtx_vfx.bat"


def test_pyproject_declares_registry_metadata_for_comfy_manager_discovery():
    pyproject = tomllib.loads(PYPROJECT_PATH.read_text())

    assert pyproject["project"]["name"] == "deno-custom-nodes"
    version = pyproject["project"]["version"]
    assert isinstance(version, str)
    assert re.fullmatch(r"\d+\.\d+\.\d+", version)
    assert "Core nodes are OS-independent" in pyproject["project"]["description"]
    assert "optional RTX VFX helper" in pyproject["project"]["description"]
    assert pyproject["project"]["requires-python"] == ">=3.10"
    assert pyproject["project"]["license"] == {"file": "LICENSE"}
    classifiers = pyproject["project"]["classifiers"]
    assert "Operating System :: OS Independent" in classifiers
    assert "License :: Public Domain" in classifiers
    assert pyproject["project"]["dependencies"] == []
    assert pyproject["project"]["urls"]["Repository"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes"
    assert pyproject["project"]["urls"]["Bug Tracker"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes/issues"

    assert pyproject["tool"]["comfy"]["PublisherId"] == "deno2026"
    assert pyproject["tool"]["comfy"]["DisplayName"] == "Deno Custom Nodes"
    assert pyproject["tool"]["comfy"]["requires-comfyui"] == ">=0.3.0"
    assert pyproject["tool"]["comfy"]["Icon"].endswith("icon.svg")


def test_publish_workflow_exists_and_fails_without_registry_secret():
    workflow = PUBLISH_WORKFLOW_PATH.read_text()

    assert "name: Publish to Comfy registry" in workflow
    assert "workflow_dispatch:" in workflow
    assert "paths:" in workflow
    assert "- pyproject.toml" in workflow
    assert "REGISTRY_ACCESS_TOKEN: ${{ secrets.REGISTRY_ACCESS_TOKEN }}" in workflow
    assert "REGISTRY_ACCESS_TOKEN secret is missing" in workflow
    assert "if: ${{ env.REGISTRY_ACCESS_TOKEN != '' }}" not in workflow
    assert "Comfy-Org/publish-node-action@main" in workflow
    assert "personal_access_token: ${{ env.REGISTRY_ACCESS_TOKEN }}" in workflow


def test_registry_package_excludes_manual_installers_and_local_harnesses():
    comfyignore = COMFYIGNORE_PATH.read_text()

    assert "tools/install_rtx_vfx.bat" in comfyignore
    assert "tools/test_portable_baseline.ps1" in comfyignore
    assert "docs/PORTABLE_TEST_BASELINE.md" in comfyignore
    assert "tools/DENO_RTX_VFX_runtime_path.txt" in comfyignore


def test_prestartup_script_prefers_rtx_runtime_without_importing_nvvfx():
    comfyignore = COMFYIGNORE_PATH.read_text()
    prestartup = PRESTARTUP_PATH.read_text()
    runtime_helper = (REPO_ROOT / "deno_rtx_vfx_runtime.py").read_text()

    assert PRESTARTUP_PATH.exists()
    assert "prestartup_script.py" not in comfyignore
    assert "import nvvfx" not in prestartup
    assert "del sys.modules" not in prestartup
    assert "os.environ[" not in prestartup
    assert "os.environ[" not in runtime_helper
    assert "DENO_RTX_VFX_runtime_path.txt" in prestartup
    assert "Preferred NVIDIA VFX runtime path" in prestartup
    assert "_runtime_path_matches_current_python" in prestartup


def test_rtx_vfx_installer_requires_prestartup_hook_before_success():
    install_bat = INSTALL_BAT_PATH.read_text()

    assert "PRESTARTUP_SCRIPT" in install_bat
    assert "prestartup_script.py" in install_bat
    assert "DENO_RTX_VFX_runtime_path.txt" in install_bat
    assert "normal ComfyUI Python package path" in install_bat
    assert "DENO ASCII runtime fallback" in install_bat
    assert "too old for RTX VFX setup" in install_bat
    assert "Progress [" in install_bat
    assert "Live pip output" in install_bat
    assert "AppendAllText" in install_bat
    assert "UTF8Encoding" in install_bat
    assert "Tee-Object" not in install_bat
    assert "DENO_PYTHON_OK" in install_bat
    assert "Python 3.10+" in install_bat


def test_rtx_vfx_docs_use_direct_installer_download_link():
    readme = README_PATH.read_text()
    install_guide = RTX_INSTALL_GUIDE_PATH.read_text()
    node_source = (REPO_ROOT / "deno_rtx_vfx_easy_upscale.py").read_text()

    assert DIRECT_INSTALLER_URL in readme
    assert DIRECT_INSTALLER_URL in install_guide
    assert DIRECT_INSTALLER_URL in node_source
    assert "blob/main/tools/install_rtx_vfx.bat" not in readme
    assert "blob/main/tools/install_rtx_vfx.bat" not in install_guide
    assert "blob/main/tools/install_rtx_vfx.bat" not in node_source


def test_prestartup_runtime_path_rejects_wrong_python_version():
    spec = importlib.util.spec_from_file_location("deno_prestartup_test", PRESTARTUP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    current_segment = f"py{sys.version_info[0]}{sys.version_info[1]}"
    wrong_segment = "py999" if current_segment != "py999" else "py998"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        package_dir = temp_root / "deno-custom-nodes"
        wrong_runtime = temp_root / "DENO" / "nvvfx_runtime" / wrong_segment / "nvidia_vfx_0_1_0_1"
        right_runtime = temp_root / "DENO" / "nvvfx_runtime" / current_segment / "nvidia_vfx_0_1_0_1"
        (package_dir / "tools").mkdir(parents=True)
        (wrong_runtime / "nvvfx").mkdir(parents=True)
        (right_runtime / "nvvfx").mkdir(parents=True)
        marker = package_dir / "tools" / "DENO_RTX_VFX_runtime_path.txt"

        marker.write_text(str(wrong_runtime), encoding="utf-8")
        assert module._runtime_path_from_marker(package_dir) is None

        marker.write_text(str(right_runtime), encoding="utf-8")
        assert module._runtime_path_from_marker(package_dir) == right_runtime


def test_prestartup_runtime_path_is_preferred_before_existing_paths():
    spec = importlib.util.spec_from_file_location("deno_prestartup_path_test", PRESTARTUP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    current_segment = f"py{sys.version_info[0]}{sys.version_info[1]}"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        package_dir = temp_root / "deno-custom-nodes"
        runtime = temp_root / "DENO" / "nvvfx_runtime" / current_segment / "nvidia_vfx_0_1_0_1"
        other_site_packages = temp_root / "python_embeded" / "Lib" / "site-packages"
        (package_dir / "tools").mkdir(parents=True)
        (runtime / "nvvfx").mkdir(parents=True)
        (other_site_packages / "nvvfx").mkdir(parents=True)
        marker = package_dir / "tools" / "DENO_RTX_VFX_runtime_path.txt"
        marker.write_text(str(runtime), encoding="utf-8")

        old_sys_path = list(sys.path)
        try:
            sys.path[:] = [str(other_site_packages), str(runtime), *old_sys_path]

            assert module._prefer_runtime_path(package_dir) == runtime
            assert sys.path[0] == str(runtime)
            assert sys.path.count(str(runtime)) == 1
            assert "nvvfx" not in sys.modules
        finally:
            sys.path[:] = old_sys_path
