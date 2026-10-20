import hashlib
import os
from typing import List

import numpy as np
import torch
from PIL import Image, ImageOps

from .deno_multi_image_board import (
    IMAGE_INTERPOLATION_MODES,
    INPUT_BROWSER_IMAGE_EXTENSIONS,
    _compute_keep_input_ratio_dims,
    _external_image_access_notice,
    _filter_disabled_sources,
    _image_path_is_allowed,
    _local_image_path_is_safe,
    _path_is_within_root,
    _resize_tensor,
    _resolve_input_source_path as _resolve_path,
    _split_paths,
)
from .deno_resolution_common import (
    COMMON_RATIOS,
    DIVISIBLE_BY_VALUES,
    RESIZE_METHODS,
    compute_aligned_ratio_dims,
    round_up,
    validate_combo_choice,
    validate_active_ratio_preset,
)


ADVANCED_RESIZE_METHODS = list(dict.fromkeys([
    *RESIZE_METHODS,
    "Top Crop (Fill)",
    "Bottom Crop (Fill)",
]))


def _open_image_source(source: str) -> Image.Image | None:
    raw_source = str(source or "").strip().strip('"')
    if not raw_source:
        return None

    try:
        resolved_path = _resolve_path(raw_source)
        if resolved_path is None:
            return None
        return Image.open(resolved_path)
    except (OSError, ValueError) as exc:
        print(f"[DenoAdvancedImageSourceLoader] Failed to open image source {raw_source}: {exc}")
        return None


def _record_source_failure(failures: List[str] | None, source: str) -> None:
    if failures is not None and source not in failures:
        failures.append(source)


def _expand_image_sources(
    sources: List[str],
    recursive_folders: bool = False,
    failures: List[str] | None = None,
) -> List[str]:
    expanded = []
    for source in sources:
        raw_source = str(source or "").strip().strip('"')
        if not raw_source:
            continue

        local_candidate = _resolve_path(raw_source)
        if local_candidate is None:
            _record_source_failure(failures, raw_source)
            continue
        if os.path.isdir(local_candidate):
            try:
                if recursive_folders:
                    def on_walk_error(exc):
                        print(f"[DenoAdvancedImageSourceLoader] Failed to scan folder {local_candidate}: {exc}")
                        _record_source_failure(failures, raw_source)

                    walker = os.walk(
                        local_candidate,
                        onerror=on_walk_error,
                    )
                else:
                    walker = [(local_candidate, [], os.listdir(local_candidate))]
            except OSError as exc:
                print(f"[DenoAdvancedImageSourceLoader] Failed to scan folder {local_candidate}: {exc}")
                _record_source_failure(failures, raw_source)
                continue

            folder_files = []
            visited_dirs = set()
            for current_dir, folder_names, file_names in walker:
                real_dir = os.path.normcase(os.path.realpath(current_dir))
                if (
                    real_dir in visited_dirs
                    or not _path_is_within_root(local_candidate, current_dir)
                    or not _image_path_is_allowed(current_dir)
                ):
                    folder_names[:] = []
                    continue
                visited_dirs.add(real_dir)
                folder_names[:] = [
                    name for name in folder_names
                    if _path_is_within_root(local_candidate, os.path.join(current_dir, name))
                    and _image_path_is_allowed(os.path.join(current_dir, name))
                ]
                for file_name in file_names:
                    full_path = os.path.join(current_dir, file_name)
                    if not _path_is_within_root(local_candidate, full_path) or not _image_path_is_allowed(full_path):
                        continue
                    if os.path.isfile(full_path) and os.path.splitext(full_path)[1].lower() in INPUT_BROWSER_IMAGE_EXTENSIONS:
                        folder_files.append(os.path.realpath(full_path))
            if not folder_files:
                _record_source_failure(failures, raw_source)
            expanded.extend(sorted(folder_files, key=lambda item: item.lower()))
            continue

        expanded.append(raw_source)

    return expanded


def _image_source_to_tensor(source: str) -> torch.Tensor | None:
    image = _open_image_source(source)
    if image is None:
        print(f"[DenoAdvancedImageSourceLoader] Missing image source: {source}")
        return None

    try:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image_np = np.asarray(image).astype(np.float32)
        image_np /= 255.0
        return torch.from_numpy(image_np)[None, ...]
    except Exception as exc:
        print(f"[DenoAdvancedImageSourceLoader] Failed to load {source}: {exc}")
        return None


def _format_source_preview(sources: List[str]) -> str:
    preview = ", ".join(str(source) for source in sources[:3])
    if len(sources) > 3:
        preview += f", ... (+{len(sources) - 3} more)"
    return preview


def _validate_active_sources(image_paths: str, disabled_image_paths: str) -> str | bool:
    active_sources = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
    invalid_sources = []

    for source in active_sources:
        raw_source = str(source or "").strip().strip('"')
        if _resolve_path(raw_source) is None:
            invalid_sources.append(raw_source)

    if invalid_sources:
        return (
            "[DenoAdvancedImageSourceLoader] Active image source(s) are missing or outside the ComfyUI input folder: "
            f"{_format_source_preview(invalid_sources)}. Fix or disable the source, then run the workflow again. "
            f"{_external_image_access_notice()}"
        )
    return True


def _update_source_stat_hash(hasher, source: str) -> None:
    raw_source = str(source or "").strip().strip('"')
    hasher.update(raw_source.encode("utf-8", "surrogatepass"))
    hasher.update(b"\0")

    resolved_path = _resolve_path(raw_source)
    if resolved_path is None:
        hasher.update(b"missing\0")
        return

    real_path = os.path.realpath(resolved_path)
    try:
        stat = os.stat(real_path)
    except OSError:
        hasher.update(b"unreadable\0")
        return

    hasher.update(b"local\0")
    for value in (
        real_path,
        stat.st_dev,
        stat.st_ino,
        stat.st_size,
        stat.st_mtime_ns,
        getattr(stat, "st_ctime_ns", 0),
    ):
        hasher.update(str(value).encode("utf-8", "surrogatepass"))
        hasher.update(b"\0")


def _split_input_image_batch(images) -> List[torch.Tensor]:
    if images is None:
        return []
    if isinstance(images, torch.Tensor) and hasattr(images, "ndim"):
        image_tensor = images
        if image_tensor.ndim == 3:
            image_tensor = image_tensor.unsqueeze(0)
        if image_tensor.ndim != 4:
            return []
        return [image_tensor[index:index + 1] for index in range(int(image_tensor.shape[0]))]
    if isinstance(images, (list, tuple)):
        split_images = []
        for image in images:
            split_images.extend(_split_input_image_batch(image))
        return split_images
    return []


class DenoAdvancedImageSourceLoader:
    DESCRIPTION = (
        "Load uploaded images and ComfyUI input folders, or connect an IMAGE batch. "
        "Provides batch output and mixed-size image-list output. External folders and image URLs are not supported. "
        "Click thumbnails to enable or disable sources. Disabled sources are skipped; "
        "enabled source badges update to 1, 2, 3, and so on in card order.\n"
        "Use the standard Multi Image Loader for simpler input-folder workflows.\n"
        "YouTube: https://www.youtube.com/@Denoise-AI"
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True, "hidden": True}),
                "mode": (["Keep Input Ratio", "Preset Ratio", "Manual Input"], {"default": "Keep Input Ratio"}),
                "ratio_preset": (COMMON_RATIOS, {"default": "16:9"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.01, "max": 10.0, "step": 0.01}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "divisible_by": (DIVISIBLE_BY_VALUES, {"default": "32"}),
                "interpolation": (IMAGE_INTERPOLATION_MODES, {"default": "lanczos"}),
                "resize_method": (ADVANCED_RESIZE_METHODS, {"default": "Center Crop (Fill)"}),
                "recursive_folders": ("BOOLEAN", {"default": False}),
                "list_output_mode": (["Original Size", "Match Batch Size"], {"default": "Original Size"}),
                "disabled_image_paths": ("STRING", {"default": "", "multiline": True, "hidden": True}),
            },
            "optional": {
                "images": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "INT", "INT", "INT")
    RETURN_NAMES = ("batch", "image_list", "width", "height", "image_count")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "load_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(
        cls,
        mode=None,
        ratio_preset=None,
        divisible_by=None,
        interpolation=None,
        resize_method=None,
        list_output_mode=None,
        image_paths=None,
        disabled_image_paths=None,
    ):
        for result in (
            validate_combo_choice("mode", mode, ["Keep Input Ratio", "Preset Ratio", "Manual Input"]),
            validate_combo_choice("divisible_by", divisible_by, DIVISIBLE_BY_VALUES),
            validate_combo_choice("interpolation", interpolation, IMAGE_INTERPOLATION_MODES),
            validate_combo_choice("resize_method", resize_method, ADVANCED_RESIZE_METHODS),
            validate_combo_choice("list_output_mode", list_output_mode, ["Original Size", "Match Batch Size"]),
        ):
            if result is not True:
                return result
        ratio_result = validate_active_ratio_preset(mode, ratio_preset)
        if ratio_result is not True:
            return ratio_result
        return _validate_active_sources(image_paths or "", disabled_image_paths or "")

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
        recursive_folders,
        list_output_mode,
        disabled_image_paths="",
        images=None,
    ):
        del images

        hasher = hashlib.sha256()
        hasher.update(b"deno_advanced_image_source_loader_input_only_v2")
        for value in (
            mode,
            ratio_preset,
            megapixels,
            width,
            height,
            divisible_by,
            interpolation,
            resize_method,
            recursive_folders,
            list_output_mode,
        ):
            hasher.update(str(value).encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")

        active_sources = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
        for source in active_sources:
            hasher.update(b"source\0")
            _update_source_stat_hash(hasher, source)

        expanded_sources = _expand_image_sources(active_sources, bool(recursive_folders))
        for source in expanded_sources:
            hasher.update(b"expanded\0")
            _update_source_stat_hash(hasher, source)

        return hasher.hexdigest()

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
        recursive_folders: bool,
        list_output_mode: str,
        disabled_image_paths: str = "",
        images=None,
    ):
        source_inputs = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
        failed_sources = []
        sources = _expand_image_sources(source_inputs, bool(recursive_folders), failures=failed_sources)
        originals = _split_input_image_batch(images)

        for source in sources:
            image_tensor = _image_source_to_tensor(source)
            if image_tensor is not None:
                originals.append(image_tensor)
            else:
                _record_source_failure(failed_sources, source)

        if failed_sources:
            raise RuntimeError(
                "[DenoAdvancedImageSourceLoader] Active image source(s) could not be loaded: "
                f"{_format_source_preview(failed_sources)}. Fix or disable the source, then run the workflow again. "
                f"{_external_image_access_notice()}"
            )

        if not originals:
            raise RuntimeError(
                "[DenoAdvancedImageSourceLoader] No active images are available. "
                "Upload images, select a ComfyUI input folder, or connect the images input, then run the workflow again."
            )

        loaded_image_count = len(originals)

        if mode == "Preset Ratio":
            width, height = compute_aligned_ratio_dims(ratio_preset, megapixels, int(divisible_by))
        elif mode == "Keep Input Ratio" and originals:
            _, source_height, source_width, _ = originals[0].shape
            width, height = _compute_keep_input_ratio_dims(int(source_width), int(source_height), megapixels, int(divisible_by))
        else:
            width = round_up(width, int(divisible_by))
            height = round_up(height, int(divisible_by))

        batch_images = [
            _resize_tensor(
                image=image_tensor,
                width=width,
                height=height,
                resize_method=resize_method,
                interpolation=interpolation,
            )
            for image_tensor in originals
        ]
        batch = torch.cat(batch_images, dim=0)

        if list_output_mode == "Match Batch Size":
            image_list = batch_images
        else:
            image_list = originals

        return (batch, image_list, int(width), int(height), loaded_image_count)
