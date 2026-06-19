from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_floating_tools_frontend_free_vram_contract():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert 'const DENO_FLOATING_TOOLS_MARKER = "r2026.06.19-floating-tools-d"' in script
    assert 'name: "Show DENO floating tools"' in script
    assert 'category: ["DENO", "Tools", "Floating Tools"]' in script
    assert "Free VRAM" in script
    assert 'api.fetchApi("/free"' in script
    assert "unload_models: true" in script
    assert "free_memory: true" in script
    assert "Queue busy" in script


def test_floating_tools_update_watch_is_read_only():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert "Update Watch" in script
    assert "Check Updates" in script
    assert 'api.fetchApi("/system_stats"' in script
    assert "https://pypi.org/pypi/" in script
    assert "comfyui-workflow-templates" in script
    assert "comfyui-frontend-package" in script
    assert "https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest" in script
    assert "deno-floating-tools-update-badge" in script
    assert "Use your launcher or Manager to update" in script
    assert "if (!normalizeVersion(latest) || !normalizeVersion(installed)) return false;" in script

    forbidden = [
        "pip install",
        "git pull",
        "subprocess",
        "os.startfile",
        "shell.openPath",
        "explorer.exe",
        "/update",
    ]
    for token in forbidden:
        assert token not in script


def test_floating_tools_translation_surface_is_removed():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")
    init_py = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")

    assert "Canvas Translate" not in script
    assert "Canvas Translation" not in script
    assert "CanvasRenderingContext2D.prototype.fillText" not in script
    assert "deno/floating_tools/translate_text" not in script
    assert "TRANSLATION_TARGET" not in script
    assert "canvasTranslate" not in script
    assert "deno_floating_tools" not in init_py
    assert not (REPO_ROOT / "deno_floating_tools.py").exists()
