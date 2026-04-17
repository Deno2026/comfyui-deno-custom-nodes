import math
from typing import Tuple

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


COMMON_RATIOS = [
    "1:1",
    "4:5",
    "5:4",
    "3:4",
    "4:3",
    "2:3",
    "3:2",
    "16:9",
    "9:16",
    "16:10",
    "10:16",
    "21:9",
    "9:21",
]

INTERPOLATION_MODES = ["lanczos", "bicubic", "bilinear", "area", "nearest", "nearest-exact"]
DIVISIBLE_BY_VALUES = ["8", "16", "32", "64", "128"]
RESIZE_METHODS = ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"]
PREFERRED_DIMENSIONS = [512, 720, 768, 1024, 1088, 1536, 1920]


def _get_torch():
    return torch


def _round_up(value: float, multiple: int) -> int:
    return int(math.ceil(max(float(value), float(multiple)) / multiple) * multiple)


def _parse_ratio(ratio_preset: str) -> Tuple[int, int]:
    ratio_x, ratio_y = ratio_preset.split(":")
    return int(ratio_x), int(ratio_y)


def _simplify_ratio(width: int, height: int) -> str:
    gcd = math.gcd(int(width), int(height))
    return f"{width // gcd}:{height // gcd}"


def _compute_aligned_ratio_dims(
    ratio_preset: str,
    megapixels: float,
    divisible_by: int,
) -> Tuple[int, int]:
    ratio_x, ratio_y = _parse_ratio(ratio_preset)
    total_pixels = max(0.01, float(megapixels)) * 1_000_000
    effective_alignment = int(divisible_by)

    base_width = math.sqrt(total_pixels * ratio_x / ratio_y)
    base_height = math.sqrt(total_pixels * ratio_y / ratio_x)

    def round_down(value: float) -> int:
        return max(effective_alignment, int(math.floor(float(value) / effective_alignment) * effective_alignment))

    width_candidates = sorted({_round_up(base_width, effective_alignment), round_down(base_width)})
    height_candidates = sorted({_round_up(base_height, effective_alignment), round_down(base_height)})

    candidates = set()

    for width_candidate in width_candidates:
        exact_height = width_candidate * ratio_y / ratio_x
        candidates.add((width_candidate, _round_up(exact_height, effective_alignment)))
        candidates.add((width_candidate, round_down(exact_height)))

    for height_candidate in height_candidates:
        exact_width = height_candidate * ratio_x / ratio_y
        candidates.add((_round_up(exact_width, effective_alignment), height_candidate))
        candidates.add((round_down(exact_width), height_candidate))

    def candidate_score(dims: Tuple[int, int]) -> Tuple[float, float, float]:
        width_candidate, height_candidate = dims
        area_error = abs((width_candidate * height_candidate) - total_pixels) / total_pixels
        width_error = abs(width_candidate - base_width) / base_width
        height_error = abs(height_candidate - base_height) / base_height
        ratio_error = abs((width_candidate / height_candidate) - (ratio_x / ratio_y)) / (ratio_x / ratio_y)
        preference_error = min(abs(width_candidate - preferred) for preferred in PREFERRED_DIMENSIONS) + min(
            abs(height_candidate - preferred) for preferred in PREFERRED_DIMENSIONS
        )
        return (
            width_error + height_error,
            preference_error,
            area_error,
            ratio_error,
        )

    return min(candidates, key=candidate_score)


def _resize_with_method(
    image,
    target_width: int,
    target_height: int,
    resize_method: str,
    interpolation: str,
):
    image_nchw = image.movedim(-1, 1)
    _, _, source_height, source_width = image_nchw.shape

    source_aspect = source_width / source_height
    target_aspect = target_width / target_height

    if resize_method == "Center Crop (Fill)":
        if source_aspect > target_aspect:
            scale = target_height / source_height
        else:
            scale = target_width / source_width

        intermediate_width = max(1, int(round(source_width * scale)))
        intermediate_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_image(image_nchw, intermediate_height, intermediate_width, interpolation)

        crop_x = max(0, (intermediate_width - target_width) // 2)
        crop_y = max(0, (intermediate_height - target_height) // 2)
        resized = resized[:, :, crop_y:crop_y + target_height, crop_x:crop_x + target_width]
    else:
        if source_aspect > target_aspect:
            scale = target_width / source_width
        else:
            scale = target_height / source_height

        intermediate_width = max(1, int(round(source_width * scale)))
        intermediate_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_image(image_nchw, intermediate_height, intermediate_width, interpolation)

        pad_width = max(0, target_width - intermediate_width)
        pad_height = max(0, target_height - intermediate_height)
        resized = F.pad(
            resized,
            (
                pad_width // 2,
                pad_width - (pad_width // 2),
                pad_height // 2,
                pad_height - (pad_height // 2),
            ),
            mode="constant",
            value=0.0,
        )

    return resized.movedim(1, -1).clamp(0.0, 1.0)


def _interpolate_image(image_nchw, height: int, width: int, interpolation: str):
    if interpolation == "lanczos":
        return _resize_with_pil(image_nchw, height, width, Image.Resampling.LANCZOS)

    kwargs = {}
    if interpolation in {"bilinear", "bicubic"}:
        kwargs["align_corners"] = False
    return _get_torch().nn.functional.interpolate(
        image_nchw,
        size=(height, width),
        mode=interpolation,
        **kwargs,
    )


def _resize_with_pil(image_nchw, height: int, width: int, resample):
    torch_module = _get_torch()
    resized_batches = []

    for sample in image_nchw:
        sample_hwc = sample.permute(1, 2, 0).detach().cpu().clamp(0.0, 1.0).numpy()
        pil_image = Image.fromarray(np.clip(sample_hwc * 255.0, 0, 255).astype(np.uint8))
        resized = pil_image.resize((width, height), resample=resample)
        resized_array = np.asarray(resized).astype(np.float32) / 255.0
        if resized_array.ndim == 2:
            resized_array = resized_array[:, :, None]
        resized_tensor = torch_module.from_numpy(resized_array).permute(2, 0, 1)
        resized_batches.append(resized_tensor)

    return torch_module.stack(resized_batches, dim=0).to(image_nchw.device)


class DenoResolutionSetup:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Preset Ratio", "Manual Input"], {"default": "Preset Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "64"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
                "interpolation": (INTERPOLATION_MODES, {"default": "lanczos"}),
            },
            "optional": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "width", "height")
    FUNCTION = "setup_resolution"
    CATEGORY = "Deno/Image"

    def calculate_dims(
        self,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by: int,
    ) -> Tuple[int, int, float, str]:
        effective_alignment = int(divisible_by)

        if mode == "Preset Ratio":
            final_width, final_height = _compute_aligned_ratio_dims(
                ratio_preset=ratio_preset,
                megapixels=megapixels,
                divisible_by=effective_alignment,
            )
        else:
            final_width = _round_up(width, effective_alignment)
            final_height = _round_up(height, effective_alignment)

        final_megapixels = (final_width * final_height) / 1_000_000
        aspect_ratio = _simplify_ratio(final_width, final_height)
        return final_width, final_height, final_megapixels, aspect_ratio

    def _build_output_image(
        self,
        image,
        width: int,
        height: int,
        resize_method: str,
        interpolation: str,
    ):
        if image is None:
            return _get_torch().zeros((1, height, width, 3), dtype=_get_torch().float32)
        return _resize_with_method(image, width, height, resize_method, interpolation)

    def setup_resolution(
        self,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by: int,
        resize_method: str,
        interpolation: str,
        image=None,
    ):
        final_width, final_height, final_megapixels, aspect_ratio = self.calculate_dims(
            mode=mode,
            ratio_preset=ratio_preset,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=divisible_by,
        )

        output_image = self._build_output_image(
            image=image,
            width=final_width,
            height=final_height,
            resize_method=resize_method,
            interpolation=interpolation,
        )

        return (
            output_image,
            final_width,
            final_height,
        )


NODE_CLASS_MAPPINGS = {
    "DenoResolutionSetup": DenoResolutionSetup,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoResolutionSetup": "(Deno) Resize Box",
}

WEB_DIRECTORY = "./web/js"
