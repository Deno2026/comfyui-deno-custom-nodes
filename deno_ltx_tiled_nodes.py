from __future__ import annotations

import copy
import gc
import importlib
import math
from typing import Any

import torch

try:
    from .deno_ltx_tiling import (
        BlendMode,
        TileSpec,
        build_tile_plan,
        make_spec_window,
        make_window_2d,
        scaled_fades,
    )
except ImportError:
    from deno_ltx_tiling import (
        BlendMode,
        TileSpec,
        build_tile_plan,
        make_spec_window,
        make_window_2d,
        scaled_fades,
    )


class UnsupportedTiledConditioning(RuntimeError):
    """Raised when a conditioning feature cannot be spatially tiled safely."""


def _runtime_module(name: str):
    return importlib.import_module(name)


def _comfy_model_management():
    return _runtime_module("comfy.model_management")


def _comfy_model_patcher():
    return _runtime_module("comfy.model_patcher")


def _comfy_sample():
    return _runtime_module("comfy.sample")


def _comfy_samplers():
    return _runtime_module("comfy.samplers")


def _comfy_utils():
    return _runtime_module("comfy.utils")


def _comfy_nested_tensor():
    return _runtime_module("comfy.nested_tensor")


def _latent_preview():
    return _runtime_module("latent_preview")


def _clone_model_options(options: dict) -> dict:
    try:
        return _comfy_model_patcher().create_model_options_clone(options)
    except Exception:
        return copy.deepcopy(options)


def _copy_cond_value(value: Any, replacement: Any) -> Any:
    if hasattr(value, "_copy_with"):
        return value._copy_with(replacement)
    cloned = copy.copy(value)
    if hasattr(cloned, "cond"):
        cloned.cond = replacement
        return cloned
    raise UnsupportedTiledConditioning(
        f"Cannot clone conditioning value of type {type(value).__name__}."
    )


def _model_spatial_scales(model: Any) -> tuple[float, float]:
    diffusion_model = getattr(model, "diffusion_model", None)
    factors = getattr(diffusion_model, "vae_scale_factors", (8, 32, 32))
    if len(factors) < 3:
        return 32.0, 32.0
    return float(factors[1]), float(factors[2])


def _crop_spatial_tensor(
    tensor: torch.Tensor,
    spec: TileSpec,
    full_height: int,
    full_width: int,
) -> torch.Tensor:
    if tensor.ndim >= 4 and tuple(tensor.shape[-2:]) == (full_height, full_width):
        return tensor[..., spec.y0:spec.y1, spec.x0:spec.x1].contiguous()
    return tensor


def _guide_entries_from_model_conds(model_conds: dict[str, Any]) -> list[dict] | None:
    wrapped = model_conds.get("guide_attention_entries")
    entries = getattr(wrapped, "cond", None)
    return entries if isinstance(entries, list) else None


def _guide_token_counts(
    entries: list[dict] | None,
    total_tokens: int,
    full_height: int,
    full_width: int,
) -> list[int]:
    full_area = full_height * full_width
    if entries:
        counts = [int(entry.get("pre_filter_count", 0)) for entry in entries]
        if all(count > 0 for count in counts) and sum(counts) == total_tokens:
            return counts

    if total_tokens % full_area != 0:
        raise UnsupportedTiledConditioning(
            "keyframe_idxs token count cannot be factored by the full latent "
            f"area: tokens={total_tokens}, HxW={full_height}x{full_width}."
        )
    return [total_tokens]


def _crop_keyframe_indices(
    tensor: torch.Tensor,
    spec: TileSpec,
    full_height: int,
    full_width: int,
    entries: list[dict] | None,
    model: Any,
) -> torch.Tensor:
    if tensor.ndim != 4 or tensor.shape[1] != 3 or tensor.shape[-1] != 2:
        raise UnsupportedTiledConditioning(
            "Unexpected keyframe_idxs shape. Expected [B,3,N,2], got "
            f"{tuple(tensor.shape)}."
        )

    token_counts = _guide_token_counts(
        entries,
        total_tokens=tensor.shape[2],
        full_height=full_height,
        full_width=full_width,
    )
    full_area = full_height * full_width
    scale_h, scale_w = _model_spatial_scales(model)

    chunks: list[torch.Tensor] = []
    offset = 0
    for token_count in token_counts:
        if token_count % full_area != 0:
            raise UnsupportedTiledConditioning(
                f"Guide token chunk {token_count} is not divisible by HxW={full_area}."
            )
        guide_frames = token_count // full_area
        chunk = tensor[:, :, offset:offset + token_count, :]
        chunk = chunk.reshape(tensor.shape[0], 3, guide_frames, full_height, full_width, 2)
        chunk = chunk[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1, :].contiguous()

        chunk[:, 1, ...] -= spec.y0 * scale_h
        chunk[:, 2, ...] -= spec.x0 * scale_w
        chunk = chunk.reshape(tensor.shape[0], 3, guide_frames * spec.height * spec.width, 2)
        chunks.append(chunk)
        offset += token_count

    if offset != tensor.shape[2]:
        raise UnsupportedTiledConditioning(
            f"Guide token accounting mismatch: consumed={offset}, total={tensor.shape[2]}."
        )
    return torch.cat(chunks, dim=2)


def _crop_guide_entries(
    entries: list[dict],
    spec: TileSpec,
    full_height: int,
    full_width: int,
    model: Any,
) -> list[dict]:
    full_area = full_height * full_width
    scale_h, scale_w = _model_spatial_scales(model)
    result: list[dict] = []

    for entry in entries:
        original = dict(entry)
        count = int(original.get("pre_filter_count", 0))
        if count <= 0 or count % full_area != 0:
            raise UnsupportedTiledConditioning(
                "A guide_attention_entries item has an unsupported token count: "
                f"{count} for full area {full_area}."
            )
        guide_frames = count // full_area
        original["pre_filter_count"] = guide_frames * spec.height * spec.width
        original["latent_shape"] = [guide_frames, spec.height, spec.width]

        pixel_mask = original.get("pixel_mask")
        if isinstance(pixel_mask, torch.Tensor) and pixel_mask.ndim >= 5:
            py0 = int(round(spec.y0 * scale_h))
            py1 = int(round(spec.y1 * scale_h))
            px0 = int(round(spec.x0 * scale_w))
            px1 = int(round(spec.x1 * scale_w))
            if pixel_mask.shape[-2] >= py1 and pixel_mask.shape[-1] >= px1:
                original["pixel_mask"] = pixel_mask[..., py0:py1, px0:px1].contiguous()

        result.append(original)
    return result


def _crop_condition_list_for_tile(
    cond_list: list[dict] | None,
    spec: TileSpec,
    full_height: int,
    full_width: int,
    model: Any,
) -> list[dict] | None:
    if cond_list is None:
        return None

    cropped_list: list[dict] = []
    for entry in cond_list:
        if entry.get("control") is not None:
            raise UnsupportedTiledConditioning(
                "ControlNet-style conditioning is not supported by the v1 "
                "step-fused tiled sampler. Test plain LTX text/image guide "
                "conditioning first."
            )
        if entry.get("gligen") is not None:
            raise UnsupportedTiledConditioning("GLIGEN conditioning is unsupported in v1.")
        if entry.get("area") is not None:
            raise UnsupportedTiledConditioning(
                "Regional conditioning areas are unsupported in v1 because "
                "their global-to-local intersection must be defined explicitly."
            )

        cloned = entry.copy()

        mask = cloned.get("mask")
        if isinstance(mask, torch.Tensor):
            cropped_mask = _crop_spatial_tensor(mask, spec, full_height, full_width)
            if cropped_mask is mask and tuple(mask.shape[-2:]) != (spec.height, spec.width):
                raise UnsupportedTiledConditioning(
                    "Conditioning mask does not match full or tile spatial dimensions: "
                    f"mask={tuple(mask.shape)}, full={full_height}x{full_width}."
                )
            cloned["mask"] = cropped_mask

        model_conds = dict(cloned.get("model_conds", {}))
        guide_entries = _guide_entries_from_model_conds(model_conds)

        for key, wrapped in list(model_conds.items()):
            value = getattr(wrapped, "cond", None)

            if key == "keyframe_idxs" and isinstance(value, torch.Tensor):
                cropped = _crop_keyframe_indices(
                    value,
                    spec,
                    full_height,
                    full_width,
                    guide_entries,
                    model,
                )
                model_conds[key] = _copy_cond_value(wrapped, cropped)
                continue

            if key == "guide_attention_entries" and isinstance(value, list):
                cropped_entries = _crop_guide_entries(value, spec, full_height, full_width, model)
                model_conds[key] = _copy_cond_value(wrapped, cropped_entries)
                continue

            if isinstance(value, torch.Tensor):
                cropped = _crop_spatial_tensor(value, spec, full_height, full_width)
                if cropped is not value:
                    model_conds[key] = _copy_cond_value(wrapped, cropped)
                continue

            if isinstance(value, list) and value and all(isinstance(item, torch.Tensor) for item in value):
                cropped_items = [
                    _crop_spatial_tensor(item, spec, full_height, full_width)
                    for item in value
                ]
                if any(new is not old for new, old in zip(cropped_items, value)):
                    model_conds[key] = _copy_cond_value(wrapped, cropped_items)

        cloned["model_conds"] = model_conds
        cropped_list.append(cloned)

    return cropped_list


def _crop_conds_for_tile(
    conds: list[list[dict] | None],
    spec: TileSpec,
    full_height: int,
    full_width: int,
    model: Any,
) -> list[list[dict] | None]:
    return [
        _crop_condition_list_for_tile(cond_list, spec, full_height, full_width, model)
        for cond_list in conds
    ]


def _pack_latents(latents: list[torch.Tensor]) -> tuple[torch.Tensor, list[torch.Size]]:
    return _comfy_utils().pack_latents(latents)


def _unpack_latents(
    combined_latent: torch.Tensor,
    latent_shapes: list[torch.Size],
) -> list[torch.Tensor]:
    return _comfy_utils().unpack_latents(combined_latent, latent_shapes)


def _make_nested_latent(tensors: list[torch.Tensor]):
    return _comfy_nested_tensor().NestedTensor(tensors)


def _is_nested(value: Any) -> bool:
    return bool(getattr(value, "is_nested", False))


def _replace_latent_shapes_in_condition_list(
    cond_list: list[dict] | None,
    latent_shapes: list[torch.Size],
) -> list[dict] | None:
    if cond_list is None:
        return None

    replaced_list: list[dict] = []
    for entry in cond_list:
        cloned = entry.copy()
        model_conds = dict(cloned.get("model_conds", {}))
        wrapped = model_conds.get("latent_shapes")
        if wrapped is not None:
            model_conds["latent_shapes"] = _copy_cond_value(wrapped, list(latent_shapes))
        cloned["model_conds"] = model_conds
        replaced_list.append(cloned)
    return replaced_list


def _replace_latent_shapes_in_conds(
    conds: list[list[dict] | None],
    latent_shapes: list[torch.Size],
) -> list[list[dict] | None]:
    return [
        _replace_latent_shapes_in_condition_list(cond_list, latent_shapes)
        for cond_list in conds
    ]


def _make_av_freeze_noise_mask(latent: dict, video: torch.Tensor, audio: torch.Tensor):
    mask = latent.get("noise_mask")
    video_mask = None
    if _is_nested(mask):
        mask_parts = mask.unbind()
        if mask_parts:
            video_mask = mask_parts[0]
    elif isinstance(mask, torch.Tensor):
        video_mask = mask

    if video_mask is None:
        video_mask = torch.ones_like(video)
    else:
        video_mask = video_mask.to(device=video.device, dtype=video.dtype)

    audio_mask = torch.zeros_like(audio)
    return _make_nested_latent([video_mask, audio_mask])


def _require_callback_x0(x0_output: dict[str, Any], node_name: str) -> torch.Tensor:
    if "x0" not in x0_output:
        raise RuntimeError(
            f"{node_name} did not capture callback x0. Strict denoised_output mode "
            "will not substitute sampler output."
        )
    x0 = x0_output["x0"]
    if not isinstance(x0, torch.Tensor):
        raise RuntimeError(
            f"{node_name} expected callback x0 to be a torch.Tensor, "
            f"got {type(x0).__name__}."
        )
    return x0


def _expected_packed_shape(latent_shapes: list[torch.Size]) -> tuple[int, int, int]:
    if not latent_shapes:
        raise RuntimeError("Cannot validate a packed latent without latent shapes.")
    batch = int(latent_shapes[0][0])
    total = 0
    for shape in latent_shapes:
        if int(shape[0]) != batch:
            raise RuntimeError(
                "Packed latent parts must have the same batch size, got "
                f"{[tuple(item) for item in latent_shapes]}."
            )
        total += math.prod(tuple(shape)[1:])
    return batch, 1, int(total)


def _validate_packed_latent_shape(
    packed: torch.Tensor,
    latent_shapes: list[torch.Size],
    label: str,
) -> None:
    expected = _expected_packed_shape(latent_shapes)
    if not isinstance(packed, torch.Tensor) or packed.ndim != 3:
        raise RuntimeError(
            f"{label} must be a packed tensor shaped {expected}, got "
            f"{type(packed).__name__} {getattr(packed, 'shape', None)}."
        )
    if tuple(packed.shape) != expected:
        raise RuntimeError(
            f"Invalid packed {label} shape: got={tuple(packed.shape)}, "
            f"expected={expected}."
        )


def _validate_unpacked_shapes(
    parts: list[torch.Tensor],
    latent_shapes: list[torch.Size],
    label: str,
) -> None:
    if len(parts) != len(latent_shapes):
        raise RuntimeError(
            f"{label} unpacked into {len(parts)} parts, expected {len(latent_shapes)}."
        )
    for index, (part, shape) in enumerate(zip(parts, latent_shapes)):
        if not isinstance(part, torch.Tensor) or tuple(part.shape) != tuple(shape):
            raise RuntimeError(
                f"{label} part {index} shape mismatch: got="
                f"{getattr(part, 'shape', None)}, expected={tuple(shape)}."
            )


def _assert_same_tensor(
    actual: torch.Tensor,
    expected: torch.Tensor,
    label: str,
    *,
    rtol: float = 1e-5,
    atol: float = 1e-6,
) -> None:
    comparable = actual.to(device=expected.device, dtype=expected.dtype)
    if tuple(comparable.shape) != tuple(expected.shape) or not torch.allclose(
        comparable,
        expected,
        rtol=rtol,
        atol=atol,
    ):
        raise RuntimeError(
            f"{label} changed even though audio_mode='freeze'. An incompatible "
            "wrapper or sampler path may have bypassed the audio denoise mask."
        )


def _active_cond_value(value: Any) -> bool:
    if value is None:
        return False
    if hasattr(value, "cond"):
        return value.cond is not None
    return True


def _raise_av_guide_metadata_error() -> None:
    raise UnsupportedTiledConditioning(
        "DENO LTX AV tiled sampler v1 requires guides to be cropped "
        "before AV sampling. Use LTXVCropGuides before AV concat."
    )


def _reject_av_guide_metadata_in_condition_list(cond_list: list[dict] | None) -> None:
    if cond_list is None:
        return
    for raw_entry in cond_list:
        entry = raw_entry
        if (
            isinstance(raw_entry, (list, tuple))
            and len(raw_entry) >= 2
            and isinstance(raw_entry[1], dict)
        ):
            entry = raw_entry[1]
        if not isinstance(entry, dict):
            continue

        model_conds = entry.get("model_conds", {}) or {}
        for key in ("keyframe_idxs", "guide_attention_entries"):
            if _active_cond_value(entry.get(key)):
                _raise_av_guide_metadata_error()
            if _active_cond_value(model_conds.get(key)):
                _raise_av_guide_metadata_error()


def _reject_av_guide_metadata(conds: Any) -> None:
    if isinstance(conds, dict):
        iterable = conds.values()
    else:
        iterable = conds or []
    for cond_list in iterable:
        _reject_av_guide_metadata_in_condition_list(cond_list)


def _wrapper_key_name(key: Any) -> str:
    value = getattr(key, "value", None)
    if isinstance(value, str):
        return value.lower()
    name = getattr(key, "name", None)
    if isinstance(name, str):
        return name.lower()
    return str(key).lower()


def _is_outer_wrapper_key(key: Any) -> bool:
    normalized = _wrapper_key_name(key)
    return normalized == "outer_sample" or normalized.endswith(".outer_sample")


def _collect_outer_wrapper_maps(guider: Any) -> list[dict]:
    maps: list[dict] = []

    model_options = getattr(guider, "model_options", {}) or {}
    transformer_options = model_options.get("transformer_options", {}) or {}
    option_wrappers = transformer_options.get("wrappers", {}) or {}
    if isinstance(option_wrappers, dict):
        for key, value in option_wrappers.items():
            if _is_outer_wrapper_key(key) and isinstance(value, dict):
                maps.append(value)

    patcher = getattr(guider, "model_patcher", None)
    patcher_wrappers = getattr(patcher, "wrappers", {}) or {}
    if isinstance(patcher_wrappers, dict):
        for key, value in patcher_wrappers.items():
            if _is_outer_wrapper_key(key) and isinstance(value, dict):
                maps.append(value)

    return maps


def _reject_incompatible_outer_wrappers(guider: Any) -> None:
    found: set[str] = set()
    for wrapper_map in _collect_outer_wrapper_maps(guider):
        for key in wrapper_map:
            normalized = str(key).lower()
            if (
                normalized == "ltx2_audio_normalization"
                or ("ltx2" in normalized and "audio" in normalized and "normal" in normalized)
            ):
                found.add(str(key))
    blocked = sorted(found)
    if blocked:
        raise RuntimeError(
            "The DENO LTX tiled samplers do not currently support OUTER_SAMPLE "
            f"wrappers: {blocked}."
        )


def _reject_unsupported_guider(guider: Any) -> None:
    cfg_cls = _comfy_samplers().CFGGuider
    predict_noise = getattr(type(guider), "predict_noise", None)
    if predict_noise is not cfg_cls.predict_noise:
        raise TypeError(
            "DENO LTX tiled sampler v1 supports BasicGuider and CFGGuider "
            "paths that use the standard predict_noise. Custom guider paths "
            "must be verified separately."
        )


class DenoLTXTiledSpatialUpscaler:
    DESCRIPTION = (
        "Runs the LTX latent spatial upscaler on overlapping spatial tiles, then "
        "reconstructs one video latent with float32 blending. Use it before a "
        "large low-denoise second pass when tall LTX outputs start drifting in "
        "colour or conditioning."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "samples": ("LATENT",),
                "upscale_model": ("LATENT_UPSCALE_MODEL",),
                "vae": ("VAE",),
                "horizontal_tiles": (
                    "INT",
                    {
                        "default": 2,
                        "min": 1,
                        "max": 8,
                        "step": 1,
                        "display_name": "Frame width split count",
                    },
                ),
                "vertical_tiles": (
                    "INT",
                    {
                        "default": 2,
                        "min": 1,
                        "max": 8,
                        "step": 1,
                        "display_name": "Frame height split count",
                    },
                ),
                "overlap": ("INT", {"default": 8, "min": 1, "max": 32, "step": 1}),
            },
            "optional": {
                "blend_mode": (["hann", "cosine"], {"default": "hann"}),
                "aggressive_memory_cleanup": ("BOOLEAN", {"default": True}),
                "debug": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("upscaled_latent",)
    FUNCTION = "upscale"
    CATEGORY = "Deno/LTX"

    @staticmethod
    def _validate_latent(samples: Any) -> torch.Tensor:
        if hasattr(samples, "is_nested") and samples.is_nested:
            raise TypeError(
                "Deno LTX Tiled Spatial Upscaler v1 accepts video-only LATENT "
                "tensors. Separate LTX audio first, then rejoin audio later."
            )
        if not isinstance(samples, torch.Tensor):
            raise TypeError(
                f"Expected latent samples to be torch.Tensor, got {type(samples).__name__}."
            )
        if samples.ndim != 5:
            raise ValueError(
                "Expected LTX video latent shape [B,C,F,H,W], got "
                f"{tuple(samples.shape)}."
            )
        return samples

    @staticmethod
    def _cleanup(device: torch.device, aggressive: bool) -> None:
        if not aggressive:
            return
        gc.collect()
        if device.type == "cuda":
            torch.cuda.empty_cache()

    def upscale(
        self,
        samples,
        upscale_model,
        vae,
        horizontal_tiles=2,
        vertical_tiles=2,
        overlap=8,
        blend_mode: BlendMode = "hann",
        aggressive_memory_cleanup=True,
        debug=False,
    ):
        source = self._validate_latent(samples["samples"])
        input_dtype = source.dtype
        batch, channels, frames, height, width = source.shape

        plan = build_tile_plan(
            height=height,
            width=width,
            vertical_tiles=int(vertical_tiles),
            horizontal_tiles=int(horizontal_tiles),
            overlap=int(overlap),
        )

        model_management = _comfy_model_management()
        device = model_management.get_torch_device()
        intermediate_device = model_management.intermediate_device()
        model_dtype = next(upscale_model.parameters()).dtype

        max_tile_h = max(spec.height for spec in plan)
        max_tile_w = max(spec.width for spec in plan)
        model_bytes = model_management.module_size(upscale_model)
        tile_elements = batch * channels * frames * max_tile_h * max_tile_w
        model_management.free_memory(model_bytes + tile_elements * 3000.0, device)

        if debug:
            print(
                "[Deno LTX] Tiled upscaler input="
                f"{tuple(source.shape)}, tiles={vertical_tiles}x{horizontal_tiles}, "
                f"overlap={overlap}, dtype={source.dtype}, device={device}"
            )

        stats = vae.first_stage_model.per_channel_statistics
        output_accum: torch.Tensor | None = None
        weight_accum: torch.Tensor | None = None
        scale_h: float | None = None
        scale_w: float | None = None
        out_height: int | None = None
        out_width: int | None = None

        try:
            upscale_model.to(device)
            latent_device = source.to(device=device, dtype=model_dtype)
            latent_unnormalized = stats.un_normalize(latent_device)

            for index, spec in enumerate(plan):
                tile_in = latent_unnormalized[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].contiguous()
                tile_out = upscale_model(tile_in)

                if tile_out.ndim != 5:
                    raise RuntimeError(
                        "LTX spatial upscaler returned a non-5D tensor: "
                        f"{tuple(tile_out.shape)}"
                    )

                if index == 0:
                    scale_h = tile_out.shape[-2] / tile_in.shape[-2]
                    scale_w = tile_out.shape[-1] / tile_in.shape[-1]
                    if scale_h <= 0 or scale_w <= 0:
                        raise RuntimeError(f"Invalid detected upscale ratio {scale_h}x{scale_w}.")

                    out_height = int(round(height * scale_h))
                    out_width = int(round(width * scale_w))
                    output_accum = torch.zeros(
                        (batch, channels, frames, out_height, out_width),
                        dtype=torch.float32,
                        device=device,
                    )
                    weight_accum = torch.zeros(
                        (1, 1, 1, out_height, out_width),
                        dtype=torch.float32,
                        device=device,
                    )

                assert scale_h is not None and scale_w is not None
                assert out_height is not None and out_width is not None
                assert output_accum is not None and weight_accum is not None

                out_y0 = int(round(spec.y0 * scale_h))
                out_x0 = int(round(spec.x0 * scale_w))
                out_y1 = min(out_height, out_y0 + tile_out.shape[-2])
                out_x1 = min(out_width, out_x0 + tile_out.shape[-1])
                actual_h = out_y1 - out_y0
                actual_w = out_x1 - out_x0
                if actual_h <= 0 or actual_w <= 0:
                    raise RuntimeError(
                        f"Upscaled tile r{spec.row}c{spec.col} maps outside output canvas."
                    )

                fade_top, fade_bottom, fade_left, fade_right = scaled_fades(spec, scale_h, scale_w)
                window = make_window_2d(
                    actual_h,
                    actual_w,
                    fade_top=min(fade_top, actual_h),
                    fade_bottom=min(fade_bottom, actual_h),
                    fade_left=min(fade_left, actual_w),
                    fade_right=min(fade_right, actual_w),
                    dtype=torch.float32,
                    device=device,
                    mode=blend_mode,
                ).view(1, 1, 1, actual_h, actual_w)

                tile_crop = tile_out[:, :, :, :actual_h, :actual_w].float()
                output_accum[:, :, :, out_y0:out_y1, out_x0:out_x1].add_(tile_crop * window)
                weight_accum[:, :, :, out_y0:out_y1, out_x0:out_x1].add_(window)

                if debug:
                    print(
                        f"  r{spec.row}c{spec.col}: "
                        f"in={tuple(tile_in.shape)} out={tuple(tile_out.shape)} "
                        f"canvas=({out_y0}:{out_y1},{out_x0}:{out_x1})"
                    )

                del tile_in, tile_out, tile_crop, window
                self._cleanup(device, bool(aggressive_memory_cleanup))

            assert output_accum is not None and weight_accum is not None
            min_weight = float(weight_accum.min().item())
            if min_weight <= 1e-7:
                raise RuntimeError(
                    f"Tiled upscaler produced uncovered output positions; min weight={min_weight}."
                )

            upscaled_unnormalized = output_accum / weight_accum.clamp_min(1e-8)
            del output_accum, weight_accum, latent_unnormalized, latent_device

            upscaled = stats.normalize(upscaled_unnormalized.to(dtype=model_dtype))
            del upscaled_unnormalized
        finally:
            upscale_model.cpu()
            self._cleanup(device, bool(aggressive_memory_cleanup))

        result = samples.copy()
        result["samples"] = upscaled.to(dtype=input_dtype, device=intermediate_device)
        result.pop("noise_mask", None)
        result["deno_ltx_tiled_upscale"] = {
            "horizontal_tiles": int(horizontal_tiles),
            "vertical_tiles": int(vertical_tiles),
            "overlap": int(overlap),
            "blend_mode": str(blend_mode),
        }
        return (result,)


class StepFusedAVTilePredictor:
    """Tiled video prediction with full-audio context for packed LTX AV latents."""

    def __init__(
        self,
        plan: list[TileSpec],
        full_height: int,
        full_width: int,
        global_video_shape: torch.Size,
        global_audio_shape: torch.Size,
        blend_mode: BlendMode,
        previous_calculator: Any = None,
        aggressive_memory_cleanup: bool = True,
        debug: bool = False,
    ) -> None:
        self.plan = plan
        self.full_height = full_height
        self.full_width = full_width
        self.global_video_shape = global_video_shape
        self.global_audio_shape = global_audio_shape
        self.blend_mode = blend_mode
        self.previous_calculator = previous_calculator
        self.aggressive_memory_cleanup = aggressive_memory_cleanup
        self.debug = debug
        self.call_count = 0
        self._window_cache: dict[tuple[str, int, int], torch.Tensor] = {}
        self._seen_sigma_strings: set[str] = set()

    def _window(self, spec: TileSpec, x: torch.Tensor) -> torch.Tensor:
        key = (str(x.device), spec.row, spec.col)
        cached = self._window_cache.get(key)
        if cached is None:
            cached = make_spec_window(
                spec,
                dtype=torch.float32,
                device=x.device,
                mode=self.blend_mode,
            )
            self._window_cache[key] = cached
        return cached

    def _cleanup(self, device: torch.device) -> None:
        if not self.aggressive_memory_cleanup:
            return
        gc.collect()
        if device.type == "cuda":
            torch.cuda.empty_cache()

    def __call__(self, args: dict) -> list[torch.Tensor]:
        self.call_count += 1
        x = args["input"]
        sigma = args["sigma"]
        model = args["model"]
        conds = args["conds"]
        model_options = args["model_options"]
        _reject_av_guide_metadata(conds)

        if not isinstance(x, torch.Tensor) or x.ndim != 3:
            raise RuntimeError(
                "Deno LTX AV step-fused prediction expected packed nested "
                f"latent shape [B,1,N], got {type(x).__name__} {getattr(x, 'shape', None)}."
            )
        _validate_packed_latent_shape(
            x,
            [self.global_video_shape, self.global_audio_shape],
            "AV sampler state",
        )

        video_x, audio_x = _unpack_latents(
            x,
            [self.global_video_shape, self.global_audio_shape],
        )
        if tuple(video_x.shape) != tuple(self.global_video_shape):
            raise RuntimeError(
                "Packed AV video shape changed during sampling: expected "
                f"{tuple(self.global_video_shape)}, got {tuple(video_x.shape)}."
            )
        if tuple(audio_x.shape) != tuple(self.global_audio_shape):
            raise RuntimeError(
                "Packed AV audio shape changed during sampling: expected "
                f"{tuple(self.global_audio_shape)}, got {tuple(audio_x.shape)}."
            )
        if tuple(video_x.shape[-2:]) != (self.full_height, self.full_width):
            raise RuntimeError(
                "AV video latent spatial shape changed during sampling: expected "
                f"{self.full_height}x{self.full_width}, got {tuple(video_x.shape[-2:])}."
            )

        sigma_value = float(sigma.flatten()[0].detach().cpu())
        sigma_label = f"{sigma_value:.7g}"
        if self.debug and sigma_label not in self._seen_sigma_strings:
            self._seen_sigma_strings.add(sigma_label)
            print(
                "[Deno LTX] AV step-fused prediction sigma="
                f"{sigma_label}, tiles={len(self.plan)}, audio_mode=freeze"
            )

        accumulators: list[torch.Tensor] | None = None
        weights = torch.zeros(
            (1, 1, 1, self.full_height, self.full_width),
            dtype=torch.float32,
            device=x.device,
        )

        for spec in self.plan:
            tile_video = video_x[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].contiguous()
            tile_packed, tile_shapes = _pack_latents([tile_video, audio_x])
            tile_conds = _crop_conds_for_tile(conds, spec, self.full_height, self.full_width, model)
            tile_conds = _replace_latent_shapes_in_conds(tile_conds, tile_shapes)

            tile_options = _clone_model_options(model_options)
            tile_options.pop("sampler_calc_cond_batch_function", None)
            transformer_options = tile_options.setdefault("transformer_options", {})
            transformer_options["deno_ltx_av_tile"] = {
                "row": spec.row,
                "col": spec.col,
                "origin": (spec.y0, spec.x0),
                "tile_shape": (spec.height, spec.width),
                "full_shape": (self.full_height, self.full_width),
                "audio_mode": "freeze",
            }

            if self.previous_calculator is not None:
                tile_args = dict(args)
                tile_args["input"] = tile_packed
                tile_args["conds"] = tile_conds
                tile_args["model_options"] = tile_options
                tile_predictions = self.previous_calculator(tile_args)
            else:
                tile_predictions = _comfy_samplers().calc_cond_batch(
                    model,
                    tile_conds,
                    tile_packed,
                    sigma,
                    tile_options,
                )

            if accumulators is None:
                accumulators = [
                    torch.zeros_like(video_x, dtype=torch.float32, device=x.device)
                    for _ in tile_predictions
                ]
            if len(tile_predictions) != len(accumulators):
                raise RuntimeError(
                    "Conditional AV prediction count changed between tiles: "
                    f"expected {len(accumulators)}, got {len(tile_predictions)}."
                )

            window = self._window(spec, video_x)
            for accumulator, packed_prediction in zip(accumulators, tile_predictions):
                _validate_packed_latent_shape(
                    packed_prediction,
                    tile_shapes,
                    "AV tile prediction",
                )
                parts = _unpack_latents(packed_prediction, tile_shapes)
                _validate_unpacked_shapes(parts, tile_shapes, "AV tile prediction")
                if len(parts) != 2:
                    raise RuntimeError(
                        "AV tile model prediction did not unpack into video and audio parts."
                    )
                video_prediction = parts[0]
                if tuple(video_prediction.shape) != tuple(tile_video.shape):
                    raise RuntimeError(
                        "AV tile video prediction shape mismatch: "
                        f"prediction={tuple(video_prediction.shape)}, "
                        f"tile={tuple(tile_video.shape)}."
                    )
                accumulator[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].add_(
                    video_prediction.float() * window
                )

            weights[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].add_(window)

            if self.debug:
                print(
                    f"  AV r{spec.row}c{spec.col} "
                    f"video={tuple(tile_video.shape)} audio={tuple(audio_x.shape)}"
                )

            del tile_video, tile_packed, tile_shapes, tile_conds, tile_options
            del tile_predictions, window
            self._cleanup(x.device)

        if accumulators is None:
            raise RuntimeError("No AV tile predictions were produced.")
        min_weight = float(weights.min().item())
        if min_weight <= 1e-7:
            raise RuntimeError(
                f"AV step-fused tile plan left uncovered pixels; min weight={min_weight}."
            )

        packed_results: list[torch.Tensor] = []
        for accumulator in accumulators:
            fused_video = (accumulator / weights.clamp_min(1e-8)).to(dtype=video_x.dtype)
            packed, _ = _pack_latents([fused_video, audio_x])
            packed_results.append(packed.to(dtype=x.dtype))

        return packed_results


class DenoLTXAVStepFusedTiledSampler:
    DESCRIPTION = (
        "Refines the video half of an LTX AV latent with step-fused spatial tiles "
        "while passing the full audio latent to every tile as context. Audio is "
        "kept unchanged in v1 so the second pass can use audio sync without "
        "re-denoising the sound."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "noise": ("NOISE",),
                "guider": ("GUIDER",),
                "sampler": ("SAMPLER",),
                "sigmas": ("SIGMAS",),
                "latent_image": ("LATENT",),
                "horizontal_tiles": (
                    "INT",
                    {
                        "default": 2,
                        "min": 1,
                        "max": 8,
                        "step": 1,
                        "display_name": "Frame width split count",
                    },
                ),
                "vertical_tiles": (
                    "INT",
                    {
                        "default": 2,
                        "min": 1,
                        "max": 8,
                        "step": 1,
                        "display_name": "Frame height split count",
                    },
                ),
                "overlap": ("INT", {"default": 8, "min": 1, "max": 32, "step": 1}),
            },
            "optional": {
                "audio_mode": (["freeze"], {"default": "freeze"}),
                "blend_mode": (["hann", "cosine"], {"default": "hann"}),
                "aggressive_memory_cleanup": ("BOOLEAN", {"default": True}),
                "debug": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("LATENT", "LATENT")
    RETURN_NAMES = ("output", "denoised_output")
    FUNCTION = "sample"
    CATEGORY = "Deno/LTX"

    @staticmethod
    def _validate_av_samples(samples: Any) -> tuple[torch.Tensor, torch.Tensor]:
        if not _is_nested(samples):
            raise TypeError(
                "Deno LTX AV Step-Fused Tiled Sampler expects an LTX AV nested "
                "latent containing video and audio parts. Use the DENO tiled "
                "spatial upscaler only for separated video-only latents."
            )
        parts = samples.unbind()
        if len(parts) != 2:
            raise ValueError(
                "Deno LTX AV Step-Fused Tiled Sampler v1 expects exactly two "
                f"latent parts: video and audio. Got {len(parts)} parts."
            )

        video, audio = parts
        if not isinstance(video, torch.Tensor) or not isinstance(audio, torch.Tensor):
            raise TypeError("AV nested latent parts must both be torch.Tensor values.")
        if video.ndim != 5:
            raise ValueError(
                "Expected AV video latent shape [B,C,F,H,W], got "
                f"{tuple(video.shape)}."
            )
        if audio.ndim != 4:
            raise ValueError(
                "Expected LTX AV audio latent [B,C,T,F], got "
                f"{tuple(audio.shape)}."
            )
        if video.shape[0] != audio.shape[0]:
            raise ValueError(
                "AV video and audio batch sizes must match: "
                f"video={video.shape[0]}, audio={audio.shape[0]}."
            )
        return video, audio

    @staticmethod
    def _validate_av_output(
        samples: Any,
        *,
        expected_video_shape: torch.Size,
        expected_audio_shape: torch.Size,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        if not _is_nested(samples):
            raise RuntimeError(
                "Deno LTX AV Step-Fused Tiled Sampler expected a NestedTensor "
                "output, but the sampler returned "
                f"{type(samples).__name__}. Remove incompatible OUTER_SAMPLE "
                "wrappers such as LTX2AudioLatentNormalizingSampling from the "
                "DENO AV tiled stage."
            )
        video, audio = DenoLTXAVStepFusedTiledSampler._validate_av_samples(samples)
        if tuple(video.shape) != tuple(expected_video_shape):
            raise RuntimeError(
                "Deno LTX AV Step-Fused Tiled Sampler output video shape "
                f"mismatch: got={tuple(video.shape)}, "
                f"expected={tuple(expected_video_shape)}."
            )
        if tuple(audio.shape) != tuple(expected_audio_shape):
            raise RuntimeError(
                "Deno LTX AV Step-Fused Tiled Sampler output audio shape "
                f"mismatch: got={tuple(audio.shape)}, "
                f"expected={tuple(expected_audio_shape)}."
            )
        return video, audio

    @staticmethod
    def _fix_video_channels(guider: Any, latent: dict, video: torch.Tensor) -> torch.Tensor:
        return _comfy_sample().fix_empty_latent_channels(
            guider.model_patcher,
            video,
            latent.get("downscale_ratio_spacial", None),
            latent.get("downscale_ratio_temporal", None),
        )

    def sample(
        self,
        noise,
        guider,
        sampler,
        sigmas,
        latent_image,
        horizontal_tiles=2,
        vertical_tiles=2,
        overlap=8,
        audio_mode="freeze",
        blend_mode: BlendMode = "hann",
        aggressive_memory_cleanup=True,
        debug=False,
    ):
        if audio_mode != "freeze":
            raise ValueError(
                "Deno LTX AV Step-Fused Tiled Sampler v1 only supports "
                "audio_mode='freeze'."
            )
        _reject_unsupported_guider(guider)
        _reject_incompatible_outer_wrappers(guider)
        _reject_av_guide_metadata(getattr(guider, "original_conds", {}))

        latent = latent_image.copy()
        video, audio = self._validate_av_samples(latent["samples"])
        video = self._fix_video_channels(guider, latent, video)
        source = _make_nested_latent([video, audio])
        latent["samples"] = source
        latent["noise_mask"] = _make_av_freeze_noise_mask(latent, video, audio)

        _, _, _, height, width = video.shape
        plan = build_tile_plan(
            height=height,
            width=width,
            vertical_tiles=int(vertical_tiles),
            horizontal_tiles=int(horizontal_tiles),
            overlap=int(overlap),
        )

        tiled_guider = copy.copy(guider)
        tiled_options = _clone_model_options(getattr(guider, "model_options", {}))
        previous_calculator = tiled_options.get("sampler_calc_cond_batch_function")
        predictor = StepFusedAVTilePredictor(
            plan=plan,
            full_height=height,
            full_width=width,
            global_video_shape=video.shape,
            global_audio_shape=audio.shape,
            blend_mode=blend_mode,
            previous_calculator=previous_calculator,
            aggressive_memory_cleanup=bool(aggressive_memory_cleanup),
            debug=bool(debug),
        )
        tiled_options["sampler_calc_cond_batch_function"] = predictor
        tiled_guider.model_options = tiled_options

        x0_output: dict[str, Any] = {}
        callback = _latent_preview().prepare_callback(
            tiled_guider.model_patcher, sigmas.shape[-1] - 1, x0_output
        )
        global_noise = noise.generate_noise(latent)

        if debug:
            print(
                "[Deno LTX] AV step-fused sampler input="
                f"video={tuple(video.shape)}, audio={tuple(audio.shape)}, "
                f"tiles={vertical_tiles}x{horizontal_tiles}, overlap={overlap}, "
                f"blend={blend_mode}, audio_mode=freeze"
            )

        samples = tiled_guider.sample(
            global_noise,
            source,
            sampler,
            sigmas,
            denoise_mask=latent["noise_mask"],
            callback=callback,
            disable_pbar=not _comfy_utils().PROGRESS_BAR_ENABLED,
            seed=noise.seed,
        )
        video_out, audio_out = self._validate_av_output(
            samples,
            expected_video_shape=video.shape,
            expected_audio_shape=audio.shape,
        )
        terminal_sigma = float(sigmas[-1].detach().flatten()[0].cpu())
        if math.isclose(terminal_sigma, 0.0, abs_tol=1e-8):
            _assert_same_tensor(audio_out, audio, "AV sampler output audio")

        if predictor.call_count == 0:
            raise RuntimeError(
                "The supplied guider did not invoke ComfyUI's conditional-batch "
                "calculation hook, so AV tiled prediction was not active. Use the "
                "built-in BasicGuider/CFGGuider for v1 and verify custom guiders separately."
            )

        intermediate_device = _comfy_model_management().intermediate_device()
        frozen_audio = audio.to(intermediate_device)
        output_samples = _make_nested_latent([video_out.to(intermediate_device), frozen_audio])

        output = latent.copy()
        output.pop("downscale_ratio_spacial", None)
        output.pop("downscale_ratio_temporal", None)
        output["samples"] = output_samples
        output["deno_ltx_av_step_fused_tiling"] = {
            "horizontal_tiles": int(horizontal_tiles),
            "vertical_tiles": int(vertical_tiles),
            "overlap": int(overlap),
            "blend_mode": str(blend_mode),
            "audio_mode": "freeze",
            "prediction_calls": int(predictor.call_count),
        }

        callback_x0 = _require_callback_x0(
            x0_output,
            "Deno LTX AV Step-Fused Tiled Sampler",
        )
        raw_x0 = tiled_guider.model_patcher.model.process_latent_out(callback_x0.cpu())
        latent_shapes = [video_out.shape, audio.shape]
        _validate_packed_latent_shape(raw_x0, latent_shapes, "AV x0")
        x0_parts = _unpack_latents(raw_x0, latent_shapes)
        _validate_unpacked_shapes(x0_parts, latent_shapes, "AV x0")
        _assert_same_tensor(x0_parts[1], audio, "AV x0 audio")

        denoised = latent.copy()
        denoised.pop("downscale_ratio_spacial", None)
        denoised.pop("downscale_ratio_temporal", None)
        denoised["samples"] = _make_nested_latent([
            x0_parts[0].to(intermediate_device),
            frozen_audio,
        ])
        denoised["deno_ltx_av_step_fused_tiling"] = (
            output["deno_ltx_av_step_fused_tiling"].copy()
        )

        return output, denoised


NODE_CLASS_MAPPINGS = {
    "DenoLTXTiledSpatialUpscaler": DenoLTXTiledSpatialUpscaler,
    "DenoLTXAVStepFusedTiledSampler": DenoLTXAVStepFusedTiledSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoLTXTiledSpatialUpscaler": "(Deno) LTX Tiled Spatial Upscaler",
    "DenoLTXAVStepFusedTiledSampler": "(Deno) LTX AV Step-Fused Tiled Sampler",
}
