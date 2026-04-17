from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
README_PATH = REPO_ROOT / "README.md"
GEMMA_GUIDE_PATH = REPO_ROOT / "docs" / "GEMMA4_OPERATOR_GUIDE.md"
GEMMA_PROMPT_PATH = REPO_ROOT / "docs" / "GEMMA4_TASK_PROMPT.md"


def test_gemma4_operator_docs_exist_and_cover_required_workflows():
    guide = GEMMA_GUIDE_PATH.read_text()
    prompt = GEMMA_PROMPT_PATH.read_text()

    assert GEMMA_GUIDE_PATH.exists()
    assert GEMMA_PROMPT_PATH.exists()
    assert "Never work directly on `main`." in guide
    assert "docker compose run --rm test" in guide
    assert "pyproject.toml" in guide
    assert "publish_registry.yml" in guide
    assert "Definition of done" in guide
    assert "Copy the text below" in prompt
    assert "Output format for status updates" in prompt


def test_readme_points_to_gemma4_docs_and_manager_lag_note():
    readme = README_PATH.read_text()

    assert "docs/GEMMA4_OPERATOR_GUIDE.md" in readme
    assert "docs/GEMMA4_TASK_PROMPT.md" in readme
    assert "indexing may still be catching up" in readme
    assert "https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes" in readme
