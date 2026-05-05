import importlib.util
import sys
import types
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_INIT = REPO_ROOT / "__init__.py"


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

        nodes_stub.CheckpointLoaderSimple = CheckpointLoaderSimple
        nodes_stub.UNETLoader = UNETLoader
        nodes_stub.DualCLIPLoader = DualCLIPLoader
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
        "DenoLTXSequencer",
        "DenoLTX23PresetLoader",
        "DenoLTXModelDownloader",
        "DenoLTXMultiLoraLoader",
        "DenoLTXPromptGuide",
    ]
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoResolutionSetup"] == "(Deno) Resize Box"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoMultiImageLoader"] == "(Deno) Multi Image Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXSequencer"] == "(Deno) LTX Sequencer"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTX23PresetLoader"] == "(Deno) LTX Model Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXModelDownloader"] == "(Deno) Easy Model Download Helper"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXMultiLoraLoader"] == "(Deno) LTX Multi LoRA Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXPromptGuide"] == "(Deno) LTX Prompt Guide"
    assert package.WEB_DIRECTORY == "./web/js"


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
    assert input_types["required"]["clip_device"][0] == ["default", "cpu"]
    assert node_cls.RETURN_TYPES == ("MODEL", "CLIP", "VAE", "VAE")
    assert node_cls.RETURN_NAMES == ("model", "clip", "video_vae", "audio_vae")
    assert node_cls.CATEGORY == "Deno/LTX"


def test_ltx_model_setup_helper_declares_output_node_and_safe_root_widget():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXModelDownloader"]
    input_types = node_cls.INPUT_TYPES()

    assert node_cls.RETURN_TYPES == ()
    assert node_cls.OUTPUT_NODE is True
    assert node_cls.CATEGORY == "Deno/Setup"
    assert "model_root" in input_types["required"]
    assert input_types["required"]["model_root"][1]["default"] == input_types["required"]["model_root"][0][0]


def test_ltx_model_setup_helper_has_no_backend_download_code():
    source = (REPO_ROOT / "deno_ltx_model_downloader.py").read_text(encoding="utf-8")

    assert "urlopen" not in source
    assert "urllib.request" not in source
    assert "subprocess" not in source
    assert "@PromptServer.instance.routes.post" not in source


def test_ltx_multi_lora_loader_declares_compact_av_controls():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXMultiLoraLoader"]
    input_types = node_cls.INPUT_TYPES()
    required = input_types["required"]

    assert "advanced_mode" not in required
    assert "trigger_1" not in required
    assert required["active_loras"][0] == "INT"
    assert required["lora_1"][0][0] == "__none__"
    assert required["strength_1"][0] == "FLOAT"
    assert required["video_1"][0] == "FLOAT"
    assert required["audio_1"][0] == "FLOAT"
    assert node_cls.RETURN_TYPES == ("MODEL", "CLIP")
    assert node_cls.RETURN_NAMES == ("model", "clip")


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
