from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")


def test_ideogram_director_stage_aspect_follows_current_resolution():
    assert 'const IDD_REV = "r2026.06.30-generate-target-a"' in SCRIPT
    assert "function targetAspect()" in SCRIPT
    assert 'const W2 = +getW("width", 1024), H2 = +getW("height", 1024);' in SCRIPT
    assert "return targetAspect() || imageAspect() || 1;" in SCRIPT
    assert "bimg.naturalWidth > 0 && bimg.naturalHeight > 0" in SCRIPT
    assert "function stageRect()" in SCRIPT
    assert "placeRect(ov, srect);   // boxes always follow the committed output canvas unless Fit Ref changes that canvas" in SCRIPT
    assert 'bdFitRefBtn.textContent = "Fit Ref"' in SCRIPT


def test_ideogram_director_box_drag_captures_pointer_until_release_or_cancel():
    assert "function startDragListeners(e)" in SCRIPT
    assert "setPointerCapture(e.pointerId)" in SCRIPT
    assert "releasePointerCapture(drag.pointerId)" in SCRIPT
    assert 'window.addEventListener("pointermove", onMove, true)' in SCRIPT
    assert 'window.addEventListener("pointercancel", onCancel, true)' in SCRIPT
    assert 'window.addEventListener("blur", onCancel, true)' in SCRIPT
    assert "function dragPointerMatches(e)" in SCRIPT


def test_ideogram_result_descriptor_is_optional_and_transient_failures_preserve_it():
    assert "let resultImageRef = null;" in SCRIPT
    assert "if (resultImageRef) cd.resultImage = Object.assign({}, resultImageRef);" in SCRIPT
    assert "persistResultImageDescriptor();" in SCRIPT
    assert "node._idd._last = null;" in SCRIPT
    assert "resultImageRef = null;" in SCRIPT
    assert "resultImageRef = normalizeResultImageDescriptor(d.resultImage);" in SCRIPT
    assert "delete saved.resultImage;" in SCRIPT
    assert "commit();" not in SCRIPT.split("function persistResultImageDescriptor()", 1)[1].split("function savedImportSig()", 1)[0]


def test_ideogram_body_overlays_use_owner_scoped_real_close_paths():
    assert "const bodyOverlayOwners = new Set();" in SCRIPT
    assert "function ownBodyOverlay(close, element, ownerCloseArgs = [])" in SCRIPT
    assert "if (node.graph && activeGraph && activeGraph !== node.graph)" in SCRIPT
    assert "const fallbackOwner = ownBodyOverlay" in SCRIPT
    assert "}, modal, [false]);" in SCRIPT
    assert "languageOwner = ownBodyOverlay(closeRaw, modal);" in SCRIPT
    assert "resPopupOwner = ownBodyOverlay(closeResPopup, resPop);" in SCRIPT
    assert "fsOwner = ownBodyOverlay(() => setFullscreen(false), wrap);" in SCRIPT
    assert "const galleryOwner = ownBodyOverlay" in SCRIPT
    assert "closeOwnedBodyOverlays();" in SCRIPT


def test_ideogram_preflight_and_backdrop_changes_are_narrow():
    assert 'purpose: options.purpose === "queue_preflight" ? "queue_preflight" : undefined' in SCRIPT
    assert '{ purpose: "queue_preflight" }' in SCRIPT
    assert "function backdropSourceNodeForDirector" in SCRIPT
    assert 'return String(node?.type || node?.comfyClass || node?.constructor?.nodeData?.name || "").trim() === "Reroute";' in SCRIPT
    assert "Backdrop preview appears after this connected image source runs." in SCRIPT
