from nodes import PreviewImage


COMPARE_MODES = ["Slider", "Side by Side", "Difference", "Toggle"]
TOGGLE_CHOICES = ["A", "B"]


def _single_image(image):
    if image is None or len(image) <= 0:
        return None
    return image[:1].float().clamp(0.0, 1.0)


def _normalize_mode(mode: str) -> str:
    return mode if mode in COMPARE_MODES else "Slider"


def _normalize_toggle(value: str) -> str:
    return value if value in TOGGLE_CHOICES else "B"


def _normalize_split(value) -> float:
    try:
        return max(0.02, min(0.98, float(value)))
    except (TypeError, ValueError):
        return 0.5


def _normalize_bool(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _image_size(image):
    if image is None:
        return 0, 0
    return int(image.shape[2]), int(image.shape[1])


class DenoImageCompare(PreviewImage):
    DESCRIPTION = (
        "DENO A/B image comparison node with Slider, Side by Side, Difference, Toggle, "
        "Swap, and visible A/B labels."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (COMPARE_MODES, {"default": "Slider"}),
                "split_position": ("FLOAT", {"default": 0.5, "min": 0.02, "max": 0.98, "step": 0.01}),
                "toggle_image": (TOGGLE_CHOICES, {"default": "B"}),
                "swap": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "compare_images"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def _preview_ui(self, image, filename_prefix: str, prompt=None, extra_pnginfo=None):
        if image is None or len(image) <= 0:
            return []
        return self.save_images(image[:1], filename_prefix, prompt, extra_pnginfo)["ui"]["images"]

    def compare_images(
        self,
        mode: str,
        split_position: float,
        toggle_image: str,
        swap: bool,
        image_a=None,
        image_b=None,
        prompt=None,
        extra_pnginfo=None,
    ):
        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)

        source_a = _single_image(image_a)
        source_b = _single_image(image_b)
        width_a, height_a = _image_size(source_a)
        width_b, height_b = _image_size(source_b)

        ui = {
            "a_images": self._preview_ui(source_a, "deno.compare.a.", prompt, extra_pnginfo),
            "b_images": self._preview_ui(source_b, "deno.compare.b.", prompt, extra_pnginfo),
            "compare_meta": [{
                "mode": mode,
                "split_position": split_position,
                "toggle_image": toggle_image,
                "swap": swap,
                "a_width": width_a,
                "a_height": height_a,
                "b_width": width_b,
                "b_height": height_b,
            }],
        }
        return {"ui": ui}
