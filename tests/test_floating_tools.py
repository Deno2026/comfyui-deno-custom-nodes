from pathlib import Path
import shutil
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_floating_tools_frontend_free_vram_contract():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert 'const DENO_FLOATING_TOOLS_MARKER = "r2026.06.27-floating-tools-hardening-b"' in script
    assert 'name: "Show DENO floating tools"' in script
    assert 'category: ["DENO", "Tools", "Floating Tools"]' in script
    assert "Free VRAM" in script
    assert "const BADGE_TOP_PAD = 8;" in script
    assert "const BADGE_RIGHT_PAD = 10;" in script
    assert "const FLOATING_TOOLS_ROOT_WIDTH = ICON_SIZE + BADGE_RIGHT_PAD;" in script
    assert "const FLOATING_TOOLS_ROOT_HEIGHT = ICON_SIZE + BADGE_TOP_PAD;" in script
    assert "const FLOATING_TOOLS_Z_INDEX = 999;" in script
    assert "width: ${FLOATING_TOOLS_ROOT_WIDTH}px;" in script
    assert "height: ${FLOATING_TOOLS_ROOT_HEIGHT}px;" in script
    assert "z-index: ${FLOATING_TOOLS_Z_INDEX};" in script
    assert "deno-floating-tools-dialog-blocked" not in script
    assert "rootEl.append(orb, updateBadgeEl, panelEl);" in script
    assert "orb.append(img);" in script
    assert "deno-floating-tools-bob" not in script
    assert "animation:" not in script
    assert "transform: translateY(-1px)" not in script
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
    assert 'updateBadgeEl.textContent = "NEW"' in script
    assert "New update available." in script
    assert "새로운 업데이트가 발견되었습니다." not in script
    assert "Portable helper only" not in script
    assert "Use your launcher or Manager to update" not in script
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


def test_floating_tools_update_watch_resyncs_local_versions_before_using_cache():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert "function getLatestMetadataTime(state)" in script
    assert "function isLatestMetadataFresh(state)" in script
    assert "function latestVersionsFromState(state)" in script
    assert "function installedVersionsFromSystem(system)" in script
    assert "function latestVersionsCoverInstalled(latest, installed)" in script
    assert "function fetchLocalUpdateSystem()" in script
    assert "function fetchLatestUpdateVersions()" in script
    assert "function buildUpdateState(system, latestVersions, latestCheckedAt)" in script
    assert "function buildOfflineUpdateState(system, error)" in script
    assert "let updateStartupTimer = null;" in script
    assert "let queuedUpdateForce = false;" in script
    assert "system = await fetchLocalUpdateSystem();" in script
    assert "const installedVersions = installedVersionsFromSystem(system);" in script
    assert "let latestCheckedAt = null;" in script
    assert "const cachedLatestVersions = latestVersionsFromState(cached);" in script
    assert "&& latestVersionsCoverInstalled(cachedLatestVersions, installedVersions)" in script
    assert "latestVersions = cachedLatestVersions;" in script
    assert "latestCheckedAt = getLatestMetadataTime(cached);" in script
    assert "latestVersions = await fetchLatestUpdateVersions();" in script
    assert "latestCheckedAt = Date.now();" in script
    assert "const state = buildUpdateState(system, latestVersions, latestCheckedAt);" in script
    assert "latestCheckedAt," in script
    assert 'if (cached) renderUpdateState({ ...cached, status: "checking" });' in script
    assert "function clearUpdateStartupTimer()" in script
    assert "window.clearTimeout(updateStartupTimer);" in script
    assert "updateStartupTimer = window.setTimeout(() => {" in script
    assert "requestUpdateCheck(false);" in script
    assert "requestUpdateCheck(true);" in script
    assert "if (force) queuedUpdateForce = true;" in script
    assert "void checkUpdates(true);" in script
    assert "if (!force && isUpdateCacheFresh(cached)) {\n        renderUpdateState(cached);" not in script
    assert "if (!isUpdateCacheFresh(cached)) {\n        window.setTimeout(() => checkUpdates(false), 1200);" not in script
    assert "function isUpdateCacheFresh(state)" not in script


def test_floating_tools_update_watch_cache_harness():
    node = shutil.which("node")
    assert node, "node executable is required for the Floating Tools cache harness"

    subprocess.run(
        [node, str(REPO_ROOT / "tests" / "js" / "floating_tools_update_cache_harness.mjs")],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )


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
