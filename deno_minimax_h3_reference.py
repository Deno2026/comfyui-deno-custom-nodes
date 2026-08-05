"""MiniMax H3 reference-image bundle loader and stock-compatible wrapper."""

from __future__ import annotations

import copy
import hashlib
import os

import numpy as np
import torch
from PIL import Image, ImageOps
from comfy_api.latest import io
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo

from .deno_multi_image_board import (
    _format_path_preview,
    _hash_file_contents,
    _resolve_input_path,
    _selected_image_errors,
    _split_paths,
)
from .deno_node_metadata import NODE_INPUT_TOOLTIPS, NODE_OUTPUT_TOOLTIPS, _with_version_prefix


MINIMAX_H3_REFERENCE_IMAGES_TYPE = "DENO_MINIMAX_H3_REFERENCE_IMAGES"
MINIMAX_H3_MAX_REFERENCE_IMAGES = 9

_H3_INPUT_TOOLTIPS = NODE_INPUT_TOOLTIPS["DenoMiniMaxH3ReferenceToVideo"]
_H3_OUTPUT_TOOLTIPS = NODE_OUTPUT_TOOLTIPS["DenoMiniMaxH3ReferenceToVideo"]
_H3_REFERENCE_IMAGES_TOOLTIP = _H3_INPUT_TOOLTIPS["ref_images"]

_H3_DESCRIPTION = _with_version_prefix(
    "Use one ordered DENO reference-image bundle plus the stock MiniMax H3 "
    "reference video and audio slots. Prompt tags remain <Picture i>, <Video k>, and <Audio j>."
)


def _no_reference_images_message() -> str:
    return (
        "[DenoMiniMaxH3ReferenceImageLoader] No images are selected. "
        "Add at least one image with Upload or Input Folder, then run the workflow again."
    )


def _too_many_reference_images_message(count: int) -> str:
    return (
        "[DenoMiniMaxH3ReferenceImageLoader] MiniMax H3 supports at most "
        f"{MINIMAX_H3_MAX_REFERENCE_IMAGES} reference images, but {count} are selected. "
        "Remove the extra images and run the workflow again."
    )


def _load_reference_image(path: str) -> torch.Tensor:
    resolved_path = _resolve_input_path(path)
    if resolved_path is None:
        raise RuntimeError(f"Reference image is missing: {path}")

    try:
        with Image.open(resolved_path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            image_np = np.asarray(image, dtype=np.float32) / 255.0
    except Exception as exc:
        raise RuntimeError(f"Reference image could not be loaded: {path}: {exc}") from exc

    # One tensor per source is intentional: unlike a normal IMAGE batch, the
    # ordered bundle may contain different heights and widths.
    return torch.from_numpy(image_np)[None, ...]


class DenoMiniMaxH3ReferenceImageLoader:
    DESCRIPTION = (
        "Load up to 9 ordered MiniMax H3 reference images through one cable. "
        "Each image keeps its own decoded size and aspect ratio; card order maps to "
        "<Picture 1>, <Picture 2>, and so on. The optional IMAGE list output can "
        "reuse the same ordered sources in nodes such as DENO Local LLM Loader."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = (MINIMAX_H3_REFERENCE_IMAGES_TYPE, "IMAGE")
    RETURN_NAMES = ("ref_images", "image_list")
    OUTPUT_IS_LIST = (False, True)
    FUNCTION = "load_reference_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, image_paths):
        paths = _split_paths(image_paths)
        if not paths:
            return _no_reference_images_message()
        if len(paths) > MINIMAX_H3_MAX_REFERENCE_IMAGES:
            return _too_many_reference_images_message(len(paths))

        failed_paths = _selected_image_errors(image_paths, path_resolver=_resolve_input_path)
        if failed_paths:
            return (
                "[DenoMiniMaxH3ReferenceImageLoader] Selected image file(s) are missing or unreadable "
                f"before execution: {_format_path_preview(failed_paths)}. Re-add the image from the "
                "Upload/Input Folder button, then run the workflow again."
            )
        return True

    @classmethod
    def IS_CHANGED(cls, image_paths):
        hasher = hashlib.sha256()
        hasher.update(b"deno_minimax_h3_reference_image_loader_v1\0")
        for path in _split_paths(image_paths):
            hasher.update(path.encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")
            resolved_path = _resolve_input_path(path)
            if resolved_path is None:
                hasher.update(b"missing\0")
                continue
            real_path = os.path.realpath(resolved_path)
            hasher.update(real_path.encode("utf-8", "surrogatepass"))
            hasher.update(b"\0")
            _hash_file_contents(hasher, real_path)
            hasher.update(b"\0")
        return hasher.hexdigest()

    def load_reference_images(self, image_paths: str):
        paths = _split_paths(image_paths)
        if not paths:
            raise RuntimeError(_no_reference_images_message())
        if len(paths) > MINIMAX_H3_MAX_REFERENCE_IMAGES:
            raise RuntimeError(_too_many_reference_images_message(len(paths)))

        images = []
        failed_paths = []
        for path in paths:
            try:
                images.append(_load_reference_image(path))
            except Exception:
                failed_paths.append(path)

        if failed_paths:
            raise RuntimeError(
                "[DenoMiniMaxH3ReferenceImageLoader] Selected image file(s) could not be loaded: "
                f"{_format_path_preview(failed_paths)}. Re-add the image from the Upload/Input Folder "
                "button, then run the workflow again."
            )

        # Slot 0 remains one opaque ordered H3 bundle. Slot 1 exposes the same
        # tensor objects as an IMAGE list so mixed source sizes stay separate.
        return (tuple(images), images)


def _bundle_to_stock_ref_images(ref_images):
    if ref_images is None:
        return None
    if not isinstance(ref_images, (tuple, list)):
        raise TypeError(
            "[DenoMiniMaxH3ReferenceToVideo] ref_images must come from the "
            "DENO MiniMax H3 Reference Image Loader."
        )

    count = len(ref_images)
    if count == 0:
        raise ValueError("[DenoMiniMaxH3ReferenceToVideo] The connected reference-image bundle is empty.")
    if count > MINIMAX_H3_MAX_REFERENCE_IMAGES:
        raise ValueError(_too_many_reference_images_message(count))

    stock_inputs = {}
    for index, image in enumerate(ref_images):
        if not isinstance(image, torch.Tensor):
            raise TypeError(
                f"[DenoMiniMaxH3ReferenceToVideo] Reference image {index + 1} is not an IMAGE tensor."
            )
        if image.ndim != 4 or image.shape[0] != 1 or image.shape[1] <= 0 or image.shape[2] <= 0 or image.shape[3] < 3:
            raise ValueError(
                f"[DenoMiniMaxH3ReferenceToVideo] Reference image {index + 1} must have shape "
                f"[1, H, W, C>=3], but received {tuple(image.shape)}."
            )
        stock_inputs[f"ref_image_{index}"] = image
    return stock_inputs


class DenoMiniMaxH3ReferenceToVideo(io.ComfyNode):
    """Stock H3 ref2va with one ordered DENO reference-image bundle input."""

    DESCRIPTION = _H3_DESCRIPTION
    RETURN_TYPES = tuple(MiniMaxH3ReferenceToVideo.RETURN_TYPES)
    RETURN_NAMES = tuple(MiniMaxH3ReferenceToVideo.RETURN_NAMES)
    FUNCTION = "EXECUTE_NORMALIZED"
    CATEGORY = MiniMaxH3ReferenceToVideo.CATEGORY

    @classmethod
    def define_schema(cls):
        # Upstream returns a fresh schema. Only the image Autogrow input is
        # replaced; all stock video/audio Autogrow inputs stay untouched.
        schema = MiniMaxH3ReferenceToVideo.define_schema()
        schema.node_id = "DenoMiniMaxH3ReferenceToVideo"
        schema.display_name = "(Deno) MiniMax H3 Reference to Video"
        schema.description = _H3_DESCRIPTION

        schema.inputs = list(schema.inputs)
        replaced = False
        for index, input_spec in enumerate(schema.inputs):
            if input_spec.id == "ref_images":
                schema.inputs[index] = io.Custom(MINIMAX_H3_REFERENCE_IMAGES_TYPE).Input(
                    "ref_images",
                    optional=True,
                    tooltip=_H3_REFERENCE_IMAGES_TOOLTIP,
                )
                replaced = True
            elif input_spec.id in _H3_INPUT_TOOLTIPS:
                input_spec.tooltip = _H3_INPUT_TOOLTIPS[input_spec.id]
        if not replaced:
            raise RuntimeError("MiniMax H3 upstream schema no longer exposes the ref_images input.")

        for output_spec, tooltip in zip(schema.outputs, _H3_OUTPUT_TOOLTIPS):
            output_spec.tooltip = tooltip
        return schema

    @classmethod
    def INPUT_TYPES(cls):
        # Keep a V1-compatible view for object_info/tests while execution stays
        # on the V3 ComfyNode path needed by stock Autogrow nesting.
        input_types = copy.deepcopy(MiniMaxH3ReferenceToVideo.INPUT_TYPES())
        input_types.setdefault("optional", {})["ref_images"] = (
            MINIMAX_H3_REFERENCE_IMAGES_TYPE,
            {"tooltip": _H3_REFERENCE_IMAGES_TOOLTIP},
        )
        return input_types

    @classmethod
    def execute(
        cls,
        clip,
        vae,
        audio_vae,
        prompt,
        width,
        height,
        length,
        ref_image_size="match",
        ref_images=None,
        ref_videos=None,
        ref_video_audios=None,
        ref_audios=None,
    ):
        return MiniMaxH3ReferenceToVideo.execute(
            clip=clip,
            vae=vae,
            audio_vae=audio_vae,
            prompt=prompt,
            width=width,
            height=height,
            length=length,
            ref_image_size=ref_image_size,
            ref_images=_bundle_to_stock_ref_images(ref_images),
            ref_videos=ref_videos,
            ref_video_audios=ref_video_audios,
            ref_audios=ref_audios,
        )
