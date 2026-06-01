import importlib.util
import hashlib
import inspect
import json
import os
import sys
import tempfile
import types
import urllib.error
from pathlib import Path

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
    if "comfy_extras.nodes_lt" in sys.modules:
        return

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
    if "folder_paths" not in sys.modules:
        folder_paths = types.ModuleType("folder_paths")
        folder_paths.models_dir = str(REPO_ROOT / "models")
        folder_paths.folder_names_and_paths = {}
        folder_paths.get_filename_list = lambda folder_name: []
        folder_paths.get_full_path = lambda folder_name, filename: str(REPO_ROOT / "models" / folder_name / filename)
        folder_paths.get_full_path_or_raise = folder_paths.get_full_path
        folder_paths.get_folder_paths = lambda folder_name: [str(REPO_ROOT / "models" / folder_name)]
        folder_paths.get_input_directory = lambda: str(REPO_ROOT / "input")
        sys.modules["folder_paths"] = folder_paths

    if "nodes" not in sys.modules:
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

    if "node_helpers" not in sys.modules:
        node_helpers = types.ModuleType("node_helpers")
        node_helpers.conditioning_set_values = lambda conditioning, values: conditioning
        sys.modules["node_helpers"] = node_helpers

    if "comfy" not in sys.modules:
        comfy = types.ModuleType("comfy")
        comfy.lora = types.ModuleType("comfy.lora")
        comfy.lora_convert = types.ModuleType("comfy.lora_convert")
        comfy.utils = types.ModuleType("comfy.utils")
        comfy.lora.model_lora_keys_unet = lambda model, key_map: key_map
        comfy.lora.model_lora_keys_clip = lambda clip, key_map: key_map
        comfy.lora.load_lora = lambda lora_sd, key_map: {}
        comfy.lora_convert.convert_lora = lambda lora_sd: lora_sd
        comfy.utils.load_torch_file = lambda *args, **kwargs: {}
        sys.modules["comfy"] = comfy
        sys.modules["comfy.lora"] = comfy.lora
        sys.modules["comfy.lora_convert"] = comfy.lora_convert
        sys.modules["comfy.utils"] = comfy.utils

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
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoRTXVFXEasyUpscale"] == "(Deno) RTX Video Super Resolution"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoRTXVFXVideoFinisher"] == "(Deno) RTX Video Super Resolution (2 Pass)"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoImageCompare"] == "(Deno) Image Compare"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoVideoCompare"] == "(Deno) Video Compare"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoVideoPreview"] == "(Deno) Video Preview"
    assert package.WEB_DIRECTORY == "./web/js"


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


def test_multi_image_loader_validate_inputs_does_not_disable_builtin_validation():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]

    signature = inspect.signature(node_cls.VALIDATE_INPUTS)

    assert list(signature.parameters) == ["image_paths"]
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


def test_ltx_model_setup_helper_recursively_finds_files_in_model_subfolders():
    load_package()
    module = sys.modules["comfyui_deno_custom_nodes.deno_ltx_model_downloader"]

    with tempfile.TemporaryDirectory() as temp_dir:
        models_root = Path(temp_dir) / "models"
        nested_dir = models_root / "diffusion_models" / "Flux"
        nested_dir.mkdir(parents=True)
        target_file = nested_dir / "flux2-klein-9b-kv-fp8.safetensors"
        target_file.write_bytes(b"ready")

        result = module._public_custom_file(
            str(models_root),
            {
                "url": "https://example.com/flux2-klein-9b-kv-fp8.safetensors",
                "target_subdir": "diffusion_models",
                "filename": "flux2-klein-9b-kv-fp8.safetensors",
                "size": 1,
            },
            0,
        )

    assert result["status"] == "exists"
    assert result["found_by"] == "subfolder"
    assert result["relative_path"].replace("\\", "/") == "diffusion_models/Flux/flux2-klein-9b-kv-fp8.safetensors"


def test_ltx_model_setup_helper_has_no_backend_download_code():
    source = (REPO_ROOT / "deno_ltx_model_downloader.py").read_text(encoding="utf-8")

    assert "urlopen" not in source
    assert "urllib.request" not in source
    assert "subprocess" not in source
    assert "write_bytes(" not in source
    assert "shutil.copy" not in source
    assert "ClientSession" not in source
    assert "resolve_civitai" not in source


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
