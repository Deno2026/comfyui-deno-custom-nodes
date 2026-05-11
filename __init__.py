import math
import sys
from pathlib import Path
from typing import Tuple

import torch
import torch.nn.functional as F

from .deno_ltx_sequencer_plus import DenoLTXSequencer
from .deno_ltx23_preset_loader import DenoLTX23PresetLoader
from .deno_ltx_model_downloader import DenoLTXModelDownloader
from .deno_ltx_multi_lora_loader import DenoLTXMultiLoraLoader
from .deno_ltx_prompt_guide import DenoLTXPromptGuide
from .deno_multi_image_board import DenoAdvancedImageSourceLoader, DenoMultiImageLoader
from .deno_resolution_common import COMMON_RATIOS, DIVISIBLE_BY_VALUES, PREFERRED_DIMENSIONS, RESIZE_METHODS, parse_ratio

INTERPOLATION_MODES = ["lanczos", "bicubic", "bilinear", "area", "nearest", "nearest-exact"]
RESOLUTION_MODES = ["Preset Ratio", "Manual Input", "Keep Input Ratio"]


def _choice(value, choices, default):
    text = str(value).strip()
    return text if text in choices else default


def _safe_float(value, default, minimum, maximum):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)
    if not math.isfinite(number):
        number = float(default)
    return min(max(number, minimum), maximum)


def _safe_int(value, default, minimum, maximum):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        number = int(default)
    return min(max(number, minimum), maximum)


def _normalize_divisible_by(value, default="32"):
    text = str(value).strip()
    if text in DIVISIBLE_BY_VALUES:
        return text
    try:
        text = str(int(float(text)))
    except (TypeError, ValueError):
        return default
    return text if text in DIVISIBLE_BY_VALUES else default


def _looks_like_legacy_resolution_without_mode(mode, ratio_preset):
    return str(mode).strip() in COMMON_RATIOS and str(ratio_preset).strip() not in COMMON_RATIOS


def _normalize_resolution_inputs(
    mode,
    ratio_preset,
    megapixels,
    width,
    height,
    divisible_by,
    resize_method,
    interpolation,
):
    if _looks_like_legacy_resolution_without_mode(mode, ratio_preset):
        legacy_ratio_preset = mode
        legacy_megapixels = ratio_preset
        legacy_width = megapixels
        legacy_height = width
        legacy_divisible_by = height

        if str(divisible_by).strip() in RESIZE_METHODS:
            legacy_resize_method = divisible_by
            legacy_interpolation = resize_method
        elif str(divisible_by).strip() in INTERPOLATION_MODES:
            legacy_interpolation = divisible_by
            legacy_resize_method = resize_method
        else:
            legacy_resize_method = resize_method
            legacy_interpolation = interpolation

        mode = "Preset Ratio"
        ratio_preset = legacy_ratio_preset
        megapixels = legacy_megapixels
        width = legacy_width
        height = legacy_height
        divisible_by = legacy_divisible_by
        resize_method = legacy_resize_method
        interpolation = legacy_interpolation

    return (
        _choice(mode, RESOLUTION_MODES, "Preset Ratio"),
        _choice(ratio_preset, COMMON_RATIOS, "16:9"),
        _safe_float(megapixels, 1.0, 0.01, 10.0),
        _safe_int(width, 1024, 64, 8192),
        _safe_int(height, 1024, 64, 8192),
        _normalize_divisible_by(divisible_by),
        _choice(resize_method, RESIZE_METHODS, "Center Crop (Fill)"),
        _choice(interpolation, INTERPOLATION_MODES, "lanczos"),
    )


def _get_torch():
    return torch


def _get_comfy_utils():
    try:
        from comfy import utils as comfy_utils
    except ModuleNotFoundError:
        comfy_root = Path(__file__).resolve().parents[2]
        comfy_root_str = str(comfy_root)
        if comfy_root_str not in sys.path:
            sys.path.append(comfy_root_str)
        from comfy import utils as comfy_utils

    return comfy_utils


def _round_up(value: float, multiple: int) -> int:
    return int(math.ceil(max(float(value), float(multiple)) / multiple) * multiple)


def _round_down(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor(float(value) / multiple) * multiple))


def _round_nearest(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor((float(value) / multiple) + 0.5) * multiple))


def _parse_ratio(ratio_preset: str) -> Tuple[int, int]:
    return parse_ratio(ratio_preset)


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


def _compute_auto_ratio_dims(
    source_width: int,
    source_height: int,
    megapixels: float,
    divisible_by: int,
) -> Tuple[int, int]:
    effective_alignment = int(divisible_by)
    total_pixels = max(0.01, float(megapixels)) * 1_000_000
    source_area = max(1.0, float(source_width * source_height))
    source_aspect = float(source_width) / float(source_height)

    scale = math.sqrt(total_pixels / source_area)
    base_width = max(float(effective_alignment), float(source_width) * scale)
    base_height = max(float(effective_alignment), float(source_height) * scale)

    rounders = (_round_down, _round_nearest, _round_up)
    candidates = set()

    for rounder in rounders:
        width_candidate = rounder(base_width, effective_alignment)
        exact_height = width_candidate / source_aspect
        for height_rounder in rounders:
            candidates.add((width_candidate, height_rounder(exact_height, effective_alignment)))

    for rounder in rounders:
        height_candidate = rounder(base_height, effective_alignment)
        exact_width = height_candidate * source_aspect
        for width_rounder in rounders:
            candidates.add((width_rounder(exact_width, effective_alignment), height_candidate))

    candidates.add((
        _round_nearest(base_width, effective_alignment),
        _round_nearest(base_height, effective_alignment),
    ))

    def candidate_score(dims: Tuple[int, int]) -> Tuple[float, float, float]:
        width_candidate, height_candidate = dims
        area_error = abs((width_candidate * height_candidate) - total_pixels) / total_pixels
        ratio_error = abs((width_candidate / height_candidate) - source_aspect) / source_aspect
        distance_error = (
            abs(width_candidate - base_width) / base_width
            + abs(height_candidate - base_height) / base_height
        )
        return (
            area_error,
            ratio_error,
            distance_error,
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
        return _resize_with_comfy(image_nchw, height, width)

    kwargs = {}
    if interpolation in {"bilinear", "bicubic"}:
        kwargs["align_corners"] = False
    return _get_torch().nn.functional.interpolate(
        image_nchw,
        size=(height, width),
        mode=interpolation,
        **kwargs,
    )


def _resize_with_comfy(image_nchw, height: int, width: int):
    comfy_utils = _get_comfy_utils()
    return comfy_utils.common_upscale(image_nchw, width, height, "lanczos", "disabled")


class DenoResolutionSetup:
    DESCRIPTION = (
        "Resolution helper and image resize node for ComfyUI.\n"
        "Preset ratio, manual input, or keep-input-ratio auto mode with MP-based sizing, divisible-by alignment, "
        "crop/fit resize, and realtime ratio preview.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (RESOLUTION_MODES, {"default": "Preset Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
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

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    def calculate_dims(
        self,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by: int,
        image=None,
    ) -> Tuple[int, int, float, str]:
        effective_alignment = int(divisible_by)

        if mode == "Preset Ratio":
            final_width, final_height = _compute_aligned_ratio_dims(
                ratio_preset=ratio_preset,
                megapixels=megapixels,
                divisible_by=effective_alignment,
            )
        elif mode == "Keep Input Ratio":
            if image is not None:
                _, source_height, source_width, _ = image.shape
                final_width, final_height = _compute_auto_ratio_dims(
                    source_width=int(source_width),
                    source_height=int(source_height),
                    megapixels=megapixels,
                    divisible_by=effective_alignment,
                )
            else:
                final_width = _round_up(width, effective_alignment)
                final_height = _round_up(height, effective_alignment)
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
        (
            mode,
            ratio_preset,
            megapixels,
            width,
            height,
            divisible_by,
            resize_method,
            interpolation,
        ) = _normalize_resolution_inputs(
            mode=mode,
            ratio_preset=ratio_preset,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=divisible_by,
            resize_method=resize_method,
            interpolation=interpolation,
        )
        final_width, final_height, final_megapixels, aspect_ratio = self.calculate_dims(
            mode=mode,
            ratio_preset=ratio_preset,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=divisible_by,
            image=image,
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
    "DenoMultiImageLoader": DenoMultiImageLoader,
    "DenoAdvancedImageSourceLoader": DenoAdvancedImageSourceLoader,
    "DenoLTXSequencer": DenoLTXSequencer,
    "DenoLTX23PresetLoader": DenoLTX23PresetLoader,
    "DenoLTXModelDownloader": DenoLTXModelDownloader,
    "DenoLTXMultiLoraLoader": DenoLTXMultiLoraLoader,
    "DenoLTXPromptGuide": DenoLTXPromptGuide,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoResolutionSetup": "(Deno) Resize Box",
    "DenoMultiImageLoader": "(Deno) Multi Image Loader",
    "DenoAdvancedImageSourceLoader": "(Deno) Advanced Image Source Loader",
    "DenoLTXSequencer": "(Deno) LTX Sequencer",
    "DenoLTX23PresetLoader": "(Deno) LTX Model Loader",
    "DenoLTXModelDownloader": "(Deno) Easy Model Download Helper",
    "DenoLTXMultiLoraLoader": "(Deno) LTX Multi LoRA Loader",
    "DenoLTXPromptGuide": "(Deno) LTX Prompt Guide",
}

WEB_DIRECTORY = "./web/js"
