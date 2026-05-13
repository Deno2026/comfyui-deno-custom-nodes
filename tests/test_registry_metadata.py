from pathlib import Path
import tomllib
import re


REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"
PUBLISH_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "publish_registry.yml"
COMFYIGNORE_PATH = REPO_ROOT / ".comfyignore"


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
    assert "Environment :: GPU :: NVIDIA CUDA" in classifiers
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
