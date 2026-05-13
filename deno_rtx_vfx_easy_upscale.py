import math
import sys
from pathlib import Path
from typing import Tuple

import torch
import torch.nn.functional as F

from .deno_resolution_common import COMMON_RATIOS, RESIZE_METHODS, compute_aligned_ratio_dims, round_up


QUALITY_LEVELS = [
    "VSR Medium",
    "VSR High",
    "VSR Low",
    "VSR Ultra",
    "High Bitrate Medium",
    "High Bitrate High",
    "High Bitrate Low",
    "High Bitrate Ultra",
    "Denoise Medium",
    "Denoise High",
    "Denoise Low",
    "Denoise Ultra",
    "Deblur Medium",
    "Deblur High",
    "Deblur Low",
    "Deblur Ultra",
]

RESIZE_TYPES = ["Keep Ratio", "Manual", "Preset Ratio", "Same Size"]
RTX_VFX_DIVISIBLE_BY_VALUES = ["8", "16", "32", "64", "128"]
RTX_VFX_DEFAULT_DIVISIBLE_BY = "32"


def _safe_divisible_by(divisible_by) -> int:
    try:
        value = int(divisible_by)
    except Exception:
        return int(RTX_VFX_DEFAULT_DIVISIBLE_BY)
    if str(value) not in RTX_VFX_DIVISIBLE_BY_VALUES:
        return int(RTX_VFX_DEFAULT_DIVISIBLE_BY)
    return value


def _quality_attr(mode: str) -> str:
    return {
        "VSR Low": "LOW",
        "VSR Medium": "MEDIUM",
        "VSR High": "HIGH",
        "VSR Ultra": "ULTRA",
        "High Bitrate Low": "HIGHBITRATE_LOW",
        "High Bitrate Medium": "HIGHBITRATE_MEDIUM",
        "High Bitrate High": "HIGHBITRATE_HIGH",
        "High Bitrate Ultra": "HIGHBITRATE_ULTRA",
        "Denoise Low": "DENOISE_LOW",
        "Denoise Medium": "DENOISE_MEDIUM",
        "Denoise High": "DENOISE_HIGH",
        "Denoise Ultra": "DENOISE_ULTRA",
        "Deblur Low": "DEBLUR_LOW",
        "Deblur Medium": "DEBLUR_MEDIUM",
        "Deblur High": "DEBLUR_HIGH",
        "Deblur Ultra": "DEBLUR_ULTRA",
        "Bicubic": "BICUBIC",
    }[mode]


def _same_size_only(mode: str) -> bool:
    return mode.startswith("Denoise ") or mode.startswith("Deblur ")


def _aligned_megapixel_size(source_width: int, source_height: int, megapixels: float, divisible_by: int) -> Tuple[int, int]:
    alignment = _safe_divisible_by(divisible_by)
    target_area = max(0.01, float(megapixels)) * 1_000_000.0
    source_aspect = float(source_width) / float(source_height)
    source_area = max(1.0, float(source_width * source_height))
    scale = math.sqrt(target_area / source_area)
    base_width = max(float(alignment), float(source_width) * scale)
    base_height = max(float(alignment), float(source_height) * scale)

    def round_down(value: float) -> int:
        return max(alignment, int(math.floor(float(value) / alignment) * alignment))

    def round_nearest(value: float) -> int:
        return max(alignment, int(math.floor((float(value) / alignment) + 0.5) * alignment))

    def round_up_aligned(value: float) -> int:
        return round_up(value, alignment)

    candidates = set()
    for width_rounder in (round_down, round_nearest, round_up_aligned):
        width_candidate = width_rounder(base_width)
        exact_height = width_candidate / source_aspect
        for height_rounder in (round_down, round_nearest, round_up_aligned):
            candidates.add((width_candidate, height_rounder(exact_height)))

    for height_rounder in (round_down, round_nearest, round_up_aligned):
        height_candidate = height_rounder(base_height)
        exact_width = height_candidate * source_aspect
        for width_rounder in (round_down, round_nearest, round_up_aligned):
            candidates.add((width_rounder(exact_width), height_candidate))

    def candidate_score(dims: Tuple[int, int]) -> Tuple[float, float, float]:
        width_candidate, height_candidate = dims
        area_error = abs((width_candidate * height_candidate) - target_area) / target_area
        ratio_error = abs((width_candidate / height_candidate) - source_aspect) / source_aspect
        distance_error = (
            abs(width_candidate - base_width) / base_width
            + abs(height_candidate - base_height) / base_height
        )
        return (ratio_error, area_error, distance_error)

    return min(candidates, key=candidate_score)


def _target_size(
    source_width: int,
    source_height: int,
    mode: str,
    resize_type: str,
    scale: float,
    megapixels: float,
    width: int,
    height: int,
    divisible_by: int,
    ratio_preset: str,
) -> Tuple[int, int]:
    alignment = _safe_divisible_by(divisible_by)

    if _same_size_only(mode) or resize_type == "Same Size":
        return source_width, source_height
    if resize_type == "Scale":
        return (
            round_up(float(source_width) * float(scale), alignment),
            round_up(float(source_height) * float(scale), alignment),
        )
    if resize_type in {"Keep Ratio", "Megapixels"}:
        return _aligned_megapixel_size(source_width, source_height, megapixels, alignment)
    if resize_type == "Preset Ratio":
        return compute_aligned_ratio_dims(ratio_preset, megapixels, alignment)
    return (
        round_up(int(width), alignment),
        round_up(int(height), alignment),
    )


def _fit_frame_to_target_aspect(frame, target_width: int, target_height: int, resize_method: str):
    if resize_method not in RESIZE_METHODS:
        resize_method = "Center Crop (Fill)"

    _, source_height, source_width = frame.shape
    source_aspect = float(source_width) / float(source_height)
    target_aspect = float(target_width) / float(target_height)

    if abs(source_aspect - target_aspect) < 0.0001:
        return frame.contiguous()

    if resize_method == "Center Crop (Fill)":
        if source_aspect > target_aspect:
            crop_width = max(1, min(int(source_width), int(round(float(source_height) * target_aspect))))
            crop_x = max(0, (int(source_width) - crop_width) // 2)
            return frame[:, :, crop_x:crop_x + crop_width].contiguous()

        crop_height = max(1, min(int(source_height), int(round(float(source_width) / target_aspect))))
        crop_y = max(0, (int(source_height) - crop_height) // 2)
        return frame[:, crop_y:crop_y + crop_height, :].contiguous()

    if source_aspect > target_aspect:
        padded_height = max(int(source_height), int(math.ceil(float(source_width) / target_aspect)))
        pad_total = padded_height - int(source_height)
        pad_top = pad_total // 2
        pad_bottom = pad_total - pad_top
        return F.pad(frame, (0, 0, pad_top, pad_bottom), mode="constant", value=0.0).contiguous()

    padded_width = max(int(source_width), int(math.ceil(float(source_height) * target_aspect)))
    pad_total = padded_width - int(source_width)
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    return F.pad(frame, (pad_left, pad_right, 0, 0), mode="constant", value=0.0).contiguous()


def _import_vfx():
    runtime_path_file = Path(__file__).resolve().parent / "tools" / "DENO_RTX_VFX_runtime_path.txt"
    if runtime_path_file.exists():
        runtime_path = runtime_path_file.read_text(encoding="utf-8").strip().strip('"')
        runtime_package = Path(runtime_path) / "nvvfx"
        if runtime_path and runtime_package.exists() and runtime_path not in sys.path:
            sys.path.insert(0, runtime_path)

    try:
        from nvvfx import VideoSuperRes
    except Exception as exc:
        raise RuntimeError(
            "NVIDIA RTX VFX is not installed in this ComfyUI Python. "
            "Close ComfyUI, follow the RTX VFX install guide in the DENO README, restart ComfyUI, then try again. "
            f"Original import error: {type(exc).__name__}: {exc}"
        ) from exc
    return VideoSuperRes


def _vfx_runtime_error_message(exc: Exception, mode: str, device_index: int) -> str:
    try:
        gpu_name = torch.cuda.get_device_name(device_index)
    except Exception:
        gpu_name = f"CUDA device {device_index}"

    original = f"{type(exc).__name__}: {exc}"
    lowered = str(exc).lower()
    common_hint = (
        "NVIDIA RTX VFX is installed, but this PC could not create the VideoSuperRes effect. "
        f"Selected mode: {mode}. Selected GPU: {gpu_name} (device {device_index}). "
        "This usually means the GPU or driver does not support the NVIDIA VFX Video Super Resolution runtime on this machine. "
        "Check that the PC has an NVIDIA RTX GPU with Tensor Cores, Windows 10/11, and NVIDIA driver 570.65 or newer "
        "(595 or newer for TCC devices). If the PC has multiple NVIDIA GPUs, try the correct device index. "
        "Original NVIDIA VFX error: "
    )

    if "not yet implemented" in lowered or "unimplemented" in lowered or "code -2" in lowered:
        return (
            common_hint
            + original
            + " This specific error means NVIDIA's runtime reported that the requested VFX feature is not implemented/available on the current system."
        )

    return common_hint + original


def _create_vfx_effect(VideoSuperRes, quality, device_index: int, mode: str):
    try:
        return VideoSuperRes(quality=quality, device=device_index)
    except Exception as exc:
        raise RuntimeError(_vfx_runtime_error_message(exc, mode, device_index)) from exc


def _safe_cuda_device_index(device: int) -> int:
    try:
        device_index = int(device)
    except Exception:
        return 0

    try:
        device_count = int(torch.cuda.device_count())
    except Exception:
        device_count = 0

    if device_index < 0 or (device_count and device_index >= device_count):
        return 0
    return device_index


class DenoRTXVFXEasyUpscale:
    DESCRIPTION = (
        "Optional NVIDIA RTX Video Super Resolution helper.\n\n"
        "- `VSR`: low-res or compressed source -> larger image.\n"
        "- `High Bitrate`: cleaner source -> sharper upscale.\n"
        "- `Denoise`: noisy or grainy source -> same-size cleanup.\n"
        "- `Deblur`: soft or blurry source -> same-size fix.\n"
        "- RTX VFX uses `32` as the safe divisible-by default; legacy `1` values are automatically corrected.\n"
        "- If NVIDIA VFX is missing, close ComfyUI and follow the RTX VFX install guide in the DENO README."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "mode": (QUALITY_LEVELS, {"default": "VSR Medium"}),
                "resize_type": (RESIZE_TYPES, {"default": "Keep Ratio"}),
                "scale": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 4.0, "step": 0.05}),
                "megapixels": ("FLOAT", {"default": 2.0, "min": 0.01, "max": 64.0, "step": 0.01}),
                "width": ("INT", {"default": 1920, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1080, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (RTX_VFX_DIVISIBLE_BY_VALUES, {"default": RTX_VFX_DEFAULT_DIVISIBLE_BY}),
                "device": ("INT", {"default": 0, "min": 0, "max": 16, "step": 1}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "apply_vfx"
    CATEGORY = "Deno/Image"

    def apply_vfx(
        self,
        images,
        mode: str,
        resize_type: str,
        scale: float,
        megapixels: float,
        width: int,
        height: int,
        divisible_by: int,
        device: int,
        ratio_preset: str = "16:9",
        resize_method: str = "Center Crop (Fill)",
    ):
        if not torch.cuda.is_available():
            raise RuntimeError("NVIDIA RTX VFX requires CUDA. This ComfyUI Python does not currently see CUDA.")

        if images.ndim != 4:
            raise ValueError(f"Expected IMAGE tensor with shape [batch, height, width, channels], got {tuple(images.shape)}")

        batch, source_height, source_width, channels = images.shape
        if channels < 3:
            raise ValueError("NVIDIA RTX VFX requires RGB images with 3 channels.")

        target_width, target_height = _target_size(
            source_width=int(source_width),
            source_height=int(source_height),
            mode=mode,
            resize_type=resize_type,
            scale=scale,
            megapixels=megapixels,
            width=width,
            height=height,
            divisible_by=_safe_divisible_by(divisible_by),
            ratio_preset=ratio_preset,
        )

        VideoSuperRes = _import_vfx()
        quality = getattr(VideoSuperRes.QualityLevel, _quality_attr(mode))
        output_device = images.device
        device_index = _safe_cuda_device_index(device)
        cuda_device = torch.device(f"cuda:{device_index}")

        outputs = []
        with torch.inference_mode():
            with _create_vfx_effect(VideoSuperRes, quality, device_index, mode) as effect:
                effect.output_width = int(target_width)
                effect.output_height = int(target_height)
                effect.load()

                for index in range(int(batch)):
                    frame = images[index, :, :, :3].to(device=cuda_device, dtype=torch.float32).permute(2, 0, 1).contiguous()
                    if not _same_size_only(mode):
                        frame = _fit_frame_to_target_aspect(frame, int(target_width), int(target_height), resize_method)
                    result = effect.run(frame)
                    enhanced = torch.from_dlpack(result.image).clone().permute(1, 2, 0).contiguous()
                    outputs.append(enhanced.to(device=output_device, dtype=images.dtype).clamp(0.0, 1.0))

        return (torch.stack(outputs, dim=0),)
