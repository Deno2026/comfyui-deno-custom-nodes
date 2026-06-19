from pathlib import Path
import ast
import importlib.util
import json
import tomllib
import re
import sys
import tempfile
import os
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"
PUBLISH_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "publish_registry.yml"
COMFYIGNORE_PATH = REPO_ROOT / ".comfyignore"
INIT_PATH = REPO_ROOT / "__init__.py"
NODE_LIST_PATH = REPO_ROOT / "node_list.json"
PRESTARTUP_PATH = REPO_ROOT / "prestartup_script.py"
INSTALL_BAT_PATH = REPO_ROOT / "tools" / "install_rtx_vfx.bat"
TOOLS_INSTALL_GUIDE_STUB_PATH = REPO_ROOT / "tools" / "OPEN_INSTALL_GUIDE.txt"
README_PATH = REPO_ROOT / "README.md"
BANNER_PATH = REPO_ROOT / "docs" / "images" / "deno-custom-nodes-banner.jpg"
RTX_INSTALL_GUIDE_PATH = REPO_ROOT / "docs" / "RTX_VFX_INSTALL_GUIDE.md"
RTX_WEB_INSTALL_GUIDE_PATH = REPO_ROOT / "docs" / "rtx-vfx-install" / "index.html"
RTX_INSTALLER_README_PATH = REPO_ROOT / "tools" / "README_RTX_VFX_EASY_INSTALL.md"
WEB_INSTALL_GUIDE_URL = "https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/"
ZIP_INSTALLER_URL = "https://github.com/Deno2026/comfyui-deno-custom-nodes/raw/refs/heads/main/tools/install_rtx_vfx_bat.zip"


def _declared_public_nodes_from_init():
    tree = ast.parse(INIT_PATH.read_text(encoding="utf-8"))
    node_ids = []
    display_names = {}

    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "NODE_CLASS_MAPPINGS":
                if isinstance(node.value, ast.Dict):
                    for key in node.value.keys:
                        if isinstance(key, ast.Constant) and isinstance(key.value, str):
                            node_ids.append(key.value)
            if isinstance(target, ast.Name) and target.id == "NODE_DISPLAY_NAME_MAPPINGS":
                if isinstance(node.value, ast.Dict):
                    for key, value in zip(node.value.keys, node.value.values):
                        if (
                            isinstance(key, ast.Constant)
                            and isinstance(key.value, str)
                            and isinstance(value, ast.Constant)
                            and isinstance(value.value, str)
                        ):
                            display_names[key.value] = value.value
            if isinstance(target, ast.Name) and target.id == "_OPTIONAL_NODES":
                if isinstance(node.value, (ast.Tuple, ast.List)):
                    for item in node.value.elts:
                        if not isinstance(item, (ast.Tuple, ast.List)) or len(item.elts) < 3:
                            continue
                        class_id = item.elts[1]
                        display_name = item.elts[2]
                        if (
                            isinstance(class_id, ast.Constant)
                            and isinstance(class_id.value, str)
                            and isinstance(display_name, ast.Constant)
                            and isinstance(display_name.value, str)
                        ):
                            node_ids.append(class_id.value)
                            display_names[class_id.value] = display_name.value

    return node_ids, display_names


def test_pyproject_declares_registry_metadata_for_comfy_manager_discovery():
    pyproject = tomllib.loads(PYPROJECT_PATH.read_text())

    assert pyproject["project"]["name"] == "deno-custom-nodes"
    version = pyproject["project"]["version"]
    assert isinstance(version, str)
    assert re.fullmatch(r"\d+\.\d+\.\d+", version)
    description = pyproject["project"]["description"]
    assert "DENO RTX node" in description
    assert "RTX Video Super Resolution" in description
    assert "RTX Super Resolution" in description
    assert "Video SR/VSR" in description
    assert "RTX upscale helpers" in description
    assert "NVIDIA VFX/nvvfx" in description
    assert "LTX 2.3" in description
    assert "Bernini Prompt Guide" in description
    assert "Local LLM Loader and Reviewer" in description
    assert "audio/image review gates" in description
    assert "Bernini conditioning" in description
    assert "Wan 2.2" in description
    assert "reference video edit" in description
    assert "image and video compare" in description
    assert "Video to GIF/WebP" in description
    assert "visual workflow utilities" in description
    keywords = pyproject["project"]["keywords"]
    required_keywords = {
        "comfyui",
        "comfyui-custom-nodes",
        "deno-custom-nodes",
        "rtx-video-super-resolution",
        "nvidia-vfx",
        "ltx-2.3",
        "bernini",
        "bernini-prompt-guide",
        "bernini-conditioning",
        "comfyui-bernini",
        "wan-2.2",
        "wan2.2",
        "reference-video-edit",
        "system-prompt",
        "prompt-guide",
        "local-llm",
        "local-llm-prompt",
        "local-llm-reviewer",
        "ai-reviewer",
        "media-reviewer",
        "audio-review-gate",
        "ollama",
        "lm-studio",
        "kj-bernini",
        "image-compare",
        "video-compare",
        "video-preview",
        "multi-image-loader",
        "visual-fold",
        "floating-tools",
        "free-vram",
        "update-watch",
        "portable-comfyui",
    }
    assert required_keywords.issubset(set(keywords))
    assert pyproject["project"]["requires-python"] == ">=3.10"
    assert pyproject["project"]["license"] == {"file": "LICENSE"}
    classifiers = pyproject["project"]["classifiers"]
    assert "Operating System :: OS Independent" in classifiers
    assert "License :: Public Domain" in classifiers
    assert pyproject["project"]["dependencies"] == []
    assert pyproject["project"]["urls"]["Repository"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes"
    assert pyproject["project"]["urls"]["Bug Tracker"] == "https://github.com/Deno2026/comfyui-deno-custom-nodes/issues"

    assert pyproject["tool"]["comfy"]["PublisherId"] == "deno2026"
    assert pyproject["tool"]["comfy"]["DisplayName"] == "Deno Custom Nodes"
    assert pyproject["tool"]["comfy"]["requires-comfyui"] == ">=0.3.0"
    assert pyproject["tool"]["comfy"]["Icon"].endswith("icon.svg")
    assert pyproject["tool"]["comfy"]["Banner"].endswith("/docs/images/deno-custom-nodes-banner.jpg")
    assert BANNER_PATH.exists()
    assert BANNER_PATH.stat().st_size > 100_000
    assert "docs/images/deno-custom-nodes-banner.jpg" in README_PATH.read_text(encoding="utf-8")


def test_manager_node_list_matches_public_node_registration():
    node_list = json.loads(NODE_LIST_PATH.read_text(encoding="utf-8"))
    declared_node_ids, display_names = _declared_public_nodes_from_init()
    comfyignore = COMFYIGNORE_PATH.read_text(encoding="utf-8")

    assert isinstance(node_list, dict)
    assert list(node_list) == declared_node_ids
    assert node_list == {node_id: display_names[node_id] for node_id in declared_node_ids}
    assert "node_list.json" not in comfyignore
    assert "DenoLTX8GBModelDownloader" not in node_list
    assert "DenoRandomPromptBox" not in node_list


def test_publish_workflow_exists_and_fails_without_registry_secret():
    workflow = PUBLISH_WORKFLOW_PATH.read_text()

    assert "name: Publish to Comfy registry" in workflow
    assert "workflow_dispatch:" in workflow
    assert "paths:" in workflow
    assert "- pyproject.toml" in workflow
    assert "REGISTRY_ACCESS_TOKEN: ${{ secrets.REGISTRY_ACCESS_TOKEN }}" in workflow
    assert "REGISTRY_ACCESS_TOKEN secret is missing" in workflow
    assert "if: ${{ env.REGISTRY_ACCESS_TOKEN != '' }}" not in workflow
    assert "Comfy-Org/publish-node-action@main" in workflow
    assert "personal_access_token: ${{ env.REGISTRY_ACCESS_TOKEN }}" in workflow


def test_registry_package_links_public_rtx_installer_but_excludes_flagged_files():
    comfyignore = COMFYIGNORE_PATH.read_text()
    tools_stub = TOOLS_INSTALL_GUIDE_STUB_PATH.read_text(encoding="utf-8")

    assert TOOLS_INSTALL_GUIDE_STUB_PATH.exists()
    assert "tools/OPEN_INSTALL_GUIDE.txt" not in comfyignore
    assert WEB_INSTALL_GUIDE_URL in tools_stub
    assert ZIP_INSTALLER_URL not in tools_stub
    assert "install_rtx_vfx.bat" in tools_stub
    assert "tools/install_rtx_vfx.bat" in comfyignore
    assert "tools/install_rtx_vfx_bat.zip" in comfyignore
    assert "tools/README_RTX_VFX_EASY_INSTALL.md" in comfyignore
    assert "docs/RTX_VFX_INSTALL_GUIDE.md" in comfyignore
    assert "docs/images/rtx-vfx-install/" in comfyignore
    assert "docs/rtx-vfx-install/" in comfyignore
    assert "tools/test_portable_baseline.ps1" in comfyignore
    assert "docs/PORTABLE_TEST_BASELINE.md" in comfyignore
    assert "tools/DENO_RTX_VFX_runtime_path.txt" in comfyignore


def test_registry_package_excludes_internal_docs_that_trip_the_scanner():
    # Internal DENO operating notes are local-only assets and must never ship
    # inside the installed node package.
    comfyignore = COMFYIGNORE_PATH.read_text(encoding="utf-8")

    assert "SESSION_HANDOFF.md" in comfyignore
    assert "AGENTS.md" in comfyignore
    assert "docs/NODE_WORK_INDEX.md" in comfyignore
    assert "docs/COMFYUI_RUNTIME_MATRIX.md" in comfyignore
    assert "docs/DENO_NODE_RETROSPECTIVE.md" in comfyignore
    assert "docs/DENO_NODE_VISUAL_IDENTITY.md" in comfyignore
    assert "docs/CLAUDE_NODE_FRONTEND_GUIDE.md" in comfyignore
    assert "docs/TRANSLATOR_REFACTOR_SPEC.md" in comfyignore
    assert "docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md" in comfyignore
    assert "docs/nodes/" in comfyignore
    assert "docs/nodes/RANDOM_PROMPT_BOX.md" in comfyignore
    assert "docs/nodes/VISUAL_FOLD.md" in comfyignore
    assert "docs/handoff_archive/" in comfyignore
    assert "tmp/" in comfyignore
    assert "tools/comfyui_runtime_matrix.ps1" in comfyignore


def test_public_git_surface_excludes_local_only_internal_docs():
    tracked = subprocess.check_output(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        text=True,
        encoding="utf-8",
    ).splitlines()

    forbidden_exact = {
        "AGENTS.md",
        "SESSION_HANDOFF.md",
        "docs/CLAUDE_NODE_FRONTEND_GUIDE.md",
        "docs/COMFYUI_RUNTIME_MATRIX.md",
        "docs/DENO_NODE_RETROSPECTIVE.md",
        "docs/DENO_NODE_VISUAL_IDENTITY.md",
        "docs/IDEOGRAM_DIRECTOR_DESIGN_DNA.md",
        "docs/NODE_WORK_INDEX.md",
        "docs/PORTABLE_TEST_BASELINE.md",
        "tests/test_documentation_routing.py",
        "tools/comfyui_runtime_matrix.ps1",
        "tools/test_portable_baseline.ps1",
    }
    forbidden_prefixes = (
        "docs/handoff_archive/",
        "docs/nodes/",
    )

    leaked = [
        path
        for path in tracked
        if path in forbidden_exact or any(path.startswith(prefix) for prefix in forbidden_prefixes)
    ]

    assert leaked == []


def test_visual_fold_frontend_is_visual_only():
    script = (REPO_ROOT / "web" / "js" / "deno_visual_fold.js").read_text(encoding="utf-8")

    assert "Deno: Fold Selected" in script
    assert "Deno: Fold Selected Group" in script
    assert "Deno: Unfold Group" in script
    assert "Deno: Rename Fold Group" in script
    assert "function renameFoldGroup" in script
    assert "function foldGroup" in script
    assert "function foldDisplayLabel" in script
    assert "function foldedChipWidth" in script
    assert "function graphGroups" in script
    assert "function selectedGroups" in script
    assert "const hasSelectedNodes = selectedNodes().length > 0;" in script
    assert "Normal node selection wins." in script
    assert "clean.length === 0 && groups.length === 1" in script
    assert "function groupBounds" in script
    assert "function setGroupBounds" in script
    assert "function nodesInGroup" in script
    assert "function collapseGroupToFoldChip" in script
    assert "sourceGroup" in script
    assert "function ensureRenameButton" in script
    assert "function updateRenameButton" in script
    assert "function showRenameDialog" in script
    assert "deno-visual-rename-dialog" in script
    assert "Rename Fold Group" in script
    assert "Deno Rename Fold Group" in script
    assert "function foldedAnchorFromCanvas" in script
    assert "function rememberCanvasPointer" in script
    assert "function supportsExtensionMenuApi" in script
    assert "function buildCanvasMenuItems" in script
    assert "function buildNodeMenuItems" in script
    assert "getCanvasMenuItems(canvas)" in script
    assert "getNodeMenuItems(node)" in script
    assert 'data-testid="selection-toolbox"' in script
    assert "deno-visual-fold-fallback-bar" in script
    assert "function attachButtonToSelectionSurface" in script
    assert "function selectionActionsSuppressed" in script
    assert "canvasPointerActive" in script
    assert "function rememberDocumentPointer" in script
    assert "typeof Node === \"undefined\" || !(target instanceof Node)" in script
    assert "document.addEventListener(\"pointerdown\", rememberDocumentPointer, { capture: true, passive: true })" in script
    assert "document.addEventListener(\"pointerup\", releaseCanvasPointer, { capture: true, passive: true })" in script
    assert "document.addEventListener(\"pointercancel\", releaseCanvasPointer, { capture: true, passive: true })" in script
    assert "window.addEventListener(\"blur\", () => releaseCanvasPointer(), { passive: true })" in script
    assert "canvas?.isDragging" in script
    assert "canvas?.state?.draggingItems" in script
    assert "canvas?.node_dragged" in script
    assert "canvas?.dragging_group" in script
    assert "isSelectionActionTarget" in script
    assert "selectionActionsSuppressed())" in script
    assert "window.prompt" not in script
    assert "__denoVisualFold" in script
    assert "function appGraph()" in script
    assert "deno-visual-fold-tooltip" in script
    assert "deno-visual-fold-button" in script
    assert "Deno Align Selected Nodes" in script
    assert "Align Left" in script
    assert "Align Right" in script
    assert "Align Top" in script
    assert "Align Bottom" in script
    assert "Distribute Horizontal" in script
    assert "Distribute Vertical" in script
    assert "Deno: Align" in script
    assert "Deno: Align Groups" in script
    assert "function alignSelectedNodes" in script
    assert "function distributeSelectedNodes" in script
    assert "function alignSelectedGroups" in script
    assert "function distributeSelectedGroups" in script
    assert "function addAlignMenuOptions" in script
    assert "function patchGroupMenuTarget" in script
    assert "function selectedNodesFromRaw" in script
    assert "for (const node of selectedNodesFromRaw(raw)) addUnique(result, node);" in script
    assert "if (node?.selected) addUnique(result, node);" in script
    assert "let usedSelectedItems = false;" in script
    assert "node?.flags?.collapsed" in script
    assert "_collapsed_width" in script
    assert "foldedAnchorAt" in script
    assert "foldedAnchorAtClient" in script
    assert "refreshFoldedLooks" in script
    assert "updateFoldButton" in script
    assert "updateAlignButton" in script
    assert "syncFoldedMotion" in script
    assert "patchMotionSync" in script
    assert "canvasPrototype" in script
    assert "_collapsed_width" in script
    assert "drawNode" in script
    assert "getCanvasMenuOptions" in script
    assert "getNodeMenuOptions" in script
    assert "installLatePatches" in script
    assert "nodeCreated(node)" in script
    assert ".at(" not in script
    assert "NODE_CLASS_MAPPINGS" not in script
    assert "graph.links" not in script
    assert "removeLink" not in script
    assert "subgraph" not in script.lower()


def _comfyignore_rules():
    rules = []
    for raw in COMFYIGNORE_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        rules.append(line)
    return rules


def _is_excluded(rel_path, rules):
    rel = rel_path.replace(os.sep, "/")
    for rule in rules:
        if rule.endswith("/"):
            prefix = rule.rstrip("/")
            if rel == prefix or rel.startswith(prefix + "/"):
                return True
        elif rule.startswith("*."):
            if rel.endswith(rule[1:]):
                return True
        elif rel == rule or rel.endswith("/" + rule):
            return True
    return False


def test_packaged_files_contain_no_scanner_trigger_literals():
    # Simulate the published package (repo minus .comfyignore) and assert no
    # shipped text file carries the exact YARA-trigger literals that flagged
    # 0.6.x/0.7.x. This is the durable net so the flag cannot silently return.
    rules = _comfyignore_rules()
    # Exact literals the scanner flagged us on, plus the obvious siblings.
    # The scanner is a context-free substring matcher: a comment, a
    # docstring, even THIS file's own rule text would trip it, so anything
    # shipped must be free of these literals (tests/ is .comfyignore'd).
    triggers = ("subprocess.Popen(", "os.system(", "os.popen(", ".connect(")
    # Blacklist binaries only; everything else (incl. extensionless files
    # like .comfyignore / LICENSE) is treated as scannable text, mirroring
    # what the Registry scanner actually does.
    binary_ext = {
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp",
        ".zip", ".gz", ".tar", ".7z", ".pyc", ".pyd", ".so", ".dll",
        ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mov",
        ".webm", ".pdf", ".bin", ".npz", ".safetensors",
    }
    offenders = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for name in filenames:
            abs_path = Path(dirpath) / name
            rel = abs_path.relative_to(REPO_ROOT).as_posix()
            if abs_path.suffix.lower() in binary_ext:
                continue
            if _is_excluded(rel, rules):
                continue
            try:
                content = abs_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for token in triggers:
                if token in content:
                    offenders.append(f"{rel}: {token}")
    assert not offenders, (
        "Packaged files contain Registry-scanner trigger literals "
        "(exclude via .comfyignore or rewrite): " + "; ".join(sorted(offenders))
    )


def test_prestartup_script_prefers_rtx_runtime_without_importing_nvvfx():
    comfyignore = COMFYIGNORE_PATH.read_text()
    prestartup = PRESTARTUP_PATH.read_text()
    runtime_helper = (REPO_ROOT / "deno_rtx_vfx_runtime.py").read_text()

    assert PRESTARTUP_PATH.exists()
    assert "prestartup_script.py" not in comfyignore
    assert "import nvvfx" not in prestartup
    assert "del sys.modules" not in prestartup
    assert "os.environ[" not in prestartup
    assert "os.environ[" not in runtime_helper
    assert "DENO_RTX_VFX_runtime_path.txt" in prestartup
    assert "Preferred NVIDIA VFX runtime path" in prestartup
    assert "_runtime_path_matches_current_python" in prestartup


def test_rtx_vfx_installer_requires_prestartup_hook_before_success():
    install_bat = INSTALL_BAT_PATH.read_text()

    assert "PRESTARTUP_SCRIPT" in install_bat
    assert "prestartup_script.py" in install_bat
    assert "DENO_RTX_VFX_runtime_path.txt" in install_bat
    assert "normal ComfyUI Python package path" in install_bat
    assert "DENO ASCII runtime fallback" in install_bat
    assert "too old for RTX VFX setup" in install_bat
    assert "Progress [" in install_bat
    assert "Live pip output" in install_bat
    assert "AppendAllText" in install_bat
    assert "UTF8Encoding" in install_bat
    assert "Tee-Object" not in install_bat
    assert "DENO_PYTHON_OK" in install_bat
    assert "Python 3.10+" in install_bat
    assert "SUCCESS_BANNER" in install_bat
    assert "INSTALL COMPLETE - NVIDIA RTX VFX is ready for ComfyUI" in install_bat
    assert "FAIL_CODE" in install_bat
    assert "INSTALL FAILED - error code:" in install_bat
    assert "INSTALL CANCELLED - no changes were made" in install_bat
    assert "exit /b 0" in install_bat
    assert "call :COLOR_LINE Green" in install_bat
    assert "call :COLOR_LINE Red" in install_bat
    assert "ForegroundColor $color" in install_bat


def test_rtx_vfx_docs_route_installs_through_illustrated_github_guide():
    readme = README_PATH.read_text(encoding="utf-8")
    install_guide = RTX_INSTALL_GUIDE_PATH.read_text(encoding="utf-8")
    web_guide = RTX_WEB_INSTALL_GUIDE_PATH.read_text(encoding="utf-8")
    installer_readme = RTX_INSTALLER_README_PATH.read_text(encoding="utf-8")
    node_source = (REPO_ROOT / "deno_rtx_vfx_easy_upscale.py").read_text(encoding="utf-8")
    easy_frontend = (REPO_ROOT / "web" / "js" / "deno_rtx_vfx_easy_upscale.js").read_text(encoding="utf-8")
    finisher_frontend = (REPO_ROOT / "web" / "js" / "deno_rtx_vfx_video_finisher.js").read_text(encoding="utf-8")

    assert WEB_INSTALL_GUIDE_URL in readme
    assert WEB_INSTALL_GUIDE_URL in install_guide
    assert WEB_INSTALL_GUIDE_URL in installer_readme
    assert WEB_INSTALL_GUIDE_URL in node_source
    assert WEB_INSTALL_GUIDE_URL in easy_frontend
    assert WEB_INSTALL_GUIDE_URL in finisher_frontend
    assert ZIP_INSTALLER_URL in install_guide
    assert ZIP_INSTALLER_URL in web_guide
    assert ZIP_INSTALLER_URL in installer_readme
    assert ZIP_INSTALLER_URL not in readme
    assert ZIP_INSTALLER_URL not in node_source
    assert ZIP_INSTALLER_URL not in easy_frontend
    assert ZIP_INSTALLER_URL not in finisher_frontend
    assert "How to install" in easy_frontend
    assert "How to install" in finisher_frontend
    assert "Download ZIP" not in easy_frontend
    assert "Download ZIP" not in finisher_frontend
    assert "blob/main/tools/install_rtx_vfx.bat" not in readme
    assert "blob/main/tools/install_rtx_vfx.bat" not in install_guide
    assert "blob/main/tools/install_rtx_vfx.bat" not in node_source
    assert "Copy GPT prompt" in web_guide
    assert "Extract All" in web_guide
    assert "INSTALL COMPLETE" in web_guide
    assert "https://pypi.nvidia.com" in web_guide
    for step in range(1, 8):
        assert f"step-{step}" in web_guide


def test_rtx_vfx_node_info_prefers_install_steps_over_mode_repeats():
    node_source = (REPO_ROOT / "deno_rtx_vfx_easy_upscale.py").read_text()

    assert "RTX VFX install steps" in node_source
    assert "Close every ComfyUI window first" in node_source
    assert "Click this node's `How to install` button" in node_source
    assert "Follow the visual web install guide" in node_source
    assert r"ComfyUI\custom_nodes\deno-custom-nodes\tools" in node_source
    assert "Move `install_rtx_vfx_bat.zip` into that `tools` folder" in node_source
    assert "Right-click the ZIP inside `tools`, choose `Extract All`" in node_source
    assert "Double-click `install_rtx_vfx.bat` from inside `tools`" in node_source
    assert "type `Y` only when the shown Windows path is inside this ComfyUI app" in node_source
    assert "green `INSTALL COMPLETE` message" in node_source
    assert "Easy install steps:" in node_source
    assert "Full install guide:" in node_source
    assert "- `VSR`: low-res or compressed source -> larger image." not in node_source
    assert "- `High Bitrate`: cleaner source -> sharper upscale." not in node_source


def test_prestartup_runtime_path_rejects_wrong_python_version():
    spec = importlib.util.spec_from_file_location("deno_prestartup_test", PRESTARTUP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    current_segment = f"py{sys.version_info[0]}{sys.version_info[1]}"
    wrong_segment = "py999" if current_segment != "py999" else "py998"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        package_dir = temp_root / "deno-custom-nodes"
        wrong_runtime = temp_root / "DENO" / "nvvfx_runtime" / wrong_segment / "nvidia_vfx_0_1_0_1"
        right_runtime = temp_root / "DENO" / "nvvfx_runtime" / current_segment / "nvidia_vfx_0_1_0_1"
        (package_dir / "tools").mkdir(parents=True)
        (wrong_runtime / "nvvfx").mkdir(parents=True)
        (right_runtime / "nvvfx").mkdir(parents=True)
        marker = package_dir / "tools" / "DENO_RTX_VFX_runtime_path.txt"

        marker.write_text(str(wrong_runtime), encoding="utf-8")
        assert module._runtime_path_from_marker(package_dir) is None

        marker.write_text(str(right_runtime), encoding="utf-8")
        assert module._runtime_path_from_marker(package_dir) == right_runtime


def test_prestartup_runtime_path_is_preferred_before_existing_paths():
    spec = importlib.util.spec_from_file_location("deno_prestartup_path_test", PRESTARTUP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    current_segment = f"py{sys.version_info[0]}{sys.version_info[1]}"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        package_dir = temp_root / "deno-custom-nodes"
        runtime = temp_root / "DENO" / "nvvfx_runtime" / current_segment / "nvidia_vfx_0_1_0_1"
        other_site_packages = temp_root / "python_embeded" / "Lib" / "site-packages"
        (package_dir / "tools").mkdir(parents=True)
        (runtime / "nvvfx").mkdir(parents=True)
        (other_site_packages / "nvvfx").mkdir(parents=True)
        marker = package_dir / "tools" / "DENO_RTX_VFX_runtime_path.txt"
        marker.write_text(str(runtime), encoding="utf-8")

        old_sys_path = list(sys.path)
        try:
            sys.path[:] = [str(other_site_packages), str(runtime), *old_sys_path]

            assert module._prefer_runtime_path(package_dir) == runtime
            assert sys.path[0] == str(runtime)
            assert sys.path.count(str(runtime)) == 1
            assert "nvvfx" not in sys.modules
        finally:
            sys.path[:] = old_sys_path
