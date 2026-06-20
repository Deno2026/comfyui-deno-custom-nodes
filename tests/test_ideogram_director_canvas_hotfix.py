from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")


def test_ideogram_director_stage_aspect_follows_current_resolution():
    assert 'const IDD_REV = "r2026.06.21-canvas-hotfix-a"' in SCRIPT
    assert "function targetAspect()" in SCRIPT
    assert 'const W2 = +getW("width", 1024), H2 = +getW("height", 1024);' in SCRIPT
    assert "return targetAspect() || imageAspect() || 1;" in SCRIPT
    assert "bimg.naturalWidth > 0 && bimg.naturalHeight > 0" in SCRIPT


def test_ideogram_director_box_drag_captures_pointer_until_release_or_cancel():
    assert "function startDragListeners(e)" in SCRIPT
    assert "setPointerCapture(e.pointerId)" in SCRIPT
    assert "releasePointerCapture(drag.pointerId)" in SCRIPT
    assert 'window.addEventListener("pointermove", onMove, true)' in SCRIPT
    assert 'window.addEventListener("pointercancel", onCancel, true)' in SCRIPT
    assert 'window.addEventListener("blur", onCancel, true)' in SCRIPT
    assert "function dragPointerMatches(e)" in SCRIPT
