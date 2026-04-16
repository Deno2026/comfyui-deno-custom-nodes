import importlib


def _get_torch():
    return importlib.import_module("torch")


class DenoImageResizeNode:
    CATEGORY = "Deno/Image"
    FUNCTION = "resize_image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "width": ("INT", {"default": 1024, "min": 1, "max": 8192, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 1, "max": 8192, "step": 1}),
                "interpolation": (["nearest", "bilinear", "bicubic", "area"],),
            }
        }

    def resize_image(self, image, width, height, interpolation):
        torch = _get_torch()
        image_chw = image.movedim(-1, 1)

        kwargs = {}
        if interpolation in {"bilinear", "bicubic"}:
            kwargs["align_corners"] = False

        resized = torch.nn.functional.interpolate(
            image_chw,
            size=(height, width),
            mode=interpolation,
            **kwargs,
        )
        resized = resized.movedim(1, -1).clamp(0.0, 1.0)
        return (resized,)


NODE_CLASS_MAPPINGS = {
    "Deno Image Resize": DenoImageResizeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Deno Image Resize": "Deno Image Resize",
}
