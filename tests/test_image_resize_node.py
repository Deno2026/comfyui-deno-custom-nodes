import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_INIT = REPO_ROOT / "__init__.py"


def load_package():
    spec = importlib.util.spec_from_file_location(
        "comfyui_deno_custom_nodes",
        PACKAGE_INIT,
        submodule_search_locations=[str(REPO_ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_node_registration_exports_only_resize_box_node():
    package = load_package()

    assert list(package.NODE_CLASS_MAPPINGS.keys()) == ["DenoResolutionSetup"]
    assert package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"].__name__ == "DenoResolutionSetup"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["DenoResolutionSetup"] == "(Deno) Resize Box"
    assert package.WEB_DIRECTORY == "./web/js"


def test_resize_box_declares_comfyui_contract():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["DenoResolutionSetup"]

    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["mode"][0] == ["Preset Ratio", "Manual Input"]
    assert "16:9" in input_types["required"]["ratio_preset"][0]
    assert input_types["required"]["megapixels"][0] == "FLOAT"
    assert input_types["required"]["divisible_by"][0] == ["8", "16", "32", "64", "128"]
    assert input_types["required"]["resize_method"][0] == [
        "Center Crop (Fill)",
        "Fit (Letterbox/Pillarbox)",
    ]
    assert input_types["required"]["interpolation"][0] == [
        "lanczos",
        "bicubic",
        "bilinear",
        "area",
        "nearest",
        "nearest-exact",
    ]
    assert input_types["optional"]["image"][0] == "IMAGE"
    assert node_cls.RETURN_TYPES == ("IMAGE", "INT", "INT")
    assert node_cls.RETURN_NAMES == ("image", "width", "height")
    assert node_cls.FUNCTION == "setup_resolution"
    assert node_cls.CATEGORY == "Deno/Image"
    assert "https://www.youtube.com/@Denoise-AI" in node_cls.DESCRIPTION


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
