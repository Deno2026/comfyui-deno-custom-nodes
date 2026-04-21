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


def load_package():
    install_torch_stub()
    install_ltx_stub()
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
    ]
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoResolutionSetup"] == "(Deno) Resize Box"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoMultiImageLoader"] == "(Deno) Multi Image Loader"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoLTXSequencer"] == "(Deno) LTX Sequencer"
    assert package.WEB_DIRECTORY == "./web/js"


def test_multi_image_loader_returns_only_batch_output():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoMultiImageLoader"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["image_paths"][0] == "STRING"
    assert input_types["required"]["mode"][0] == ["Preset Ratio", "Manual Input"]
    assert "16:9" in input_types["required"]["ratio_preset"][0]
    assert input_types["required"]["megapixels"][0] == "FLOAT"
    assert input_types["required"]["divisible_by"][0] == ["1", "8", "16", "32", "64", "128"]
    assert input_types["required"]["divisible_by"][1]["default"] == "32"
    assert input_types["required"]["interpolation"][0][0] == "lanczos"
    assert node_cls.RETURN_TYPES == ("IMAGE",)
    assert node_cls.RETURN_NAMES == ("multi_output",)
    assert node_cls.CATEGORY == "Deno/Image"


def test_ltx_sequencer_declares_sync_controls():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLTXSequencer"]
    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["strength_sync"][0] == "BOOLEAN"
    assert node_cls.RETURN_TYPES == ("CONDITIONING", "CONDITIONING", "LATENT")
    assert node_cls.CATEGORY == "Deno/LTX"


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
