import importlib.util
import hashlib
import inspect
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
import types
import urllib.error
from pathlib import Path

import numpy as np
import pytest
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_INIT = REPO_ROOT / "__init__.py"
PUBLIC_LTX23_8GB_WORKFLOW = REPO_ROOT / "docs" / "workflows" / "ltx23-8gb-vram-public-baseline.json"
PUBLIC_LTX23_8GB_WORKFLOW_CANONICAL_SHA256 = "5b58e483ebdce0e12a2363b44f9e9527e58ab90caedb66813fe7ff37633932e8"


def install_torch_stub():
    if "torch" in sys.modules and "torch.nn.functional" in sys.modules:
        return

    torch_stub = types.ModuleType("torch")
    nn_module = types.ModuleType("torch.nn")
    functional_module = types.ModuleType("torch.nn.functional")

    functional_module.pad = lambda *args, **kwargs: None
    functional_module.interpolate = lambda *args, **kwargs: None
    nn_module.functional = functional_module
    torch_stub.nn = nn_module
    torch_stub.float32 = "float32"
    torch_stub.Tensor = object

    sys.modules["torch"] = torch_stub
    sys.modules["torch.nn"] = nn_module
    sys.modules["torch.nn.functional"] = functional_module


def install_ltx_stub():
    comfy_extras = types.ModuleType("comfy_extras")
    nodes_lt = types.ModuleType("comfy_extras.nodes_lt")

    class LTXVAddGuide:
        @classmethod
        def encode(cls, vae, latent_width, latent_height, image, scale_factors):
            return image, image

        @classmethod
        def get_latent_index(cls, positive, latent_length, image_count, frame_idx, scale_factors):
            return frame_idx, 0

        @classmethod
        def append_keyframe(
            cls, positive, negative, frame_idx, latent_image, noise_mask, encoded_latent, strength, scale_factors
        ):
            return positive, negative, latent_image, noise_mask

    nodes_lt.LTXVAddGuide = LTXVAddGuide
    comfy_extras.nodes_lt = nodes_lt
    sys.modules["comfy_extras"] = comfy_extras
    sys.modules["comfy_extras.nodes_lt"] = nodes_lt


def install_comfyui_dependency_stubs():
    for module_name in list(sys.modules):
        if module_name.startswith("comfy."):
            del sys.modules[module_name]

    folder_paths = types.ModuleType("folder_paths")
    folder_paths.models_dir = str(REPO_ROOT / "models")
    folder_paths.folder_names_and_paths = {}
    folder_paths.get_filename_list = lambda folder_name: []
    folder_paths.get_full_path = lambda folder_name, filename: str(REPO_ROOT / "models" / folder_name / filename)
    folder_paths.get_full_path_or_raise = folder_paths.get_full_path
    folder_paths.get_folder_paths = lambda folder_name: [str(REPO_ROOT / "models" / folder_name)]
    folder_paths.get_input_directory = lambda: str(REPO_ROOT / "input")
    folder_paths.get_user_directory = lambda: str(REPO_ROOT / "user")
    folder_paths.get_temp_directory = lambda: str(REPO_ROOT / "tmp" / "test-temp")
    sys.modules["folder_paths"] = folder_paths

    nodes_stub = types.ModuleType("nodes")

    class CheckpointLoaderSimple:
        def load_checkpoint(self, ckpt_name):
            return "model", "clip", "video_vae"

    class UNETLoader:
        def load_unet(self, unet_name, weight_dtype):
            return ("model",)

    class DualCLIPLoader:
        def load_clip(self, clip_name1, clip_name2, clip_type, device="default"):
            return ("clip",)

    class PreviewImage:
        OUTPUT_NODE = True

        def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None):
            return {
                "ui": {
                    "images": [{
                        "filename": f"{filename_prefix}00001_.png",
                        "subfolder": "",
                        "type": "temp",
                    }]
                }
            }

    nodes_stub.CheckpointLoaderSimple = CheckpointLoaderSimple
    nodes_stub.UNETLoader = UNETLoader
    nodes_stub.DualCLIPLoader = DualCLIPLoader
    nodes_stub.PreviewImage = PreviewImage
    nodes_stub.NODE_CLASS_MAPPINGS = {}
    sys.modules["nodes"] = nodes_stub

    node_helpers = types.ModuleType("node_helpers")
    node_helpers.conditioning_set_values = lambda conditioning, values: conditioning
    sys.modules["node_helpers"] = node_helpers

    comfy = types.ModuleType("comfy")
    comfy.lora = types.ModuleType("comfy.lora")
    comfy.lora_convert = types.ModuleType("comfy.lora_convert")
    comfy.utils = types.ModuleType("comfy.utils")
    comfy.model_management = types.ModuleType("comfy.model_management")
    comfy.lora.model_lora_keys_unet = lambda model, key_map: key_map
    comfy.lora.model_lora_keys_clip = lambda clip, key_map: key_map
    comfy.lora.load_lora = lambda lora_sd, key_map: {}
    comfy.lora_convert.convert_lora = lambda lora_sd: lora_sd
    comfy.utils.load_torch_file = lambda *args, **kwargs: {}
    comfy.model_management.InterruptProcessingException = RuntimeError
    comfy.model_management.throw_exception_if_processing_interrupted = lambda: None
    sys.modules["comfy"] = comfy
    sys.modules["comfy.lora"] = comfy.lora
    sys.modules["comfy.lora_convert"] = comfy.lora_convert
    sys.modules["comfy.utils"] = comfy.utils
    sys.modules["comfy.model_management"] = comfy.model_management

    if "aiohttp" not in sys.modules:
        aiohttp = types.ModuleType("aiohttp")
        web = types.ModuleType("aiohttp.web")
        web.json_response = lambda payload=None, status=200: {"payload": payload, "status": status}
        aiohttp.web = web
        sys.modules["aiohttp"] = aiohttp
        sys.modules["aiohttp.web"] = web

    if "server" not in sys.modules:
        server = types.ModuleType("server")

        class Routes:
            def get(self, *_args, **_kwargs):
                return lambda fn: fn

            def post(self, *_args, **_kwargs):
                return lambda fn: fn

        class PromptServer:
            instance = types.SimpleNamespace(routes=Routes())

        server.PromptServer = PromptServer
        sys.modules["server"] = server


def load_package():
    for name in list(sys.modules):
        if name == "comfyui_deno_custom_nodes" or name.startswith("comfyui_deno_custom_nodes."):
            del sys.modules[name]
    install_torch_stub()
    install_ltx_stub()
    install_comfyui_dependency_stubs()
    spec = importlib.util.spec_from_file_location(
        "comfyui_deno_custom_nodes",
        PACKAGE_INIT,
        submodule_search_locations=[str(REPO_ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_node_registration_exports_expected_nodes():
    package = load_package()

    assert list(package.NODE_CLASS_MAPPINGS.keys()) == [
        "DenoResolutionSetup",
        "DenoMultiImageLoader",
        "DenoAdvancedImageSourceLoader",
        "DenoLTXSequencer",
        "DenoLTX23PresetLoader",
        "DenoLTXModelDownloader",
        "DenoMultiLoraLoader",
        "DenoLTXMultiLoraLoader",
        "DenoLTXPromptGuide",
        "DenoLTXTiledSpatialUpscaler",
        "DenoLTXAVStepFusedTiledSampler",
        "DenoBerniniPromptGuide",
        "DenoIdeogramDirector",
        "DenoLocalLLMRefiner",
        "DenoAIReviewGate",
        "DenoPromptText",
        "DenoRTXVFXEasyUpscale",
        "DenoRTXVFXVideoFinisher",
        "DenoImageCompare",
        "DenoVideoCompare",
        "DenoVideoPreview",
    ]
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoResolutionSetup"] == "(Deno) Resize Box"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoMultiImageLoader"] == "(Deno) Multi Image Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoAdvancedImageSourceLoader"] == "(Deno) Advanced Image Source Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXSequencer"] == "(Deno) LTX Sequencer"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTX23PresetLoader"] == "(Deno) LTX Model Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXModelDownloader"] == "(Deno) Easy Model Download Helper"
    assert "DenoLTX8GBModelDownloader" not in package.NODE_CLASS_MAPPINGS
    assert package.DENO_NODE_REPLACEMENTS == (
        {
            "old_node_id": "DenoLTX8GBModelDownloader",
            "new_node_id": "DenoLTXModelDownloader",
            "old_widget_ids": ["model_root", "presets_json"],
            "input_mapping": [
                {"new_id": "model_root", "old_id": "model_root"},
                {"new_id": "presets_json", "old_id": "presets_json"},
            ],
            "output_mapping": None,
        },
    )
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoMultiLoraLoader"] == "(Deno) Multi LoRA Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXMultiLoraLoader"] == "(Deno) LTX Multi LoRA Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXPromptGuide"] == "(Deno) LTX Prompt Guide"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXTiledSpatialUpscaler"] == "(Deno) LTX Tiled Spatial Upscaler"
    assert "DenoLTXStepFusedTiledSampler" not in package.NODE_CLASS_MAPPINGS
    assert "DenoLTXStepFusedTiledSampler" not in package.NODE_DISPLAY_NAME_MAPPINGS
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXAVStepFusedTiledSampler"] == "(Deno) LTX High resolution Tiled Sampler"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoBerniniPromptGuide"] == "(Deno) Bernini Prompt Guide"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoIdeogramDirector"] == "(Deno) Ideogram Director"
    assert "DenoTranslate" not in package.NODE_CLASS_MAPPINGS
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLocalLLMRefiner"] == "(Deno) Local LLM Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoAIReviewGate"] == "(Deno) Local LLM Reviewer"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoPromptText"] == "(Deno) Prompt Text"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoRTXVFXEasyUpscale"] == "(Deno) RTX Video Super Resolution"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoRTXVFXVideoFinisher"] == "(Deno) RTX Video Super Resolution (2 Pass)"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoImageCompare"] == "(Deno) Image Compare"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoVideoCompare"] == "(Deno) Video Compare"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoVideoPreview"] == "(Deno) Video Preview"
    assert package.WEB_DIRECTORY == "./web/js"


def test_public_nodes_expose_complete_object_info_metadata():
    package = load_package()
    public_nodes = json.loads((REPO_ROOT / "node_list.json").read_text(encoding="utf-8"))
    version = tomllib.loads((REPO_ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    failures = []

    for node_id in public_nodes:
        node_cls = package.NODE_CLASS_MAPPINGS[node_id]
        input_types = node_cls.INPUT_TYPES()
        description = getattr(node_cls, "DESCRIPTION", "")
        if not isinstance(description, str) or not description.strip():
            failures.append(f"{node_id}: DESCRIPTION is empty")
        if f"DENO Custom Nodes v{version}" not in str(description):
            failures.append(f"{node_id}: DESCRIPTION missing DENO Custom Nodes v{version}")

        for section in ("required", "optional"):
            for input_name, spec in input_types.get(section, {}).items():
                metadata = (
                    spec[1]
                    if isinstance(spec, (tuple, list)) and len(spec) > 1 and isinstance(spec[1], dict)
                    else {}
                )
                tooltip = metadata.get("tooltip")
                if not isinstance(tooltip, str) or not tooltip.strip():
                    failures.append(f"{node_id}: {section}.{input_name} missing tooltip")

        output_types = tuple(getattr(node_cls, "RETURN_TYPES", ()))
        output_names = tuple(getattr(node_cls, "RETURN_NAMES", output_types))
        output_tooltips = tuple(getattr(node_cls, "OUTPUT_TOOLTIPS", ()))
        if output_types:
            if len(output_names) != len(output_types):
                failures.append(f"{node_id}: RETURN_NAMES length does not match RETURN_TYPES")
            if len(output_tooltips) != len(output_types):
                failures.append(f"{node_id}: OUTPUT_TOOLTIPS length does not match RETURN_TYPES")
            for index, tooltip in enumerate(output_tooltips):
                if not isinstance(tooltip, str) or not tooltip.strip():
                    failures.append(f"{node_id}: output[{index}] missing tooltip")
        elif output_tooltips:
            failures.append(f"{node_id}: zero-output node has OUTPUT_TOOLTIPS")

    assert not failures, "\n".join(failures)


def test_ltx_tiled_tile_controls_use_readable_frame_labels():
    package = load_package()

    for node_id in ("DenoLTXTiledSpatialUpscaler", "DenoLTXAVStepFusedTiledSampler"):
        input_types = package.NODE_CLASS_MAPPINGS[node_id].INPUT_TYPES()
        required = input_types["required"]
        optional = input_types["optional"]
        assert required["horizontal_tiles"][1]["display_name"] == "Frame width split count"
        assert required["horizontal_tiles"][1]["default"] == 2
        assert required["vertical_tiles"][1]["display_name"] == "Frame height split count"
        assert required["vertical_tiles"][1]["default"] == 2
        assert optional["aggressive_memory_cleanup"][1]["default"] is True
        if node_id == "DenoLTXAVStepFusedTiledSampler":
            assert "fusion_safety_mode" not in optional
            assert "fusion_safety_strength" not in optional
            assert "debug_fusion_stats" not in optional


def test_ltx_tiled_node_help_markdown_uses_readable_frame_labels():
    help_paths = [
        REPO_ROOT / "web/js/docs/DenoLTXTiledSpatialUpscaler.md",
        REPO_ROOT / "web/js/docs/DenoLTXTiledSpatialUpscaler/ko.md",
        REPO_ROOT / "web/js/docs/DenoLTXAVStepFusedTiledSampler.md",
        REPO_ROOT / "web/js/docs/DenoLTXAVStepFusedTiledSampler/ko.md",
    ]

    for help_path in help_paths:
        text = help_path.read_text(encoding="utf-8")
        assert "Frame width split count" in text
        assert "Frame height split count" in text
        assert "horizontal_tiles" not in text
        assert "vertical_tiles" not in text
        assert "fusion_safety" not in text
    en_av_help = (
        REPO_ROOT / "web/js/docs/DenoLTXAVStepFusedTiledSampler.md"
    ).read_text(encoding="utf-8")
    ko_av_help = (
        REPO_ROOT / "web/js/docs/DenoLTXAVStepFusedTiledSampler/ko.md"
    ).read_text(encoding="utf-8")
    assert "-> LTXVSeparateAVLatent\n-> LTXVCropGuides on the video latent" in en_av_help
    assert "-> LTXVSeparateAVLatent\n-> video latent" in ko_av_help
    assert "-> (Deno) LTX High resolution Tiled Sampler\n-> LTXVCropGuides" not in en_av_help
    assert "-> (Deno) LTX High resolution Tiled Sampler\n-> LTXVCropGuides" not in ko_av_help


def test_deno_version_metadata_stays_scanner_safe():
    metadata_source = (REPO_ROOT / "deno_node_metadata.py").read_text(encoding="utf-8")
    assert "urllib.request" not in metadata_source
    assert "urlopen" not in metadata_source
    assert "api.comfy.org" not in metadata_source


def test_deno_node_help_update_state_has_badge():
    script = (REPO_ROOT / "web" / "js" / "deno_node_help.js").read_text(encoding="utf-8")

    assert 'badgeLabel: "!"' in script
    assert "deno-node-update-available::after" in script
    assert "UPDATE_BADGE_RADIUS" in script
    assert "Update available:" in script
    assert "CHANGELOG_URL" in script
    assert "parseChangelogNotes" in script
    assert "createVersionCard" in script
    assert "What changed" in script
    assert "Release notes" in script
    assert "Rollback guide" not in script
    assert "Rollback is manual" not in script
    assert "ROLLBACK_GUIDE_URL" not in script
    assert "__denoHelpButtonHover" in script
    assert "canvasHelpCursorTicket" in script
    assert "requestAnimationFrame" in script
    assert "isCanvasHelpButtonHit" in script
    assert "handleOutsideHelpPointerDown" in script
    assert "handleOutsideHelpWheel" in script
    assert 'document.addEventListener("wheel", handleOutsideHelpWheel, true)' in script
    assert "TIP_BUTTON_CLASS" in script
    assert "deno-node-tip-button" in script
    assert "LOCAL_LLM_CHAIN_TIP" in script
    assert "DenoLocalLLMRefiner" in script
    assert "Tip: Using LLM nodes in a chain" in script
    assert "[LLM 1: Generate JSON prompt]" in script
    assert "      ↓" in script
    assert "Model After Run: Keep loaded" in script
    assert "[Last LLM: Final cleanup]" in script
    assert "Model After Run: Unload after run" in script
    assert "isCanvasTipButtonHit" in script
    assert "openCanvasTipPopup" in script
    assert "openDomTipPopup" in script
    assert "const tipPopupState = popupState.get(`${nodeKey}:tip`)" in script
    tip_draw = script.split("function drawCanvasTipButton", 1)[1].split("function patchCanvasHelpButton", 1)[0]
    assert "ctx.save();" in tip_draw
    assert "ctx.restore();" in tip_draw
    assert 'event.key === "Escape"' in script
    assert "getNodeTip(node)" in script
    assert "helpButton.before(tipButton)" in script
    assert 'style.cursor = "pointer"' in script
    assert "showStatusTooltip" not in script
    assert "deno-node-help-status-tip" not in script
    assert 'addEventListener("mouseenter"' not in script


def test_public_ltx23_8gb_workflow_keeps_deno_node_contracts():
    package = load_package()
    workflow = json.loads(PUBLIC_LTX23_8GB_WORKFLOW.read_text(encoding="utf-8"))
    canonical = json.dumps(workflow, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

    assert hashlib.sha256(canonical).hexdigest() == PUBLIC_LTX23_8GB_WORKFLOW_CANONICAL_SHA256

    node_types = {
        node.get("type")
        for node in workflow.get("nodes", [])
        if isinstance(node, dict) and node.get("type")
    }
    deno_node_types = {
        node_type
        for node_type in node_types
        if node_type.startswith("Deno") or "deno" in node_type.lower()
    }

    assert deno_node_types == {
        "DenoLTX23PresetLoader",
        "DenoLTXModelDownloader",
        "DenoLTXMultiLoraLoader",
        "DenoLTXPromptGuide",
        "DenoLTXSequencer",
        "DenoMultiImageLoader",
        "DenoResolutionSetup",
    }
    assert deno_node_types <= set(package.NODE_CLASS_MAPPINGS)
    assert "DenoLTX8GBModelDownloader" not in node_types
    assert "DenoVideoCompareVHS" not in node_types

    ltx_loader_nodes = [node for node in workflow["nodes"] if node.get("type") == "DenoLTX23PresetLoader"]
    assert len(ltx_loader_nodes) == 1
    ltx_widgets = ltx_loader_nodes[0]["widgets_values"]
    assert ltx_widgets[0] == "GGUF Style"
    assert len(ltx_widgets) == 11
    assert ltx_widgets[1] == ""


def test_deno_video_preview_passes_canvas_navigation_events():
    script = (REPO_ROOT / "web" / "js" / "deno_video_preview.js").read_text(encoding="utf-8")

    assert "installMiddleMouseCanvasPan" in script
    assert 'root.addEventListener("wheel"' in script
    assert "new WheelEvent" in script
    assert 'root.addEventListener("pointerdown"' in script
    assert "e.button !== 1" in script
    assert "canvas.ds.offset[0]" in script
    assert "canvas.ds.offset[1]" in script
    assert 'root.addEventListener("auxclick"' in script
    assert 'video.addEventListener("click"' in script
    assert 'fsBtn.addEventListener("click"' in script
    assert "syncAudioMute" in script
    assert 'root.addEventListener("pointerenter"' in script
    assert 'root.addEventListener("pointerleave"' in script
    assert "hovering: false" in script


def test_deno_video_preview_shows_current_video_metadata_badge():
    script = (REPO_ROOT / "web" / "js" / "deno_video_preview.js").read_text(encoding="utf-8")

    assert 'infoBadge.className = "mi"' in script
    assert "updateInfoBadge" in script
    assert "previewInfo" in script
    assert "frame_rate" in script
    assert "frame_count" in script
    assert "has_audio" in script
    assert 'parts.join(" | ")' in script
    assert "max-width:calc(100% - 150px)" in script


def test_preview_nodes_preserve_user_resized_node_size():
    video_preview = (REPO_ROOT / "web" / "js" / "deno_video_preview.js").read_text(encoding="utf-8")
    video_compare = (REPO_ROOT / "web" / "js" / "deno_video_compare.js").read_text(encoding="utf-8")
    image_compare = (REPO_ROOT / "web" / "js" / "deno_image_compare.js").read_text(encoding="utf-8")

    assert "__denoVideoPreviewManualSize" in video_preview
    assert "maybeFitNodeToAspect" in video_preview
    assert "object-fit:contain" in video_preview
    assert "node.setSize?.(node.computeSize())" not in video_preview
    assert "NODE_VERTICAL_CHROME" in video_preview
    assert "Fill the user-chosen node height" in video_preview
    assert "state.widgetHeight" not in video_preview
    assert "previewHeightForNodeHeight" not in video_preview

    assert "__denoVideoCompareManualSize" in video_compare
    assert "resizeTrackingArmed" in video_compare
    assert "if (!force && isManualSized(node)) return;" in video_compare

    assert "__denoImageCompareManualSize" in image_compare
    assert "installManualResizeTracking" in image_compare
    assert "if (isManualSized(node))" in image_compare


def test_ideogram_director_compute_size_guard_allows_user_shrink():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'IDD_REV = "r2026.06.30-generate-target-a"' in script
    assert "let iddUserResizing = false;" in script
    assert "const preserveCurrent = !iddUserResizing;" in script
    assert "preserveCurrent ? iddSizeValue(current, 0) : 0" in script
    assert "preserveCurrent ? iddSizeValue(current, 1) : 0" in script
    assert "installIddResizeIntentGuard()" in script
    assert 'canvas.addEventListener("pointerdown", begin, true);' in script
    assert 'window.addEventListener("pointerup", end, true);' in script
    assert 'window.addEventListener("pointercancel", end, true);' in script
    assert 'window.removeEventListener("pointercancel", end, true)' in script


def test_ideogram_director_validation_accepts_stale_style_combo_values():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoIdeogramDirector"]

    assert node_cls.VALIDATE_INPUTS(
        style_mode="cinematic",
        import_mode="Ask before replacing board",
        translate_output="English",
        view_language="Original (as written)",
        translation_engine="Google",
    ) is True


def test_ideogram_director_recreate_node_restores_default_size_when_small():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert "const IDD_DEFAULT_W = 850;" in script
    assert "const IDD_DEFAULT_H = 1000;" in script
    assert "const IDD_MIN_W = 760;" in script
    assert "const recreatedTooSmall = marked && (sw < IDD_MIN_W || sh < IDD_MIN_H);" in script
    assert "marked && !recreatedTooSmall" in script
    assert ": [IDD_DEFAULT_W, IDD_DEFAULT_H];" in script
    assert "layoutStage(); fitTopBarAfterRestore();" in script


def test_ideogram_director_backdrop_fit_ref_keeps_output_stage_as_authority():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'const bdFitRefBtn = el("button", "idd-bdfit")' in script
    assert 'bdFitRefBtn.textContent = "Fit Ref"' in script
    assert "function fitOutputToReferenceRatio()" in script
    assert "dimsFor(bdrop.naturalWidth, bdrop.naturalHeight, currentMp)" in script
    assert "function hasLoadedBackdrop()" in script
    assert "placeRect(ov, srect);   // boxes always follow the committed output canvas unless Fit Ref changes that canvas" in script
    assert "const overlayRect = hasVisibleResult() ? srect : (hasLoadedBackdrop() && brect ? brect : srect);" not in script
    assert "userSet: hadUserSet ? !!raw.userSet : !!raw.set" in script
    assert "bdT.userSet = true;" in script


def test_ideogram_director_bbox_number_badge_is_primary_drag_handle():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'tag.dataset.role = "move-handle";' in script
    assert 'tag.title = "Drag this number to move the box";' in script
    assert 'tag.addEventListener("pointerdown", (e) => onBoxDown(e, i, "move"));' in script
    assert ".idd-box .tag{position:absolute;top:0;left:0;z-index:6;" in script
    assert "cursor:move;touch-action:none;user-select:none;" in script
    assert ".idd-h{position:absolute;width:9px;height:9px" in script
    assert "z-index:4;display:none;box-sizing:border-box;" in script


def test_ideogram_director_dom_widget_keeps_full_width_in_desktop():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert "width:100%;min-width:0;max-width:100%;height:100%;align-self:stretch" in script
    assert 'width: "100%"' in script
    assert 'maxWidth: "100%"' in script
    assert 'alignSelf: "stretch"' in script
    assert ".idd-body{display:flex;flex:1 1 auto;width:100%;min-width:0;min-height:0;}" in script
    assert ".idd-board{position:relative;flex:1 1 320px;min-width:260px;" in script


def test_ideogram_director_right_rail_keeps_local_wheel_scroll():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert "Deliberate local scroll areas keep their wheel." in script
    assert 't.closest(".idd-rail,.idd-gal-scroll,.idd-importlist,textarea,input,select")' in script
    assert "overflow-y:auto;overscroll-behavior:contain;transition:width .15s ease;" in script
    assert "--railw:248px;" in script
    assert ".idd-wrap.idd-railwide{--railw:380px;}" in script
    assert 'const railWideBtn = el("button", "idd-railwidebtn")' in script
    assert ".idd-railwidebtn:hover,.idd-railwidebtn.on" in script
    assert ".idd-wrap.idd-railwide .idd-elem .t" in script
    assert "white-space:normal;overflow:visible;text-overflow:clip" in script
    assert "railWide: !!railWide" in script
    assert "setRailWide(!!d.railWide, false)" in script
    assert "for (const elc of [seedIn, rail, summary, bgArea]) stop(elc);" in script


def test_ideogram_director_elements_list_is_front_to_back_without_reversing_output():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'elemLbl.textContent = "Elements"' in script
    assert "Elements (Front" not in script
    assert "boxes.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {" in script
    assert "row.dataset.iddBoxId = String(b.id)" in script
    assert "d.dataset.iddBoxId = String(b.id)" in script
    assert 'e.dataTransfer.setData("text/plain", String(b.id));' in script
    assert 'const movingId = +e.dataTransfer.getData("text/plain");' in script
    assert "function paintElementDropPreview(e, row)" in script
    assert "function reorderElementDrop(e, targetBox, row)" in script
    assert "function handleElementRowClick(e, boxId)" in script
    assert "const isFastRepeat = lastElementClick.id === boxId" in script
    assert "openElementById(boxId)" in script
    assert "function elementListText(b)" in script
    assert "row.title = elementListTitle(b, i)" in script
    assert "t.title = row.title" in script
    assert "Click to select. Double-click to edit this element." not in script
    assert 'const elemHead = el("div", "idd-sechead");' in script
    assert 'const addBboxBtn = mkBtn("+BBOX")' in script
    assert 'addBboxBtn.title = "Add a new BBOX at the center of the board";' in script
    assert ".idd-sechead{display:flex;align-items:center;justify-content:space-between;gap:8px;" in script
    assert ".idd-addbbox{padding:3px 8px !important;" in script
    assert "function paintBoardEmptyHint()" in script
    assert 'board.classList.toggle("empty", !boxes.length && !hasBackdrop && !hasResult);' in script
    assert "function addCenteredBox()" in script
    assert 'addBboxBtn.onclick = (e) => { e.stopPropagation(); addCenteredBox(); };' in script
    assert "paintBoardEmptyHint();" in script
    assert 'e0.textContent = "Drag on the board or use +BBOX";' in script
    assert "const frontFirst = boxes.slice().reverse().filter((x) => x.id !== movingId);" in script
    assert "frontFirst.splice(target + (elementDropAfter(e, row) ? 1 : 0), 0, moving);" in script
    assert "boxes = frontFirst.reverse();" in script
    assert ".idd-elem{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:6px;cursor:pointer;position:relative;}" in script
    assert ".idd-elem.drop-before::before,.idd-elem.drop-after::after" in script
    assert ".idd-elem.over{outline" not in script
    assert 'row.classList.toggle("drop-after", elementDropAfter(e, row));' in script
    assert 'row.classList.toggle("drop-before", !elementDropAfter(e, row));' in script
    assert 'grip.addEventListener("dragend", clearElementDropPreview);' in script
    assert 'elemList.querySelector(`[data-idd-box-id="${b.id}"]`)' in script
    assert 'ov.querySelector(`[data-idd-box-id="${b.id}"]`)' in script
    assert "const els = boxes.map((b) => {" in script


def test_ideogram_director_auto_colors_stay_with_boxes_not_row_index():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert "function ensureBoxUiColor(b, i)" in script
    assert "function ensureBoxUiColors() { boxes.forEach((b, i) => ensureBoxUiColor(b, i)); }" in script
    assert 'uiColor: HEX.test(b.uiColor || "") ? b.uiColor : ""' in script
    assert 'if (HEX.test(raw.uiColor || "")) item.uiColor = raw.uiColor;' in script
    assert "uiColor: ensureBoxUiColor(b, i)" in script
    assert "uiColor: HEX.test(e0.uiColor || \"\") ? e0.uiColor : \"\"" in script
    assert "function withCurrentUiColors(cap)" in script
    assert 'applyImportedCaption(withCurrentUiColors(translated.caption));' in script
    assert "const boxColor = (b, i) => (b.palette && b.palette[0]) || ensureBoxUiColor(b, i);" in script
    assert "uiColor: uiColorForIndex(boxes.length)" in script
    assert "ensureBoxUiColors();" in script

    assemble = script.split("function assembleCaption()", 1)[1].split('copy.addEventListener("click"', 1)[0]
    assert "uiColor" not in assemble
    assert "if (bpal.length) el.color_palette = bpal;" in assemble


def test_ideogram_director_history_and_translate_refresh_buttons_are_wired():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'const undoBtn = mkBtn("↶")' in script
    assert 'const redoBtn = mkBtn("↷")' in script
    assert 'undoBtn.title = "Undo board edit"' in script
    assert 'redoBtn.title = "Redo board edit"' in script
    assert "ComfyUI owns global" in script
    assert "Ctrl+Z/Y" in script
    assert 'undoBtn.title = "Undo board edit (Ctrl+Z)"' not in script
    assert 'redoBtn.title = "Redo board edit (Ctrl+Y)"' not in script
    assert "undoBtn.disabled = !undoStack.length;" in script
    assert "redoBtn.disabled = !redoStack.length;" in script
    assert "undoBtn.onclick = (e) => { e.stopPropagation(); undo(); };" in script
    assert "redoBtn.onclick = (e) => { e.stopPropagation(); redo(); };" in script
    assert "bot.append(save, auto, vsep(), copy, paste, el(\"span\", \"idd-sp\"), undoBtn, redoBtn, clear);" in script

    assert 'const translateRefreshBtn = mkBtn("↻")' in script
    assert "function refreshBoardTranslation()" in script
    assert 'translateRefreshBtn.onclick = (e) => { e.stopPropagation(); refreshBoardTranslation(); };' in script
    assert 'translateBoardToViewLanguage("auto")' in script
    assert "function translateCaptionViaRoute" in script
    assert "function openTranslationFallbackDialog" in script
    assert 'top.append(layoutsBtn, el("span", "idd-sp"), importBtn, resWrap, translateBtn, translateRefreshBtn, seedPill, targetBtn, regen);' in script
    assert 'api.fetchApi("/deno/ideogram_director/translate_board"' not in script


def test_ideogram_director_generate_target_uses_native_partial_execution_without_widget_shift():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert 'const targetBtn = mkBtn("All")' in script
    assert 'targetBtn.classList.add("idd-targetbtn")' in script
    assert 'const TARGET_PROP = "idd_regen_target";' in script
    assert 'props[TARGET_PROP] = { mode: "node", nodeId: String(state.nodeId), title: state.title || "" };' in script
    assert 'top.append(layoutsBtn, el("span", "idd-sp"), importBtn, resWrap, translateBtn, translateRefreshBtn, seedPill, targetBtn, regen);' in script

    assert "async function queueDirectorPrompt()" in script
    assert "await app.queuePrompt(0, 1, targetIds);" in script
    assert "else await app.queuePrompt(0);" in script
    assert "await queueDirectorPrompt();" in script

    assert "function shouldAcceptResultForTarget(detail)" in script
    assert "eventNodeIds(detail).has(String(selected.id))" in script
    assert "shouldAcceptResult: (detail) => shouldAcceptResultForTarget(detail)," in script

    assert "Target output is missing." in script
    assert "Choose All outputs or select a current Preview/Save output before generating." in script


def test_ideogram_director_generate_target_filters_fake_graph_outputs():
    node_bin = shutil.which("node")
    if not node_bin:
        pytest.skip("node runtime not available")

    harness = r"""
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = process.argv[1];
const source = fs
  .readFileSync(path.join(repo, "web/js/deno_ideogram_director.js"), "utf8")
  .replaceAll("import.meta.url", "\"file:///deno_ideogram_director.js\"");
let helpers = null;
const app = {
  api: { addEventListener() {} },
  registerExtension() {},
  graph: null,
  rootGraph: null,
};
const classList = { add() {}, remove() {}, toggle() {} };
const document = {
  createElement() {
    return {
      classList,
      style: {},
      dataset: {},
      children: [],
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      remove() {},
    };
  },
  getElementById() { return null; },
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
};
const windowObj = {
  comfyAPI: { app: { app } },
  __DENO_IDEOGRAM_DIRECTOR_TEST_HOOK__(api) { helpers = api; },
  addEventListener() {},
  removeEventListener() {},
  setTimeout() {},
  clearTimeout() {},
  LiteGraph: { NEVER: 4 },
};
const context = {
  console,
  document,
  URL,
  window: windowObj,
  setTimeout() {},
  clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "deno_ideogram_director.js" });
if (!helpers) throw new Error("Ideogram Director test hook was not installed");

function outputNode(id, title = "Preview Image") {
  return {
    id,
    title,
    outputs: [],
    properties: {},
    constructor: { nodeData: { output_node: true }, title },
  };
}
function normalNode(id) {
  return {
    id,
    title: "Middle",
    outputs: [{ links: [102] }],
    properties: {},
    constructor: { nodeData: { output_node: false } },
  };
}
function makeGraph({ connectDirector = true, connectMiddle = true } = {}) {
  const director = {
    id: 1,
    title: "Director",
    outputs: [{ links: connectDirector ? [101] : [] }],
    properties: {},
    constructor: { nodeData: { output_node: false } },
  };
  const mid = normalNode(2);
  const downstream = outputNode(3);
  const unrelated = outputNode(9, "Unrelated Save");
  const links = {};
  if (connectDirector) links[101] = { id: 101, origin_id: 1, target_id: 2 };
  if (connectMiddle) links[102] = { id: 102, origin_id: 2, target_id: 3 };
  const nodes = [director, mid, downstream, unrelated];
  const graph = {
    _nodes: nodes,
    links,
    getNodeById(id) { return nodes.find((node) => String(node.id) === String(id)) || null; },
  };
  for (const node of nodes) node.graph = graph;
  return { graph, director, mid, downstream, unrelated };
}
function ids(nodes) {
  return nodes.map((node) => String(node.id)).sort();
}
function check(condition, label) {
  if (!condition) throw new Error(label);
}
function same(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

{
  const { director } = makeGraph();
  same(ids(helpers.outputTargetNodesForDirector(director)), ["3"], "only downstream output is a target candidate");
  director.properties.idd_regen_target = { mode: "node", nodeId: "3" };
  check(helpers.selectedTargetNodeForDirector(director).id === 3, "selected downstream target resolves");
  check(helpers.shouldAcceptResultForDirectorTarget(director, { node: 3 }), "selected target event is accepted");
  check(!helpers.shouldAcceptResultForDirectorTarget(director, { node: 9 }), "unrelated output event is rejected");
}
{
  const { director } = makeGraph({ connectDirector: false });
  same(ids(helpers.outputTargetNodesForDirector(director)), [], "unrelated outputs are not fallback candidates");
  director.properties.idd_regen_target = { mode: "node", nodeId: "9" };
  check(helpers.selectedTargetNodeForDirector(director) === null, "saved unrelated target is missing");
  check(!helpers.shouldAcceptResultForDirectorTarget(director, { node: 9 }), "missing selected target rejects result events");
}
{
  const { director } = makeGraph({ connectMiddle: false });
  director.properties.idd_regen_target = { mode: "node", nodeId: "3" };
  same(ids(helpers.outputTargetNodesForDirector(director)), [], "disconnected saved target is not a candidate");
  check(!helpers.shouldAcceptResultForDirectorTarget(director, { node: 3 }), "disconnected saved target rejects stale events");
}
{
  const { director } = makeGraph({ connectDirector: false });
  director.properties.idd_regen_target = { mode: "all" };
  check(helpers.shouldAcceptResultForDirectorTarget(director, { node: 9 }), "all mode keeps legacy result acceptance");
}
"""
    result = subprocess.run([node_bin, "-e", harness, str(REPO_ROOT)], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr


def test_ideogram_director_external_size_inputs_sync_frontend_without_pruning_sockets():
    script = (REPO_ROOT / "web" / "js" / "deno_ideogram_director.js").read_text(encoding="utf-8")

    assert "const sz = d.output && d.output.idd_size;" in script
    assert "n._idd.onSize(sz[sz.length - 1]);" in script
    assert "function applyExternalSizePayload(payload)" in script
    assert 'onSize: (p) => { applyExternalSizePayload(p); },' in script
    assert "const keep = { backdrop: 1, import_json: 1, input_width: 1, input_height: 1, input_megapixels: 1 };" in script
    assert "setRes(w, h, label, machine);" in script
    assert "serialize();" in script


def test_rtx_vfx_preflight_node_is_not_registered():
    package = load_package()

    assert "DenoRTXVFXPreflight" not in package.NODE_CLASS_MAPPINGS
    assert "DenoRTXVFXPreflight" not in package.NODE_DISPLAY_NAME_MAPPINGS


def test_rtx_vfx_node_is_optional_until_execution():
    package = load_package()
    node = package.NODE_CLASS_MAPPINGS["DenoRTXVFXEasyUpscale"]
    inputs = node.INPUT_TYPES()["required"]

    assert inputs["mode"][1]["default"] == "VSR Medium"
    assert inputs["resize_type"][0] == ["Scale", "Keep Ratio", "Manual", "Preset Ratio", "Same Size"]
    assert inputs["resize_type"][1]["default"] == "Keep Ratio"
    assert inputs["ratio_preset"][0][:3] == ["1:1", "4:5", "5:4"]
    assert "16:9" in inputs["ratio_preset"][0]
    assert "9:16" in inputs["ratio_preset"][0]
    assert inputs["resize_method"][0] == ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"]
    assert inputs["resize_method"][1]["default"] == "Center Crop (Fill)"
    assert inputs["scale"][1]["default"] == 2.0
    assert inputs["divisible_by"][0] == ["1", "8", "16", "32", "64", "128"]
    assert inputs["divisible_by"][1]["default"] == "1"
    assert inputs["device"][1]["default"] == 0
    assert node.RETURN_TYPES == ("IMAGE",)
    assert node.RETURN_NAMES == ("images",)


def test_rtx_vfx_frontend_panel_keeps_readable_minimum_width():
    script = (REPO_ROOT / "web" / "js" / "deno_rtx_vfx_easy_upscale.js").read_text(encoding="utf-8")

    assert "const MIN_EASY_WIDTH = 560;" in script
    assert "const PANEL_MIN_WIDTH = MIN_EASY_WIDTH - NODE_WIDGET_SIDE_MARGIN;" in script
    assert "const PANEL_BOTTOM_GAP = 10;" in script
    assert "const NVIDIA_VSR_DOCS_URL" in script
    assert 'VSR: "Video SR"' in script
    assert 'const RESIZE_TYPES = ["Scale", "Keep Ratio", "Manual", "Preset Ratio", "Same Size"];' in script
    assert 'value: "Scale"' in script
    assert 'label: "Scale"' in script
    assert 'resizeType === "Scale"' in script
    assert "How to install" in script
    assert "Copy steps" in script
    assert "https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/" in script
    assert "raw/refs/heads/main/tools/install_rtx_vfx_bat.zip" not in script
    assert "install_rtx_vfx_bat.zip" in script
    assert "Video Super Resolution | Low-res/compressed -> larger, cleaner, sharper" not in script
    assert "Low-res/compressed -> larger, cleaner, sharper" in script
    assert "Clean source -> crisp detail-preserving upscale" in script
    assert "Noise/grain -> smoother, cleaner same-size image" in script
    assert "Soft/blurred -> clearer, sharper same-size image" in script
    assert "Link : NVIDIA official docs: Video Super Resolution" in script
    assert 'target = "_blank"' in script
    assert "RTX Video Super Resolution" in script
    assert "wrapComputeSize(node);" in script
    assert "node.__denoRtxVfxComputeWrapped" in script
    assert "root.style.width = `${width}px`;" in script
    assert "ui.height() + PANEL_BOTTOM_GAP" in script
    assert "clampNumberWidget(node, deviceWidget, BACKEND_DEFAULTS.device);" in script
    assert "setWidgetValue(node, deviceWidget, BACKEND_DEFAULTS.device, false);" not in script
    assert "installCanvasWheelForwarding(root);" in script
    assert 'root.addEventListener("wheel"' in script
    assert 'root.addEventListener("pointerdown"' in script
    assert 'root.addEventListener("auxclick"' in script
    assert "event.button !== 1" in script
    assert "canvas.ds.offset[0]" in script
    assert "new WheelEvent" in script

    finisher_script = (REPO_ROOT / "web" / "js" / "deno_rtx_vfx_video_finisher.js").read_text(encoding="utf-8")
    assert 'const UPSCALE_PASS_LABELS = {' in finisher_script
    assert 'VSR: "Video SR"' in finisher_script
    assert "installCanvasWheelForwarding(root);" in finisher_script
    assert 'root.addEventListener("wheel"' in finisher_script
    assert 'root.addEventListener("pointerdown"' in finisher_script
    assert 'root.addEventListener("auxclick"' in finisher_script
    assert "event.button !== 1" in finisher_script
    assert "canvas.ds.offset[0]" in finisher_script
    assert "new WheelEvent" in finisher_script
    assert 'const DIVISIBLE_BY_VALUES = ["1", "8", "16", "32", "64", "128"];' in finisher_script
    assert 'divisible_by: "1"' in finisher_script
    assert "use divisible_by 1 for exact video sizes" in finisher_script
    assert "repairShiftedBackendWidgetValues(node);" in finisher_script
    assert "looksShiftedByOne" in finisher_script
    assert "first_quality: String(value(\"upscale_pass\"))" in finisher_script
    assert "resize_type: String(value(\"scale\"))" in finisher_script
    assert "serializable so ComfyUI cannot shift later widget values forward" in finisher_script
    assert 'widget.type = "hidden";' not in finisher_script


def test_deno_image_compare_contract_and_frontend_copy():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoImageCompare"]
    inputs = node_cls.INPUT_TYPES()

    assert list(inputs["required"].keys()) == ["mode", "split_position", "toggle_image", "swap"]
    assert inputs["required"]["mode"][0] == ["Slider", "Side by Side", "Difference", "Toggle"]
    assert inputs["required"]["mode"][1]["default"] == "Slider"
    assert inputs["required"]["split_position"][1]["default"] == 0.5
    assert inputs["required"]["toggle_image"][0] == ["A", "B"]
    assert inputs["required"]["toggle_image"][1]["default"] == "B"
    assert inputs["required"]["swap"][1]["default"] is False
    assert list(inputs["optional"].keys()) == ["image_a", "image_b"]
    assert node_cls.RETURN_TYPES == ()
    assert node_cls.RETURN_NAMES == ()
    assert node_cls.FUNCTION == "compare_images"
    assert node_cls.CATEGORY == "Deno/Image"
    assert node_cls.OUTPUT_NODE is True

    script = (REPO_ROOT / "web" / "js" / "deno_image_compare.js").read_text(encoding="utf-8")
    assert 'const NODE_NAME = "DenoImageCompare";' in script
    assert "removeCompareOutputs(node);" in script
    assert "ensureSaveImageOutput" not in script
    assert 'name: "save_image"' not in script
    assert '"Slider", "Side by Side", "Difference", "Toggle"' in script
    assert '"Swap"' in script
    assert '"A"' in script
    assert '"B"' in script
    assert "normalizeBoolean" in script
    assert 'const WIDGET_NAME = "deno_image_compare_canvas";' in script
    assert "const DEFAULT_NODE_HEIGHT = 520;" in script
    assert "const IMAGE_NODE_MIN_HEIGHT = 520;" in script
    assert "const PREVIEW_MIN_HEIGHT = 300;" in script
    assert "const PREVIEW_MAX_HEIGHT = 760;" in script
    assert "const NODE_VERTICAL_CHROME = 110;" in script
    assert "node.addCustomWidget(widget);" in script
    assert 'widget?.name !== WIDGET_NAME && widget?.name !== "deno_image_compare_panel"' in script
    assert "removeExistingCompareWidgets(node);" in script
    assert "serializeValue()" in script
    assert "return this._value;" in script
    assert "hydratePreviewFromWidgetValue" in script
    assert "getWidgetHeightFromNode" in script
    assert "normalizeImageDescriptor" in script
    assert "descriptor: item.descriptor" in script
    assert "nodeHeight - y - 12" in script
    assert "nodeType.prototype.onMouseMove" in script
    assert "updateSliderFromPointer" in script
    assert 'event.type === "pointermove" || event.type === "mousemove"' in script
    assert 'event.type === "pointerdown" || event.type === "mousedown" || event.type === "click"' in script
    assert 'isMoveEvent && mode === "Slider"' in script
    assert "drawFitImage" in script
    assert "drawBadgeAtBounds" in script
    assert "aLabel: \"B\", bLabel: \"A\"" in script
    assert "drawCoverImage" not in script
    assert "drawContainedImage" not in script
    assert "drawLowZoomFallback" in script
    assert "getCanvasScale" in script
    assert "resizeNodeToImage(node);" in script
    assert "ctx.lineWidth = 1;" in script
    assert "ctx.arc(centerX, centerY, 9" in script
    assert 'ctx.textBaseline = "middle";' in script
    assert "addDOMWidget" not in script
    assert "forwardWheelToCanvas" not in script
    assert "object-fit:cover;" not in script
    assert "draggingSlider" not in script
    assert "height:230px;" not in script
    assert "for SaveImage" not in script
    assert "save the selected view" not in script
    assert "Compare A and B with live visual modes." in script


def test_deno_image_compare_runtime_semantics_when_torch_available():
    torch = sys.modules.get("torch")
    if torch is None:
        try:
            import torch
        except ImportError:
            return

    if not hasattr(torch, "zeros"):
        return

    nodes_previous = sys.modules.get("nodes")
    nodes_stub = types.ModuleType("nodes")

    class PreviewImage:
        OUTPUT_NODE = True

        def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None):
            return {
                "ui": {
                    "images": [{
                        "filename": f"{filename_prefix}00001_.png",
                        "subfolder": "",
                        "type": "temp",
                    }]
                }
            }

    nodes_stub.PreviewImage = PreviewImage
    sys.modules["nodes"] = nodes_stub

    try:
        spec = importlib.util.spec_from_file_location(
            "deno_image_compare_runtime", REPO_ROOT / "deno_image_compare.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        node = module.DenoImageCompare()
        image_a = torch.zeros((1, 8, 8, 3), dtype=torch.float32)
        image_b = torch.ones((1, 4, 4, 3), dtype=torch.float32) * 0.7

        slider = node.compare_images("Slider", 0.5, "B", "false", image_a=image_a, image_b=image_b)
        assert "result" not in slider
        assert slider["ui"]["a_images"][0]["filename"] == "deno.compare.a.00001_.png"
        assert slider["ui"]["b_images"][0]["filename"] == "deno.compare.b.00001_.png"
        assert slider["ui"]["compare_meta"][0]["mode"] == "Slider"
        assert slider["ui"]["compare_meta"][0]["split_position"] == 0.5
        assert slider["ui"]["compare_meta"][0]["toggle_image"] == "B"
        assert slider["ui"]["compare_meta"][0]["swap"] is False
        assert slider["ui"]["compare_meta"][0]["a_width"] == 8
        assert slider["ui"]["compare_meta"][0]["a_height"] == 8
        assert slider["ui"]["compare_meta"][0]["b_width"] == 4
        assert slider["ui"]["compare_meta"][0]["b_height"] == 4

        toggled = node.compare_images("Toggle", 0.5, "A", False, image_a=image_a, image_b=image_b)
        assert toggled["ui"]["compare_meta"][0]["mode"] == "Toggle"
        assert toggled["ui"]["compare_meta"][0]["toggle_image"] == "A"

        difference = node.compare_images("Difference", 0.5, "B", False, image_a=image_a, image_b=image_b)
        assert difference["ui"]["compare_meta"][0]["mode"] == "Difference"

        side_by_side = node.compare_images("Side by Side", 0.5, "B", False, image_a=image_a, image_b=image_b)
        assert side_by_side["ui"]["compare_meta"][0]["mode"] == "Side by Side"

        swapped = node.compare_images("Slider", 0.5, "B", True, image_a=image_a, image_b=image_b)
        assert swapped["ui"]["compare_meta"][0]["swap"] is True
        assert swapped["ui"]["compare_meta"][0]["a_width"] == 8
        assert swapped["ui"]["compare_meta"][0]["b_width"] == 4

        normalized = node.compare_images("Bad Mode", "bad", "Z", "yes", image_a=None, image_b=None)
        assert normalized["ui"]["a_images"] == []
        assert normalized["ui"]["b_images"] == []
        assert normalized["ui"]["compare_meta"][0]["mode"] == "Slider"
        assert normalized["ui"]["compare_meta"][0]["split_position"] == 0.5
        assert normalized["ui"]["compare_meta"][0]["toggle_image"] == "B"
        assert normalized["ui"]["compare_meta"][0]["swap"] is True
        assert normalized["ui"]["compare_meta"][0]["a_width"] == 0
        assert normalized["ui"]["compare_meta"][0]["b_width"] == 0
    finally:
        if nodes_previous is None:
            sys.modules.pop("nodes", None)
        else:
            sys.modules["nodes"] = nodes_previous


def test_deno_video_compare_contract_and_frontend_copy():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoVideoCompare"]
    inputs = node_cls.INPUT_TYPES()

    assert list(inputs["required"].keys()) == [
        "mode", "split_position", "toggle_image", "swap", "fps", "burn_labels"
    ]
    assert inputs["required"]["mode"][0] == ["Slider", "Side by Side", "Difference", "Toggle"]
    assert inputs["required"]["mode"][1]["default"] == "Slider"
    assert inputs["required"]["split_position"][1]["default"] == 0.5
    assert inputs["required"]["toggle_image"][0] == ["A", "B"]
    assert inputs["required"]["toggle_image"][1]["default"] == "B"
    assert inputs["required"]["swap"][1]["default"] is False
    assert inputs["required"]["fps"][0] == "FLOAT"
    assert inputs["required"]["fps"][1]["default"] == 24.0
    assert inputs["required"]["fps"][1]["min"] == 1.0
    assert inputs["required"]["fps"][1]["max"] == 240.0
    assert inputs["required"]["burn_labels"][0] == "BOOLEAN"
    assert inputs["required"]["burn_labels"][1]["default"] is False
    assert list(inputs["optional"].keys()) == ["video_a", "video_b", "audio_a", "audio_b"]
    assert inputs["optional"]["video_a"][0] == "IMAGE"
    assert inputs["optional"]["video_b"][0] == "IMAGE"
    assert inputs["optional"]["audio_a"][0] == "AUDIO"
    assert inputs["optional"]["audio_b"][0] == "AUDIO"
    assert node_cls.RETURN_TYPES == ("IMAGE",)
    assert node_cls.RETURN_NAMES == ("comparison",)
    assert node_cls.FUNCTION == "compare_videos"
    assert node_cls.CATEGORY == "Deno/Image"
    assert node_cls.OUTPUT_NODE is True

    script = (REPO_ROOT / "web" / "js" / "deno_video_compare.js").read_text(encoding="utf-8")
    assert 'const NODE_NAME = "DenoVideoCompare";' in script
    assert 'const WIDGET_NAME = "deno_video_compare_canvas";' in script
    assert '"Slider", "Side by Side", "Difference", "Toggle"' in script
    assert '"mode", "split_position", "toggle_image", "swap",' in script
    assert '"burn_labels"' in script
    assert "Synced A/B playback on a shared timeline." in script
    assert "node.addDOMWidget(WIDGET_NAME" in script
    assert "function handleExecuted(node, output)" in script
    assert 'o.label !== "Output"' in script
    assert "Output Images SBS/Diff" not in script
    assert "Output Badges" in script
    assert "function startPlayback(node)" in script
    assert "function pausePlayback(node)" in script
    assert "function togglePlay(node)" in script
    assert "function getTimeline(node)" in script
    assert "function loopOf(node)" in script
    assert "⛶ Full" in script
    assert "Full screen compare view" in script
    assert ".dvp:fullscreen" in script
    assert "function isFullscreenRoot(root)" in script
    assert "function zoomPreviewAt(node, event)" in script
    assert "function startFullscreenHorizontalPan(node, event)" in script
    assert "s.panX = ev.clientX - startX" in script
    assert "s.hovering || isFullscreenRoot(d.root)" in script
    assert "requestFullscreen" in script
    assert "isFullscreenRoot(d.root)" in script
    assert "output.deno_video_compare" in script
    assert "createBufferSource" in script
    assert "requestAnimationFrame(tick)" in script
    assert "nodeType.prototype.onRemoved" in script
    # the Registry-trigger frontend patterns must never reappear
    assert "<video" not in script
    assert ".connect(" not in script
    assert ".disconnect(" not in script
    assert "ffmpeg" not in script
    assert "subprocess" not in script


def test_deno_video_compare_runtime_semantics_when_torch_available():
    saved_torch_modules = {name: sys.modules.get(name) for name in ("torch", "torch.nn", "torch.nn.functional")}
    for name in saved_torch_modules:
        sys.modules.pop(name, None)

    try:
        import torch
    except Exception:
        # ImportError on CI (no torch); RuntimeError if torch is re-imported
        # in a shared multi-test process — skip rather than fail the suite.
        for name, module in saved_torch_modules.items():
            if module is not None:
                sys.modules[name] = module
        return

    if not hasattr(torch, "zeros"):
        return

    fp_previous = sys.modules.get("folder_paths")
    tmpdir = tempfile.mkdtemp()
    fp_stub = types.ModuleType("folder_paths")
    fp_stub.get_temp_directory = lambda: tmpdir
    sys.modules["folder_paths"] = fp_stub

    try:
        spec = importlib.util.spec_from_file_location(
            "deno_video_compare_runtime", REPO_ROOT / "deno_video_compare.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        node = module.DenoVideoCompare()
        video_a = torch.zeros((24, 8, 8, 3), dtype=torch.float32)
        video_b = torch.ones((48, 16, 16, 3), dtype=torch.float32) * 0.6

        result = node.compare_videos(
            "Slider", 0.5, "B", "false", 24.0, False, video_a=video_a, video_b=video_b
        )
        assert "result" in result
        out = result["result"][0]
        assert out.ndim == 4 and out.shape[-1] == 3  # full-res lossless composite
        payload = result["ui"]["deno_video_compare"][0]
        assert payload["mode"] == "Slider"
        assert payload["have_a"] is True and payload["have_b"] is True
        assert payload["a_count"] == 24 and payload["b_count"] == 48
        assert payload["a_src_w"] == 8 and payload["b_src_w"] == 16
        assert isinstance(payload["files_a"], list) and len(payload["files_a"]) > 0
        assert isinstance(payload["files_b"], list) and len(payload["files_b"]) > 0
        assert payload["frame_count"] == max(len(payload["files_a"]), len(payload["files_b"]))
        for fn in payload["files_a"][:3] + payload["files_b"][:3]:
            assert fn.endswith(".webp")
        assert payload["preview_capped"] is False
        assert payload["output_fullres"] is True
        split_col = out.shape[2] // 2
        divider = out[:, :, split_col, :]
        assert float((divider[..., 0] - (72 / 255)).abs().max()) < 1e-5
        assert float((divider[..., 1] - 1.0).abs().max()) < 1e-5
        assert float((divider[..., 2] - (132 / 255)).abs().max()) < 1e-5

        # burn_labels stamps the saved output; off must leave it untouched
        on = node.compare_videos(
            "Side by Side", 0.5, "B", False, 24.0, True, video_a=video_a, video_b=video_b
        )["result"][0]
        off = node.compare_videos(
            "Side by Side", 0.5, "B", False, 24.0, False, video_a=video_a, video_b=video_b
        )["result"][0]
        assert tuple(on.shape) == tuple(off.shape)
        assert float((on - off).abs().sum()) > 0.0

        # normalization + no inputs -> safe, non-crashing
        norm = node.compare_videos("Bad", "bad", "Z", "yes", "bad", False)
        nmeta = norm["ui"]["deno_video_compare"][0]
        assert nmeta["mode"] == "Slider"
        assert nmeta["split_position"] == 0.5
        assert nmeta["toggle_image"] == "B"
        assert nmeta["swap"] is True
        assert nmeta["have_a"] is False and nmeta["have_b"] is False
        assert nmeta["files_a"] == [] and nmeta["files_b"] == []
        z = norm["result"][0]
        assert z.ndim == 4 and z.shape[-1] == 3
    finally:
        if fp_previous is None:
            sys.modules.pop("folder_paths", None)
        else:
            sys.modules["folder_paths"] = fp_previous


def test_rtx_vfx_target_size_modes_match_visible_resize_choices():
    load_package()
    vfx_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_easy_upscale"]

    assert vfx_module._safe_divisible_by("1") == 1
    assert vfx_module._safe_divisible_by("32") == 32
    assert vfx_module._safe_divisible_by("bad") == 1

    assert vfx_module._target_size(1920, 1080, "VSR Medium", "Manual", 2.0, 2.0, 1234, 777, 1, "16:9") == (
        1234,
        777,
    )
    assert vfx_module._target_size(1920, 1080, "VSR Medium", "Manual", 2.0, 2.0, 1234, 777, 32, "16:9") == (
        1248,
        800,
    )
    assert vfx_module._target_size(1920, 1080, "Denoise Medium", "Manual", 2.0, 2.0, 1234, 777, 1, "16:9") == (
        1920,
        1080,
    )
    assert vfx_module._target_size(1920, 1080, "VSR Medium", "Scale", 2.0, 2.0, 0, 0, 32, "16:9") == (
        3840,
        2176,
    )
    assert vfx_module._target_size(1920, 1080, "VSR Medium", "Scale", 2.0, 2.0, 0, 0, 1, "16:9") == (
        3840,
        2160,
    )
    assert vfx_module._target_size(1280, 720, "VSR Medium", "Manual", 2.0, 2.0, 1920, 1080, 1, "16:9") == (
        1920,
        1080,
    )

    keep_width, keep_height = vfx_module._target_size(1920, 1080, "VSR Medium", "Keep Ratio", 2.0, 2.0, 0, 0, 1, "16:9")
    keep_aligned_width, keep_aligned_height = vfx_module._target_size(
        1920,
        1080,
        "VSR Medium",
        "Keep Ratio",
        2.0,
        2.0,
        0,
        0,
        32,
        "16:9",
    )
    preset_width, preset_height = vfx_module._target_size(
        1920,
        1080,
        "VSR Medium",
        "Preset Ratio",
        2.0,
        2.0,
        0,
        0,
        1,
        "9:16",
    )

    assert keep_width > keep_height
    assert keep_width > 0
    assert keep_height > 0
    assert abs((keep_width / keep_height) - (16 / 9)) / (16 / 9) < 0.01
    assert keep_aligned_width % 32 == 0
    assert keep_aligned_height % 32 == 0
    assert abs((keep_aligned_width / keep_aligned_height) - (16 / 9)) / (16 / 9) < 0.01
    assert preset_height > preset_width
    assert abs((preset_width / preset_height) - (9 / 16)) < 0.01


def test_rtx_vfx_create_effect_error_is_user_readable():
    load_package()
    vfx_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_easy_upscale"]

    class BrokenVideoSuperRes:
        def __init__(self, *_args, **_kwargs):
            raise RuntimeError("NvVFX_CreateEffect failed: The requested feature is not yet implemented (code -2)")

    try:
        vfx_module._create_vfx_effect(BrokenVideoSuperRes, object(), 0, "VSR Medium")
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected user-readable NVIDIA VFX runtime error")

    assert "NVIDIA RTX VFX is installed" in message
    assert "VideoSuperRes" in message
    assert "driver" in message
    assert "RTX GPU" in message
    assert "DENO runtime path" in message
    assert "Loaded nvvfx path" in message
    assert "code -2" in message


def test_rtx_vfx_code_minus_two_reports_broadcast_runtime_conflict():
    load_package()
    vfx_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_easy_upscale"]

    class BrokenVideoSuperRes:
        def __init__(self, *_args, **_kwargs):
            raise RuntimeError("NvVFX_CreateEffect failed: The requested feature is not yet implemented (code -2)")

    original_loader = vfx_module.loaded_broadcast_vfx_module_paths
    try:
        vfx_module.loaded_broadcast_vfx_module_paths = lambda: [
            r"C:\ProgramData\NVIDIA\NGX\models\nvbcast\versions\2309\files\170_E658703\NVVideoEffects.dll"
        ]
        try:
            vfx_module._create_vfx_effect(BrokenVideoSuperRes, object(), 0, "VSR Medium")
        except RuntimeError as exc:
            message = str(exc)
        else:
            raise AssertionError("expected Broadcast conflict NVIDIA VFX runtime error")
    finally:
        vfx_module.loaded_broadcast_vfx_module_paths = original_loader

    assert "NVIDIA Broadcast/NGX VFX DLLs" in message
    assert "Broadcast's Upscale effect" in message
    assert "disable the Broadcast-based RTX node" in message
    assert "code -2" in message


def test_rtx_vfx_runtime_marker_prefers_ascii_copy_without_reloading_native_module():
    load_package()
    runtime_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_runtime"]

    old_module = types.ModuleType("nvvfx")
    old_module.__path__ = [str(REPO_ROOT / "python_embeded" / "Lib" / "site-packages" / "nvvfx")]
    sys.modules["nvvfx"] = old_module
    sys.modules["nvvfx.effects"] = types.ModuleType("nvvfx.effects")
    original_sys_path = list(sys.path)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            package_dir = temp_root / "deno-custom-nodes"
            runtime_path = (
                temp_root
                / "DENO"
                / "nvvfx_runtime"
                / runtime_module.expected_python_runtime_segment()
                / "nvidia_vfx_0_1_0_1"
            )
            (package_dir / "tools").mkdir(parents=True)
            (runtime_path / "nvvfx").mkdir(parents=True)
            (package_dir / "tools" / "DENO_RTX_VFX_runtime_path.txt").write_text(
                str(runtime_path),
                encoding="utf-8",
            )

            preferred = runtime_module.prefer_rtx_vfx_runtime_path(package_dir)

            assert preferred == runtime_path
            assert sys.path[0] == str(runtime_path)
            assert sys.modules["nvvfx"] is old_module
            assert "nvvfx.effects" in sys.modules
    finally:
        sys.path[:] = original_sys_path
        sys.modules.pop("nvvfx", None)
        sys.modules.pop("nvvfx.effects", None)


def test_rtx_vfx_runtime_marker_ignores_wrong_python_version():
    load_package()
    runtime_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_runtime"]
    current_segment = runtime_module.expected_python_runtime_segment()
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
        assert runtime_module.read_rtx_vfx_runtime_path(package_dir) is None

        marker.write_text(str(right_runtime), encoding="utf-8")
        assert runtime_module.read_rtx_vfx_runtime_path(package_dir) == right_runtime


def test_rtx_vfx_import_stops_if_another_nvvfx_path_is_already_loaded():
    load_package()
    vfx_module = sys.modules["comfyui_deno_custom_nodes.deno_rtx_vfx_easy_upscale"]
    runtime_path = REPO_ROOT / "DENO" / "nvvfx_runtime" / "py312" / "nvidia_vfx_0_1_0_1"
    loaded_path = REPO_ROOT / "python_embeded" / "Lib" / "site-packages" / "nvvfx"

    originals = (
        vfx_module.prefer_rtx_vfx_runtime_path,
        vfx_module.current_nvvfx_package_path,
        vfx_module.loaded_nvvfx_module_paths,
        vfx_module.read_rtx_vfx_runtime_path,
    )

    try:
        vfx_module.prefer_rtx_vfx_runtime_path = lambda: runtime_path
        vfx_module.current_nvvfx_package_path = lambda: loaded_path
        vfx_module.loaded_nvvfx_module_paths = lambda: {
            "nvvfx": str(loaded_path),
            "nvvfx._ext": str(loaded_path / "_ext.pyd"),
        }
        vfx_module.read_rtx_vfx_runtime_path = lambda: runtime_path

        try:
            vfx_module._import_vfx()
        except RuntimeError as exc:
            message = str(exc)
        else:
            raise AssertionError("expected path-conflict RuntimeError")

        assert "already loaded from another nvvfx path" in message
        assert "cannot be safely switched" in message
        assert "Loaded native modules" in message
        assert "nvvfx._ext" in message
    finally:
        (
            vfx_module.prefer_rtx_vfx_runtime_path,
            vfx_module.current_nvvfx_package_path,
            vfx_module.loaded_nvvfx_module_paths,
            vfx_module.read_rtx_vfx_runtime_path,
        ) = originals


def test_multi_image_loader_returns_batch_and_int_dimensions():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["image_paths"][0] == "STRING"
    assert input_types["required"]["mode"][0] == ["Keep Input Ratio", "Preset Ratio", "Manual Input"]
    assert input_types["required"]["mode"][1]["default"] == "Keep Input Ratio"
    assert "16:9" in input_types["required"]["ratio_preset"][0]
    assert input_types["required"]["megapixels"][0] == "FLOAT"
    assert input_types["required"]["divisible_by"][0] == ["1", "8", "16", "32", "64", "128"]
    assert input_types["required"]["divisible_by"][1]["default"] == "32"
    assert input_types["required"]["interpolation"][0][0] == "lanczos"
    assert node_cls.RETURN_TYPES == ("IMAGE", "INT", "INT")
    assert node_cls.RETURN_NAMES == ("multi_output", "width", "height")
    assert node_cls.CATEGORY == "Deno/Image"


def test_multi_image_loader_frontend_supports_copy_image_context_menu():
    script = (REPO_ROOT / "web" / "js" / "deno_extra_nodes.js").read_text(encoding="utf-8")

    assert 'card.addEventListener("contextmenu"' in script
    assert "showImageCardMenu(event, path, image)" in script
    assert '"Copy Image"' in script
    assert "copyImageElementToClipboard" in script
    assert "resolveInputImageCopyPath" in script
    assert "/deno/input-image-path" in script
    assert "ClipboardItem" in script
    assert '"image/png"' in script
    assert "Full image path copied." in script
    assert "Copy image failed. Path copied." in script


def test_ltx_loader_frontend_preserves_saved_model_values_when_lists_refresh_empty():
    script = (REPO_ROOT / "web" / "js" / "deno_extra_nodes.js").read_text(encoding="utf-8")

    assert "LTX_MODEL_WIDGET_NAMES" in script
    assert "shouldPreserveStaleLtxModelValue(widgetName, currentValue)" in script
    assert "return savedValue !== \"\" && savedValue !== LTX_NONE_VALUE" in script


def test_multi_image_loader_errors_when_selected_images_cannot_load():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]

    try:
        node_cls().load_images(
            "missing_input_image.png",
            "Manual Input",
            "16:9",
            1.0,
            512,
            512,
            "32",
            "nearest",
            "Stretch",
        )
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected missing selected image to raise RuntimeError")

    assert "Selected image file(s) could not be loaded" in message
    assert "missing_input_image.png" in message
    assert "Re-add the image" in message


def test_multi_image_loader_rejects_empty_image_selection():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]

    validation_result = node_cls.VALIDATE_INPUTS(
        image_paths="",
        mode="Manual Input",
        ratio_preset="16:9",
        divisible_by="32",
        interpolation="nearest",
        resize_method="Center Crop (Fill)",
    )

    assert "No images are selected" in validation_result
    assert "Upload or Input Folder" in validation_result

    with pytest.raises(RuntimeError, match="No images are selected"):
        node_cls().load_images(
            "",
            "Manual Input",
            "16:9",
            1.0,
            512,
            512,
            "32",
            "nearest",
            "Center Crop (Fill)",
        )


def test_multi_image_loader_validates_selected_files_before_execution():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        subfolder = Path(temp_dir) / "shots"
        subfolder.mkdir()
        image_file = subfolder / "nested.png"
        Image.new("RGB", (2, 2), color=(12, 34, 56)).save(image_file)

        folder_paths.get_input_directory = lambda: temp_dir
        try:
            valid_result = node_cls.VALIDATE_INPUTS("shots/nested.png")
            missing_result = node_cls.VALIDATE_INPUTS("shots/missing.png")
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert valid_result is True
    assert "missing or unreadable before execution" in missing_result
    assert "shots/missing.png" in missing_result


def test_multi_image_loader_validate_inputs_only_bypasses_needed_saved_combos():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]

    signature = inspect.signature(node_cls.VALIDATE_INPUTS)

    assert list(signature.parameters) == [
        "image_paths",
        "mode",
        "ratio_preset",
        "divisible_by",
        "interpolation",
        "resize_method",
    ]
    assert all(parameter.kind is not inspect.Parameter.VAR_KEYWORD for parameter in signature.parameters.values())


def test_multi_image_loader_is_changed_hashes_selected_file_contents():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        image_file = Path(temp_dir) / "sample.png"
        Image.new("RGB", (2, 2), color=(1, 2, 3)).save(image_file)

        folder_paths.get_input_directory = lambda: temp_dir
        try:
            first_hash = node_cls.IS_CHANGED(
                "sample.png",
                "Manual Input",
                "16:9",
                1.0,
                512,
                512,
                "32",
                "nearest",
                "Stretch",
            )
            Image.new("RGB", (2, 2), color=(4, 5, 6)).save(image_file)
            second_hash = node_cls.IS_CHANGED(
                "sample.png",
                "Manual Input",
                "16:9",
                1.0,
                512,
                512,
                "32",
                "nearest",
                "Stretch",
            )
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert len(first_hash) == 64
    assert first_hash != second_hash


def test_advanced_image_source_loader_declares_external_outputs():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoAdvancedImageSourceLoader"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["image_paths"][0] == "STRING"
    assert input_types["required"]["mode"][0] == ["Keep Input Ratio", "Preset Ratio", "Manual Input"]
    assert input_types["required"]["disabled_image_paths"][0] == "STRING"
    assert input_types["required"]["resize_method"][0] == [
        "Center Crop (Fill)",
        "Fit (Letterbox/Pillarbox)",
        "Top Crop (Fill)",
        "Bottom Crop (Fill)",
    ]
    assert input_types["required"]["recursive_folders"][0] == "BOOLEAN"
    assert input_types["required"]["list_output_mode"][0] == ["Original Size", "Match Batch Size"]
    assert input_types["optional"]["images"][0] == "IMAGE"
    assert node_cls.RETURN_TYPES == ("IMAGE", "IMAGE", "INT", "INT", "INT")
    assert node_cls.RETURN_NAMES == ("batch", "image_list", "width", "height", "image_count")
    assert node_cls.OUTPUT_IS_LIST == (False, True, False, False, False)
    assert node_cls.CATEGORY == "Deno/Image"


def test_advanced_image_source_loader_filters_disabled_sources():
    load_package()
    advanced = sys.modules["comfyui_deno_custom_nodes.deno_advanced_image_source_loader"]

    sources = ["keep.png", "skip.png", "folder"]

    assert advanced._filter_disabled_sources(sources, "skip.png\nmissing.png") == ["keep.png", "folder"]


def test_multi_image_loader_input_browser_lists_newest_files_first():
    load_package()
    board = sys.modules["comfyui_deno_custom_nodes.deno_multi_image_board"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        old_file = Path(temp_dir) / "old.png"
        new_file = Path(temp_dir) / "new.jpg"
        ignored_file = Path(temp_dir) / "note.txt"
        old_file.write_bytes(b"old")
        new_file.write_bytes(b"new")
        ignored_file.write_text("ignore", encoding="utf-8")
        os.utime(old_file, (100, 100))
        os.utime(new_file, (200, 200))
        os.utime(ignored_file, (300, 300))

        folder_paths.get_input_directory = lambda: temp_dir
        try:
            files = board._list_input_folder_images()
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert [entry["name"] for entry in files] == ["new.jpg", "old.png"]
    assert files[0]["mtime"] > files[1]["mtime"]


def test_multi_image_loader_input_browser_lists_subfolders():
    load_package()
    board = sys.modules["comfyui_deno_custom_nodes.deno_multi_image_board"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        subfolder = Path(temp_dir) / "shots"
        subfolder.mkdir()
        root_file = Path(temp_dir) / "root.png"
        nested_file = subfolder / "nested.webp"
        ignored_file = subfolder / "note.txt"
        root_file.write_bytes(b"root")
        nested_file.write_bytes(b"nested")
        ignored_file.write_text("ignore", encoding="utf-8")

        folder_paths.get_input_directory = lambda: temp_dir
        try:
            root_listing = board._list_input_folder_entries()
            nested_listing = board._list_input_folder_entries("shots")
            traversal_listing = board._list_input_folder_entries("../outside")
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert root_listing["path"] == ""
    assert [entry["path"] for entry in root_listing["folders"]] == ["shots"]
    assert [entry["name"] for entry in root_listing["files"]] == ["root.png"]
    assert nested_listing["path"] == "shots"
    assert nested_listing["parent"] == ""
    assert [entry["name"] for entry in nested_listing["files"]] == ["shots/nested.webp"]
    assert traversal_listing["folders"] == []
    assert traversal_listing["files"] == []


def test_multi_image_loader_resolves_copy_path_inside_input_folder():
    load_package()
    board = sys.modules["comfyui_deno_custom_nodes.deno_multi_image_board"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        subfolder = Path(temp_dir) / "shots"
        subfolder.mkdir()
        image_file = subfolder / "nested.png"
        image_file.write_bytes(b"image")
        outside_file = Path(temp_dir).parent / "outside.png"

        folder_paths.get_input_directory = lambda: temp_dir
        try:
            resolved_path = board._resolve_input_image_copy_path("shots/nested.png")
            missing_path = board._resolve_input_image_copy_path("shots/missing.png")
            traversal_path = board._resolve_input_image_copy_path("../outside.png")
            drive_like_path = board._resolve_input_image_copy_path("C:/outside.png")
            absolute_path = board._resolve_input_image_copy_path(str(image_file))
            outside_absolute_path = board._resolve_input_image_copy_path(str(outside_file))
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert resolved_path == os.path.realpath(image_file)
    assert absolute_path == os.path.realpath(image_file)
    assert missing_path is None
    assert traversal_path is None
    assert drive_like_path is None
    assert outside_absolute_path is None


def test_advanced_image_source_loader_lists_and_expands_external_folders():
    load_package()
    advanced = sys.modules["comfyui_deno_custom_nodes.deno_advanced_image_source_loader"]

    with tempfile.TemporaryDirectory() as temp_dir:
        subfolder = Path(temp_dir) / "refs"
        subfolder.mkdir()
        root_file = Path(temp_dir) / "root.png"
        nested_file = subfolder / "nested.webp"
        ignored_file = subfolder / "note.txt"
        root_file.write_bytes(b"root")
        nested_file.write_bytes(b"nested")
        ignored_file.write_text("ignore", encoding="utf-8")

        root_listing = advanced._list_external_folder_entries(temp_dir)
        nested_listing = advanced._list_external_folder_entries(temp_dir, "refs")
        traversal_listing = advanced._list_external_folder_entries(temp_dir, "../outside")
        flat_sources = advanced._expand_image_sources([temp_dir], recursive_folders=False)
        recursive_sources = advanced._expand_image_sources([temp_dir], recursive_folders=True)
        duplicate_sources = advanced._expand_image_sources([str(root_file), str(root_file)], recursive_folders=False)

    assert root_listing["root"]
    assert [entry["path"] for entry in root_listing["folders"]] == ["refs"]
    assert [Path(entry["path"]).name for entry in root_listing["files"]] == ["root.png"]
    assert nested_listing["path"] == "refs"
    assert [Path(entry["path"]).name for entry in nested_listing["files"]] == ["nested.webp"]
    assert traversal_listing["folders"] == []
    assert [Path(path).name for path in flat_sources] == ["root.png"]
    assert [Path(path).name for path in recursive_sources] == ["nested.webp", "root.png"]
    assert [Path(path).name for path in duplicate_sources] == ["root.png", "root.png"]


def test_advanced_image_source_loader_skips_unreadable_external_folder():
    load_package()
    advanced = sys.modules["comfyui_deno_custom_nodes.deno_advanced_image_source_loader"]
    original_listdir = advanced.os.listdir

    with tempfile.TemporaryDirectory() as temp_dir:
        def deny_listdir(path):
            if Path(path) == Path(temp_dir):
                raise PermissionError("access denied")
            return original_listdir(path)

        advanced.os.listdir = deny_listdir
        try:
            sources = advanced._expand_image_sources([temp_dir], recursive_folders=False)
        finally:
            advanced.os.listdir = original_listdir

    assert sources == []


def test_advanced_remote_image_redirect_revalidates_target():
    load_package()
    advanced = sys.modules["comfyui_deno_custom_nodes.deno_advanced_image_source_loader"]

    class RedirectToLocalhostOpener:
        def open(self, request, timeout):
            raise urllib.error.HTTPError(
                request.full_url,
                302,
                "Found",
                {"Location": "http://127.0.0.1/private.png"},
                None,
            )

    original_opener = advanced._REMOTE_IMAGE_OPENER
    advanced._REMOTE_IMAGE_OPENER = RedirectToLocalhostOpener()
    try:
        try:
            advanced._read_remote_image_bytes("http://8.8.8.8/image.png")
            assert False, "redirect to localhost should be rejected"
        except ValueError as exc:
            assert "redirect target" in str(exc)
    finally:
        advanced._REMOTE_IMAGE_OPENER = original_opener


def test_ltx_sequencer_declares_sync_controls():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXSequencer"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["strength_sync"][0] == "BOOLEAN"
    assert input_types["required"]["bypass"][0] == "BOOLEAN"
    assert list(input_types["required"]).index("bypass") == list(input_types["required"]).index("strength_sync") + 1
    assert node_cls.RETURN_TYPES == ("CONDITIONING", "CONDITIONING", "LATENT")
    assert node_cls.CATEGORY == "Deno/LTX"


def test_ltx_sequencer_bypass_returns_inputs_without_touching_vae():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXSequencer"]

    positive = [{"positive": True}]
    negative = [{"negative": True}]
    latent = {"samples": object()}

    result = node_cls.execute(
        positive,
        negative,
        object(),
        latent,
        object(),
        1,
        "frames",
        24,
        True,
        True,
    )

    assert result == (positive, negative, latent)


def test_ltx_model_loader_declares_three_loading_modes():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTX23PresetLoader"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["pipeline_mode"][0] == ["Checkpoint Style", "KJ Style", "GGUF Style"]
    assert input_types["required"]["gguf_unet_name"][0] == ["__none__"]
    assert input_types["required"]["clip_device"][0] == ["default", "cpu"]
    assert node_cls.RETURN_TYPES == ("MODEL", "CLIP", "VAE", "VAE")
    assert node_cls.RETURN_NAMES == ("model", "clip", "video_vae", "audio_vae")
    assert node_cls.CATEGORY == "Deno/LTX"
    assert "ComfyUI-GGUF" in node_cls.DESCRIPTION
    assert "comfyui-kjnodes" in node_cls.DESCRIPTION


def test_ltx_model_loader_only_lists_installed_model_files():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTX23PresetLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_filename_list = folder_paths.get_filename_list

    installed_files = {
        "checkpoints": ["ltx-2.3-22b-dev-fp8.safetensors"],
        "diffusion_models": [
            "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
            "not-a-gguf.safetensors",
        ],
        "text_encoders": [
            "gemma_3_12B_it_fp4_mixed.safetensors",
            "ltx-2.3_text_projection_bf16.safetensors",
        ],
        "vae": ["LTX23_video_vae_bf16.safetensors", "LTX23_audio_vae_bf16.safetensors"],
        "unet": ["LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"],
        "unet_gguf": [],
    }

    try:
        folder_paths.get_filename_list = lambda folder_name: installed_files.get(folder_name, [])
        required = node_cls.INPUT_TYPES()["required"]
    finally:
        folder_paths.get_filename_list = original_get_filename_list

    checkpoint_options, checkpoint_config = required["checkpoint_name"]
    assert checkpoint_options == ["ltx-2.3-22b-dev-fp8.safetensors"]
    assert checkpoint_config["default"] == "ltx-2.3-22b-dev-fp8.safetensors"
    assert "ltx-2.3-22b-dev.safetensors" not in checkpoint_options

    diffusion_options, diffusion_config = required["diffusion_model_name"]
    assert diffusion_options == [
        "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors",
        "not-a-gguf.safetensors",
    ]
    assert diffusion_config["default"] == "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors"
    assert "ltx-2.3-22b-dev_transformer_only_bf16.safetensors" not in diffusion_options

    gguf_options, gguf_config = required["gguf_unet_name"]
    assert gguf_options == ["LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"]
    assert gguf_config["default"] == "LTX-2.3-22B-distilled-1.1-Q4_K_M.gguf"

    text_encoder_options, text_encoder_config = required["text_encoder_name"]
    assert text_encoder_options[0] == "gemma_3_12B_it_fp4_mixed.safetensors"
    assert text_encoder_config["default"] == "gemma_3_12B_it_fp4_mixed.safetensors"
    assert "comfy_gemma_3_12B_it.safetensors" not in text_encoder_options

    text_projection_options, text_projection_config = required["text_projection_name"]
    assert text_projection_options[0] == "ltx-2.3_text_projection_bf16.safetensors"
    assert text_projection_config["default"] == "ltx-2.3_text_projection_bf16.safetensors"
    assert "ltx-2.3-22b-dev.safetensors" not in text_projection_options


def test_ltx_model_loader_uses_none_when_only_unrelated_models_exist():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTX23PresetLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_filename_list = folder_paths.get_filename_list

    installed_files = {
        "checkpoints": ["sdxl_base.safetensors"],
        "diffusion_models": ["flux-dev.safetensors"],
        "text_encoders": ["clip_l.safetensors"],
        "vae": ["ae.safetensors"],
        "unet": ["z-image-Q3_K_M.gguf"],
        "unet_gguf": [],
    }

    try:
        folder_paths.get_filename_list = lambda folder_name: installed_files.get(folder_name, [])
        required = node_cls.INPUT_TYPES()["required"]
    finally:
        folder_paths.get_filename_list = original_get_filename_list

    for field_name in (
        "checkpoint_name",
        "diffusion_model_name",
        "gguf_unet_name",
        "video_vae_name",
        "audio_vae_name",
        "text_encoder_name",
        "text_projection_name",
    ):
        options, config = required[field_name]
        assert options[0] == "__none__"
        assert config["default"] == "__none__"

    assert "sdxl_base.safetensors" in required["checkpoint_name"][0]
    assert "flux-dev.safetensors" in required["diffusion_model_name"][0]
    assert "z-image-Q3_K_M.gguf" in required["gguf_unet_name"][0]
    assert "ae.safetensors" in required["video_vae_name"][0]
    assert "clip_l.safetensors" in required["text_encoder_name"][0]


def test_ltx_model_loader_promotes_recommended_files_inside_subfolders():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTX23PresetLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_filename_list = folder_paths.get_filename_list

    installed_files = {
        "checkpoints": [
            "other/model.safetensors",
            "LTX2.3/ltx-2.3-22b-dev-fp8.safetensors",
        ],
        "diffusion_models": [],
        "text_encoders": [],
        "vae": [],
        "unet": [],
        "unet_gguf": [],
    }

    try:
        folder_paths.get_filename_list = lambda folder_name: installed_files.get(folder_name, [])
        checkpoint_options, checkpoint_config = node_cls.INPUT_TYPES()["required"]["checkpoint_name"]
    finally:
        folder_paths.get_filename_list = original_get_filename_list

    assert checkpoint_options[0] == "LTX2.3/ltx-2.3-22b-dev-fp8.safetensors"
    assert checkpoint_config["default"] == "LTX2.3/ltx-2.3-22b-dev-fp8.safetensors"


def test_ltx_model_loader_frontend_hides_text_projection_for_checkpoint_style():
    script = (REPO_ROOT / "web" / "js" / "deno_extra_nodes.js").read_text(encoding="utf-8")

    assert 'toggleWidgetVisibility(getWidget(this, "checkpoint_name"), checkpointMode);' in script
    assert 'toggleWidgetVisibility(getWidget(this, "text_projection_name"), kjMode || ggufMode);' in script


def test_ltx_model_loader_checkpoint_style_uses_checkpoint_as_clip_projection():
    package = load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx23_preset_loader"]
    nodes_module = sys.modules["nodes"]
    comfy_extras = sys.modules["comfy_extras"]

    calls = {}
    nodes_lt_audio = types.ModuleType("comfy_extras.nodes_lt_audio")

    class LTXAVTextEncoderLoader:
        @classmethod
        def execute(cls, text_encoder, ckpt_name, device="default"):
            calls["clip"] = (text_encoder, ckpt_name, device)
            return ("checkpoint_style_clip",)

    class LTXVAudioVAELoader:
        @classmethod
        def execute(cls, ckpt_name):
            calls["audio_vae"] = ckpt_name
            return ("audio_vae",)

    class DualCLIPLoaderMustNotRun:
        def load_clip(self, *args, **kwargs):
            raise AssertionError("Checkpoint Style must not use DualCLIPLoader/text_projection.")

    nodes_lt_audio.LTXAVTextEncoderLoader = LTXAVTextEncoderLoader
    nodes_lt_audio.LTXVAudioVAELoader = LTXVAudioVAELoader

    original_dual_clip_loader = nodes_module.DualCLIPLoader
    original_nodes_lt_audio = sys.modules.get("comfy_extras.nodes_lt_audio")
    original_comfy_extras_nodes_lt_audio = getattr(comfy_extras, "nodes_lt_audio", None)

    nodes_module.DualCLIPLoader = DualCLIPLoaderMustNotRun
    sys.modules["comfy_extras.nodes_lt_audio"] = nodes_lt_audio
    comfy_extras.nodes_lt_audio = nodes_lt_audio
    try:
        result = module.DenoLTX23PresetLoader().load_ltx_model(
            "Checkpoint Style",
            "ltx-2.3-22b-dev.safetensors",
            "gemma_3_12B_it_fp4_mixed.safetensors",
            "unused_text_projection.safetensors",
            "unused_diffusion.safetensors",
            "__none__",
            "unused_video_vae.safetensors",
            "unused_audio_vae.safetensors",
            "cpu",
            "default",
        )
    finally:
        nodes_module.DualCLIPLoader = original_dual_clip_loader
        if original_nodes_lt_audio is None:
            sys.modules.pop("comfy_extras.nodes_lt_audio", None)
        else:
            sys.modules["comfy_extras.nodes_lt_audio"] = original_nodes_lt_audio
        if original_comfy_extras_nodes_lt_audio is None:
            try:
                delattr(comfy_extras, "nodes_lt_audio")
            except AttributeError:
                pass
        else:
            comfy_extras.nodes_lt_audio = original_comfy_extras_nodes_lt_audio

    assert result == ("model", "checkpoint_style_clip", "video_vae", "audio_vae")
    assert calls["clip"] == ("gemma_3_12B_it_fp4_mixed.safetensors", "ltx-2.3-22b-dev.safetensors", "cpu")
    assert calls["audio_vae"] == "ltx-2.3-22b-dev.safetensors"


def test_ltx_model_loader_has_friendly_gguf_dependency_errors():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx23_preset_loader"]

    assert "ComfyUI-GGUF" in module.GGUF_INSTALL_MESSAGE
    assert "comfyui-kjnodes" in module.KJ_INSTALL_MESSAGE

    original = RuntimeError(
        "Error(s) in loading state_dict for LTXAVModel: "
        "size mismatch for transformer_blocks.0.scale_shift_table"
    )
    friendly = module._friendly_ltx23_shape_error(original)
    assert "Update ComfyUI core and ComfyUI-GGUF" in str(friendly)

    audio_original = TypeError("AudioVAE.__init__() takes 2 positional arguments but 3 were given")
    audio_friendly = module._friendly_ltx_audio_vae_error(audio_original, "LTX23_audio_vae_bf16.safetensors")
    assert "Update ComfyUI core, comfyui-kjnodes, and ComfyUI-GGUF" in str(audio_friendly)
    assert "LTX23_audio_vae_bf16.safetensors" in str(audio_friendly)


def test_ltx_model_setup_helper_declares_output_node_and_safe_root_widget():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXModelDownloader"]
    input_types = node_cls.INPUT_TYPES()

    assert node_cls.RETURN_TYPES == ()
    assert node_cls.OUTPUT_NODE is True
    assert node_cls.CATEGORY == "Deno/Setup"
    assert "model_root" in input_types["required"]
    assert input_types["required"]["model_root"][0] == "STRING"
    assert input_types["required"]["model_root"][1]["default"]
    assert "presets_json" in input_types["required"]
    assert input_types["required"]["presets_json"][0] == "STRING"
    assert "ltx_23_8gb_vram" in input_types["required"]["presets_json"][1]["default"]
    assert node_cls().run(input_types["required"]["model_root"][1]["default"]) == ()


def test_ltx_model_setup_helper_input_types_do_not_scan_model_folders(monkeypatch):
    package = load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXModelDownloader"]

    def fail_rglob(*_args, **_kwargs):
        raise AssertionError("INPUT_TYPES must not recursively scan model folders")

    monkeypatch.setattr(module.Path, "rglob", fail_rglob)

    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["model_root"][1]["default"]


def test_ltx_model_setup_helper_payload_does_not_scan_model_folders(monkeypatch):
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_models_dir = folder_paths.models_dir

    def fail_rglob(*_args, **_kwargs):
        raise AssertionError("Default setup-helper payload must not recursively scan model folders")

    monkeypatch.setattr(module.Path, "rglob", fail_rglob)

    with tempfile.TemporaryDirectory() as temp_dir:
        models_root = Path(temp_dir) / "models"
        models_root.mkdir()
        folder_paths.models_dir = str(models_root)
        try:
            payload = module._build_payload(None, module._default_presets_state())
        finally:
            folder_paths.models_dir = original_models_dir

    assert payload["mode"] == "manual_setup_helper"
    assert payload["files"]
    assert "existing_count" in payload


def test_ltx_model_setup_helper_preserves_builtin_preset_for_old_workflows():
    package = load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]

    parsed = module._parse_presets_state(
        {
            "active_preset_id": "custom_pack",
            "presets": [
                {
                    "id": "custom_pack",
                    "title": "Custom Pack",
                    "files": [
                        {
                            "url": "https://example.com/model.safetensors",
                            "target_subdir": "checkpoints",
                            "filename": "model.safetensors",
                        }
                    ],
                }
            ],
        }
    )

    assert parsed["presets"][0]["id"] == "ltx_23_8gb_vram"
    assert parsed["presets"][1]["id"] == "custom_pack"
    assert parsed["active_preset_id"] == "custom_pack"


def test_ltx_model_setup_helper_checks_registered_model_folder_names():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_folder_map = folder_paths.folder_names_and_paths

    with tempfile.TemporaryDirectory() as temp_dir:
        models_root = Path(temp_dir) / "Models"
        text_encoder_dir = models_root / "TextEncoders"
        text_encoder_dir.mkdir(parents=True)
        target_file = text_encoder_dir / "flux2-klein-9b-uncensored-q6_k.gguf"
        target_file.write_bytes(b"ready")

        folder_paths.folder_names_and_paths = {
            "text_encoders": ([str(text_encoder_dir)], set()),
        }
        try:
            result = module._public_custom_file(
                str(models_root),
                {
                    "url": "https://example.com/flux2-klein-9b-uncensored-q6_k.gguf",
                    "target_subdir": "text_encoders",
                    "filename": "flux2-klein-9b-uncensored-q6_k.gguf",
                    "size": 1,
                },
                0,
            )
        finally:
            folder_paths.folder_names_and_paths = original_folder_map

    assert result["status"] == "exists"
    assert result["found_by"] == "registered"
    assert result["relative_path"].replace("\\", "/") == "TextEncoders/flux2-klein-9b-uncensored-q6_k.gguf"


def test_ltx_model_setup_helper_does_not_probe_unregistered_nearby_roots():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_models_dir = folder_paths.models_dir
    original_folder_map = folder_paths.folder_names_and_paths

    with tempfile.TemporaryDirectory() as temp_dir:
        base = Path(temp_dir)
        comfy_root = base / "ComfyUI"
        default_root = comfy_root / "models"
        sibling_root = base / "ComfyUI Model" / "models"
        default_root.mkdir(parents=True)
        sibling_root.mkdir(parents=True)
        (sibling_root / "unet").mkdir()
        (sibling_root / "text_encoders").mkdir()
        (sibling_root / "vae").mkdir()

        folder_paths.models_dir = str(default_root)
        folder_paths.folder_names_and_paths = {}
        try:
            roots = module._collect_model_roots()
        finally:
            folder_paths.models_dir = original_models_dir
            folder_paths.folder_names_and_paths = original_folder_map

    paths = {Path(root["path"]) for root in roots}
    assert default_root.resolve() in paths
    assert sibling_root.resolve() not in paths


def test_ltx_model_setup_helper_includes_registered_yaml_model_root():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_models_dir = folder_paths.models_dir
    original_folder_map = folder_paths.folder_names_and_paths

    with tempfile.TemporaryDirectory() as temp_dir:
        default_root = Path(temp_dir) / "ComfyUI" / "models"
        yaml_root = Path(temp_dir) / "ComfyUI Model" / "models"
        default_root.mkdir(parents=True)
        (yaml_root / "unet").mkdir(parents=True)
        (yaml_root / "text_encoders").mkdir()
        (yaml_root / "vae").mkdir()

        folder_paths.models_dir = str(default_root)
        folder_paths.folder_names_and_paths = {
            "text_encoders": ([str(yaml_root / "text_encoders")], set()),
            "vae": ([str(yaml_root / "vae")], set()),
        }
        try:
            payload = module._build_payload(None, module._default_presets_state(), model_root=str(yaml_root))
        finally:
            folder_paths.models_dir = original_models_dir
            folder_paths.folder_names_and_paths = original_folder_map

    assert Path(payload["models_root"]) == default_root.resolve()
    assert payload["legacy_model_root"] == str(yaml_root)
    assert any(Path(root["path"]) == yaml_root.resolve() for root in payload["roots"])
    assert payload["selection_mode"] == "auto"


def test_ltx_model_setup_helper_autoselects_registered_root_with_ready_files():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_models_dir = folder_paths.models_dir
    original_folder_map = folder_paths.folder_names_and_paths
    package = {
        "id": "tiny_pack",
        "title": "Tiny Pack",
        "files": [
            {
                "url": "https://example.com/model-a.safetensors",
                "target_subdir": "diffusion_models",
                "filename": "model-a.safetensors",
                "size": 1,
            },
            {
                "url": "https://example.com/model-b.safetensors",
                "target_subdir": "text_encoders",
                "filename": "model-b.safetensors",
                "size": 1,
            },
        ],
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        default_root = Path(temp_dir) / "ComfyUI" / "models"
        registered_root = Path(temp_dir) / "ComfyUI Model" / "models"
        default_root.mkdir(parents=True)
        diffusion_dir = registered_root / "diffusion_models"
        text_dir = registered_root / "text_encoders"
        diffusion_dir.mkdir(parents=True)
        text_dir.mkdir()
        (diffusion_dir / "model-a.safetensors").write_bytes(b"a")
        (text_dir / "model-b.safetensors").write_bytes(b"b")

        folder_paths.models_dir = str(default_root)
        folder_paths.folder_names_and_paths = {
            "diffusion_models": ([str(diffusion_dir)], set()),
            "text_encoders": ([str(text_dir)], set()),
        }
        try:
            payload = module._build_payload(None, module._default_presets_state(), package, str(default_root))
            explicit = module._build_payload(payload["roots"][0]["id"], module._default_presets_state(), package)
        finally:
            folder_paths.models_dir = original_models_dir
            folder_paths.folder_names_and_paths = original_folder_map

    assert Path(payload["models_root"]) == default_root.resolve()
    assert payload["existing_count"] == 2
    assert all(file["status"] == "exists" for file in payload["files"])
    assert Path(explicit["models_root"]) == default_root.resolve()
    assert explicit["existing_count"] == 2
    assert all(file["status"] == "exists" for file in explicit["files"])
    assert explicit["selection_mode"] == "explicit"


def test_ltx_model_setup_helper_uses_path_stable_root_ids_and_invalid_fallback():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]
    folder_paths = sys.modules["folder_paths"]
    original_models_dir = folder_paths.models_dir
    original_folder_map = folder_paths.folder_names_and_paths

    with tempfile.TemporaryDirectory() as temp_dir:
        default_root = Path(temp_dir) / "ComfyUI" / "models"
        shared_root = Path(temp_dir) / "ComfyUI Model" / "models"
        default_root.mkdir(parents=True)
        diffusion_dir = shared_root / "diffusion_models"
        text_dir = shared_root / "text_encoders"
        diffusion_dir.mkdir(parents=True)
        text_dir.mkdir()

        folder_paths.models_dir = str(default_root)
        folder_paths.folder_names_and_paths = {
            "diffusion_models": ([str(diffusion_dir)], set()),
            "text_encoders": ([str(text_dir)], set()),
        }
        try:
            first_roots = module._collect_model_roots()
            invalid = module._build_payload("root_missing_legacy_id", module._default_presets_state())
            folder_paths.folder_names_and_paths = {
                "text_encoders": ([str(text_dir)], set()),
                "diffusion_models": ([str(diffusion_dir)], set()),
            }
            second_roots = module._collect_model_roots()
        finally:
            folder_paths.models_dir = original_models_dir
            folder_paths.folder_names_and_paths = original_folder_map

    first_ids = {Path(root["path"]): root["id"] for root in first_roots}
    second_ids = {Path(root["path"]): root["id"] for root in second_roots}
    assert first_ids[shared_root.resolve()] == second_ids[shared_root.resolve()]
    assert first_ids[shared_root.resolve()].startswith("root_")
    assert invalid["selection_mode"] == "auto"
    assert invalid["selection_reason"] == "invalid_explicit_root_fallback"


def test_ltx_model_setup_helper_deep_scan_is_explicit_opt_in():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]

    with tempfile.TemporaryDirectory() as temp_dir:
        models_root = Path(temp_dir) / "models"
        nested_dir = models_root / "diffusion_models" / "Flux"
        nested_dir.mkdir(parents=True)
        target_file = nested_dir / "flux2-klein-9b-kv-fp8.safetensors"
        target_file.write_bytes(b"ready")

        default_result = module._public_custom_file(
            str(models_root),
            {
                "url": "https://example.com/flux2-klein-9b-kv-fp8.safetensors",
                "target_subdir": "diffusion_models",
                "filename": "flux2-klein-9b-kv-fp8.safetensors",
                "size": 1,
            },
            0,
        )
        scanned = module._resolve_target_file(
            str(models_root),
            "diffusion_models",
            "flux2-klein-9b-kv-fp8.safetensors",
            1,
            allow_deep_scan=True,
        )

    assert default_result["status"] == "missing"
    assert scanned["status"] == "exists"
    assert scanned["found_by"] == "subfolder"
    assert scanned["relative_path"].replace("\\", "/") == "diffusion_models/Flux/flux2-klein-9b-kv-fp8.safetensors"


def test_ltx_model_setup_helper_has_no_backend_download_code():
    source = (REPO_ROOT / "deno_ltx_model_downloader.py").read_text(encoding="utf-8")

    assert "urlopen" not in source
    assert "urllib.request" not in source
    assert "subprocess" not in source
    assert "write_bytes(" not in source
    assert "shutil.copy" not in source
    assert "ClientSession" not in source
    assert "resolve_civitai" not in source


def test_ltx_model_setup_helper_frontend_keeps_auto_root_selection_available():
    script = (REPO_ROOT / "web" / "js" / "deno_ltx_model_downloader.js").read_text(encoding="utf-8")

    assert "r2026.06.23-root-intent-c" in script
    assert "rootMode" in script
    assert "explicitRootId" in script
    assert "effectiveRootId" in script
    assert "refreshSequence" in script
    assert 'return state.rootMode === "explicit" ? state.explicitRootId : "";' in script
    assert 'refreshButton.addEventListener("click", () => refreshInfo())' in script
    assert "selectRootByUser(rootInfo.id)" in script
    assert "resetRootToAuto();" in script
    assert 'refreshButton.addEventListener("click", () => refreshInfo(state.selectedRootId))' not in script
    assert "userSelectedRootId" not in script
    assert "selectedRootId" not in script
    assert "const sequence = ++state.refreshSequence;" in script
    assert "sequence !== state.refreshSequence" in script


def test_ltx_multi_lora_loader_declares_compact_av_controls():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXMultiLoraLoader"]
    input_types = node_cls.INPUT_TYPES()
    required = input_types["required"]

    assert "advanced_mode" not in required
    assert required["active_loras"][0] == "INT"
    assert required["lora_1"][0][0] == "__none__"
    assert required["strength_1"][0] == "FLOAT"
    assert required["video_1"][0] == "FLOAT"
    assert required["audio_1"][0] == "FLOAT"
    assert required["trigger_1"][0] == "STRING"
    assert required["description_1"][1]["multiline"] is True
    assert list(required).index("trigger_1") > list(required).index("video_8")
    assert node_cls.RETURN_TYPES == ("MODEL", "CLIP")
    assert node_cls.RETURN_NAMES == ("model", "clip")


def test_multi_lora_loader_declares_generic_model_clip_controls():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiLoraLoader"]
    input_types = node_cls.INPUT_TYPES()
    required = input_types["required"]

    assert node_cls.CATEGORY == "Deno/LoRA"
    assert input_types["optional"]["clip"][0] == "CLIP"
    assert required["active_loras"][0] == "INT"
    assert required["lora_1"][0][0] == "__none__"
    assert required["model_strength_1"][0] == "FLOAT"
    assert required["clip_strength_1"][0] == "FLOAT"
    assert "video_1" not in required
    assert "audio_1" not in required
    assert required["trigger_1"][0] == "STRING"
    assert required["description_1"][1]["multiline"] is True
    assert node_cls.RETURN_TYPES == ("MODEL", "CLIP")
    assert node_cls.RETURN_NAMES == ("model", "clip")


def test_ltx_multi_lora_frontend_supports_power_lora_style_row_order_menu():
    script = (REPO_ROOT / "web" / "js" / "deno_ltx_multi_lora.js").read_text(encoding="utf-8")

    assert '"Move Up"' in script
    assert '"Move Down"' in script
    assert '"Remove"' in script
    assert "function moveLoraSlot" in script
    assert "function swapSlotValues" in script
    assert "swapSlotValues(node, fromIndex, toIndex)" in script


def test_ltx_multi_lora_frontend_preserves_saved_missing_lora_values():
    script = (REPO_ROOT / "web" / "js" / "deno_ltx_multi_lora.js").read_text(encoding="utf-8")

    assert "captureLtxMultiLoraSerializedWidgetValues(info)" in script
    assert "function ltxMultiLoraLegacySerializedWidgetNames()" in script
    assert "if (values.length >= legacyNames.length)" in script
    assert "__denoLtxMultiLoraConfiguredWidgetValues" in script
    assert "applyLtxMultiLoraSerializedValuesToWidgets(this, savedValues)" in script
    assert "preserveLoraComboValue(widget, savedValues[name])" in script
    assert "currentLoraValues(node)" in script
    assert "preserveLoraOptionValues(values, currentLoraValues(node))" in script
    assert "updateBackendLoraWidgets(node, loraOptionsSync(node))" in script
    assert "syncLtxMultiLoraSerializedWidgetValues(this)" in script


def test_ltx_multi_lora_frontend_covers_legacy_45_value_public_fixture():
    script = (REPO_ROOT / "web" / "js" / "deno_ltx_multi_lora.js").read_text(encoding="utf-8")
    workflow = json.loads((REPO_ROOT / "tests" / "fixtures" / "public_workflows" / "ltx23_8gb_vram.json").read_text(encoding="utf-8"))
    ltx_nodes = [node for node in workflow["nodes"] if node.get("type") == "DenoLTXMultiLoraLoader"]

    assert ltx_nodes
    assert len(ltx_nodes[0]["widgets_values"]) == 45
    assert "function ltxMultiLoraLegacySerializedWidgetNames()" in script
    assert "return Object.fromEntries(legacyNames.map((name, index) => [name, values[index]]));" in script


def test_multi_lora_frontend_uses_generic_model_clip_columns():
    script = (REPO_ROOT / "web" / "js" / "deno_multi_lora.js").read_text(encoding="utf-8")

    assert 'const NODE_NAME = "DenoMultiLoraLoader"' in script
    assert '"model_strength"' in script
    assert '"clip_strength"' in script
    assert '"Model strength"' in script
    assert '"CLIP strength"' in script
    assert '"video"' not in script
    assert '"audio"' not in script
    assert "/object_info/DenoMultiLoraLoader" in script
    assert "function moveLoraSlot" in script
    assert "function swapSlotValues" in script


def test_multi_lora_frontend_preserves_saved_missing_lora_values():
    script = (REPO_ROOT / "web" / "js" / "deno_multi_lora.js").read_text(encoding="utf-8")

    assert "captureMultiLoraSerializedWidgetValues(info)" in script
    assert "function multiLoraLegacySerializedWidgetNames()" in script
    assert "if (values.length >= legacyNames.length)" in script
    assert "__denoMultiLoraConfiguredWidgetValues" in script
    assert "applyMultiLoraSerializedValuesToWidgets(this, savedValues)" in script
    assert "preserveLoraComboValue(widget, savedValues[name])" in script
    assert "currentLoraValues(node)" in script
    assert "preserveLoraOptionValues(values, currentLoraValues(node))" in script
    assert "updateBackendLoraWidgets(node, loraOptionsSync(node))" in script
    assert "syncMultiLoraSerializedWidgetValues(this)" in script


def test_ltx_multi_lora_metadata_fields_do_not_affect_loading():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXMultiLoraLoader"]
    model = object()
    clip = object()
    assert node_cls().load_multi_lora(model, clip, 1, lora_1="__none__", trigger_1="deno style") == (model, clip)


def test_multi_lora_metadata_fields_do_not_affect_loading():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiLoraLoader"]
    model = object()
    clip = object()
    assert node_cls().load_multi_lora(model, clip, 1, lora_1="__none__", trigger_1="deno style") == (model, clip)


def test_multi_lora_validation_skips_disabled_missing_saved_lora():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiLoraLoader"]
    assert inspect.getfullargspec(node_cls.VALIDATE_INPUTS).varkw == "kwargs"
    folder_paths = sys.modules["folder_paths"]
    original_get_filename_list = folder_paths.get_filename_list
    try:
        folder_paths.get_filename_list = lambda folder_name: ["present.safetensors"] if folder_name == "loras" else []
        assert (
            node_cls.VALIDATE_INPUTS(
                active_loras=2,
                enabled_1=True,
                lora_1="present.safetensors",
                enabled_2=False,
                lora_2="removed_usb/missing.safetensors",
            )
            is True
        )
        assert node_cls.VALIDATE_INPUTS(active_loras=1, enabled_1=True, lora_1="removed_usb/missing.safetensors") == (
            "LoRA slot 1 is enabled but not installed: removed_usb/missing.safetensors"
        )
    finally:
        folder_paths.get_filename_list = original_get_filename_list


def test_ltx_multi_lora_validation_skips_disabled_missing_saved_lora():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXMultiLoraLoader"]
    assert inspect.getfullargspec(node_cls.VALIDATE_INPUTS).varkw == "kwargs"
    folder_paths = sys.modules["folder_paths"]
    original_get_filename_list = folder_paths.get_filename_list
    try:
        folder_paths.get_filename_list = lambda folder_name: ["present.safetensors"] if folder_name == "loras" else []
        assert (
            node_cls.VALIDATE_INPUTS(
                active_loras=2,
                enabled_1=True,
                lora_1="present.safetensors",
                enabled_2=False,
                lora_2="removed_usb/missing.safetensors",
            )
            is True
        )
        assert node_cls.VALIDATE_INPUTS(active_loras=1, enabled_1=True, lora_1="removed_usb/missing.safetensors") == (
            "LTX LoRA slot 1 is enabled but not installed: removed_usb/missing.safetensors"
        )
    finally:
        folder_paths.get_filename_list = original_get_filename_list


def test_ltx23_preset_validation_skips_inactive_missing_saved_model_values():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTX23PresetLoader"]
    folder_paths = sys.modules["folder_paths"]
    original_get_full_path = folder_paths.get_full_path

    present = {
        ("checkpoints", "present.ckpt"),
        ("text_encoders", "present_text.safetensors"),
    }

    def fake_get_full_path(folder_name, filename):
        return str(REPO_ROOT / "models" / folder_name / filename) if (folder_name, filename) in present else None

    try:
        folder_paths.get_full_path = fake_get_full_path
        assert (
            node_cls.VALIDATE_INPUTS(
                pipeline_mode="Checkpoint Style",
                checkpoint_name="present.ckpt",
                text_encoder_name="present_text.safetensors",
                gguf_unet_name="removed_usb/missing.gguf",
                video_vae_name="removed_usb/missing_video_vae.safetensors",
                audio_vae_name="removed_usb/missing_audio_vae.safetensors",
                text_projection_name="removed_usb/missing_projection.safetensors",
                clip_device="default",
                weight_dtype="default",
            )
            is True
        )
        missing_active = node_cls.VALIDATE_INPUTS(
            pipeline_mode="Checkpoint Style",
            checkpoint_name="removed_usb/missing.ckpt",
            text_encoder_name="present_text.safetensors",
            clip_device="default",
            weight_dtype="default",
        )
        assert "checkpoint_name" in missing_active
        assert "not installed" in missing_active
    finally:
        folder_paths.get_full_path = original_get_full_path


def test_ltx_prompt_guide_encodes_prompts_and_outputs_integer_frame_rate():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXPromptGuide"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["clip"][0] == "CLIP"
    assert input_types["required"]["frame_rate"][0] == "INT"
    assert input_types["required"]["frame_rate"][1]["step"] == 1
    assert node_cls.RETURN_TYPES == ("CONDITIONING", "CONDITIONING", "INT")
    assert node_cls.RETURN_NAMES == ("positive", "negative", "frame_rate")
    assert node_cls.CATEGORY == "Deno/LTX"
    assert node_cls.VALIDATE_INPUTS(language="Retired Language") is True


def test_ltx_prompt_guide_keeps_negative_prompt_when_collapsed():
    package = load_package()

    class RecordingClip:
        def __init__(self):
            self.texts = []

        def tokenize(self, text):
            self.texts.append(text)
            return text

        def encode_from_tokens_scheduled(self, tokens):
            return {"encoded": tokens}

    clip = RecordingClip()
    node = package.DenoLTXPromptGuide()
    positive, negative, frame_rate = node.build(
        clip=clip,
        positive_prompt="hello",
        language="Auto",
        frame_rate=25,
        show_negative_prompt=False,
        negative_prompt="low quality",
    )

    assert clip.texts == ["hello", "low quality"]
    assert positive == {"encoded": "hello"}
    assert negative == {"encoded": "low quality"}
    assert frame_rate == 25


def test_bernini_prompt_guide_declares_kj_style_contract_and_frontend_summary():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoBerniniPromptGuide"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["clip"][0] == "CLIP"
    assert input_types["required"]["task_type"][0] == [
        "Default",
        "Text to Image",
        "Text to Video",
        "Image Edit",
        "Subject to Image",
        "Image to Video",
        "Video Edit",
        "Subject to Video",
        "Video Propagation",
        "Reference Video Edit",
        "Ads Insertion",
        "Video Reference Control",
        "Motion / Style Edit",
    ]
    assert "custom_system_prompt" not in input_types["required"]
    assert input_types["required"]["task_type"][1]["default"] == "Reference Video Edit"
    assert input_types["required"]["reference_prompt_helper"][1]["default"] is True
    assert input_types["required"]["negative_preset"][0] == [
        "Official Wan2.2",
        "Empty",
    ]
    assert input_types["required"]["show_negative_prompt"][1]["default"] is True
    assert "色调艳丽" in input_types["required"]["negative_prompt"][1]["default"]
    assert node_cls.RETURN_TYPES == ("CONDITIONING", "CONDITIONING")
    assert node_cls.RETURN_NAMES == ("positive", "negative")
    assert node_cls.CATEGORY == "Deno/Bernini"

    script = (REPO_ROOT / "web" / "js" / "deno_bernini_prompt_guide.js").read_text(encoding="utf-8")
    assert 'const NODE_NAME = "DenoBerniniPromptGuide";' in script
    assert 'const SUMMARY_HEIGHT = 40;' in script
    assert 'const POSITIVE_PROMPT_DEFAULT_HEIGHT = 112;' in script
    assert 'const POSITIVE_PROMPT_MIN_HEIGHT = 86;' in script
    assert 'const DEFAULT_NODE_WIDTH = 660;' in script
    assert '"System Prompt"' in script
    assert "Image to Video" in script
    assert "moveWidgetAfter(node, summary, taskAnchor, promptAnchor)" in script
    assert 'custom: "Custom System Prompt"' not in script
    assert "System Prompt ·" not in script
    assert "image0 reference naming" not in script
    assert "drawSingleLineText(ctx, systemPrompt" in script
    assert "TASK_HELP" in script
    assert "showTaskInfoPanel(node, event)" in script
    assert "drawInfoIcon(ctx, iconX, iconY, this.infoPressed)" in script
    assert 'opened ? "Hide" : "Show"' in script
    assert 'opened ? "open" : "closed"' not in script
    assert "Use for" in script
    assert "Prompt example" in script
    assert "Subject to Video" in script
    assert "fitPositivePromptToNodeHeight(node, requestedHeight, hadExplicitRequestedHeight)" in script
    assert "__denoBerniniRequestedHeight" in script
    assert "delete node.__denoBerniniRequestedHeight;" in script
    assert "queueMicrotask(() => {" in script
    assert "const minPromptHeight = explicitResize ? POSITIVE_PROMPT_MIN_HEIGHT : POSITIVE_PROMPT_DEFAULT_HEIGHT;" in script
    assert "const fixedHeight = Number(computed[1]) - currentPromptHeight;" in script
    assert "widget.__denoBerniniMinHeight" in script
    assert "return widget.__denoBerniniMinHeight;" in script
    assert "return Number.MAX_SAFE_INTEGER;" in script
    assert "installResizeHandler(node)" in script
    assert "const height = Math.max(requestedHeight || 0, computed[1], 180);" in script
    assert "ellipsis" not in script
    assert "LiteGraph.WIDGET_BGCOLOR" in script
    assert "NegativeToggleWidget" in script
    assert 'drawSectionHeader(ctx, 15, y, width - 30, height, "Negative Prompt"' in script
    assert 'setWidgetHidden(getWidget(node, "reference_prompt_helper"), true);' in script
    assert 'widget.hidden = hidden;' in script
    assert "applyNegativePresetToPrompt(node, { force: true })" in script
    assert "OFFICIAL_WAN22_NEGATIVE_PROMPT" in script
    assert "stale oversized node bodies" in script
    assert "const height = Math.max(computed[1], 180);" not in script
    assert "Math.max(node.size?.[1] || computed[1], computed[1], 180)" not in script
    assert 'widget.type = "converted-widget";' in script
    assert "serializeValue()" in script


def test_bernini_prompt_guide_builds_chatlike_prompt_with_reference_hint_and_official_negative():
    package = load_package()

    class RecordingClip:
        def __init__(self):
            self.texts = []

        def tokenize(self, text):
            self.texts.append(text)
            return text

        def encode_from_tokens_scheduled(self, tokens):
            return {"encoded": tokens}

    clip = RecordingClip()
    node = package.DenoBerniniPromptGuide()
    positive, negative = node.build(
        clip=clip,
        task_type="Reference Video Edit",
        positive_prompt="Replace the jacket with the shirt from image0. Keep the camera motion unchanged.",
        reference_prompt_helper=True,
        negative_preset="Official Wan2.2",
        show_negative_prompt=True,
        negative_prompt="",
        custom_system_prompt="",
    )

    assert clip.texts[0].startswith("You are a helpful assistant specialized in video editing with reference.")
    assert "Use reference images in order as image0, image1, image2" in clip.texts[0]
    assert "Replace the jacket with the shirt from image0." in clip.texts[0]
    assert "色调艳丽" in clip.texts[1]
    assert positive == {"encoded": clip.texts[0]}
    assert negative == {"encoded": clip.texts[1]}


def test_bernini_prompt_guide_legacy_custom_system_falls_back_to_default_and_keeps_negative_presets():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoBerniniPromptGuide"]

    assert node_cls.VALIDATE_INPUTS(
        task_type="custom",
        negative_preset="Official Wan2.2 + Custom",
    ) is True

    class RecordingClip:
        def __init__(self):
            self.texts = []

        def tokenize(self, text):
            self.texts.append(text)
            return text

        def encode_from_tokens_scheduled(self, tokens):
            return {"encoded": tokens}

    clip = RecordingClip()
    node = package.DenoBerniniPromptGuide()
    node.build(
        clip=clip,
        task_type="custom",
        positive_prompt="Add a soft rim light. Keep the subject identity.",
        reference_prompt_helper=True,
        negative_preset="Official Wan2.2 + Custom",
        show_negative_prompt=True,
        negative_prompt="watermark, logo",
        custom_system_prompt="You are a careful Bernini editing assistant.",
    )

    assert clip.texts[0] == (
        "You are a helpful assistant. "
        "Add a soft rim light. Keep the subject identity."
    )
    assert "Use reference images in order" not in clip.texts[0]
    assert "色调艳丽" in clip.texts[1]
    assert clip.texts[1].endswith("watermark, logo")


def test_bernini_prompt_guide_outputs_visible_negative_prompt_edits():
    package = load_package()

    class RecordingClip:
        def __init__(self):
            self.texts = []

        def tokenize(self, text):
            self.texts.append(text)
            return text

        def encode_from_tokens_scheduled(self, tokens):
            return {"encoded": tokens}

    clip = RecordingClip()
    node = package.DenoBerniniPromptGuide()
    node.build(
        clip=clip,
        task_type="Text to Video",
        positive_prompt="A calm camera push toward a glass sculpture.",
        reference_prompt_helper=False,
        negative_preset="Official Wan2.2",
        show_negative_prompt=True,
        negative_prompt="watermark, logo, bad hands",
        custom_system_prompt="",
    )

    assert clip.texts[1] == "watermark, logo, bad hands"


def test_local_llm_refiner_declares_batch_prompt_contract_and_frontend_preview():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLocalLLMRefiner"]
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    original_list_models = module.list_local_llm_models

    def fake_list_models(provider, server_url):
        if provider == "LM Studio":
            return [{"id": "lm-studio-model-b", "label": "LM Studio Model B", "loaded": False}]
        if provider == "llama.cpp":
            return [{"id": "llama-cpp-model-c", "label": "llama.cpp Model C", "loaded": False}]
        if provider == "vLLM":
            return [{"id": "vllm-model-d", "label": "vLLM Model D", "loaded": False}]
        if provider == "Custom":
            return [{"id": "custom-model-e", "label": "Custom Model E", "loaded": False}]
        return [{"id": "ollama-model-a", "label": "Ollama Model A", "loaded": False}]

    module.list_local_llm_models = fake_list_models
    try:
        input_types = node_cls.INPUT_TYPES()
    finally:
        module.list_local_llm_models = original_list_models

    required = input_types["required"]
    optional = input_types["optional"]
    hidden = input_types["hidden"]
    assert node_cls.INPUT_IS_LIST is True
    assert node_cls.OUTPUT_IS_LIST == (True,)
    assert node_cls.RETURN_TYPES == ("STRING",)
    assert node_cls.RETURN_NAMES == ("result",)
    assert node_cls.CATEGORY == "Deno/LLM"
    assert node_cls.IS_CHANGED(seed_mode=["fixed"], seed=[1], prompt=["same"]) == node_cls.IS_CHANGED(seed_mode=["fixed"], seed=[1], prompt=["same"])
    assert "help rewrite or review prompt text" in node_cls.DESCRIPTION
    assert "Ollama, LM Studio, llama.cpp, vLLM, or Custom" in node_cls.DESCRIPTION
    assert "An optional IMAGE input" in node_cls.DESCRIPTION
    assert "connect STRING into Prompt" in node_cls.DESCRIPTION
    assert "AUDIO" not in node_cls.DESCRIPTION
    assert required["provider"][0] == ["Ollama", "LM Studio", "llama.cpp", "vLLM", "Custom"]
    assert "server_url" not in required
    assert "model" not in required
    assert required["ollama_model"][0] == ["ollama-model-a"]
    assert required["lm_studio_model"][0] == ["lm-studio-model-b"]
    assert required["custom_server_url"][0] == "STRING"
    assert required["custom_server_url"][1]["default"] == "http://127.0.0.1:8000/v1"
    assert required["custom_model"][0] == "STRING"
    assert required["system_prompt"][1]["default"] == ""
    assert required["system_prompt"][1]["multiline"] is True
    assert "forceInput" not in required["system_prompt"][1]
    assert required["prompt"][0] == "STRING"
    assert required["prompt"][1]["default"] == ""
    assert required["prompt"][1]["multiline"] is True
    assert "forceInput" not in required["prompt"][1]
    assert "user_prompt" not in required
    assert required["seed_mode"][0] == ["fixed", "increment", "decrement", "randomize"]
    assert "control_after_generate" not in required
    assert required["model_memory"][0] == ["Unload after run", "Keep for minutes", "Keep loaded"]
    assert required["comfy_vram_policy"][0] == [
        "Auto: unload only before first LLM call",
        "Always unload before each LLM call",
        "Never unload before LLM call",
    ]
    assert required["comfy_vram_policy"][1]["default"] == "Auto: unload only before first LLM call"
    assert optional["image"][0] == "IMAGE"
    assert "user_prompt" not in optional
    assert "audio" not in optional
    assert list(hidden) == ["unique_id"]
    assert "reviewer_state" not in hidden

    script = (REPO_ROOT / "web" / "js" / "deno_local_llm_refiner.js").read_text(encoding="utf-8")
    assert 'const NODE_NAME = "DenoLocalLLMRefiner";' in script
    assert 'const DISPLAY_NAME = "(Deno) Local LLM Loader";' in script
    assert 'const GATE_DISPLAY_NAME = "(Deno) Local LLM Reviewer";' in script
    assert 'const LEGACY_DISPLAY_NAMES = new Set([OLD_DISPLAY_NAME, "(Deno) Local LLM Prompt Helper"]);' in script
    assert "normalizeNodeTitle" in script
    assert "node.resizable = true" in script
    assert 'eventApi.addEventListener("deno-local-llm-progress"' in script
    assert "window?.comfyAPI?.api?.api" in script
    assert "progressListenerApis" in script
    assert "localLLMStateByNodeId = new Map()" in script
    assert "function setLocalLLMNodeState(node, patch)" in script
    assert "function getLocalLLMNodeState(node)" in script
    assert "app?.rootGraph || app?.graph || app?.canvas?.graph" in script
    assert "function localLLMCandidateGraphs()" in script
    assert "function localLLMGraphNodes(graph)" in script
    assert "Array.isArray(graph?._nodes)" in script
    assert "idMap.get(id) || idMap.get(numericId)" in script
    assert "localNodes.length === 1 ? localNodes[0] : null" in script
    assert "Refresh Models" in script
    assert "Stop LLM" in script
    assert "stopLocalModel" in script
    assert "isStopButtonWidget" in script
    assert "removeStopButtonWidgets" in script
    assert "ensureSingleStopButton" in script
    assert "Unload LLM" in script
    assert "unloadLocalModel" in script
    assert "isLocalLLMBusyState" in script
    assert "unload blocked" in script
    assert "payload.busy" in script
    assert "payload?.manual_unavailable" in script
    assert "/deno/local_llm/stop" in script
    assert "/deno/local_llm/unload" in script
    assert "COMFY_VRAM_VALUES" in script
    assert "Unload ComfyUI Models Setting" in script
    assert "Auto: unload only before first LLM call" in script
    assert "Always unload before each LLM call" in script
    assert "Never unload before LLM call" in script
    assert "normalizeComfyVramValue" in script
    assert "syncComfyVramWidgetOptions" in script
    assert "comfy_vram_policy" in script
    assert "ModelPickerWidget" not in script
    assert "showModelMenu" not in script
    assert "normalizeModelChoices" in script
    assert "updateModelChoices" in script
    assert "modelChoiceValuesWithSavedValue" in script
    assert "hasUsableSavedModelValue" in script
    assert "normalizeLocalLLMLoaderSerializedValues" in script
    assert "normalizeLocalLLMLoaderWidgetValues" in script
    assert "preserveLocalLLMLoaderSavedComboOptions" in script
    assert "preserveWidgetOption" in script
    assert "const configure = nodeType.prototype.configure" in script
    assert "saved model not found" in script
    assert "!currentStillExists" not in script
    assert "installProgressListener" in script
    assert "function localLLMProgressStatePatch(node, detail)" in script
    assert "progressError = String(payload.error || \"\")" in script
    assert "exception_message: progressError" in script
    assert 'eventApi.addEventListener("execution_error"' in script
    assert "isLocalLLMOwnExecutionError" in script
    assert "allowSingleFallback: false" in script
    assert "nodeType && nodeType !== NODE_NAME" in script
    assert "Incoming Prompt" in script
    assert "localLLMExecutionErrorMessage" in script
    assert "Context window is too small for this prompt." in script
    assert 'status: "error"' in script
    assert 'hasError ? "Error" : "Result"' in script
    assert 'openPreviewTextDialog(node, "result", isError ? "Error" : "Result", text)' in script
    assert "updateOpenPreviewTextDialogs(node, next)" in script
    assert "installGraphScan" in script
    assert "syncLoaderOutputSlots" in script
    assert "removeLegacyWidgets" in script
    assert "setActiveProviderModelVisibility" in script
    assert "migrateLegacyModelWidgets" in script
    assert "repairSavedWidgetValues" in script
    assert "repairPromptWidgetValue" in script
    assert "isShiftedPromptWidgetValue" in script
    assert "SHIFTED_MODEL_WIDGET_VALUES" in script
    assert "isShiftedModelWidgetValue" in script
    assert "repairModelWidgetValue" in script
    assert "Missing saved model:" in script
    assert "displayModelValueForCurrentChoices" in script
    assert "isUnavailableModelWidgetValue" in script
    assert "Refresh Models and select an installed local LLM model before unloading." in script
    assert "inferWidgetType" in script
    assert "denoLocalLLMModelChoicesByProvider" in script
    assert "Ollama Model" in script
    assert "LM Studio Model" in script
    assert "llama.cpp" in script
    assert "vLLM" in script
    assert "Custom" in script
    assert "LEGACY_PROVIDER_CUSTOM" in script
    assert "Server URL" in script
    assert "custom_server_url" in script
    assert "LEGACY_CUSTOM_DEFAULT_URL" in script
    assert "wrapCustomServerCallback" not in script
    assert "repairLegacyProviderValues" in script
    assert "isShiftedCustomModelValue" in script
    assert "function safeAppGraph" in script
    assert "installReviewerGraphToPromptHook" in script
    assert "function applyLocalLLMAfterGenerateSeedModes(output)" in script
    assert "applyLocalLLMAfterGenerateSeedModes(result?.output)" in script
    assert "function nextLocalLLMSeedValue(seed, mode)" in script
    assert "collectReviewerAncestors" in script
    assert "collectPromptLinkAncestors" in script
    assert "pruneUnreferencedPromptAncestors" in script
    assert "applyReviewerPassMode" in script
    assert 'review: "Manual pass."' in script
    assert "applyReviewerRegenerateMode" in script
    assert "__DENO_LOCAL_LLM_REVIEWER_TEST_HOOK__" in script
    assert "queueReviewerWithMode" in script
    assert "_denoReviewerSubmitMode" in script
    assert "Regenerating the path into this reviewer." in script
    assert "app.graph" not in script
    assert "removePromptWidgets" in script
    assert "const LOADER_WIDGET_SOCKET_NAMES = new Set([" in script
    loader_socket_block = script.split("const LOADER_WIDGET_SOCKET_NAMES = new Set([", 1)[1].split("]);", 1)[0]
    assert '"provider",' in script
    assert '"Provider",' in script
    assert '"ollama_model",' in script
    assert '"lm_studio_model",' in script
    assert '"prompt"' not in loader_socket_block
    assert '"Prompt"' not in loader_socket_block
    assert "normalizeLoaderPromptInputSocket" in script
    assert "setPromptInputSocketFields" in script
    assert "const PROMPT_WIDGET_SIDE_INSET = 0;" in script
    assert "removeLoaderWidgetInputSockets" in script
    assert "isLoaderWidgetSocket" in script
    assert "input?.localized_name" in script
    assert "copyLinkedPromptTextIntoWidget" in script
    assert "removeWidgetElement" in script
    assert "migrateLocalLLMPromptInputNames" in script
    assert "ensureSystemPromptWidget" in script
    assert "ensurePromptWidget" in script
    assert "addPromptTextBox" not in script
    assert "positionPromptWidget" in script
    assert "loaderPromptWidgetHeight" in script
    assert "PROMPT_WIDGET_SIDE_INSET" in script
    assert "element.style.marginLeft" in script
    assert "removeLegacyPromptBoxDomElements" in script
    assert "deno-local-llm-prompt-box" in script
    assert "ensureSeedModeWidget" in script
    assert "SEED_MODE_VALUES" in script
    assert "addSystemPromptButton" in script
    assert "openSystemPromptDialog" in script
    assert "Optional system prompt. Empty is OK." in script
    assert "SYSTEM_PROMPT_PRESET_STORAGE_KEY" in script
    assert "Prompt Only" in script
    assert "PROMPT_ONLY_SYSTEM_PROMPT" in script
    assert "DENO_FINAL_PROMPT:" in script
    assert "Reviewer JSON" in script
    assert "Return only valid JSON. Do not write markdown." in script
    assert "writeSystemPromptUserPresets" in script
    assert 'loadPresetButton.textContent = "Load";' in script
    assert 'savePresetButton.textContent = "Save Preset";' in script
    assert 'saveButton.textContent = "Save to Node";' in script
    assert "Use This" not in script
    assert "dedupeKnownWidgets" in script
    assert "removeRefreshButtonWidgets" in script
    assert "removeStopButtonWidgets" in script
    assert "removeUnloadButtonWidgets" in script
    assert 'node.addWidget?.("button", "Refresh Models", "Refresh Models", () => refreshModels(node))' in script
    assert 'node.addWidget?.("button", "Stop LLM", "Stop LLM", () => stopLocalModel(node))' in script
    assert 'node.addWidget?.("button", "Unload LLM", "Unload LLM", () => unloadLocalModel(node))' in script
    assert 'drawWideButton(ctx, 15, y, width - 30, height, "Refresh Models"' not in script
    assert "schedulePostSetupCleanup" in script
    assert "Model list is ready. Choose from the ${provider} model row." in script
    assert "LocalLLMPreviewWidget" in script
    assert "function loaderPreviewWidgetLayoutWidth(node, width)" in script
    assert "function loaderPreviewWidgetDrawWidth(node, width)" in script
    assert "return [loaderPreviewWidgetLayoutWidth(this.__node, width), PREVIEW_HEIGHT];" in script
    assert "const drawWidth = loaderPreviewWidgetDrawWidth(node, width);" in script
    assert "const panelW = Math.max(1, drawWidth - 30);" in script
    assert "ctx.rect(0, y, drawWidth, actualHeight);" in script
    assert "const actualHeight = Math.max(expectedHeight, Number(height) || 0);" in script
    assert "maxPreviewLinesForHeight(resultH)" in script
    assert 'openPreviewTextDialog(node, "thinking", "Thinking", text)' in script
    assert 'openPreviewTextDialog(node, "result", isError ? "Error" : "Result", text)' in script
    assert "buttonBounds: this.expandBounds.result" in script
    assert "function openPreviewTextDialog" in script
    assert "setPreviewTextDialogContent" in script
    assert "denoLocalLLMExpanded" not in script
    assert "const manualHeight = Number(node.size?.[1]) || 0;" in script
    assert "Math.max(manualHeight, computed[1], 180)" in script
    assert "wrapModelMemoryCallback(node)" in script
    assert 'modelMemory !== "Keep for minutes"' in script
    assert "installPreviewWheelHandler" in script
    assert "attachGlobalPreviewWheelHandler" in script
    assert 'window.addEventListener?.("wheel", previewWheelHandler, { capture: true, passive: false })' in script
    assert "PREVIEW_SCROLLBAR_TRACK_WIDTH = 8" in script
    assert "PREVIEW_SCROLLBAR_HIT_WIDTH = 18" in script
    assert "attachPreviewPointerHandler" in script
    assert "handleCanvasPreviewPointerMove" in script
    assert "handleCanvasPreviewPointerDown" in script
    assert "handleCanvasPreviewPointerUp" in script
    assert 'canvas.addEventListener("pointerdown", previewPointerDownHandler, { capture: true, passive: false })' in script
    assert 'canvas.addEventListener("pointermove", previewPointerMoveHandler, { capture: true, passive: false })' in script
    assert 'canvas.addEventListener("pointerup", previewPointerUpHandler, { capture: true, passive: false })' in script
    assert 'canvas.style.cursor = "ns-resize"' in script
    assert 'document.body.style.cursor = "ns-resize"' in script
    assert "previewScrollbarKeyFromPos" in script
    assert "previewScrollbarHitFromEvent" in script
    assert "isDenoLocalLLMModalEvent" in script
    assert ".deno-local-llm-preview-modal, .deno-local-llm-system-prompt-modal" in script
    assert 'textBox.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true })' in script
    assert "wrapPreviewWheelProcessor" in script
    assert "canvasObj.processMouseWheel = function (event)" in script
    assert "currentGraphCanvasElement" in script
    assert 'document.querySelector?.("#graph-canvas")' in script
    assert 'canvas.addEventListener("wheel", previewWheelHandler, { capture: true, passive: false })' in script
    assert "previewWheelHitFromEvent" in script
    assert "graphPointCandidatesFromWheelEvent" in script
    assert "canvasObj.graph_mouse" in script
    assert "canvasObj.canvas_mouse" in script
    assert "previewNodeCandidates" in script
    assert "canvasObj.node_over" in script
    assert "canvasPointFromWheelEvent" in script
    assert 'typeof event.offsetX === "number"' in script
    assert "event.stopImmediatePropagation?.()" in script
    assert "handlePreviewWheel(event, pos, node, this.blockBounds, this.blockLineInfo)" in script
    assert "drawPreviewScrollbar" in script
    assert "handlePreviewScrollbarPointer" in script
    assert "previewScrollbarBounds" in script
    assert 'previewWindow(node, "result"' in script
    assert "splitPreviewLinesForWidth(ctx, resultText" in script
    assert "previewTextWidth(panelW, false)" in script
    assert "previewTextWidth(panelW, true)" in script
    assert "Thinking" in script
    assert "Result" in script
    assert "GateStatusWidget" in script
    assert "ReviewerControlsWidget" in script
    assert "function reviewerWidgetDrawWidth" in script
    assert "function reviewerWidgetLayoutWidth" in script
    assert "function reviewerRefreshSize" in script
    assert "Math.min(rawWidth, nodeWidth)" in script
    assert "const drawWidth = reviewerWidgetDrawWidth(node, width);" in script
    assert "const [width, height] = reviewerRefreshSize(node, computed);" in script
    assert "reasonClipX" in script
    assert 'ctx.textAlign = "left";\n        const reasonClipX' in script
    assert "ctx.rect(reasonClipX, reasonClipY, reasonClipW, reasonClipH)" in script
    assert "fitString(ctx, String(reasonLines[index] || \"\"), reasonClipW)" in script
    assert "syncReviewerInputSlots" in script
    assert "syncReviewerOutputSlots" in script
    assert 'getWidget(node, "reviewer_state")' in script
    assert 'reviewerStateWidget.value = ""' not in script
    assert 'name: "image"' in script
    assert 'name: "audio"' in script
    assert "updateInputLinkSlots" in script
    assert "updateOutputLinkSlots" in script
    assert "setupGateNode" in script
    assert "ComfyUI CLIP" not in script
    assert "review result" in script
    assert "Review mode. Press Run to review." in script
    assert "Pass mode. Press Run to pass through." in script
    assert "Approve Once" in script
    assert "REVIEWER_SUBMIT_APPROVE_ONCE" in script
    assert "applyReviewerApproveOnceMode" in script
    assert "triggerReviewerApproveOnce" in script
    assert "Approving the current reviewed result once." in script
    assert "Approve Armed" not in script
    assert "Regenerate" in script
    assert "triggerReviewerRegenerate" in script
    assert "REVIEWER_AUTO_RETRY_MAX = 3" in script
    assert "Retry x3 On" in script
    assert "Retry x3 Off" in script
    assert "Seed: Auto" in script
    assert "How to use" in script
    assert "openReviewerHowToUseDialog" in script
    assert "REVIEWER_HOW_TO_USE_SECTIONS" in script
    assert "Plain one-word review still works" in script
    assert ".deno-local-llm-reviewer-help-modal" in script
    assert "deno-local-llm-reviewer-help-panel" in script
    assert "hideReviewerTooltip(node);" in script
    assert "isDenoLocalLLMModalOpen" in script
    assert "showReviewerTooltip" in script
    assert "hideReviewerTooltip" in script
    assert "handleReviewerTooltipPointerMove" in script
    assert "reviewerTooltipHitFromEvent" in script
    assert "deno-local-llm-reviewer-tooltip" in script
    assert 'position: "fixed"' in script
    assert 'pointerEvents: "none"' in script
    assert "graphPointToCanvasPoint" in script
    assert "reviewerControlTooltip" in script
    assert "Bypass review and pass image/audio through" in script
    assert "Rerun the upstream path before this reviewer" in script
    assert "collectReviewerSeedCandidates" in script
    assert "collectReviewerSelectableSeedCandidates" in script
    assert "incrementReviewerRetrySeed" in script
    assert "maybeAutoRetryReviewer" in script
    assert "openReviewerSeedTargetDialog" in script
    assert "Retry Seed Target" in script
    assert "Auto: nearest upstream seed" in script
    assert "Graph fallback" in script
    assert "Auto retry could not find an upstream seed." in script
    assert "Auto retry could not find the selected seed target." in script
    assert "applyReviewerSubmitModes" in script
    assert "video frames" not in script
    assert "makeReviewerPreview" in script
    assert "Image Preview" in script
    assert "drawContainedImage" in script
    assert "passedCount" in script
    assert "blockedCount" in script
    assert "return false;" in script


def test_local_llm_refiner_fixed_seed_cache_key_is_stable_and_input_sensitive():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLocalLLMRefiner"]

    base = {
        "provider": ["Ollama"],
        "ollama_model": ["qwen3"],
        "lm_studio_model": ["google/gemma"],
        "custom_server_url": ["http://127.0.0.1:8000/v1"],
        "custom_model": [""],
        "system_prompt": ["rewrite"],
        "thinking": [False],
        "seed": [7],
        "seed_mode": ["fixed"],
        "model_memory": ["Unload after run"],
        "keep_minutes": [5],
        "comfy_vram_policy": ["Auto: unload only before first LLM call"],
        "prompt": ["a red cup"],
    }

    assert node_cls.IS_CHANGED(**base) == node_cls.IS_CHANGED(**base)
    assert node_cls.IS_CHANGED(**base) != node_cls.IS_CHANGED(**{**base, "prompt": ["a blue cup"]})
    assert node_cls.IS_CHANGED(**base) != node_cls.IS_CHANGED(**{**base, "seed": [8]})
    assert node_cls.IS_CHANGED(**base) != node_cls.IS_CHANGED(**{**base, "comfy_vram_policy": ["Always unload before each LLM call"]})

    image_a = np.zeros((1, 2, 2, 3), dtype=np.float32)
    image_b = image_a.copy()
    image_b[0, 0, 0, 0] = 1.0
    image_base = {**base, "image": [image_a]}
    assert node_cls.IS_CHANGED(**image_base) == node_cls.IS_CHANGED(**image_base)
    assert node_cls.IS_CHANGED(**image_base) != node_cls.IS_CHANGED(**{**base, "image": [image_b]})

    random_base = {**base, "seed_mode": ["randomize"]}
    assert node_cls.IS_CHANGED(**random_base) != node_cls.IS_CHANGED(**random_base)


def test_prompt_text_node_outputs_multiline_string_for_prompt_helper_inputs():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoPromptText"]
    input_types = node_cls.INPUT_TYPES()

    assert node_cls.RETURN_TYPES == ("STRING",)
    assert node_cls.RETURN_NAMES == ("text",)
    assert node_cls.CATEGORY == "Deno/Prompt"
    assert input_types["required"]["text"][0] == "STRING"
    assert input_types["required"]["text"][1]["multiline"] is True

    node = node_cls()
    assert node.build("system\nprompt") == ("system\nprompt",)


def test_local_llm_refiner_processes_prompt_batch_in_one_node_call():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return f"answer {kwargs['index']}", f"thinking {kwargs['index']}", {"seed": kwargs["seed"]}

    node._run_single = fake_run_single

    output = node.refine(
        provider=["Ollama"],
        ollama_model=["qwen3"],
        lm_studio_model=["google/gemma"],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["custom-model"],
        system_prompt=["make a prompt"],
        prompt=["first prompt", "second prompt", "third prompt"],
        thinking=[True],
        seed=[10],
        seed_mode=["fixed"],
        model_memory=["Unload after run"],
        keep_minutes=[5],
        unique_id=[123],
    )

    assert output["result"][0] == ["answer 1", "answer 2", "answer 3"]
    assert output["ui"]["thinking"] == ["thinking 1", "thinking 2", "thinking 3"]
    assert [call["seed"] for call in calls] == [10, 10, 10]
    assert [call["is_last"] for call in calls] == [False, False, True]
    assert all(call["model_memory"] == "Unload after run" for call in calls)
    assert all(call["provider"] == "Ollama" for call in calls)
    assert all(call["server_url"] == "http://127.0.0.1:11434" for call in calls)
    assert all(call["model"] == "qwen3" for call in calls)


def test_local_llm_refiner_passes_image_attachments_to_reviewer_call():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    calls = []

    original_prepare_image = module._prepare_image_attachments
    module._prepare_image_attachments = lambda image: [
        {"base64": "img64a", "data_url": "data:image/jpeg;base64,img64a", "width": 10, "height": 20, "sent_width": 10, "sent_height": 20},
        {"base64": "img64b", "data_url": "data:image/jpeg;base64,img64b", "width": 30, "height": 40, "sent_width": 30, "sent_height": 40},
    ]

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "OK", "", {"model": kwargs["model"]}

    node._run_single = fake_run_single
    try:
        output = node.refine(
            provider=["LM Studio"],
            ollama_model=["qwen3.6:35b-a3b"],
            lm_studio_model=["google/gemma-4-12b"],
            custom_server_url=["http://127.0.0.1:8000/v1"],
            custom_model=["custom-model"],
            system_prompt=["judge the image"],
            prompt=["Return OK or FAIL."],
            thinking=[False],
            seed=[11],
            seed_mode=["fixed"],
            model_memory=["Unload after run"],
            keep_minutes=[5],
            image=["fake image"],
            unique_id=[123],
        )
    finally:
        module._prepare_image_attachments = original_prepare_image

    assert output["result"][0] == ["OK"]
    assert [item["base64"] for item in calls[0]["image_attachments"]] == ["img64a", "img64b"]
    assert "audio_attachment" not in calls[0]


def test_local_llm_refiner_prepares_every_image_batch_item():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    batch = np.zeros((2, 4, 5, 3), dtype=np.float32)
    batch[1, :, :, :] = 1.0

    attachments = module._prepare_image_attachments(batch, max_side=16)
    listed_attachments = module._prepare_image_attachments([batch[0], batch[1]], max_side=16)

    assert len(attachments) == 2
    assert len(listed_attachments) == 2
    assert [item["width"] for item in attachments] == [5, 5]
    assert [item["height"] for item in attachments] == [4, 4]
    assert all(item["data_url"].startswith("data:image/jpeg;base64,") for item in attachments)


def test_local_llm_refiner_image_resize_uses_two_megapixel_budget():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    assert module.LOCAL_LLM_IMAGE_MAX_SIDE == 2048
    assert module.LOCAL_LLM_IMAGE_MAX_PIXELS == 2 * 1024 * 1024
    assert module._local_llm_image_resize_size(1920, 1080) == (1920, 1080)

    wide_width, wide_height = module._local_llm_image_resize_size(3840, 2160)
    assert wide_width > 1900
    assert wide_height > 1080
    assert max(wide_width, wide_height) <= module.LOCAL_LLM_IMAGE_MAX_SIDE
    assert wide_width * wide_height <= module.LOCAL_LLM_IMAGE_MAX_PIXELS

    square_width, square_height = module._local_llm_image_resize_size(2048, 2048)
    assert square_width == square_height
    assert square_width < 2048
    assert square_width * square_height <= module.LOCAL_LLM_IMAGE_MAX_PIXELS


def test_local_llm_refiner_image_attachment_resizes_by_pixel_budget():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    image = np.zeros((216, 384, 3), dtype=np.uint8)

    attachment = module._image_attachment_from_array(image, max_side=204, max_pixels=192 * 108)

    assert attachment["width"] == 384
    assert attachment["height"] == 216
    assert attachment["sent_width"] == 192
    assert attachment["sent_height"] == 108
    assert attachment["data_url"].startswith("data:image/jpeg;base64,")


def test_local_llm_refiner_multi_image_content_parts_are_provider_specific():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    images = [
        {"data_url": "data:image/jpeg;base64,img-a"},
        {"data_url": "data:image/jpeg;base64,img-b"},
    ]

    openai_content = module._openai_user_content("describe these", images)
    lm_native_input = module._lm_native_input("describe these", images)

    assert openai_content == [
        {"type": "text", "text": "describe these"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,img-a"}},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,img-b"}},
    ]
    assert lm_native_input == [
        {"type": "text", "content": "describe these"},
        {"type": "image", "data_url": "data:image/jpeg;base64,img-a"},
        {"type": "image", "data_url": "data:image/jpeg;base64,img-b"},
    ]


def test_local_llm_refiner_uses_provider_specific_model_field():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "thinking", {"model": kwargs["model"]}

    node._run_single = fake_run_single

    output = node.refine(
        provider=["LM Studio"],
        ollama_model=["qwen3.6:35b-a3b"],
        lm_studio_model=["google/gemma-4-12b"],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["custom-model"],
        system_prompt=["make a prompt"],
        prompt=["one prompt"],
        thinking=[False],
        seed=[4],
        seed_mode=["fixed"],
        model_memory=["Keep for minutes"],
        keep_minutes=[3],
        unique_id=[123],
    )

    assert output["result"][0] == ["answer"]
    assert calls[0]["provider"] == "LM Studio"
    assert calls[0]["server_url"] == "http://127.0.0.1:1234/v1"
    assert calls[0]["model"] == "google/gemma-4-12b"


def test_local_llm_refiner_lm_studio_keep_minutes_does_not_unload():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []
    unload_calls = []

    original_stream = module._http_stream_sse
    original_list_models = module.list_local_llm_models
    original_unload = node._lm_unload_best_effort

    def fake_stream(url, payload, **_kwargs):
        stream_payloads.append({"url": url, "payload": dict(payload)})
        yield "reasoning.delta", {"type": "reasoning.delta", "content": "hidden thought"}
        yield "message.delta", {"type": "message.delta", "content": "kept"}
        yield "chat.end", {
            "type": "chat.end",
            "result": {
                "model_instance_id": payload["model"],
                "output": [{"type": "message", "content": "kept"}],
                "stats": {"reasoning_output_tokens": 0},
            },
        }

    node._lm_unload_best_effort = lambda native_base, model: unload_calls.append((native_base, model))
    module._http_stream_sse = fake_stream
    module.list_local_llm_models = lambda _provider, _server_url: []
    try:
        answer, thought, raw = node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma-4-12b",
            system_prompt="",
            prompt="hello",
            thinking=False,
            seed=7,
            model_memory="Keep for minutes",
            keep_minutes=3,
            image_attachments=[],
            is_last=True,
            node_id="99",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_sse = original_stream
        module.list_local_llm_models = original_list_models
        node._lm_unload_best_effort = original_unload

    assert answer == "kept"
    assert thought == ""
    assert stream_payloads[0]["url"] == "http://127.0.0.1:1234/api/v1/chat"
    assert "reasoning" not in stream_payloads[0]["payload"]
    assert stream_payloads[0]["payload"]["input"] == "hello"
    assert stream_payloads[0]["payload"]["store"] is False
    assert "ttl" not in stream_payloads[0]["payload"]
    assert "seed" not in stream_payloads[0]["payload"]
    assert raw["reasoning"] == "off"
    assert raw["model_memory"] == "Keep for minutes"
    assert raw["keep_minutes"] == 3
    assert raw["api"] == "LM Studio /api/v1/chat"
    assert unload_calls == []


def test_local_llm_refiner_lm_studio_sends_reasoning_off_when_model_supports_it():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    original_stream = module._http_stream_sse
    original_list_models = module.list_local_llm_models

    def fake_stream(url, payload, **_kwargs):
        stream_payloads.append({"url": url, "payload": dict(payload)})
        yield "message.delta", {"type": "message.delta", "content": "kept"}
        yield "chat.end", {"type": "chat.end", "result": {"output": [{"type": "message", "content": "kept"}]}}

    module._http_stream_sse = fake_stream
    module.list_local_llm_models = lambda _provider, _server_url: [
        {"id": "google/gemma-4-12b", "reasoning_options": ["off", "on"]}
    ]
    try:
        answer, thought, raw = node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma-4-12b",
            system_prompt="",
            prompt="hello",
            thinking=False,
            seed=7,
            model_memory="Keep for minutes",
            keep_minutes=3,
            image_attachments=[],
            is_last=True,
            node_id="99",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_sse = original_stream
        module.list_local_llm_models = original_list_models

    assert answer == "kept"
    assert thought == ""
    assert stream_payloads[0]["payload"]["reasoning"] == "off"
    assert raw["reasoning"] == "off"


def test_local_llm_refiner_lm_studio_sends_reasoning_only_when_thinking_enabled():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    original_stream = module._http_stream_sse

    def fake_stream(url, payload, **_kwargs):
        stream_payloads.append({"url": url, "payload": dict(payload)})
        yield "reasoning.delta", {"type": "reasoning.delta", "content": "visible thought"}
        yield "message.delta", {"type": "message.delta", "content": "answer"}
        yield "chat.end", {"type": "chat.end", "result": {"output": [{"type": "message", "content": "answer"}]}}

    module._http_stream_sse = fake_stream
    try:
        answer, thought, raw = node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma-4-12b",
            system_prompt="",
            prompt="hello",
            thinking=True,
            seed=7,
            model_memory="Unload after run",
            keep_minutes=3,
            image_attachments=[],
            is_last=False,
            node_id="99",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_sse = original_stream

    assert answer == "answer"
    assert thought == "visible thought"
    assert stream_payloads[0]["payload"]["reasoning"] == "on"
    assert raw["reasoning"] == "on"


def test_local_llm_refiner_lm_studio_native_extracts_top_level_output():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    answer, thought = module._extract_lm_native_final(
        {
            "model_instance_id": "google/gemma-4-12b",
            "output": [
                {"type": "reasoning", "content": "internal"},
                {"type": "message", "content": "OK"},
            ],
        },
        include_reasoning=True,
    )

    assert answer == "OK"
    assert thought == "internal"


def test_local_llm_refiner_lm_studio_empty_stream_reports_context_error():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []

    original_stream = module._http_stream_sse
    original_http_json = module._http_json
    original_list_models = module.list_local_llm_models
    original_unload = node._lm_unload_best_effort
    diagnostic_payloads = []

    def fake_stream(_url, _payload, **_kwargs):
        yield "chat.start", {"type": "chat.start", "model_instance_id": "google/gemma-4-12b"}

    def fake_http_json(_url, _payload=None, method="GET", timeout=20.0):
        diagnostic_payloads.append(dict(_payload or {}))
        raise RuntimeError(
            "Local LLM server returned HTTP 500: "
            "The number of tokens to keep from the initial prompt is greater than the context length "
            "(n_keep: 6667>= n_ctx: 4096)."
        )

    module._http_stream_sse = fake_stream
    module._http_json = fake_http_json
    module.list_local_llm_models = lambda _provider, _server_url: []
    node._lm_unload_best_effort = lambda native_base, model: unload_calls.append((native_base, model))
    try:
        with pytest.raises(RuntimeError, match="longer than the loaded model context"):
            node._run_lm_studio(
                server_url="http://127.0.0.1:1234/v1",
                model="google/gemma-4-12b",
                system_prompt="",
                prompt="long prompt",
                thinking=False,
                seed=7,
                model_memory="Unload after run",
                keep_minutes=3,
                image_attachments=[],
                is_last=True,
                node_id="99",
                index=1,
                total=1,
            )
    finally:
        module._http_stream_sse = original_stream
        module._http_json = original_http_json
        module.list_local_llm_models = original_list_models
        node._lm_unload_best_effort = original_unload

    assert diagnostic_payloads
    assert diagnostic_payloads[0]["stream"] is False
    assert "reasoning" not in diagnostic_payloads[0]
    assert unload_calls == [("http://127.0.0.1:1234", "google/gemma-4-12b")]


def test_local_llm_refiner_sends_progress_error_before_raising(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    events = []

    monkeypatch.setattr(module, "_send_progress", lambda payload: events.append(dict(payload)))
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_mark_local_llm_active", lambda *_args, **_kwargs: "active")
    monkeypatch.setattr(module, "_clear_local_llm_active", lambda _key: None)

    def fail_run(**_kwargs):
        raise RuntimeError("context length exceeded: n_keep 9012 >= n_ctx 4096")

    monkeypatch.setattr(node, "_run_single", fail_run)

    with pytest.raises(RuntimeError, match="context length exceeded"):
        node.refine(
            provider="LM Studio",
            ollama_model="huihui_ai/gemma-4-abliterated:12b",
            lm_studio_model="google/gemma-4-12b",
            custom_server_url="http://127.0.0.1:8000/v1",
            custom_model="",
            system_prompt="",
            thinking=False,
            seed=1,
            seed_mode="fixed",
            model_memory="Unload after run",
            keep_minutes=5,
            comfy_vram_policy="Never unload before LLM call",
            prompt="hello",
            unique_id="9",
        )

    assert events[0]["status"] == "running"
    assert events[-1]["status"] == "error"
    assert events[-1]["node_id"] == "9"
    assert "n_ctx 4096" in events[-1]["error"]
    assert events[-1]["answer"] == ""


def test_local_llm_refiner_lm_studio_native_image_input_uses_text_and_image_parts():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    original_stream = module._http_stream_sse

    def fake_stream(url, payload, **_kwargs):
        stream_payloads.append({"url": url, "payload": dict(payload)})
        yield "message.delta", {"type": "message.delta", "content": "image answer"}
        yield "chat.end", {"type": "chat.end", "output": [{"type": "message", "content": "image answer"}]}

    module._http_stream_sse = fake_stream
    try:
        answer, thought, raw = node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma-4-12b",
            system_prompt="",
            prompt="what is this image?",
            thinking=False,
            seed=7,
            model_memory="Keep for minutes",
            keep_minutes=3,
            image_attachments=[
                {
                    "data_url": "data:image/jpeg;base64,abc",
                    "width": 16,
                    "height": 8,
                    "sent_width": 16,
                    "sent_height": 8,
                },
                {
                    "data_url": "data:image/jpeg;base64,def",
                    "width": 24,
                    "height": 12,
                    "sent_width": 24,
                    "sent_height": 12,
                },
            ],
            is_last=True,
            node_id="99",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_sse = original_stream

    input_parts = stream_payloads[0]["payload"]["input"]
    assert answer == "image answer"
    assert thought == ""
    assert input_parts == [
        {"type": "text", "content": "what is this image?"},
        {"type": "image", "data_url": "data:image/jpeg;base64,abc"},
        {"type": "image", "data_url": "data:image/jpeg;base64,def"},
    ]
    assert len(raw["images"]) == 2
    assert raw["image"]["width"] == 16
    assert raw["image"]["sent_height"] == 8


def test_local_llm_refiner_ollama_sends_every_image_as_images_array():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    original_stream = module._http_stream_json_lines

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        stream_payloads.append({"url": url, "payload": dict(payload)})
        yield {"message": {"content": "image answer"}, "done": False}
        yield {"done": True, "done_reason": "stop"}

    module._http_stream_json_lines = fake_stream
    try:
        answer, thought, raw = node._run_ollama(
            server_url="http://127.0.0.1:11434",
            model="qwen3-vl",
            system_prompt="",
            prompt="describe both images",
            thinking=False,
            seed=1,
            model_memory="Unload after run",
            keep_minutes=5,
            image_attachments=[
                {"base64": "img-a", "data_url": "data:image/jpeg;base64,img-a", "width": 8, "height": 8, "sent_width": 8, "sent_height": 8},
                {"base64": "img-b", "data_url": "data:image/jpeg;base64,img-b", "width": 16, "height": 16, "sent_width": 16, "sent_height": 16},
            ],
            is_last=True,
            node_id="node",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_json_lines = original_stream

    assert answer == "image answer"
    assert thought == ""
    assert stream_payloads[0]["payload"]["messages"][-1]["images"] == ["img-a", "img-b"]
    assert len(raw["images"]) == 2
    assert raw["image"]["width"] == 8


def test_local_llm_refiner_ollama_keep_alive_matches_ollama_node_duration_style():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    assert module._ollama_keep_alive("Keep loaded", 5, True) == "-1m"
    assert module._ollama_keep_alive("Keep for minutes", 3, True) == "3m"
    assert module._ollama_keep_alive("Unload after run", 5, False) == "5m"
    assert module._ollama_keep_alive("Unload after run", 5, True) == "0m"


def test_local_llm_refiner_ollama_keep_loaded_reloads_after_provider_eviction():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    calls = []
    loaded = {"value": False}

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        calls.append(("stream", url, payload))
        yield {"message": {"content": "done"}, "done": False}
        yield {"done": True, "done_reason": "stop"}

    def fake_http_json(url, payload=None, method="GET", timeout=20.0):
        calls.append(("json", url, payload, method, timeout))
        if url.endswith("/api/ps"):
            return {"models": [{"model": "qwen3"}]} if loaded["value"] else {"models": []}
        if url.endswith("/api/chat"):
            loaded["value"] = True
            return {"done": True, "done_reason": "load"}
        return {}

    original_stream = module._http_stream_json_lines
    original_http_json = module._http_json
    module._http_stream_json_lines = fake_stream
    module._http_json = fake_http_json
    try:
        answer, thought, raw = node._run_ollama(
            server_url="http://127.0.0.1:11434",
            model="qwen3",
            system_prompt="",
            prompt="hello",
            thinking=True,
            seed=1,
            model_memory="Keep loaded",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="node",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_json_lines = original_stream
        module._http_json = original_http_json

    assert answer == "done"
    assert thought == ""
    assert raw["keep_alive"] == "-1m"
    assert raw["post_keepalive"]["action"] == "reloaded"
    chat_calls = [call for call in calls if call[0] == "json" and call[1].endswith("/api/chat")]
    assert chat_calls
    assert chat_calls[-1][2]["keep_alive"] == "-1m"
    assert chat_calls[-1][2]["messages"] == []
    assert chat_calls[-1][2]["stream"] is False


def test_local_llm_refiner_ollama_keep_loaded_refreshes_even_when_provider_reports_loaded():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    calls = []

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        calls.append(("stream", url, payload))
        yield {"message": {"content": "done"}, "done": False}
        yield {"done": True, "done_reason": "stop"}

    def fake_http_json(url, payload=None, method="GET", timeout=20.0):
        calls.append(("json", url, payload, method, timeout))
        if url.endswith("/api/ps"):
            return {"models": [{"model": "qwen3"}]}
        if url.endswith("/api/chat"):
            return {"done": True, "done_reason": "load"}
        return {}

    original_stream = module._http_stream_json_lines
    original_http_json = module._http_json
    module._http_stream_json_lines = fake_stream
    module._http_json = fake_http_json
    try:
        answer, thought, raw = node._run_ollama(
            server_url="http://127.0.0.1:11434",
            model="qwen3",
            system_prompt="",
            prompt="hello",
            thinking=True,
            seed=1,
            model_memory="Keep loaded",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="node",
            index=1,
            total=1,
        )
    finally:
        module._http_stream_json_lines = original_stream
        module._http_json = original_http_json

    assert answer == "done"
    assert thought == ""
    assert raw["post_keepalive"]["action"] == "refreshed"
    chat_calls = [call for call in calls if call[0] == "json" and call[1].endswith("/api/chat")]
    assert len(chat_calls) == 1
    assert chat_calls[0][2]["keep_alive"] == "-1m"
    assert chat_calls[0][2]["messages"] == []
    assert chat_calls[0][2]["stream"] is False


def test_local_llm_refiner_keep_loaded_ollama_alias_does_not_unload_same_model():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    http_calls = []

    original_http_json = module._http_json
    module._WARM_LOCAL_LLM_KEYS.clear()

    def fake_http_json(url, payload=None, **kwargs):
        http_calls.append((url, payload, kwargs))
        return {}

    module._http_json = fake_http_json
    try:
        module._WARM_LOCAL_LLM_KEYS["Ollama|http://localhost:11434|qwen3"] = None
        result = module._unload_other_warm_local_llms(
            provider=module.PROVIDER_OLLAMA,
            server_url="http://127.0.0.1:11434",
            model="qwen3",
            node_id="node",
        )
    finally:
        module._http_json = original_http_json
        module._WARM_LOCAL_LLM_KEYS.clear()

    assert result["action"] == "none"
    assert result["unloaded"] == []
    assert http_calls == []


def test_local_llm_refiner_auto_vram_skips_when_provider_already_has_model_loaded():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    calls = []
    original_provider_loaded = module._is_provider_model_loaded
    original_free = module._free_comfy_vram_for_local_llm
    module._WARM_LOCAL_LLM_KEYS.clear()
    module._is_provider_model_loaded = lambda provider, server_url, model: True
    module._free_comfy_vram_for_local_llm = lambda: calls.append("free") or {"available": True}
    try:
        info = module._prepare_comfy_vram_before_llm(
            provider="Ollama",
            server_url="http://127.0.0.1:11434",
            model="qwen3",
            model_memory="Keep loaded",
            keep_minutes=5,
            comfy_vram_policy="Auto: unload only before first LLM call",
            node_id="node",
        )
        key = module._llm_state_key("Ollama", "http://127.0.0.1:11434", "qwen3")
        marked_warm = module._is_local_llm_marked_warm(key)
    finally:
        module._is_provider_model_loaded = original_provider_loaded
        module._free_comfy_vram_for_local_llm = original_free
        module._WARM_LOCAL_LLM_KEYS.clear()

    assert calls == []
    assert info == {
        "policy": "Auto: unload only before first LLM call",
        "action": "skipped",
        "reason": "local LLM is already loaded by provider",
    }
    assert marked_warm


def test_local_llm_refiner_rejects_thinking_only_result_instead_of_empty_output():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    def fake_run_single(**kwargs):
        return "", "internal reasoning only", {}

    module._WARM_LOCAL_LLM_KEYS.clear()
    node._run_single = fake_run_single
    try:
        with pytest.raises(RuntimeError, match="thinking text but no final result"):
            node.refine(
                provider=["Ollama"],
                ollama_model=["qwen3"],
                lm_studio_model=["google/gemma"],
                custom_server_url=["http://127.0.0.1:8000/v1"],
                custom_model=[""],
                system_prompt=[""],
                prompt=["describe this"],
                thinking=[True],
                seed=[1],
                seed_mode=["fixed"],
                model_memory=["Keep loaded"],
                keep_minutes=[5],
                comfy_vram_policy=["Never unload before LLM call"],
                unique_id=["node"],
            )
    finally:
        module._WARM_LOCAL_LLM_KEYS.clear()


def test_local_llm_refiner_extracts_final_prompt_tags_from_chatty_model_output():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    chatty_answer = (
        "Here's a thinking process that the model should not pass downstream.\n"
        "<final_prompt>A serene cat drinking clear water in soft morning light.</final_prompt>"
    )
    marker_answer = (
        "I will analyze this first, which should not pass downstream.\n"
        "DENO_FINAL_PROMPT: "
        "A fluffy ginger cat gently drinking water from a ceramic bowl in warm morning light."
    )
    inline_marker_answer = (
        "The user wants an image prompt, but this analysis should be removed."
        "DENO_FINAL_PROMPT: A photorealistic cat lapping water from a clear bowl in soft natural light."
    )
    full_marker_answer = (
        "Analysis should be ignored.\n"
        "FINAL_PROMPT_START\n"
        "A silver tabby cat drinking from a clear stream in soft forest light.\n"
        "FINAL_PROMPT_END"
    )

    assert (
        module._extract_final_prompt_block(chatty_answer)
        == "A serene cat drinking clear water in soft morning light."
    )
    assert (
        module._extract_final_prompt_block(marker_answer)
        == "A fluffy ginger cat gently drinking water from a ceramic bowl in warm morning light."
    )
    assert (
        module._extract_final_prompt_block(inline_marker_answer)
        == "A photorealistic cat lapping water from a clear bowl in soft natural light."
    )
    assert (
        module._extract_final_prompt_block(full_marker_answer)
        == "A silver tabby cat drinking from a clear stream in soft forest light."
    )
    assert module._extract_final_prompt_block("Plain prompt without tags") == "Plain prompt without tags"
    assert module._requires_final_prompt_tags("Use <final_prompt>...</final_prompt> for the result.")
    assert module._requires_final_prompt_block("Write the result as DENO_FINAL_PROMPT: ...")
    assert module._requires_final_prompt_block("Write between FINAL_PROMPT_START and FINAL_PROMPT_END.")
    assert not module._requires_final_prompt_tags("Return only the prompt.")
    assert (
        module._extract_final_prompt_block("DENO_FINAL_PROMPT: your final image prompt here", require=False)
        == "DENO_FINAL_PROMPT: your final image prompt here"
    )

    with pytest.raises(RuntimeError, match="required Prompt Only final prompt block"):
        module._extract_final_prompt_block("The final answer is not tagged.", require=True)
    with pytest.raises(RuntimeError, match="required Prompt Only final prompt block"):
        module._extract_final_prompt_block("DENO_FINAL_PROMPT: your final image prompt here", require=True)


def test_local_llm_refiner_auto_vram_free_runs_once_for_keep_loaded():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    class FakeComfyModelManagement:
        def __init__(self):
            self.calls = []
            self.free_memory = 128
            self.loaded = [object(), object()]

        def get_torch_device(self):
            return "cuda:0"

        def get_free_memory(self, device):
            self.calls.append(("get_free_memory", device))
            return self.free_memory

        def loaded_models(self):
            return list(self.loaded)

        def unload_all_models(self):
            self.calls.append(("unload_all_models",))
            self.loaded = []
            self.free_memory = 4096

        def soft_empty_cache(self, force=False):
            self.calls.append(("soft_empty_cache", force))

    fake_manager = FakeComfyModelManagement()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "", {}

    original_manager = module.comfy_model_management
    original_sleep = module.time.sleep
    module.comfy_model_management = fake_manager
    module.time.sleep = lambda seconds: fake_manager.calls.append(("sleep", seconds))
    module._WARM_LOCAL_LLM_KEYS.clear()
    node._run_single = fake_run_single
    try:
        for _ in range(2):
            node.refine(
                provider=["Ollama"],
                ollama_model=["qwen3"],
                lm_studio_model=["google/gemma"],
                custom_server_url=["http://127.0.0.1:8000/v1"],
                custom_model=["custom-model"],
                system_prompt=["make a prompt"],
                prompt=["one prompt"],
                thinking=[False],
                seed=[4],
                seed_mode=["fixed"],
                model_memory=["Keep loaded"],
                keep_minutes=[5],
                comfy_vram_policy=["Auto"],
                unique_id=[123],
            )
    finally:
        module.comfy_model_management = original_manager
        module.time.sleep = original_sleep
        module._WARM_LOCAL_LLM_KEYS.clear()

    assert len(calls) == 2
    assert sum(1 for call in fake_manager.calls if call[0] == "unload_all_models") == 1
    assert ("sleep", module.COMFY_VRAM_FREE_SETTLE_SECONDS) in fake_manager.calls
    assert sum(1 for call in fake_manager.calls if call == ("soft_empty_cache", True)) == 2


def test_local_llm_refiner_auto_vram_free_repeats_for_unload_after_run():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    class FakeComfyModelManagement:
        def __init__(self):
            self.calls = []
            self.free_memory = 128

        def get_torch_device(self):
            return "cuda:0"

        def get_free_memory(self, device):
            return self.free_memory

        def loaded_models(self):
            return []

        def unload_all_models(self):
            self.calls.append(("unload_all_models",))
            self.free_memory += 1024

        def soft_empty_cache(self, force=False):
            self.calls.append(("soft_empty_cache", force))

    fake_manager = FakeComfyModelManagement()

    def fake_run_single(**kwargs):
        return "answer", "", {}

    original_manager = module.comfy_model_management
    original_sleep = module.time.sleep
    module.comfy_model_management = fake_manager
    module.time.sleep = lambda _seconds: None
    module._WARM_LOCAL_LLM_KEYS.clear()
    node._run_single = fake_run_single
    try:
        for _ in range(2):
            node.refine(
                provider=["Ollama"],
                ollama_model=["qwen3"],
                lm_studio_model=["google/gemma"],
                custom_server_url=["http://127.0.0.1:8000/v1"],
                custom_model=["custom-model"],
                system_prompt=["make a prompt"],
                prompt=["one prompt"],
                thinking=[False],
                seed=[4],
                seed_mode=["fixed"],
                model_memory=["Unload after run"],
                keep_minutes=[5],
                comfy_vram_policy=["Auto"],
                unique_id=[123],
            )
    finally:
        module.comfy_model_management = original_manager
        module.time.sleep = original_sleep
        module._WARM_LOCAL_LLM_KEYS.clear()

    assert sum(1 for call in fake_manager.calls if call[0] == "unload_all_models") == 2


def test_local_llm_refiner_keep_loaded_provider_switch_unloads_previous_local_llm():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    run_calls = []
    http_calls = []

    original_http_json = module._http_json
    original_list_models = module.list_local_llm_models
    module._WARM_LOCAL_LLM_KEYS.clear()

    def fake_run_single(**kwargs):
        run_calls.append(kwargs)
        return "answer", "", {}

    def fake_http_json(url, payload=None, **kwargs):
        http_calls.append((url, payload, kwargs))
        return {}

    def fake_list_models(provider, server_url):
        if provider == module.PROVIDER_LM_STUDIO:
            return [{"id": "google/gemma", "loaded": True, "instance_id": "loaded-gemma"}]
        return []

    node._run_single = fake_run_single
    module._http_json = fake_http_json
    module.list_local_llm_models = fake_list_models
    try:
        module._mark_local_llm_warm(
            module.PROVIDER_OLLAMA,
            module.OLLAMA_DEFAULT_SERVER,
            "qwen3",
            module.MEMORY_KEEP_LOADED,
            5,
        )

        node.refine(
            provider=["LM Studio"],
            ollama_model=["qwen3"],
            lm_studio_model=["google/gemma"],
            custom_server_url=["http://127.0.0.1:8000/v1"],
            custom_model=["custom-model"],
            system_prompt=["make a prompt"],
            prompt=["one prompt"],
            thinking=[False],
            seed=[4],
            seed_mode=["fixed"],
            model_memory=["Keep loaded"],
            keep_minutes=[5],
            comfy_vram_policy=["Never unload before LLM call"],
            unique_id=[123],
        )

        node.refine(
            provider=["Ollama"],
            ollama_model=["qwen3"],
            lm_studio_model=["google/gemma"],
            custom_server_url=["http://127.0.0.1:8000/v1"],
            custom_model=["custom-model"],
            system_prompt=["make a prompt"],
            prompt=["one prompt"],
            thinking=[False],
            seed=[5],
            seed_mode=["fixed"],
            model_memory=["Keep loaded"],
            keep_minutes=[5],
            comfy_vram_policy=["Never unload before LLM call"],
            unique_id=[123],
        )
    finally:
        module._http_json = original_http_json
        module.list_local_llm_models = original_list_models
        module._WARM_LOCAL_LLM_KEYS.clear()

    assert [call["provider"] for call in run_calls] == ["LM Studio", "Ollama"]
    assert len(http_calls) == 2
    assert http_calls[0][0].endswith("/api/generate")
    assert http_calls[0][1]["model"] == "qwen3"
    assert http_calls[0][1]["keep_alive"] == 0
    assert http_calls[0][2]["method"] == "POST"
    assert http_calls[1][0].endswith("/api/v1/models/unload")
    assert http_calls[1][1] == {"instance_id": "loaded-gemma"}
    assert http_calls[1][2]["method"] == "POST"


def test_local_llm_refiner_manual_unload_clears_provider_warm_state():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    http_calls = []

    original_http_json = module._http_json
    original_list_models = module.list_local_llm_models
    module._WARM_LOCAL_LLM_KEYS.clear()

    def fake_http_json(url, payload=None, **kwargs):
        http_calls.append((url, payload, kwargs))
        return {}

    module._http_json = fake_http_json
    module.list_local_llm_models = lambda provider, server_url: [
        {"id": "google/gemma", "instance_id": "loaded-gemma"}
    ]
    try:
        module._mark_local_llm_warm(
            module.PROVIDER_OLLAMA,
            module.OLLAMA_DEFAULT_SERVER,
            "qwen3",
            module.MEMORY_KEEP_LOADED,
            5,
        )
        ollama_result = module.unload_local_llm_model(
            module.PROVIDER_OLLAMA,
            module.OLLAMA_DEFAULT_SERVER,
            "qwen3",
        )
        assert ollama_result["ok"] is True
        assert http_calls[-1][0].endswith("/api/generate")
        assert http_calls[-1][1]["keep_alive"] == 0
        assert http_calls[-1][2]["method"] == "POST"
        assert not module._is_local_llm_marked_warm(
            module._llm_state_key(module.PROVIDER_OLLAMA, module.OLLAMA_DEFAULT_SERVER, "qwen3")
        )

        module._mark_local_llm_warm(
            module.PROVIDER_LM_STUDIO,
            module.LM_STUDIO_DEFAULT_SERVER,
            "google/gemma",
            module.MEMORY_KEEP_LOADED,
            5,
        )
        lm_result = module.unload_local_llm_model(
            module.PROVIDER_LM_STUDIO,
            module.LM_STUDIO_DEFAULT_SERVER,
            "google/gemma",
        )
        assert lm_result["ok"] is True
        assert http_calls[-1][0].endswith("/api/v1/models/unload")
        assert http_calls[-1][1] == {"instance_id": "loaded-gemma"}
        assert not module._is_local_llm_marked_warm(
            module._llm_state_key(module.PROVIDER_LM_STUDIO, module.LM_STUDIO_DEFAULT_SERVER, "google/gemma")
        )

        http_count = len(http_calls)
        module.list_local_llm_models = lambda provider, server_url: [
            {"id": "google/gemma", "loaded": False, "instance_id": ""}
        ]
        lm_already_unloaded = module.unload_local_llm_model(
            module.PROVIDER_LM_STUDIO,
            module.LM_STUDIO_DEFAULT_SERVER,
            "google/gemma",
        )
        assert lm_already_unloaded["ok"] is True
        assert len(http_calls) == http_count
    finally:
        module._http_json = original_http_json
        module.list_local_llm_models = original_list_models
        module._WARM_LOCAL_LLM_KEYS.clear()


def test_local_llm_refiner_manual_unload_is_blocked_while_model_is_generating():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    http_calls = []

    original_http_json = module._http_json
    module._WARM_LOCAL_LLM_KEYS.clear()
    module._ACTIVE_LOCAL_LLM_KEYS.clear()
    module._http_json = lambda *args, **kwargs: http_calls.append((args, kwargs))
    active_key = module._mark_local_llm_active(
        module.PROVIDER_LM_STUDIO,
        module.LM_STUDIO_DEFAULT_SERVER,
        "google/gemma",
    )
    try:
        result = module.unload_local_llm_model(
            module.PROVIDER_LM_STUDIO,
            module.LM_STUDIO_DEFAULT_SERVER,
            "google/gemma",
        )
    finally:
        module._clear_local_llm_active(active_key)
        module._http_json = original_http_json
        module._WARM_LOCAL_LLM_KEYS.clear()
        module._ACTIVE_LOCAL_LLM_KEYS.clear()

    assert result["ok"] is False
    assert result["busy"] is True
    assert "still generating" in result["message"]
    assert http_calls == []


def test_local_llm_refiner_manual_unload_rejects_shifted_model_label():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    http_calls = []

    original_http_json = module._http_json
    module._http_json = lambda *args, **kwargs: http_calls.append((args, kwargs))
    try:
        try:
            module.unload_local_llm_model(
                module.PROVIDER_LM_STUDIO,
                module.LM_STUDIO_DEFAULT_SERVER,
                "System Prompt",
            )
        except RuntimeError as exc:
            assert "shifted UI label" in str(exc)
            assert "System Prompt" in str(exc)
        else:
            raise AssertionError("shifted UI labels must not reach LM Studio unload")
    finally:
        module._http_json = original_http_json

    assert http_calls == []


def test_local_llm_refiner_stop_marks_active_model_for_cancellation():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    module._ACTIVE_LOCAL_LLM_KEYS.clear()
    module._CANCEL_LOCAL_LLM_KEYS.clear()
    active_key = module._mark_local_llm_active(
        module.PROVIDER_LM_STUDIO,
        module.LM_STUDIO_DEFAULT_SERVER,
        "google/gemma",
    )
    try:
        result = module.stop_local_llm_generation(
            module.PROVIDER_LM_STUDIO,
            module.LM_STUDIO_DEFAULT_SERVER,
            "google/gemma",
        )
        assert result["ok"] is True
        assert result["stopping"] is True
        assert active_key in module._CANCEL_LOCAL_LLM_KEYS

        try:
            module._raise_if_local_llm_stopped(active_key)
        except RuntimeError as exc:
            assert "Local LLM generation stopped" in str(exc)
        else:
            raise AssertionError("cancelled local LLM key should stop the stream loop")
    finally:
        module._clear_local_llm_active(active_key)
        module._ACTIVE_LOCAL_LLM_KEYS.clear()
        module._CANCEL_LOCAL_LLM_KEYS.clear()


def test_local_llm_refiner_stop_reports_no_active_request_without_unloading():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    module._ACTIVE_LOCAL_LLM_KEYS.clear()
    module._CANCEL_LOCAL_LLM_KEYS.clear()
    result = module.stop_local_llm_generation(
        module.PROVIDER_OLLAMA,
        module.OLLAMA_DEFAULT_SERVER,
        "qwen3",
    )

    assert result["ok"] is False
    assert result["stopping"] is False
    assert "No active Ollama request" in result["message"]
    assert module._CANCEL_LOCAL_LLM_KEYS == set()


def test_local_llm_refiner_legacy_custom_provider_restores_custom_openai_path():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "thinking", {"model": kwargs["model"]}

    node._run_single = fake_run_single

    output = node.refine(
        provider=["Custom Local Server"],
        ollama_model=["qwen3.6:35b-a3b"],
        lm_studio_model=["google/gemma-4-12b"],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["legacy-qwen"],
        system_prompt=["make a prompt"],
        prompt=["one prompt"],
        thinking=[False],
        seed=[8],
        seed_mode=["fixed"],
        model_memory=["Keep loaded"],
        keep_minutes=[9],
        unique_id=[123],
    )

    assert output["result"][0] == ["answer"]
    assert calls[0]["provider"] == "Custom"
    assert calls[0]["server_url"] == "http://127.0.0.1:8000/v1"
    assert calls[0]["model"] == "legacy-qwen"
    assert calls[0]["seed"] == 8


def test_local_llm_refiner_validation_accepts_local_provider_models():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLocalLLMRefiner"]

    assert node_cls.VALIDATE_INPUTS(
        provider="LM Studio",
        ollama_model="",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
    ) is True

    assert node_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="",
        custom_model="",
    ) is True

    assert node_cls.VALIDATE_INPUTS(
        provider="Custom Local Server",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="",
        custom_server_url="http://127.0.0.1:8000/v1",
        custom_model="legacy-qwen",
    ) is True

    assert node_cls.VALIDATE_INPUTS(
        provider="llama.cpp",
        ollama_model="",
        lm_studio_model="",
        custom_server_url="http://127.0.0.1:8080/v1",
        custom_model="local-vision-model",
    ) is True

    assert node_cls.VALIDATE_INPUTS(
        provider="vLLM",
        ollama_model="",
        lm_studio_model="",
        custom_server_url="http://127.0.0.1:8000/v1",
        custom_model="Qwen/Qwen2.5-VL",
    ) is True

    shifted_result = node_cls.VALIDATE_INPUTS(
        provider="Custom Local Server",
        ollama_model="",
        lm_studio_model="",
        custom_server_url="http://127.0.0.1:8000/v1",
        custom_model=5,
    )
    assert "Custom Model" in shifted_result

    provider_result = node_cls.VALIDATE_INPUTS(
        provider="Remote API",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="qwen3.6-35b-a3b-nvfp4",
    )
    assert "Provider" in provider_result

    remote_result = node_cls.VALIDATE_INPUTS(
        provider="vLLM",
        ollama_model="",
        lm_studio_model="",
        custom_server_url="http://192.168.0.5:8000/v1",
        custom_model="Qwen/Qwen2.5-VL",
    )
    assert "Only local LLM servers are allowed" in remote_result

    url_result = node_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="http://127.0.0.1:11434",
        lm_studio_model="google/gemma-4-12b",
        custom_model="qwen3.6-35b-a3b-nvfp4",
    )
    assert "Ollama Model" in url_result

    shifted_label_result = node_cls.VALIDATE_INPUTS(
        provider="LM Studio",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="System Prompt",
        custom_model="",
    )
    assert "LM Studio Model" in shifted_label_result
    assert "shifted" in shifted_label_result

    missing_saved_result = node_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="Missing saved model: qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
    )
    assert "Saved Ollama model is not available on this PC" in missing_saved_result
    assert "qwen3.6:35b-a3b" in missing_saved_result


def test_local_llm_refiner_openai_compatible_sends_image_and_reasoning(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        calls.append({"url": url, "payload": payload, "cancel_key": cancel_key})
        yield "message", {"choices": [{"delta": {"reasoning_content": "checking image"}}]}
        yield "message", {"choices": [{"delta": {"content": "DENO_FINAL_PROMPT: a clean product photo"}}]}

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    image = np.zeros((2, 8, 8, 3), dtype=np.float32)
    image[1, :, :, :] = 1.0
    output = node.refine(
        provider=["llama.cpp"],
        ollama_model=["qwen3"],
        lm_studio_model=["google/gemma-4-12b"],
        custom_server_url=["http://127.0.0.1:8080/v1"],
        custom_model=["local-vision-model"],
        system_prompt=["Return DENO_FINAL_PROMPT."],
        prompt=["describe the image"],
        thinking=[True],
        seed=[123],
        seed_mode=["fixed"],
        model_memory=["Keep loaded"],
        keep_minutes=[5],
        unique_id=[123],
        image=[image],
    )

    assert output["result"][0] == ["a clean product photo"]
    payload = calls[0]["payload"]
    assert calls[0]["url"] == "http://127.0.0.1:8080/v1/chat/completions"
    assert payload["model"] == "local-vision-model"
    assert payload["messages"][-1]["content"][0] == {"type": "text", "text": "describe the image"}
    assert payload["messages"][-1]["content"][1]["type"] == "image_url"
    assert payload["messages"][-1]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert payload["messages"][-1]["content"][2]["type"] == "image_url"
    assert payload["messages"][-1]["content"][2]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_local_llm_refiner_splits_vllm_orphan_closing_think_tag(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        yield "message", {
            "choices": [
                {
                    "delta": {
                        "content": (
                            "I inspected the image and found a red rectangle.\n"
                            "</think>\n\n"
                            "DENO_FINAL_PROMPT: red rectangle"
                        )
                    }
                }
            ]
        }

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    output = node.refine(
        provider=["vLLM"],
        ollama_model=["qwen3"],
        lm_studio_model=["google/gemma-4-12b"],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["Qwen3-VL-2B-Thinking-FP8"],
        system_prompt=["Return DENO_FINAL_PROMPT."],
        prompt=["describe the image"],
        thinking=[True],
        seed=[123],
        seed_mode=["fixed"],
        model_memory=["Keep loaded"],
        keep_minutes=[5],
        unique_id=[123],
    )

    assert output["result"][0] == ["red rectangle"]
    assert output["ui"]["thinking"] == ["I inspected the image and found a red rectangle."]


def test_local_llm_refiner_thinking_on_requires_real_reasoning(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        yield "message", {"choices": [{"delta": {"content": "DENO_FINAL_PROMPT: plain answer"}}]}

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    with pytest.raises(RuntimeError) as exc:
        node.refine(
            provider=["vLLM"],
            ollama_model=["qwen3"],
            lm_studio_model=["google/gemma-4-12b"],
            custom_server_url=["http://127.0.0.1:8000/v1"],
            custom_model=["local-text-model"],
            system_prompt=["Return DENO_FINAL_PROMPT."],
            prompt=["make a prompt"],
            thinking=[True],
            seed=[123],
            seed_mode=["fixed"],
            model_memory=["Keep loaded"],
            keep_minutes=[5],
            unique_id=[123],
        )

    assert "no Thinking/reasoning content" in str(exc.value)


def test_local_llm_refiner_custom_unload_is_not_fake_success():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    result = module.unload_local_llm_model("Custom", "http://127.0.0.1:8000/v1", "local-model")

    assert result["ok"] is False
    assert result["manual_unavailable"] is True
    assert "do not share a standard unload API" in result["message"]

    with pytest.raises(RuntimeError) as exc:
        module.unload_local_llm_model("Custom", "http://192.168.0.5:8000/v1", "local-model")
    assert "Only local LLM servers are allowed" in str(exc.value)


def test_local_llm_refiner_openai_compatible_post_run_unload_failure_is_visible(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    events = []

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        yield "message", {"choices": [{"delta": {"content": "DENO_FINAL_PROMPT: final answer"}}]}

    def fail_unload(server_root, model):
        raise RuntimeError("llama.cpp does not support POST /models/unload in this build")

    monkeypatch.setattr(module, "_send_progress", lambda payload: events.append(dict(payload)))
    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_llama_cpp_unload", fail_unload)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    output = node.refine(
        provider=["llama.cpp"],
        ollama_model=[""],
        lm_studio_model=[""],
        custom_server_url=["http://127.0.0.1:8080/v1"],
        custom_model=["local-vision-model"],
        system_prompt=["Return DENO_FINAL_PROMPT."],
        prompt=["make a prompt"],
        thinking=[False],
        seed=[123],
        seed_mode=["fixed"],
        model_memory=["Unload after run"],
        keep_minutes=[5],
        unique_id=[123],
    )

    assert output["result"][0] == ["final answer"]
    assert "unload after run failed" in output["ui"]["thinking"][0]
    assert events[-1]["status"] == "done, unload warning"
    assert "unload after run failed" in events[-1]["thinking"]
    assert "POST /models/unload" in events[-1]["unload_warning"]


def test_local_llm_refiner_custom_post_run_unload_unavailable_is_visible(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    events = []

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        yield "message", {"choices": [{"delta": {"content": "DENO_FINAL_PROMPT: custom answer"}}]}

    monkeypatch.setattr(module, "_send_progress", lambda payload: events.append(dict(payload)))
    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    output = node.refine(
        provider=["Custom"],
        ollama_model=[""],
        lm_studio_model=[""],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["local-custom-model"],
        system_prompt=["Return DENO_FINAL_PROMPT."],
        prompt=["make a prompt"],
        thinking=[False],
        seed=[123],
        seed_mode=["fixed"],
        model_memory=["Unload after run"],
        keep_minutes=[5],
        unique_id=[123],
    )

    assert output["result"][0] == ["custom answer"]
    assert "unload after run is unavailable for Custom" in output["ui"]["thinking"][0]
    assert events[-1]["status"] == "done, unload warning"
    assert "unload after run is unavailable for Custom" in events[-1]["thinking"]
    assert "standard unload API" in events[-1]["unload_warning"]


def test_local_llm_and_review_gate_validation_accepts_legacy_saved_combo_labels():
    package = load_package()
    loader_cls = package.NODE_CLASS_MAPPINGS["DenoLocalLLMRefiner"]
    reviewer_cls = package.NODE_CLASS_MAPPINGS["DenoAIReviewGate"]

    assert loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode="random",
        model_memory="Keep loaded",
        comfy_vram_policy="Always free",
    ) is True
    assert loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode=[["randomize"]],
        model_memory=["Keep loaded"],
        comfy_vram_policy=["Auto"],
    ) is True
    assert "seed_mode" in loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode=["shuffle forever"],
        model_memory=["Keep loaded"],
        comfy_vram_policy=["Auto"],
    )
    assert "model_memory" in loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode=["randomize"],
        model_memory=["Keep everything forever"],
        comfy_vram_policy=["Auto"],
    )
    assert "comfy_vram_policy" in loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode=["randomize"],
        model_memory=["Keep loaded"],
        comfy_vram_policy=["Sometimes"],
    )
    assert reviewer_cls.VALIDATE_INPUTS(review_mode="Legacy Review") is True
    assert "seed_mode" in loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode="shuffle forever",
        model_memory="Keep loaded",
        comfy_vram_policy="Always free",
    )
    assert "model_memory" in loader_cls.VALIDATE_INPUTS(
        provider="Ollama",
        ollama_model="qwen3.6:35b-a3b",
        lm_studio_model="google/gemma-4-12b",
        custom_model="",
        seed_mode="random",
        model_memory="Keep everything forever",
        comfy_vram_policy="Always free",
    )
    assert "review_mode" in reviewer_cls.VALIDATE_INPUTS(review_mode="Maybe")


def test_local_llm_refiner_missing_saved_display_does_not_execute():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "", {}

    node._run_single = fake_run_single

    with pytest.raises(RuntimeError) as exc:
        node.refine(
            provider=["Ollama"],
            ollama_model=["Missing saved model: qwen3.6:35b-a3b"],
            lm_studio_model=["google/gemma-4-12b"],
            custom_server_url=["http://127.0.0.1:8000/v1"],
            custom_model=[""],
            system_prompt=[""],
            prompt=["one prompt"],
            thinking=[False],
            seed=[1],
            seed_mode=["fixed"],
            model_memory=["Unload after run"],
            keep_minutes=[5],
            comfy_vram_policy=["Auto: unload only before first LLM call"],
            unique_id=[123],
        )

    assert not calls
    assert "Saved Ollama model is not available on this PC" in str(exc.value)
    assert "qwen3.6:35b-a3b" in str(exc.value)


def test_local_llm_refiner_missing_saved_model_error_is_clear():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    error = module._local_llm_http_error(
        404,
        '{"error":{"type":"model_not_found","message":"Model with instance identifier \'missing-model\' is not loaded."}}',
        {"model": "missing-model"},
    )

    message = str(error)
    assert "Selected local LLM model is not available: missing-model" in message
    assert "Refresh Models and choose another model" in message
    assert "Server detail:" in message


def test_local_llm_refiner_legacy_custom_saved_values_do_not_execute_custom_server():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "", {}

    node._run_single = fake_run_single

    with pytest.raises(RuntimeError) as exc:
        node.refine(
            provider=["Custom Local Server"],
            ollama_model=["qwen3.6:35b-a3b"],
            lm_studio_model=["google/gemma-4-12b"],
            custom_server_url=[False],
            custom_model=[5],
            system_prompt=["make a prompt"],
            prompt=["one prompt"],
            thinking=["Unload after run"],
            seed=["bad"],
            seed_mode=["fixed"],
            model_memory=[None],
            keep_minutes=[None],
            unique_id=[123],
        )

    assert "Custom Model" in str(exc.value)
    assert calls == []


def test_local_llm_refiner_repairs_shifted_saved_widget_values():
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    calls = []

    def fake_run_single(**kwargs):
        calls.append(kwargs)
        return "answer", "", {}

    node._run_single = fake_run_single

    node.refine(
        provider=["LM Studio"],
        ollama_model=["google/gemma-4-12b"],
        lm_studio_model=["http://127.0.0.1:1234/v1"],
        custom_server_url=["http://127.0.0.1:8000/v1"],
        custom_model=["custom-model"],
        system_prompt=["make a prompt"],
        prompt=["one prompt"],
        thinking=["false"],
        seed=["NaN"],
        seed_mode=["fixed"],
        model_memory=[5],
        keep_minutes=["bad"],
        unique_id=[123],
    )

    assert calls[0]["provider"] == "LM Studio"
    assert calls[0]["server_url"] == "http://127.0.0.1:1234/v1"
    assert calls[0]["model"] == "google/gemma-4-12b"
    assert calls[0]["thinking"] is False
    assert calls[0]["seed"] == 1
    assert calls[0]["model_memory"] == "Unload after run"
    assert calls[0]["keep_minutes"] == 5


def test_ai_review_gate_passes_or_blocks_media_outputs_from_reviewer_text():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    gate_cls = package.NODE_CLASS_MAPPINGS["DenoAIReviewGate"]
    gate = package.DenoAIReviewGate()
    image = object()
    audio = object()
    input_types = gate_cls.INPUT_TYPES()

    assert "local llm reviewer" in gate_cls.SEARCH_ALIASES
    assert "save reviewer" in gate_cls.SEARCH_ALIASES
    assert "media reviewer" in gate_cls.SEARCH_ALIASES
    assert gate_cls.RETURN_NAMES == ("image", "audio")
    assert gate_cls.RETURN_TYPES == ("IMAGE", "AUDIO")
    assert gate_cls.OUTPUT_NODE is True
    assert list(input_types["required"]) == ["review", "review_mode", "approve_once"]
    assert list(input_types["optional"]) == ["image", "audio", "reviewer_state"]
    assert list(input_types["hidden"]) == ["unique_id"]
    assert "pass_words" not in input_types["required"]
    assert "reject_words" not in input_types["required"]
    assert "unclear_result" not in input_types["required"]

    passed = gate.gate(
        review='{"verdict":"OK","reason":"good result"}',
        image=image,
        audio=audio,
    )
    assert passed["ui"]["deno_llm_gate"][0]["passed"] is True
    assert passed["ui"]["deno_llm_gate"][0]["source"] == "Text review"
    assert passed["ui"]["deno_llm_gate"][0]["verdict"] == "OK"
    assert passed["ui"]["deno_llm_gate"][0]["reason"] == "good result"
    assert passed["result"][0] is image
    assert passed["result"][1] is audio

    plain_ok = gate.gate(
        review="OK",
        image=image,
        audio=audio,
    )
    assert plain_ok["ui"]["deno_llm_gate"][0]["passed"] is True
    assert plain_ok["ui"]["deno_llm_gate"][0]["verdict"] == "OK"
    assert plain_ok["ui"]["deno_llm_gate"][0]["reason"] == "Reviewer marked this result as OK."
    assert plain_ok["result"][0] is image
    assert plain_ok["result"][1] is audio

    failed = gate.gate(
        review='{"verdict":"FAIL","reason":"bad hands"}',
        image=image,
        audio=audio,
    )
    assert failed["ui"]["deno_llm_gate"][0]["passed"] is False
    assert failed["ui"]["deno_llm_gate"][0]["verdict"] == "FAIL"
    assert failed["ui"]["deno_llm_gate"][0]["reason"] == "bad hands"
    assert isinstance(failed["result"][0], module.ExecutionBlocker)
    assert failed["result"][0].message is None
    assert isinstance(failed["result"][1], module.ExecutionBlocker)

    bypass = gate.gate(
        review='{"verdict":"FAIL","reason":"ignored"}',
        review_mode="Pass",
        image=image,
        audio=audio,
    )
    assert bypass["ui"]["deno_llm_gate"][0]["passed"] is True
    assert bypass["ui"]["deno_llm_gate"][0]["source"] == "Manual pass"
    assert bypass["result"][0] is image
    assert bypass["result"][1] is audio

    once = gate.gate(
        review='{"verdict":"FAIL","reason":"ignored"}',
        approve_once=True,
        image=image,
        audio=audio,
    )
    assert once["ui"]["deno_llm_gate"][0]["passed"] is True
    assert once["ui"]["deno_llm_gate"][0]["source"] == "Approve once"
    assert once["ui"]["deno_llm_gate"][0]["approve_once_consumed"] is True
    assert once["ui"]["deno_llm_gate"][0]["reason"] == "Approved once."


def test_ai_review_gate_approve_once_can_pass_saved_image_snapshot_without_upstream_link():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    gate = package.DenoAIReviewGate()
    image = np.zeros((1, 4, 5, 3), dtype=np.float32)
    image[0, 1, 2, 0] = 0.75

    failed = gate.gate(
        review="fail",
        image=image,
        audio=None,
        unique_id="approve-snapshot",
    )
    info = failed["ui"]["deno_llm_gate"][0]
    assert info["passed"] is False
    assert info["reason"] == "Reviewer marked this result as FAIL."
    assert "snapshot_image" in info
    assert "preview_image" in info

    reviewer_state = json.dumps({"snapshot_image": info["snapshot_image"]})
    approved = gate.gate(
        review="Approved once.",
        approve_once=True,
        image=None,
        audio=None,
        reviewer_state=reviewer_state,
        unique_id="approve-snapshot",
    )
    approved_info = approved["ui"]["deno_llm_gate"][0]
    restored = approved["result"][0]

    assert approved_info["passed"] is True
    assert approved_info["source"] == "Approve once"
    assert approved_info["approve_once_consumed"] is True
    assert not isinstance(restored, module.ExecutionBlocker)
    assert np.asarray(restored).shape == image.shape
    assert np.isclose(np.asarray(restored)[0, 1, 2, 0], 0.75)

def test_local_llm_refiner_normalizes_prompts_seed_modes_and_local_urls():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    source = (REPO_ROOT / "deno_local_llm_refiner.py").read_text(encoding="utf-8")

    assert module._flatten_prompts(["a", ["b", "c"]]) == ["a", "b", "c"]
    assert module._seed_for_index(7, "fixed", 2) == 7
    assert module._seed_for_index(7, "increment", 2) == 9
    assert module._seed_for_index(7, "decrement", 9) == 0
    assert module._normalize_seed_mode("random") == "randomize"
    assert module._normalize_lm_openai_url("http://127.0.0.1:1234") == "http://127.0.0.1:1234/v1"
    assert module._normalize_comfy_vram_policy("Auto") == "Auto: unload only before first LLM call"
    assert module._normalize_comfy_vram_policy("Always free") == "Always unload before each LLM call"
    assert module._normalize_comfy_vram_policy("Never free") == "Never unload before LLM call"
    assert "urlopen" not in source
    assert "urllib.request" not in source

    try:
        module._assert_local_url("https://example.com")
    except RuntimeError as exc:
        assert "Only local LLM servers" in str(exc)
    else:
        raise AssertionError("non-local URL should be rejected")

    calls = []
    original_open_connection = module._open_local_llm_http_connection
    module._open_local_llm_http_connection = lambda *args, **kwargs: calls.append((args, kwargs))
    try:
        with pytest.raises(RuntimeError, match="Only local LLM servers"):
            module._http_json("https://example.com/api/tags")
    finally:
        module._open_local_llm_http_connection = original_open_connection
    assert calls == []


def test_resize_box_declares_comfyui_contract():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"]

    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["mode"][0] == ["Preset Ratio", "Manual Input", "Keep Input Ratio"]
    assert "16:9" in input_types["required"]["ratio_preset"][0]
    assert input_types["required"]["megapixels"][0] == "FLOAT"
    assert input_types["required"]["divisible_by"][0] == ["1", "8", "16", "32", "64", "128"]
    assert input_types["required"]["divisible_by"][1]["default"] == "32"
    assert input_types["optional"]["image"][0] == "IMAGE"
    assert node_cls.RETURN_TYPES == ("IMAGE", "INT", "INT")
    assert node_cls.RETURN_NAMES == ("image", "width", "height")
    assert node_cls.FUNCTION == "setup_resolution"


def test_resize_box_calculates_aligned_dimensions_for_preset_mode():
    package = load_package()
    node = package.DenoResolutionSetup()

    width, height, megapixels, aspect_ratio = node.calculate_dims(
        mode="Preset Ratio",
        ratio_preset="16:9",
        megapixels=2.1,
        width=1024,
        height=1024,
        divisible_by="64",
    )

    assert (width, height) == (1920, 1088)
    assert round(megapixels, 3) == 2.089
    assert aspect_ratio == "30:17"


def test_resize_box_rounds_manual_input_to_effective_alignment():
    package = load_package()
    node = package.DenoResolutionSetup()

    width, height, megapixels, aspect_ratio = node.calculate_dims(
        mode="Manual Input",
        ratio_preset="1:1",
        megapixels=1.0,
        width=1030,
        height=777,
        divisible_by="64",
    )

    assert (width, height) == (1088, 832)
    assert round(megapixels, 3) == 0.905
    assert aspect_ratio == "17:13"


def test_resize_box_keep_input_ratio_mode_uses_source_image_aspect():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["megapixels"][0] == "FLOAT"
    assert input_types["required"]["divisible_by"][0] == ["1", "8", "16", "32", "64", "128"]
    assert input_types["required"]["interpolation"][0][0] == "lanczos"
    assert input_types["optional"]["image"][0] == "IMAGE"
    assert node_cls.RETURN_TYPES == ("IMAGE", "INT", "INT")
    assert node_cls.RETURN_NAMES == ("image", "width", "height")

    class DummyImage:
        shape = (1, 1024, 1536, 3)

    node = package.DenoResolutionSetup()
    width, height, megapixels, aspect_ratio = node.calculate_dims(
        mode="Keep Input Ratio",
        ratio_preset="16:9",
        megapixels=2.1,
        width=1024,
        height=1024,
        divisible_by="16",
        image=DummyImage(),
    )

    assert width % 16 == 0
    assert height % 16 == 0
    assert round(width / height, 3) == 1.5
    assert abs(megapixels - 2.1) < 0.03
    assert aspect_ratio == "3:2"


def test_resolution_related_nodes_skip_inactive_missing_ratio_combo_values():
    package = load_package()

    resolution_cls = package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"]
    multi_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    advanced_cls = package.NODE_CLASS_MAPPINGS["DenoAdvancedImageSourceLoader"]
    rtx_cls = package.NODE_CLASS_MAPPINGS["DenoRTXVFXEasyUpscale"]
    finisher_cls = package.NODE_CLASS_MAPPINGS["DenoRTXVFXVideoFinisher"]
    folder_paths = sys.modules["folder_paths"]
    original_get_input_directory = folder_paths.get_input_directory

    with tempfile.TemporaryDirectory() as temp_dir:
        Image.new("RGB", (2, 2), color=(1, 2, 3)).save(Path(temp_dir) / "sample.png")
        folder_paths.get_input_directory = lambda: temp_dir
        try:
            multi_manual_result = multi_cls.VALIDATE_INPUTS(
                image_paths="sample.png",
                mode="Manual Input",
                ratio_preset="1712:880",
            )
            multi_preset_result = multi_cls.VALIDATE_INPUTS(
                image_paths="sample.png",
                mode="Preset Ratio",
                ratio_preset="1712:880",
            )
        finally:
            folder_paths.get_input_directory = original_get_input_directory

    assert resolution_cls.VALIDATE_INPUTS(mode="Keep Input Ratio", ratio_preset="1712:880") is True
    assert multi_manual_result is True
    assert advanced_cls.VALIDATE_INPUTS(mode="Keep Input Ratio", ratio_preset="1712:880") is True
    assert rtx_cls.VALIDATE_INPUTS(mode="Denoise Medium", resize_type="Preset Ratio", ratio_preset="1712:880") is True
    assert finisher_cls.VALIDATE_INPUTS(upscale_pass="Off", resize_type="Preset Ratio", ratio_preset="1712:880") is True

    for result in (
        resolution_cls.VALIDATE_INPUTS(mode="Preset Ratio", ratio_preset="1712:880"),
        multi_preset_result,
        advanced_cls.VALIDATE_INPUTS(mode="Preset Ratio", ratio_preset="1712:880"),
        rtx_cls.VALIDATE_INPUTS(mode="VSR Medium", resize_type="Preset Ratio", ratio_preset="1712:880"),
        finisher_cls.VALIDATE_INPUTS(upscale_pass="VSR", resize_type="Preset Ratio", ratio_preset="1712:880"),
    ):
        assert "ratio_preset" in result
        assert "Preset Ratio" in result


def test_resolution_related_nodes_reject_invalid_active_combo_controls():
    package = load_package()

    resolution_cls = package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"]
    multi_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    advanced_cls = package.NODE_CLASS_MAPPINGS["DenoAdvancedImageSourceLoader"]
    rtx_cls = package.NODE_CLASS_MAPPINGS["DenoRTXVFXEasyUpscale"]
    finisher_cls = package.NODE_CLASS_MAPPINGS["DenoRTXVFXVideoFinisher"]

    assert "mode" in resolution_cls.VALIDATE_INPUTS(mode="Whatever", ratio_preset="16:9")
    assert "divisible_by" in resolution_cls.VALIDATE_INPUTS(mode="Manual Input", divisible_by="7")
    assert "interpolation" in multi_cls.VALIDATE_INPUTS(
        image_paths="",
        mode="Manual Input",
        ratio_preset="16:9",
        interpolation="magic",
    )
    assert "resize_method" in multi_cls.VALIDATE_INPUTS(
        image_paths="",
        mode="Manual Input",
        ratio_preset="16:9",
        resize_method="stretch badly",
    )
    assert "list_output_mode" in advanced_cls.VALIDATE_INPUTS(
        mode="Manual Input",
        ratio_preset="16:9",
        list_output_mode="Merged List",
    )
    assert "mode" in rtx_cls.VALIDATE_INPUTS(
        mode="VSR Impossible",
        resize_type="Preset Ratio",
        ratio_preset="16:9",
    )
    assert "resize_type" in rtx_cls.VALIDATE_INPUTS(
        mode="VSR Medium",
        resize_type="Fake Resize",
        ratio_preset="16:9",
    )
    assert "upscale_pass" in finisher_cls.VALIDATE_INPUTS(
        upscale_pass="Maybe",
        resize_type="Preset Ratio",
        ratio_preset="16:9",
    )
    assert "resize_type" in finisher_cls.VALIDATE_INPUTS(
        upscale_pass="VSR",
        resize_type="Fake Resize",
        ratio_preset="16:9",
    )
    assert finisher_cls.VALIDATE_INPUTS(
        first_pass="Off",
        first_quality="Retired Quality",
        upscale_pass="Off",
        upscale_quality="Retired Quality",
        resize_type="Retired Resize",
        ratio_preset="1712:880",
    ) is True


def test_video_compare_validation_accepts_stale_hidden_combo_values():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoVideoCompare"]

    assert node_cls.VALIDATE_INPUTS(mode="A/B", toggle_image="C") is True
