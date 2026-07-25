import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")


def test_ideogram_director_stage_aspect_follows_current_resolution():
    assert 'const IDD_REV = "r2026.07.25-director-element-controls-a"' in SCRIPT
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


def test_ideogram_director_element_enabled_state_round_trips_and_filters_output_only():
    assert "enabled: b.enabled !== false" in SCRIPT
    assert 'const sourceBoxes = includeDisabled ? boxes : boxes.filter((b) => b.enabled !== false);' in SCRIPT
    assert "const enabledStates = boxes.map((b) => b.enabled !== false);" in SCRIPT
    assert "translateCaptionViaRoute(assembleCaption(true), target, source)" in SCRIPT
    assert "boxes.forEach((b, i) => { b.enabled = enabledStates[i] !== false; });" in SCRIPT
    assert 'e.target.closest(".g,.ty,.en,.dup,.x")' in SCRIPT
    assert "b.enabled = b.enabled === false;" in SCRIPT
    assert "input_summary: 1, input_background: 1" in SCRIPT
    assert 'inputIsConnected("input_summary")' in SCRIPT
    assert 'inputIsConnected("input_background")' in SCRIPT
    assert "Connected input overrides this saved value during generation." in SCRIPT
    assert 'translateBtn.textContent = hasConnectedTextOverride ? "Board English Ready" : "English Ready";' in SCRIPT


def test_ideogram_director_bbox_editor_uses_pointer_anchored_dom_coordinates():
    assert "function pointerAnchoredPanelPosition(options = {})" in SCRIPT
    assert "modalRect = modal.getBoundingClientRect()" in SCRIPT
    assert "panelRect = panel.getBoundingClientRect()" in SCRIPT
    assert "modalLayoutWidth: modal.clientWidth || modal.offsetWidth || modalRect.width" in SCRIPT
    assert "openElementEditor(i, { clientX: e.clientX, clientY: e.clientY })" in SCRIPT
    assert "function openElementEditor(i, pointerAnchor = null)" in SCRIPT
    assert "openElementEditor(idx);" in SCRIPT
    helper_source = SCRIPT.split("function pointerAnchoredPanelPosition(options = {})", 1)[1].split(
        'if (typeof window !== "undefined"',
        1,
    )[0]
    assert "app.canvas" not in helper_source
    assert ".ds.scale" not in helper_source


def test_ideogram_director_anchored_editor_reclamps_after_resize_and_cleans_up():
    assert "function repositionAnchoredPanel()" in SCRIPT
    assert "function scheduleAnchoredPanelReposition()" in SCRIPT
    assert 'anchorResizeObserver = new ResizeObserver(() => scheduleAnchoredPanelReposition())' in SCRIPT
    assert "anchorResizeObserver.observe(panel);" in SCRIPT
    assert "txtSec.style.display = type === \"text\" ? \"\" : \"none\";" in SCRIPT
    assert "scheduleAnchoredPanelReposition();" in SCRIPT
    assert "if (!hasPointerAnchor || editorClosed || !modal.parentNode) return;" in SCRIPT
    assert "if (anchorResizeObserver)" in SCRIPT
    assert "anchorResizeObserver.disconnect();" in SCRIPT
    assert "clearTimeout(anchorRepositionTimer);" in SCRIPT
    editor_source = SCRIPT.split("function openElementEditor(i, pointerAnchor = null)", 1)[1]
    close_source = editor_source.split("const close = () => {", 1)[1].split("modal.addEventListener", 1)[0]
    assert "stopAnchoredPanelTracking();" in close_source
    assert "modal.remove();" in close_source


def test_ideogram_director_pointer_panel_normal_zoom_fullscreen_coordinates():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")
    harness = ROOT / "tests" / "js" / "ideogram_director_pointer_panel_harness.mjs"
    completed = subprocess.run(
        [node_bin, str(harness), str(ROOT)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "ideogram director pointer panel harness passed" in completed.stdout


def test_ideogram_director_alt_click_overlap_branch_is_selection_only_and_precedes_clone():
    assert "function overlappingBoxIdsAtPoint(boxes, point)" in SCRIPT
    assert "function nextOverlappingBoxId(candidateIds, selectedId)" in SCRIPT
    on_box_down = SCRIPT.split("function onBoxDown(e, i, mode, dir)", 1)[1].split(
        'ov.addEventListener("pointerdown"',
        1,
    )[0]
    left_guard = on_box_down.index("if (e.button !== 0) return;")
    alt_branch_start = on_box_down.index("if (e.altKey) {")
    clone_branch_start = on_box_down.index('if (mode === "move" && (e.ctrlKey || e.metaKey))')
    assert left_guard < alt_branch_start < clone_branch_start
    alt_branch = on_box_down.split("if (e.altKey) {", 1)[1].split(
        "// Ctrl(⌘)+drag",
        1,
    )[0]
    assert "overlappingBoxIdsAtPoint(boxes, rel(e))" in alt_branch
    assert "nextOverlappingBoxId(candidateIds, selectedId)" in alt_branch
    assert "setSel(nextId)" in alt_branch
    assert "wrap.focus({ preventScroll: true })" in alt_branch
    assert "return;" in alt_branch
    for forbidden in (
        "cloneBoxForDrag",
        "drag =",
        "startDragListeners",
        "setPointerCapture",
        "renderBoxes",
        "serialize",
    ):
        assert forbidden not in alt_branch

    render_boxes = SCRIPT.split("function renderBoxes()", 1)[1].split("function rel(e)", 1)[0]
    box_double_click = render_boxes.split('d.addEventListener("dblclick"', 1)[1].split(
        'd.addEventListener("mouseenter"',
        1,
    )[0]
    assert "if (e.altKey) { e.preventDefault(); return; }" in box_double_click
    assert "openElementEditor(i, { clientX: e.clientX, clientY: e.clientY })" in box_double_click


def test_ideogram_director_overlap_selection_helper_cases():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")
    harness = ROOT / "tests" / "js" / "ideogram_director_overlap_selection_harness.mjs"
    completed = subprocess.run(
        [node_bin, str(harness), str(ROOT)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "ideogram director overlap selection harness passed" in completed.stdout


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
