import os
from typing import List

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

from .deno_resolution_common import COMMON_RATIOS, DIVISIBLE_BY_VALUES, RESIZE_METHODS, compute_aligned_ratio_dims, round_up


IMAGE_INTERPOLATION_MODES = ["lanczos", "bicubic", "bilinear", "area", "nearest", "nearest-exact"]


def _get_folder_paths():
    try:
        import folder_paths
    except ModuleNotFoundError:
        return None
    return folder_paths


def _get_comfy_utils():
    try:
        from comfy import utils as comfy_utils
    except ModuleNotFoundError:
        return None
    return comfy_utils


def _split_paths(image_paths: str) -> List[str]:
    return [line.strip() for line in (image_paths or "").splitlines() if line.strip()]


def _resolve_path(path: str) -> str | None:
    if os.path.exists(path):
        return path

    folder_paths = _get_folder_paths()
    if folder_paths is None:
        return None

    fallback_path = os.path.join(folder_paths.get_input_directory(), path)
    return fallback_path if os.path.exists(fallback_path) else None


def _resize_tensor(
    image: torch.Tensor,
    width: int,
    height: int,
    resize_method: str,
    interpolation: str,
) -> torch.Tensor:
    _, source_height, source_width, _ = image.shape

    if width <= 0:
        width = source_width
    if height <= 0:
        height = source_height

    image_nchw = image.movedim(-1, 1)

    if resize_method == "Fit (Letterbox/Pillarbox)":
        scale = min(width / source_width, height / source_height)
        target_width = max(1, int(round(source_width * scale)))
        target_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_tensor(image_nchw, target_height, target_width, interpolation)

        pad_width = max(0, width - target_width)
        pad_height = max(0, height - target_height)
        resized = F.pad(
            resized,
            (
                pad_width // 2,
                pad_width - (pad_width // 2),
                pad_height // 2,
                pad_height - (pad_height // 2),
            ),
            value=0.0,
        )
    elif resize_method == "Center Crop (Fill)":
        scale = max(width / source_width, height / source_height)
        target_width = max(1, int(round(source_width * scale)))
        target_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_tensor(image_nchw, target_height, target_width, interpolation)
        crop_x = max(0, (target_width - width) // 2)
        crop_y = max(0, (target_height - height) // 2)
        resized = resized[:, :, crop_y:crop_y + height, crop_x:crop_x + width]
    else:
        resized = _interpolate_tensor(image_nchw, height, width, interpolation)

    resized = resized.movedim(1, -1).clamp(0.0, 1.0)

    return resized


def _interpolate_tensor(image_nchw: torch.Tensor, height: int, width: int, interpolation: str) -> torch.Tensor:
    comfy_utils = _get_comfy_utils()
    if interpolation == "lanczos" and comfy_utils is not None:
        return comfy_utils.common_upscale(image_nchw, width, height, "lanczos", "disabled")

    kwargs = {}
    if interpolation in {"bilinear", "bicubic"}:
        kwargs["align_corners"] = False
    return F.interpolate(image_nchw, size=(height, width), mode=interpolation, **kwargs)


class DenoMultiImageLoader:
    DESCRIPTION = (
        "Minor-upgrade multi image loader for ComfyUI with drag reorder, "
        "paste/upload support, and stable batch output.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True}),
                "mode": (["Preset Ratio", "Manual Input"], {"default": "Preset Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("multi_output",)
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    def _load_single_image(
        self,
        path: str,
        width: int,
        height: int,
        interpolation: str,
        resize_method: str,
    ) -> torch.Tensor | None:
        resolved_path = _resolve_path(path)
        if resolved_path is None:
            print(f"[DenoMultiImageLoader] Missing image: {path}")
            return None

        try:
            image = Image.open(resolved_path)
            image = ImageOps.exif_transpose(image).convert("RGB")
            image_np = np.asarray(image).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np)[None, ...]
            image_tensor = _resize_tensor(image_tensor, width, height, resize_method, interpolation)
            return image_tensor
        except Exception as exc:
            print(f"[DenoMultiImageLoader] Failed to load {path}: {exc}")
            return None

    def load_images(
        self,
        image_paths: str,
        mode: str,
        ratio_preset: str,
        megapixels: float,
        width: int,
        height: int,
        divisible_by,
        interpolation: str,
        resize_method: str,
    ):
        if mode == "Preset Ratio":
            width, height = compute_aligned_ratio_dims(ratio_preset, megapixels, int(divisible_by))
        else:
            width = round_up(width, int(divisible_by))
            height = round_up(height, int(divisible_by))

        loaded_images = []
        for path in _split_paths(image_paths):
            image_tensor = self._load_single_image(
                path=path,
                width=width,
                height=height,
                interpolation=interpolation,
                resize_method=resize_method,
            )
            if image_tensor is not None:
                loaded_images.append(image_tensor)

        if loaded_images:
            can_batch = all(image.shape == loaded_images[0].shape for image in loaded_images)
            multi_output = torch.cat(loaded_images, dim=0) if can_batch else torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        else:
            multi_output = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (multi_output,)
