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


def test_node_registration_exports_deno_image_resize_node():
    package = load_package()

    assert "Deno Image Resize" in package.NODE_CLASS_MAPPINGS
    assert package.NODE_CLASS_MAPPINGS["Deno Image Resize"].__name__ == "DenoImageResizeNode"
    assert package.NODE_DISPLAY_NAME_MAPPINGS["Deno Image Resize"] == "Deno Image Resize"


def test_image_resize_node_declares_comfyui_contract():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["Deno Image Resize"]

    input_types = node_cls.INPUT_TYPES()

    assert input_types["required"]["image"][0] == "IMAGE"
    assert input_types["required"]["width"][0] == "INT"
    assert input_types["required"]["height"][0] == "INT"
    assert input_types["required"]["interpolation"][0] == ["nearest", "bilinear", "bicubic", "area"]
    assert node_cls.RETURN_TYPES == ("IMAGE",)
    assert node_cls.RETURN_NAMES == ("image",)
    assert node_cls.FUNCTION == "resize_image"
    assert node_cls.CATEGORY == "Deno/Image"


def test_resize_image_uses_torch_interpolate_and_returns_image_tuple():
    package = load_package()
    node_cls = package.NODE_CLASS_MAPPINGS["Deno Image Resize"]
    calls = []

    class FakeTensor:
        def movedim(self, src, dst):
            calls.append(("movedim", src, dst))
            return self

        def clamp(self, minimum, maximum):
            calls.append(("clamp", minimum, maximum))
            return self

    class FakeFunctional:
        @staticmethod
        def interpolate(tensor, size, mode, **kwargs):
            calls.append(("interpolate", size, mode, kwargs))
            return tensor

    class FakeNN:
        functional = FakeFunctional()

    class FakeTorch:
        nn = FakeNN()

    package._get_torch = lambda: FakeTorch
    image = FakeTensor()

    result = node_cls().resize_image(image=image, width=640, height=384, interpolation="bilinear")

    assert result == (image,)
    assert calls == [
        ("movedim", -1, 1),
        ("interpolate", (384, 640), "bilinear", {"align_corners": False}),
        ("movedim", 1, -1),
        ("clamp", 0.0, 1.0),
    ]
