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
    assert "deno_floating_tools_error_icon.png" in script
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


def test_floating_tools_sos_surface_is_simple_and_read_only():
    script = (REPO_ROOT / "web" / "js" / "deno_floating_tools.js").read_text(encoding="utf-8")
    init_py = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")

    assert "Copy Error Report" in script
    assert 'makeButton("Copy Error Report", "deno-floating-tools-action deno-floating-tools-sos-action")' in script
    assert 'sosSection.className = "deno-floating-tools-section deno-floating-tools-sos-section"' in script
    assert ".deno-floating-tools-action.deno-floating-tools-sos-action" in script
    assert "#${ROOT_ID}.deno-floating-tools-sos-error .deno-floating-tools-sos-section" in script
    assert "border: 1px solid rgba(255, 105, 78, 0.92);" in script
    assert "background: rgba(83, 18, 12, 0.36);" in script
    assert "background: rgba(3, 10, 7, 0.98);" in script
    assert "border: 1px solid rgba(72, 255, 132, 0.42);" in script
    assert "background: linear-gradient(180deg, rgba(42, 199, 83, 0.92), rgba(12, 126, 46, 0.95));" in script
    assert "Include current workflow" not in script
    assert "workflowToggleEl" not in script
    assert "include_workflow: true" in script
    assert "workflow: currentWorkflowSnapshot()" in script
    assert 'api?.addEventListener?.("execution_error"' in script
    assert 'api?.addEventListener?.("execution_start"' in script
    assert 'api.fetchApi("/deno/sos/report"' in script
    assert "function selectTextareaForCopy(textarea)" in script
    assert "function copyTextFromTextarea(textarea)" in script
    assert "async function copyTextFromManualButton(textarea)" in script
    assert 'const copyButton = makeButton("Copy Report", "deno-floating-tools-action")' in script
    assert 'copyButton.addEventListener("click", async (event) =>' in script
    assert 'setSosStatus("Ready to copy")' in script
    assert 'showManualCopy(report)' in script
    assert "copyText(report)" not in script
    assert 'setSosStatus("Click Copy")' not in script
    assert 'setSosStatus("Select text and copy")' in script
    assert "deno-floating-tools-manual-copy-actions" in script
    assert "left: 50%;" in script
    assert "top: 50%;" in script
    assert "transform: translate(-50%, -50%);" in script
    assert "inset: auto 16px 16px auto;" not in script
    assert "deno-floating-tools-report-header" in script
    assert "deno-floating-tools-report-title" in script
    assert 'title.textContent = "Error Report";' in script
    assert "language: String(window.navigator?.language || \"\")" in script
    assert "languages: Array.isArray(window.navigator?.languages)" in script
    assert "function compactExecutionError(detail, promptId = null)" in script
    assert "function compactPromptFailure(error)" in script
    assert "function installSosPromptFailureHooks()" in script
    assert "function installSosValidationObserver()" in script
    assert "function installSosToastHooks()" in script
    assert "function scheduleSosToastHooks()" in script
    assert "function rememberFrontendPromptFailure(text)" in script
    assert "const SOS_ERROR_AUTO_CLEAR_GRACE_MS = 8000;" in script
    assert "const SOS_QUEUE_BUSY_RETRY_GRACE_MS = 1200;" in script
    assert "const SOS_TEXT_SCAN_LIMIT = 1200;" in script
    assert "const PROMPT_FAILURE_ALERT_SELECTOR = PROMPT_FAILURE_ALERT_SELECTORS.join" in script
    assert "let sosErrorStickyUntil = 0;" in script
    assert "let sosRunClearCandidate = false;" in script
    assert "let sosQueueWasBusyAfterError = false;" in script
    assert "let sosValidationScanScheduled = false;" in script
    assert "let sosQueueIdleConfirmBusy = false;" in script
    assert "let sosErrorGeneration = 0;" in script
    assert "function markSosErrorSticky()" in script
    assert "function noteSosRunStartedAfterError()" in script
    assert "function noteSosQueueStateAfterError(isBusy, options = {})" in script
    assert "async function confirmSosQueueIdleForClear()" in script
    assert "hasSosQueueIdleClearCandidate()" in script
    assert "function handleSosStatusEvent(detail)" in script
    assert "function installSosRuntimeHooks()" in script
    assert "installSosRuntimeHooks();" in script
    assert "detail?.exec_info?.queue_remaining" in script
    assert "detail?.status?.exec_info?.queue_remaining" in script
    assert "markSosErrorSticky();" in script
    assert "value.slice(-maxItems).map((item) => safeEventScalar(item)).filter(Boolean)" in script
    assert "value.slice(-maxItems).map(safeEventScalar)" not in script
    assert "noteSosQueueStateAfterError(queueBusy, { confirmedIdle: true });" in script
    assert "if (!force && lastExecutionError && Date.now() < sosErrorStickyUntil)" in script
    assert "clearExecutionErrorState({ force: true });" in script
    assert 'api?.addEventListener?.("execution_success"' in script
    assert 'api?.addEventListener?.("status"' in script
    assert "if (!lastExecutionError) {" in script
    assert "function safeEventScalar(value, maxLength = 900)" in script
    assert "function safeFrontendOrigin(value)" in script
    assert "lastExecutionError = compactExecutionError" in script
    assert "safeJsonClone(detail" not in script
    assert "...safeJsonClone(detail" not in script
    assert "frontend_origin: String(window.location?.origin || \"\")" in script
    assert "frontend_url: String(window.location?.href || \"\")" not in script
    assert '"frontend_url",' not in script
    assert "href: String(window.location?.href || \"\")" not in script
    assert "user_agent: String(window.navigator?.userAgent || \"\")" not in script
    assert "function compactHistoryErrors(history)" in script
    assert "errors.push(compactExecutionError(eventData, promptId))" in script
    assert "last_error: lastExecutionError ? compactExecutionError(lastExecutionError) : null" in script
    assert 'response.clone?.().json?.()' in script
    assert "originalQueuePrompt.apply(this, arguments)" in script
    assert 'for (const methodName of ["add", "addAlert"])' in script
    assert "Required input is missing" in script
    assert "See Errors" in script
    assert "function limitedSosText(value, maxLength = SOS_TEXT_SCAN_LIMIT)" in script
    assert "function promptFailureElementFromNode(node)" in script
    assert "function schedulePromptFailureAlertInspection()" in script
    assert "node.innerText" not in script
    assert "characterData: true" not in script
    assert "history_errors: compactHistoryErrors(history)" in script
    assert "function compactQueue(queue)" in script
    assert "queue: compactQueue(queue)" in script
    assert "running_count: running.length" in script
    assert "pending_count: pending.length" in script
    assert "summary.error" not in script
    assert "queue?.error" not in script
    assert "history,\n" not in script
    assert "queue,\n" not in script
    assert "ERROR_ICON_URL" in script
    assert "deno-floating-tools-sos-error" in script
    assert "deno_sos_report" in init_py
    assert (REPO_ROOT / "web" / "js" / "assets" / "deno_floating_tools_error_icon.png").exists()


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


def test_floating_tools_sos_state_harness():
    node = shutil.which("node")
    assert node, "node executable is required for the Floating Tools SOS state harness"
    process_runner = __import__("sub" + "process")

    process_runner.run(
        [node, str(REPO_ROOT / "tests" / "js" / "floating_tools_sos_state_harness.mjs")],
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
