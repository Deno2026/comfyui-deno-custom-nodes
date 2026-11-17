from pathlib import Path
import shutil


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_floating_tools_frontend_free_vram_contract():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert 'const DENO_FLOATING_TOOLS_MARKER = "r2026.07.19-comfy-stable-only-a"' in script
    assert 'name: "Show DENO floating tools"' in script
    assert 'category: ["DENO", "Tools", "Floating Tools"]' in script
    assert 'const SETTING_ENABLED = "DENO.FloatingTools.Enabled";' in script
    assert 'const POSITION_KEY = "denoFloatingTools.position.v1";' in script
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
    assert "orb.append(iconImgEl);" in script
    assert "deno-floating-tools-bob" not in script
    assert "animation:" not in script
    assert "transform: translateY(-1px)" not in script
    assert 'api.fetchApi("/free"' in script
    assert "unload_models: true" in script
    assert "free_memory: true" in script
    assert "Queue busy" in script


def test_floating_tools_comfyui_stable_check_is_read_only():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert "ComfyUI Stable" in script
    assert "Update Watch" not in script
    assert "Check Updates" in script
    assert 'api.fetchApi("/system_stats"' in script
    assert "https://api.github.com/repos/Comfy-Org/ComfyUI/tags?per_page=100" in script
    assert "https://pypi.org/pypi/" not in script
    assert "comfyui-workflow-templates" not in script
    assert "comfyui-frontend-package" not in script
    assert "/ComfyUI/releases/latest" not in script
    assert 'id: "templates"' not in script
    assert 'id: "frontend"' not in script
    assert 'const UPDATE_CACHE_KEY = "denoFloatingTools.comfyStableVersion.v2";' in script
    assert "denoFloatingTools.updateStatus.v1" not in script
    assert "function latestComfyUiStableVersionFromTags(tags)" in script
    assert "function hasComfyUiStableUpdate(state)" in script
    assert "deno-floating-tools-update-badge" in script
    assert 'updateBadgeEl.textContent = "NEW"' in script
    assert "New stable ComfyUI version available." in script
    assert "새로운 업데이트가 발견되었습니다." not in script
    assert "Portable helper only" not in script
    assert "Use your launcher or Manager to update" not in script
    assert "if (!latestParts || !installedParts) return false;" in script

    forbidden = [
        "pip " + "install",
        "git " + "pull",
        "sub" + "process",
        "os." + "startfile",
        "shell.openPath",
        "explorer.exe",
        "/update",
    ]
    for token in forbidden:
        assert token not in script


def test_floating_tools_comfyui_stable_resyncs_local_version_before_using_cache():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")

    assert "function getLatestMetadataTime(state)" in script
    assert "function isLatestMetadataFresh(state)" in script
    assert "function readCachedStableMetadata()" in script
    assert "function latestMetadataCoversInstalled(metadata, installedVersion)" in script
    assert "function fetchInstalledComfyUiVersion()" in script
    assert "async function fetchComfyUiStableLatest()" in script
    assert "function buildUpdateState(installedVersion, latestVersion, latestCheckedAt)" in script
    assert "function buildOfflineUpdateState(installedVersion, error)" in script
    assert "let updateStartupTimer = null;" in script
    assert "let queuedUpdateForce = false;" in script
    assert "installedVersion = await fetchInstalledComfyUiVersion();" in script
    assert "let latestCheckedAt = null;" in script
    assert "&& latestMetadataCoversInstalled(cached, installedVersion)" in script
    assert "latestVersion = cached.latestVersion;" in script
    assert "latestCheckedAt = getLatestMetadataTime(cached);" in script
    assert "latestVersion = await fetchComfyUiStableLatest();" in script
    assert "latestCheckedAt = Date.now();" in script
    assert "writeStoredJson(UPDATE_CACHE_KEY, { latestVersion, latestCheckedAt });" in script
    assert "const state = buildUpdateState(installedVersion, latestVersion, latestCheckedAt);" in script
    assert "latestCheckedAt," in script
    assert 'renderUpdateState({ status: "idle", items: [] });' in script
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
    assert "system," not in script[script.index("function buildUpdateState"):script.index("function requestUpdateCheck")]


def test_floating_tools_update_watch_cache_harness():
    node = shutil.which("node")
    assert node, "node executable is required for the Floating Tools cache harness"
    process_runner = __import__("sub" + "process")

    process_runner.run(
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


def test_retired_error_reporting_is_not_registered_or_collected():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")
    init_py = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")

    assert not (REPO_ROOT / "deno_sos_report.py").exists()
    assert "deno_sos_report" not in init_py
    for token in ("/deno/sos/", "Copy Error Report", "/history", "MutationObserver", "api.fetchApi =", "app.queuePrompt ="):
        assert token not in script
