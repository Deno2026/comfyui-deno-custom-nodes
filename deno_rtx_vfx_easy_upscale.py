import math
from typing import Tuple

import torch
import torch.nn.functional as F

from .deno_resolution_common import COMMON_RATIOS, RESIZE_METHODS, compute_aligned_ratio_dims, round_up
from .deno_rtx_vfx_runtime import (
    current_nvvfx_package_path,
    is_path_relative_to,
    loaded_broadcast_vfx_module_paths,
    loaded_nvvfx_module_paths,
    prefer_rtx_vfx_runtime_path,
    read_rtx_vfx_runtime_path,
)


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

RESIZE_TYPES = ["Scale", "Keep Ratio", "Manual", "Preset Ratio", "Same Size"]
# RTX VFX scales video frames directly; exact video ratios avoid unintended crop/pad.
RTX_VFX_DIVISIBLE_BY_VALUES = ["1", "8", "16", "32", "64", "128"]
RTX_VFX_DEFAULT_DIVISIBLE_BY = "1"
RTX_VFX_INSTALL_GUIDE_URL = (
    "https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/"
)
RTX_VFX_INSTALLER_LOCAL_HINT = r"custom_nodes\deno-custom-nodes\tools\install_rtx_vfx.bat"


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
    runtime_path = prefer_rtx_vfx_runtime_path()
    loaded_path = current_nvvfx_package_path()
    native_modules = loaded_nvvfx_module_paths()
    native_ext_loaded = "nvvfx._ext" in native_modules

    if runtime_path is not None and loaded_path is not None and not is_path_relative_to(
        loaded_path,
        runtime_path / "nvvfx",
    ):
        raise RuntimeError(
            "NVIDIA RTX VFX is already loaded from another nvvfx path in this ComfyUI process. "
            + _vfx_runtime_status_note()
            + " This cannot be safely switched while ComfyUI is running because NVIDIA VFX uses a native extension. "
            "Close every ComfyUI window/process completely, then start ComfyUI again."
        )

    if native_ext_loaded and loaded_path is None:
        raise RuntimeError(
            "NVIDIA RTX VFX native extension is already partially loaded in this ComfyUI process. "
            + _vfx_runtime_status_note()
            + " This cannot be repaired inside a running ComfyUI session. "
            "Close every ComfyUI window/process completely, then start ComfyUI again."
        )

    try:
        from nvvfx import VideoSuperRes
    except Exception as exc:
        raise RuntimeError(
            "NVIDIA RTX VFX could not be imported in this ComfyUI Python. "
            + _vfx_runtime_status_note()
            + " "
            + _rtx_vfx_easy_install_note()
            + " "
            f"Original import error: {type(exc).__name__}: {exc}"
        ) from exc
    return VideoSuperRes


def _rtx_vfx_easy_install_note() -> str:
    return (
        "Easy install steps: close every ComfyUI window, click this node's How to install button, "
        "follow the visual web install guide, download the ZIP from that guide page, move it into "
        r"ComfyUI\custom_nodes\deno-custom-nodes\tools, extract it there, run install_rtx_vfx.bat "
        "from the extracted installer files inside that tools folder, type Y only if the shown Windows path is inside your ComfyUI app; if it looks wrong, type N and stop, then wait for the green "
        "INSTALL COMPLETE message, then start ComfyUI again. "
        f"Full install guide: {RTX_VFX_INSTALL_GUIDE_URL}."
    )


def _vfx_runtime_status_note() -> str:
    runtime_path = read_rtx_vfx_runtime_path()
    loaded_path = current_nvvfx_package_path()
    native_modules = loaded_nvvfx_module_paths()
    broadcast_modules = loaded_broadcast_vfx_module_paths()
    runtime_text = str(runtime_path) if runtime_path is not None else "not prepared"
    loaded_text = str(loaded_path) if loaded_path is not None else "unknown"
    native_text = ", ".join(f"{name}={path}" for name, path in native_modules.items()) or "none"
    broadcast_text = "; ".join(broadcast_modules[:5]) if broadcast_modules else "none"
    return (
        f" DENO runtime path: {runtime_text}. Loaded nvvfx path: {loaded_text}. "
        f"Loaded native modules: {native_text}. Loaded NVIDIA Broadcast VFX DLLs: {broadcast_text}."
    )


def _vfx_runtime_error_message(exc: Exception, mode: str, device_index: int) -> str:
    try:
        gpu_name = torch.cuda.get_device_name(device_index)
    except Exception:
        gpu_name = f"CUDA device {device_index}"

    original = f"{type(exc).__name__}: {exc}"
    lowered = str(exc).lower()
    broadcast_modules = loaded_broadcast_vfx_module_paths()

    if broadcast_modules and ("not yet implemented" in lowered or "unimplemented" in lowered or "code -2" in lowered):
        return (
            "NVIDIA RTX VFX is installed, but VideoSuperRes could not be created because NVIDIA Broadcast/NGX VFX "
            "DLLs are already loaded in this ComfyUI process. "
            f"Selected mode: {mode}. Selected GPU: {gpu_name} (device {device_index}). "
            "Another RTX/Broadcast-based node can still work because it may use NVIDIA Broadcast's Upscale effect, "
            "but DENO's nvidia-vfx VideoSuperRes path cannot safely use that mixed native runtime. "
            + _vfx_runtime_status_note()
            + " Close ComfyUI, disable the Broadcast-based RTX node, then start ComfyUI again; or use that RTX node "
            "for this workflow until DENO adds a dedicated Broadcast fallback engine. "
            "Original NVIDIA VFX error: "
            + original
        )

    common_hint = (
        "NVIDIA RTX VFX is installed, but this PC could not create the VideoSuperRes effect. "
        f"Selected mode: {mode}. Selected GPU: {gpu_name} (device {device_index}). "
        "This usually means the GPU or driver does not support the NVIDIA VFX Video Super Resolution runtime on this machine. "
        "Check that the PC has an NVIDIA RTX GPU with Tensor Cores, Windows 10/11, and NVIDIA driver 570.65 or newer "
        "(595 or newer for TCC devices). If the PC has multiple NVIDIA GPUs, try the correct device index. "
        + _vfx_runtime_status_note()
        + " If DENO runtime path is not prepared, "
        + _rtx_vfx_easy_install_note()
        + " "
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
        "RTX VFX install steps for beginners.\n\n"
        "1. Close every ComfyUI window first.\n"
        "2. Click this node's `How to install` button.\n"
        "3. Follow the visual web install guide.\n"
        "4. Download the ZIP from that guide page.\n"
        r"5. Open `ComfyUI\custom_nodes\deno-custom-nodes\tools`." "\n"
        "6. Move `install_rtx_vfx_bat.zip` into that `tools` folder.\n"
        "7. Right-click the ZIP inside `tools`, choose `Extract All`, then open the extracted installer files.\n"
        "8. Double-click `install_rtx_vfx.bat` from inside `tools`.\n"
        "9. If it asks `Install RTX VFX here?`, type `Y` only when the shown Windows path is inside this ComfyUI app. If it looks wrong, type `N` and stop.\n"
        "10. Wait until the BAT shows the green `INSTALL COMPLETE` message.\n"
        "11. Start ComfyUI again, then run this node.\n\n"
        "Full install guide:\n"
        f"{RTX_VFX_INSTALL_GUIDE_URL}"
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
        device_index = _safe_cuda_device_index(device)
        cuda_device = torch.device(f"cuda:{device_index}")

        # Full-quality float32 output. RAM is handled at the workflow level
        # (VHS Meta Batch chunks the whole graph); this node stays lossless.
        # Preallocate + write per frame (no Python list / torch.stack peak).
        out_device = images.device
        out_dtype = images.dtype
        out = torch.empty(
            (int(batch), int(target_height), int(target_width), 3),
            device=out_device,
            dtype=out_dtype,
        )

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
                    # clamp in float32 then a single cast for storage (avoids
                    # the slow CPU-float16 clamp path in Low RAM mode).
                    out[index].copy_(
                        enhanced.clamp(0.0, 1.0).to(device=out_device, dtype=out_dtype)
                    )
                    del frame, enhanced

        return (out,)
