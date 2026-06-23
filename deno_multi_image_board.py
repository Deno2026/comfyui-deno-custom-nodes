import hashlib
import os
import math
from typing import List, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from aiohttp import web
from PIL import Image, ImageOps
from server import PromptServer

from .deno_resolution_common import (
    COMMON_RATIOS,
    DIVISIBLE_BY_VALUES,
    RESIZE_METHODS,
    compute_aligned_ratio_dims,
    round_up,
    validate_combo_choice,
    validate_active_ratio_preset,
)


IMAGE_INTERPOLATION_MODES = ["lanczos", "bicubic", "bilinear", "area", "nearest", "nearest-exact"]
INPUT_BROWSER_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


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


def _normalize_input_browser_path(relative_path: str | None) -> str | None:
    raw_path = str(relative_path or "").replace("\\", "/").strip().strip("/")
    if not raw_path or raw_path == ".":
        return ""

    normalized = os.path.normpath(raw_path).replace("\\", "/")
    if normalized in {"", "."}:
        return ""
    if os.path.isabs(raw_path) or ":" in normalized or normalized == ".." or normalized.startswith("../"):
        return None
    return normalized


def _resolve_input_browser_dir(input_dir: str, relative_path: str) -> str | None:
    base_dir = os.path.realpath(input_dir)
    candidate_dir = os.path.realpath(os.path.join(base_dir, relative_path))

    try:
        common_path = os.path.commonpath([os.path.normcase(base_dir), os.path.normcase(candidate_dir)])
    except ValueError:
        return None

    if common_path != os.path.normcase(base_dir):
        return None
    return candidate_dir if os.path.isdir(candidate_dir) else None


def _resolve_input_image_copy_path(path: str | None) -> str | None:
    raw_path = str(path or "").strip()
    if not raw_path:
        return None

    if os.path.isabs(raw_path):
        candidate_path = os.path.realpath(raw_path)
        return candidate_path if os.path.isfile(candidate_path) else None

    folder_paths = _get_folder_paths()
    if folder_paths is None or not hasattr(folder_paths, "get_input_directory"):
        return None

    browser_path = _normalize_input_browser_path(raw_path)
    if browser_path is None:
        return None

    input_dir = os.path.realpath(folder_paths.get_input_directory())
    candidate_path = os.path.realpath(os.path.join(input_dir, browser_path))

    try:
        common_path = os.path.commonpath([os.path.normcase(input_dir), os.path.normcase(candidate_path)])
    except ValueError:
        return None

    if common_path != os.path.normcase(input_dir):
        return None
    return candidate_path if os.path.isfile(candidate_path) else None


def _to_input_relative_path(input_dir: str, full_path: str) -> str:
    relative = os.path.relpath(full_path, input_dir)
    if relative == ".":
        return ""
    return relative.replace("\\", "/")


def _get_input_browser_parent(relative_path: str) -> str:
    if not relative_path:
        return ""
    parent = os.path.dirname(relative_path).replace("\\", "/")
    return "" if parent == "." else parent


def _empty_input_folder_listing(relative_path: str = ""):
    return {
        "path": relative_path,
        "parent": _get_input_browser_parent(relative_path),
        "folders": [],
        "files": [],
    }


def _list_input_folder_entries(relative_path: str | None = ""):
    folder_paths = _get_folder_paths()
    if folder_paths is None or not hasattr(folder_paths, "get_input_directory"):
        return _empty_input_folder_listing()

    input_dir = folder_paths.get_input_directory()
    browser_path = _normalize_input_browser_path(relative_path)
    if browser_path is None:
        return _empty_input_folder_listing()

    current_dir = _resolve_input_browser_dir(input_dir, browser_path)
    if current_dir is None:
        return _empty_input_folder_listing(browser_path)

    folders = []
    files = []
    try:
        for name in os.listdir(current_dir):
            full_path = os.path.join(current_dir, name)
            stat = os.stat(full_path)
            if os.path.isdir(full_path):
                folders.append({
                    "name": name,
                    "path": _to_input_relative_path(input_dir, full_path),
                    "mtime": stat.st_mtime,
                })
                continue
            if os.path.isfile(full_path) and os.path.splitext(name)[1].lower() in INPUT_BROWSER_IMAGE_EXTENSIONS:
                files.append({
                    "name": _to_input_relative_path(input_dir, full_path),
                    "display_name": name,
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                })
    except Exception as exc:
        print(f"[DenoMultiImageLoader] Failed to list input folder images: {exc}")
        return _empty_input_folder_listing(browser_path)

    return {
        "path": browser_path,
        "parent": _get_input_browser_parent(browser_path),
        "folders": sorted(folders, key=lambda item: str(item["name"]).lower()),
        "files": sorted(files, key=lambda item: (-float(item["mtime"]), str(item["name"]).lower())),
    }


def _list_input_folder_images(relative_path: str | None = ""):
    return _list_input_folder_entries(relative_path)["files"]


@PromptServer.instance.routes.get("/deno/input-folder-images")
async def deno_input_folder_images(request):
    requested_path = request.query.get("path", "")
    browser_path = _normalize_input_browser_path(requested_path)
    if browser_path is None:
        return web.json_response({"error": "Invalid input folder path."}, status=400)
    return web.json_response(_list_input_folder_entries(browser_path))


@PromptServer.instance.routes.get("/deno/input-image-path")
async def deno_input_image_path(request):
    requested_path = request.query.get("path", "")
    resolved_path = _resolve_input_image_copy_path(requested_path)
    return web.json_response({
        "path": requested_path,
        "resolved_path": resolved_path or "",
        "exists": bool(resolved_path),
    })


def _split_paths(image_paths: str) -> List[str]:
    return [line.strip() for line in (image_paths or "").splitlines() if line.strip()]


def _format_path_preview(paths: List[str]) -> str:
    preview = ", ".join(paths[:3])
    if len(paths) > 3:
        preview += f", ... (+{len(paths) - 3} more)"
    return preview


def _image_file_error(path: str) -> str | None:
    resolved_path = _resolve_path(path)
    if resolved_path is None:
        return path
    try:
        with Image.open(resolved_path) as image:
            image.verify()
    except Exception:
        return path
    return None


def _selected_image_errors(image_paths: str) -> List[str]:
    return [
        path
        for path in _split_paths(image_paths)
        if _image_file_error(path) is not None
    ]


def _no_selected_images_message() -> str:
    return (
        "[DenoMultiImageLoader] No images are selected. "
        "Add at least one image with Upload or Input Folder, then run the workflow again."
    )


def _hash_file_contents(hasher, path: str) -> None:
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            hasher.update(chunk)


def _round_down(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor(float(value) / multiple) * multiple))


def _round_nearest(value: float, multiple: int) -> int:
    return max(multiple, int(math.floor((float(value) / multiple) + 0.5) * multiple))


def _compute_keep_input_ratio_dims(source_width: int, source_height: int, megapixels: float, divisible_by: int) -> Tuple[int, int]:
    effective_alignment = int(divisible_by)
    total_pixels = max(0.01, float(megapixels)) * 1_000_000
    source_area = max(1.0, float(source_width * source_height))
    source_aspect = float(source_width) / float(source_height)

    scale = math.sqrt(total_pixels / source_area)
    base_width = max(float(effective_alignment), float(source_width) * scale)
    base_height = max(float(effective_alignment), float(source_height) * scale)

    rounders = (_round_down, _round_nearest, round_up)
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
        return (area_error, ratio_error, distance_error)

    return min(candidates, key=candidate_score)


def _read_image_size(path: str) -> tuple[int, int] | None:
    resolved_path = _resolve_path(path)
    if resolved_path is None:
        return None
    try:
        with Image.open(resolved_path) as image:
            image = ImageOps.exif_transpose(image)
            return image.size
    except Exception as exc:
        print(f"[DenoMultiImageLoader] Failed to read image size {path}: {exc}")
        return None


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
    elif resize_method in {"Center Crop (Fill)", "Top Crop (Fill)", "Bottom Crop (Fill)"}:
        scale = max(width / source_width, height / source_height)
        target_width = max(1, int(round(source_width * scale)))
        target_height = max(1, int(round(source_height * scale)))
        resized = _interpolate_tensor(image_nchw, target_height, target_width, interpolation)
        crop_x = max(0, (target_width - width) // 2)
        vertical_overflow = max(0, target_height - height)
        if resize_method == "Top Crop (Fill)":
            crop_y = 0
        elif resize_method == "Bottom Crop (Fill)":
            crop_y = vertical_overflow
        else:
            crop_y = vertical_overflow // 2
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
                "mode": (["Keep Input Ratio", "Preset Ratio", "Manual Input"], {"default": "Keep Input Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("multi_output", "width", "height")
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        image_paths,
        mode=None,
        ratio_preset=None,
        divisible_by=None,
        interpolation=None,
        resize_method=None,
    ):
        for result in (
            validate_combo_choice("mode", mode, ["Keep Input Ratio", "Preset Ratio", "Manual Input"]),
            validate_combo_choice("divisible_by", divisible_by, DIVISIBLE_BY_VALUES),
            validate_combo_choice("interpolation", interpolation, IMAGE_INTERPOLATION_MODES),
            validate_combo_choice("resize_method", resize_method, RESIZE_METHODS),
        ):
            if result is not True:
                return result
        ratio_result = validate_active_ratio_preset(mode, ratio_preset)
        if ratio_result is not True:
            return ratio_result
        if not _split_paths(image_paths):
            return _no_selected_images_message()
        failed_paths = _selected_image_errors(image_paths)
        if failed_paths:
            return (
                "[DenoMultiImageLoader] Selected image file(s) are missing or unreadable before execution: "
                f"{_format_path_preview(failed_paths)}. Re-add the image from the Upload/Input Folder button, "
                "then run the workflow again."
            )
        return True

    @classmethod
    def IS_CHANGED(
        cls,
        image_paths,
        mode,
        ratio_preset,
        megapixels,
        width,
        height,
        divisible_by,
        interpolation,
        resize_method,
    ):
        hasher = hashlib.sha256()
        hasher.update(b"deno_multi_image_loader_v2")
        for value in (mode, ratio_preset, megapixels, width, height, divisible_by, interpolation, resize_method):
            hasher.update(str(value).encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")

        for path in _split_paths(image_paths):
            hasher.update(path.encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")
            resolved_path = _resolve_path(path)
            if resolved_path is None:
                hasher.update(b"missing")
                continue
            real_path = os.path.realpath(resolved_path)
            hasher.update(real_path.encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")
            _hash_file_contents(hasher, real_path)
            hasher.update(b"\0")

        return hasher.hexdigest()

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
        paths = _split_paths(image_paths)
        if not paths:
            raise RuntimeError(_no_selected_images_message())

        if mode == "Preset Ratio":
            width, height = compute_aligned_ratio_dims(ratio_preset, megapixels, int(divisible_by))
        elif mode == "Keep Input Ratio":
            first_size = _read_image_size(paths[0]) if paths else None
            if first_size is not None:
                width, height = _compute_keep_input_ratio_dims(first_size[0], first_size[1], megapixels, int(divisible_by))
            else:
                width = round_up(width, int(divisible_by))
                height = round_up(height, int(divisible_by))
        else:
            width = round_up(width, int(divisible_by))
            height = round_up(height, int(divisible_by))

        loaded_images = []
        failed_paths = []
        for path in paths:
            image_tensor = self._load_single_image(
                path=path,
                width=width,
                height=height,
                interpolation=interpolation,
                resize_method=resize_method,
            )
            if image_tensor is not None:
                loaded_images.append(image_tensor)
            else:
                failed_paths.append(path)

        if failed_paths:
            raise RuntimeError(
                "[DenoMultiImageLoader] Selected image file(s) could not be loaded: "
                f"{_format_path_preview(failed_paths)}. Re-add the image from the Upload/Input Folder button, "
                "then run the workflow again."
            )

        can_batch = all(image.shape == loaded_images[0].shape for image in loaded_images)
        if can_batch:
            multi_output = torch.cat(loaded_images, dim=0)
        else:
            multi_output = torch.zeros((1, int(height), int(width), 3), dtype=torch.float32)

        return (multi_output, int(width), int(height))
