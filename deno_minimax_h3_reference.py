"""MiniMax H3 reference-image bundle loader and stock-compatible wrapper."""

from __future__ import annotations

import copy
import hashlib
import os

import numpy as np
import torch
from PIL import Image, ImageOps
from comfy_api.latest import io
from comfy_execution.graph_utils import ExecutionBlocker
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo

from .deno_multi_image_board import (
    _filter_disabled_sources,
    _format_path_preview,
    _hash_file_contents,
    _resolve_input_path,
    _selected_image_errors,
    _split_paths,
)
from .deno_node_metadata import NODE_INPUT_TOOLTIPS, NODE_OUTPUT_TOOLTIPS, _with_version_prefix
from .deno_minimax_h3_audio import (
    MAX_REFERENCE_AUDIOS,
    decode_reference_audio,
    parse_audio_sources,
    resolve_reference_audio_path,
)


MINIMAX_H3_REFERENCE_IMAGES_TYPE = "DENO_MINIMAX_H3_REFERENCE_IMAGES"
MINIMAX_H3_MAX_REFERENCE_IMAGES = 9

_H3_INPUT_TOOLTIPS = NODE_INPUT_TOOLTIPS["DenoMiniMaxH3ReferenceToVideo"]
_H3_OUTPUT_TOOLTIPS = NODE_OUTPUT_TOOLTIPS["DenoMiniMaxH3ReferenceToVideo"]
_H3_REFERENCE_IMAGES_TOOLTIP = _H3_INPUT_TOOLTIPS["ref_images"]

_H3_DESCRIPTION = _with_version_prefix(
    "Use one ordered DENO reference-image bundle plus the stock MiniMax H3 "
    "reference video and audio slots. Prompt tags remain <Picture i>, <Video k>, and <Audio j>. "
    "VAE inputs may be left disconnected when supported by your ComfyUI version. "
    "Connect audio_vae to encode reference sound."
)


def _no_reference_images_message() -> str:
    return (
        "[DenoMiniMaxH3ReferenceImageLoader] No images are selected. "
        "Enable an image or audio, or add one with Upload or Input Folder, then run the workflow again."
    )


def _too_many_reference_images_message(count: int) -> str:
    return (
        "[DenoMiniMaxH3ReferenceImageLoader] MiniMax H3 supports at most "
        f"{MINIMAX_H3_MAX_REFERENCE_IMAGES} reference images, but {count} are selected. "
        "Disable or remove the extra images and run the workflow again."
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
        "Each image keeps its own decoded size and aspect ratio. Click thumbnails to enable or disable them. "
        "Only enabled images are output in card order; their badges map to "
        "<Picture 1>, <Picture 2>, and so on. The optional IMAGE list output can "
        "reuse the same ordered sources in nodes such as DENO Local LLM Loader. "
        "Add up to 3 audio files below the image gallery. Individual AUDIO outputs keep "
        "their source sample rate and channel count; disabled files skip connected branches. "
        "Enabled audio badges count from <Audio 1> in card order."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_paths": ("STRING", {"default": "", "multiline": True, "hidden": True}),
            },
            "optional": {
                "disabled_image_paths": ("STRING", {"default": "", "multiline": True, "hidden": True}),
                "audio_sources": ("STRING", {"default": "[]", "multiline": True, "hidden": True}),
            },
        }

    RETURN_TYPES = (MINIMAX_H3_REFERENCE_IMAGES_TYPE, "IMAGE", "AUDIO", "AUDIO", "AUDIO")
    RETURN_NAMES = ("ref_images", "image_list", "audio_1", "audio_2", "audio_3")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "load_reference_images"
    CATEGORY = "Deno/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, image_paths, disabled_image_paths="", audio_sources="[]"):
        try:
            audios = parse_audio_sources(audio_sources)
        except ValueError as exc:
            return f"[DenoMiniMaxH3ReferenceImageLoader] {exc}"
        paths = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
        if not paths and not any(row["enabled"] for row in audios):
            return _no_reference_images_message()
        if len(paths) > MINIMAX_H3_MAX_REFERENCE_IMAGES:
            return _too_many_reference_images_message(len(paths))

        failed_paths = _selected_image_errors(
            image_paths, path_resolver=_resolve_input_path, disabled_image_paths=disabled_image_paths
        )
        if failed_paths:
            return (
                "[DenoMiniMaxH3ReferenceImageLoader] Selected image file(s) are missing or unreadable "
                f"before execution: {_format_path_preview(failed_paths)}. Re-add the image from the "
                "Upload/Input Folder button, then run the workflow again."
            )
        for row in audios:
            if row["enabled"]:
                try:
                    # /prompt validation runs on the server event loop. Keep
                    # full decoding in execution and the preview worker pool.
                    resolve_reference_audio_path(row["path"])
                except Exception as exc:
                    return f"[DenoMiniMaxH3ReferenceImageLoader] Audio file {row['path']} could not be loaded: {exc}"
        return True

    @classmethod
    def IS_CHANGED(cls, image_paths, disabled_image_paths="", audio_sources="[]"):
        hasher = hashlib.sha256()
        hasher.update(b"deno_minimax_h3_reference_image_loader_v2\0")
        for path in _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths):
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
        try:
            audios = parse_audio_sources(audio_sources)
        except ValueError:
            return float("nan")
        for index, row in enumerate(audios):
            # Output slot/identity changes must invalidate cached physical outputs.
            hasher.update(f"audio:{index}:{row['id']}:{row['enabled']}\0".encode("utf-8", "surrogatepass"))
            if not row["enabled"]:
                continue
            hasher.update(row["path"].encode("utf-8", "surrogatepass"))
            try:
                resolved_path = resolve_reference_audio_path(row["path"])
                _hash_file_contents(hasher, resolved_path)
            except (ValueError, OSError):
                hasher.update(b"missing\0")
        return hasher.hexdigest()

    def load_reference_images(self, image_paths: str, disabled_image_paths: str = "", audio_sources: str = "[]"):
        try:
            audios = parse_audio_sources(audio_sources)
        except ValueError as exc:
            raise RuntimeError(f"[DenoMiniMaxH3ReferenceImageLoader] {exc}") from exc
        paths = _filter_disabled_sources(_split_paths(image_paths), disabled_image_paths)
        if not paths and not any(row["enabled"] for row in audios):
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
        audio_outputs = []
        for row in audios:
            if not row["enabled"]:
                audio_outputs.append(ExecutionBlocker(None))
                continue
            try:
                audio_outputs.append(decode_reference_audio(row["path"]))
            except Exception as exc:
                raise RuntimeError(
                    f"[DenoMiniMaxH3ReferenceImageLoader] Audio file {row['path']} could not be loaded: {exc}"
                ) from exc
        audio_outputs.extend(ExecutionBlocker(None) for _ in range(MAX_REFERENCE_AUDIOS - len(audio_outputs)))
        return (tuple(images) if images else None, images, *audio_outputs)


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


def _is_audio_link(value):
    return (isinstance(value, list) and len(value) == 2 and isinstance(value[0], str)
            and type(value[1]) is int)


def _ordered_audio_links(ref_audios, dynprompt, ref_video_audios):
    """Resolve DENO card state before the executor reads any blocked outputs."""
    values = list((ref_audios or {}).values())
    deno_links = []
    others = []
    for value in values:
        if value is None:
            continue
        if not _is_audio_link(value):
            others.append(value)
            continue
        if dynprompt is None:
            raise ValueError("[DenoMiniMaxH3ReferenceToVideo] Audio links require ComfyUI graph execution.")
        origin = dynprompt.get_node(value[0])
        if origin.get("class_type") != "DenoMiniMaxH3ReferenceImageLoader":
            others.append(value)
            continue
        if value[1] not in (2, 3, 4):
            raise ValueError("[DenoMiniMaxH3ReferenceToVideo] Connect an AUDIO output from the DENO reference loader.")
        deno_links.append((value, origin))

    if not deno_links:
        return others
    loader_ids = {link[0] for link, _ in deno_links}
    if len(loader_ids) != 1 or others:
        raise ValueError(
            "[DenoMiniMaxH3ReferenceToVideo] Audio numbers would conflict. Use the AUDIO outputs "
            "of one DENO reference loader without other standalone audio inputs."
        )
    if any(audio is not None for audio in (ref_video_audios or {}).values()):
        raise ValueError(
            "[DenoMiniMaxH3ReferenceToVideo] DENO audio badges start at <Audio 1>. "
            "Disconnect reference-video soundtracks to keep the displayed and actual audio numbers identical."
        )
    loader_id = next(iter(loader_ids))
    origin = deno_links[0][1]
    rows = parse_audio_sources(origin.get("inputs", {}).get("audio_sources", "[]"))
    connected_slots = [link[1] for link, _ in deno_links]
    if len(connected_slots) != len(set(connected_slots)):
        raise ValueError("[DenoMiniMaxH3ReferenceToVideo] The same DENO audio output is connected more than once.")
    expected_slots = [index + 2 for index, row in enumerate(rows) if row["enabled"]]
    if any(slot >= len(rows) + 2 for slot in connected_slots):
        raise ValueError("[DenoMiniMaxH3ReferenceToVideo] An audio output has no saved file. Reconnect the loader's audio outputs.")
    if not set(expected_slots).issubset(connected_slots):
        raise ValueError(
            "[DenoMiniMaxH3ReferenceToVideo] Connect every enabled audio output from the DENO reference "
            "loader, or turn unused files off, so each displayed <Audio j> matches the generated reference."
        )
    # Disabled cards may remain connected but are not dependencies of the child.
    return [[loader_id, slot] for slot in expected_slots]


def _stock_expansion_inputs(arguments):
    """Graph JSON uses dotted Autogrow names; execute() uses nested dictionaries."""
    inputs = {}
    for name, value in arguments.items():
        if value is None:
            continue
        if name in {"ref_images", "ref_videos", "ref_video_audios", "ref_audios"}:
            for slot, item in value.items():
                if item is not None:
                    inputs[f"{name}.{slot}"] = item
        else:
            inputs[name] = value
    return inputs


class DenoMiniMaxH3ReferenceToVideo(io.ComfyNode):
    """Stock H3 ref2va with one ordered DENO reference-image bundle input."""

    DESCRIPTION = _H3_DESCRIPTION
    RETURN_TYPES = tuple(MiniMaxH3ReferenceToVideo.RETURN_TYPES)
    RETURN_NAMES = tuple(MiniMaxH3ReferenceToVideo.RETURN_NAMES)
    FUNCTION = "EXECUTE_NORMALIZED"
    CATEGORY = MiniMaxH3ReferenceToVideo.CATEGORY

    @classmethod
    def define_schema(cls):
        # Keep native Autogrow sockets. Only standalone audio links are raw:
        # the wrapper must remove disabled DENO slots before blockers propagate.
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
            if input_spec.id == "ref_audios":
                input_spec.template.input.rawLink = True
                for audio_input in input_spec.template.get_all():
                    audio_input.rawLink = True
        if not replaced:
            raise RuntimeError("MiniMax H3 upstream schema no longer exposes the ref_images input.")

        schema.hidden = list(schema.hidden or [])
        for hidden in (io.Hidden.dynprompt, io.Hidden.unique_id):
            if hidden not in schema.hidden:
                schema.hidden.append(hidden)
        schema.enable_expand = True

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
        audio_template = input_types["optional"]["ref_audios"][1]["template"]["input"]
        for group in ("required", "optional"):
            for _name, (_kind, options) in audio_template.get(group, {}).items():
                options["rawLink"] = True
        input_types.setdefault("hidden", {}).update({"dynprompt": ("DYNPROMPT",), "unique_id": ("UNIQUE_ID",)})
        return input_types

    @classmethod
    def execute(
        cls,
        clip,
        prompt,
        width,
        height,
        length,
        ref_image_size="match",
        vae=None,
        audio_vae=None,
        ref_images=None,
        ref_videos=None,
        ref_video_audios=None,
        ref_audios=None,
    ):
        arguments = dict(
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
        if not any(_is_audio_link(value) for value in (ref_audios or {}).values()):
            # Direct Python calls and image-only legacy workflows keep their
            # established execution path without generating a child graph.
            return MiniMaxH3ReferenceToVideo.execute(**arguments)

        from comfy_execution.graph_utils import GraphBuilder

        hidden = getattr(cls, "hidden", None)
        ordered = _ordered_audio_links(ref_audios, getattr(hidden, "dynprompt", None), ref_video_audios)
        arguments["ref_audios"] = {f"ref_audio_{index}": value for index, value in enumerate(ordered)}
        graph = GraphBuilder()
        child = graph.node("MiniMaxH3ReferenceToVideo", **_stock_expansion_inputs(arguments))
        unique_id = getattr(hidden, "unique_id", None)
        if unique_id is not None:
            child.set_override_display_id(unique_id)
        return io.NodeOutput(child.out(0), child.out(1), expand=graph.finalize())
