from pathlib import Path
import tomllib


REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"
PUBLISH_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "publish_registry.yml"


def test_pyproject_declares_registry_metadata_for_comfy_manager_discovery():
    pyproject = tomllib.loads(PYPROJECT_PATH.read_text())

    assert pyproject["project"]["name"] == "deno-custom-nodes"
    assert pyproject["project"]["version"] == "0.2.5"
    assert pyproject["project"]["description"] == "Korean-friendly practical custom nodes for ComfyUI"
    assert pyproject["project"]["requires-python"] == ">=3.10"
    assert pyproject["project"]["license"] == {"file": "LICENSE"}
    assert pyproject["project"]["classifiers"] == ["Operating System :: OS Independent"]
    assert pyproject["project"]["dependencies"] == []
    assert pyproject["project"]["urls"]["Repository"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes"
    assert pyproject["project"]["urls"]["Bug Tracker"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes/issues"

    assert pyproject["tool"]["comfy"]["PublisherId"] == "deno2026"
    assert pyproject["tool"]["comfy"]["DisplayName"] == "Deno Custom Nodex"
    assert pyproject["tool"]["comfy"]["requires-comfyui"] == ">=0.3.0"
    assert pyproject["tool"]["comfy"]["Icon"].endswith("icon.svg")


def test_publish_workflow_exists_and_skips_without_registry_secret():
    workflow = PUBLISH_WORKFLOW_PATH.read_text()

    assert "name: Publish to Comfy registry" in workflow
    assert "workflow_dispatch:" in workflow
    assert "branches:" in workflow
    assert "- main" in workflow
    assert "REGISTRY_ACCESS_TOKEN: ${{ secrets.REGISTRY_ACCESS_TOKEN }}" in workflow
    assert "if: ${{ env.REGISTRY_ACCESS_TOKEN != '' }}" in workflow
    assert "Comfy-Org/publish-node-action@main" in workflow
    assert "personal_access_token: ${{ env.REGISTRY_ACCESS_TOKEN }}" in workflow
