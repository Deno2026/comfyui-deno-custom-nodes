from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "web" / "js" / "deno_advanced_image_source_loader.js"
HARNESS_PATH = REPO_ROOT / "tests" / "js" / "advanced_image_source_loader_harness.mjs"


def test_advanced_image_source_loader_frontend_harness() -> None:
    node = shutil.which("node")
    if not node:
        pytest.skip("node executable is required for the frontend harness")

    result = subprocess.run(
        [node, str(HARNESS_PATH)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
    assert "advanced_image_source_loader_harness passed" in result.stdout


def test_external_root_memory_is_runtime_only() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "node.__denoAdvancedLastExternalRoot" in source
    assert "node.properties.__denoAdvancedLastExternalRoot" not in source
    assert "localStorage" not in source
    assert "sessionStorage" not in source


def test_advanced_panel_uses_nodes2_fluid_dom_layout() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'container.dataset.denoAdvancedLayout = "fluid-v1"' in source
    assert "height: calc(100% + ${PANEL_WRAPPER_COMPENSATION}px)" in source
    assert "getMinHeight: () => PANEL_MIN_HEIGHT + PANEL_WIDGET_EXTRA_HEIGHT" in source
    assert "flex: 1 1 0px" in source
    assert "height: 0" in source
    assert 'const widget = node.addDOMWidget("advanced_source_panel"' not in source
    assert "function panelHeight()" not in source
    assert "refreshPanelHeight" not in source
    assert "PANEL_RESERVED_NODE_HEIGHT" not in source
    assert "panelResizeObserver?.observe(container)" in source
    assert "panelResizeObserver?.observe(grid)" in source


def test_advanced_gallery_keeps_disabled_cards_readable_without_full_toggle_render() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")

    assert 'image.style.opacity = isDisabled ? "0.78" : "1"' in source
    assert 'disabledPill.style.display = isDisabled ? "block" : "none"' in source
    assert "syncDisabledCardStates(currentPaths, new Set(cleaned))" in source
    assert "cards.forEach((card) => applyCardDisabledState" in source
    assert "scheduleMasonryRefresh();" in source


def test_advanced_panel_preserves_local_gallery_scroll_and_canvas_navigation() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")

    assert "installMiddleMouseCanvasPan(container, grid)" in source
    assert 'window.addEventListener("wheel", onWheel' in source
    assert "localScrollSurface.contains?.(target)" in source
    assert "localScrollSurface.scrollTop += event.deltaY * deltaScale" in source
    assert 'canvas.dispatchEvent(new WheelEvent("wheel"' in source
    assert 'window.addEventListener("mousedown", onMouseDown, true)' in source
