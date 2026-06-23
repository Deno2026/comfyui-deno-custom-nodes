from __future__ import annotations

import copy
import gc
import importlib
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
                "horizontal_tiles": ("INT", {"default": 1, "min": 1, "max": 8, "step": 1}),
                "vertical_tiles": ("INT", {"default": 2, "min": 1, "max": 8, "step": 1}),
                "overlap": ("INT", {"default": 8, "min": 1, "max": 32, "step": 1}),
            },
            "optional": {
                "blend_mode": (["hann", "cosine"], {"default": "hann"}),
                "aggressive_memory_cleanup": ("BOOLEAN", {"default": False}),
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
        horizontal_tiles=1,
        vertical_tiles=2,
        overlap=8,
        blend_mode: BlendMode = "hann",
        aggressive_memory_cleanup=False,
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


class StepFusedTilePredictor:
    """ComfyUI sampler_calc_cond_batch_function implementation."""

    def __init__(
        self,
        plan: list[TileSpec],
        full_height: int,
        full_width: int,
        blend_mode: BlendMode,
        previous_calculator: Any = None,
        aggressive_memory_cleanup: bool = False,
        debug: bool = False,
    ) -> None:
        self.plan = plan
        self.full_height = full_height
        self.full_width = full_width
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

        if not isinstance(x, torch.Tensor) or x.ndim != 5:
            raise RuntimeError(
                "Step-fused tiled prediction expected [B,C,F,H,W], got "
                f"{type(x).__name__} {getattr(x, 'shape', None)}. "
                "LTX AV packed/nested sampling is not supported in v1."
            )
        if tuple(x.shape[-2:]) != (self.full_height, self.full_width):
            raise RuntimeError(
                "Latent spatial shape changed during sampling: expected "
                f"{self.full_height}x{self.full_width}, got {tuple(x.shape[-2:])}."
            )

        sigma_value = float(sigma.flatten()[0].detach().cpu())
        sigma_label = f"{sigma_value:.7g}"
        if self.debug and sigma_label not in self._seen_sigma_strings:
            self._seen_sigma_strings.add(sigma_label)
            print(f"[Deno LTX] step-fused prediction sigma={sigma_label}, tiles={len(self.plan)}")

        accumulators: list[torch.Tensor] | None = None
        weights = torch.zeros(
            (1, 1, 1, self.full_height, self.full_width),
            dtype=torch.float32,
            device=x.device,
        )

        for spec in self.plan:
            tile_x = x[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].contiguous()
            tile_conds = _crop_conds_for_tile(conds, spec, self.full_height, self.full_width, model)

            tile_options = _clone_model_options(model_options)
            tile_options.pop("sampler_calc_cond_batch_function", None)
            transformer_options = tile_options.setdefault("transformer_options", {})
            transformer_options["deno_ltx_tile"] = {
                "row": spec.row,
                "col": spec.col,
                "origin": (spec.y0, spec.x0),
                "tile_shape": (spec.height, spec.width),
                "full_shape": (self.full_height, self.full_width),
            }

            if self.previous_calculator is not None:
                tile_args = dict(args)
                tile_args["input"] = tile_x
                tile_args["conds"] = tile_conds
                tile_args["model_options"] = tile_options
                tile_predictions = self.previous_calculator(tile_args)
            else:
                tile_predictions = _comfy_samplers().calc_cond_batch(
                    model,
                    tile_conds,
                    tile_x,
                    sigma,
                    tile_options,
                )

            if accumulators is None:
                accumulators = [torch.zeros_like(x, dtype=torch.float32, device=x.device) for _ in tile_predictions]
            if len(tile_predictions) != len(accumulators):
                raise RuntimeError(
                    "Conditional prediction count changed between tiles: "
                    f"expected {len(accumulators)}, got {len(tile_predictions)}."
                )

            window = self._window(spec, x)
            for accumulator, prediction in zip(accumulators, tile_predictions):
                if tuple(prediction.shape) != tuple(tile_x.shape):
                    raise RuntimeError(
                        "Tile model prediction shape mismatch: "
                        f"prediction={tuple(prediction.shape)}, tile={tuple(tile_x.shape)}."
                    )
                accumulator[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].add_(prediction.float() * window)

            weights[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1].add_(window)

            if self.debug:
                print(f"  r{spec.row}c{spec.col} y={spec.y0}:{spec.y1} x={spec.x0}:{spec.x1}")

            del tile_x, tile_conds, tile_options, tile_predictions, window
            self._cleanup(x.device)

        if accumulators is None:
            raise RuntimeError("No tile predictions were produced.")
        min_weight = float(weights.min().item())
        if min_weight <= 1e-7:
            raise RuntimeError(
                f"Step-fused tile plan left uncovered pixels; min weight={min_weight}."
            )

        return [(accumulator / weights.clamp_min(1e-8)).to(dtype=x.dtype) for accumulator in accumulators]


class DenoLTXStepFusedTiledSampler:
    DESCRIPTION = (
        "Runs one global sampler trajectory while each model prediction is evaluated "
        "through overlapping LTX spatial tiles and fused before CFG. Use it for "
        "low-denoise second-pass refinement of large video latents."
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
                "horizontal_tiles": ("INT", {"default": 1, "min": 1, "max": 8, "step": 1}),
                "vertical_tiles": ("INT", {"default": 2, "min": 1, "max": 8, "step": 1}),
                "overlap": ("INT", {"default": 8, "min": 1, "max": 32, "step": 1}),
            },
            "optional": {
                "blend_mode": (["hann", "cosine"], {"default": "hann"}),
                "aggressive_memory_cleanup": ("BOOLEAN", {"default": False}),
                "debug": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("LATENT", "LATENT")
    RETURN_NAMES = ("output", "denoised_output")
    FUNCTION = "sample"
    CATEGORY = "Deno/LTX"

    @staticmethod
    def _validate_samples(samples: Any) -> torch.Tensor:
        if hasattr(samples, "is_nested") and samples.is_nested:
            raise TypeError(
                "Deno LTX Step-Fused Tiled Sampler v1 supports video-only latents. "
                "Separate LTX audio before sampling or use a video-only second pass."
            )
        if not isinstance(samples, torch.Tensor):
            raise TypeError(f"Expected torch.Tensor latent samples, got {type(samples).__name__}.")
        if samples.ndim != 5:
            raise ValueError(f"Expected [B,C,F,H,W] LTX video latent, got {tuple(samples.shape)}.")
        return samples

    @staticmethod
    def _fix_channels(guider: Any, latent: dict, samples: torch.Tensor) -> torch.Tensor:
        return _comfy_sample().fix_empty_latent_channels(
            guider.model_patcher,
            samples,
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
        horizontal_tiles=1,
        vertical_tiles=2,
        overlap=8,
        blend_mode: BlendMode = "hann",
        aggressive_memory_cleanup=False,
        debug=False,
    ):
        latent = latent_image.copy()
        source = self._validate_samples(latent["samples"])
        source = self._fix_channels(guider, latent, source)
        latent["samples"] = source

        _, _, _, height, width = source.shape
        plan = build_tile_plan(
            height=height,
            width=width,
            vertical_tiles=int(vertical_tiles),
            horizontal_tiles=int(horizontal_tiles),
            overlap=int(overlap),
        )

        if len(plan) == 1:
            if debug:
                print("[Deno LTX] one tile requested; using stock guider.sample path.")
            return self._stock_sample(noise, guider, sampler, sigmas, latent)

        tiled_guider = copy.copy(guider)
        tiled_options = _clone_model_options(getattr(guider, "model_options", {}))
        previous_calculator = tiled_options.get("sampler_calc_cond_batch_function")
        predictor = StepFusedTilePredictor(
            plan=plan,
            full_height=height,
            full_width=width,
            blend_mode=blend_mode,
            previous_calculator=previous_calculator,
            aggressive_memory_cleanup=bool(aggressive_memory_cleanup),
            debug=bool(debug),
        )
        tiled_options["sampler_calc_cond_batch_function"] = predictor
        tiled_guider.model_options = tiled_options

        noise_mask = latent.get("noise_mask")
        x0_output: dict[str, Any] = {}
        callback = _latent_preview().prepare_callback(
            tiled_guider.model_patcher, sigmas.shape[-1] - 1, x0_output
        )
        global_noise = noise.generate_noise(latent)

        if debug:
            print(
                "[Deno LTX] step-fused sampler input="
                f"{tuple(source.shape)}, tiles={vertical_tiles}x{horizontal_tiles}, "
                f"overlap={overlap}, blend={blend_mode}"
            )

        samples = tiled_guider.sample(
            global_noise,
            source,
            sampler,
            sigmas,
            denoise_mask=noise_mask,
            callback=callback,
            disable_pbar=not _comfy_utils().PROGRESS_BAR_ENABLED,
            seed=noise.seed,
        )

        if predictor.call_count == 0:
            raise RuntimeError(
                "The supplied guider did not invoke ComfyUI's conditional-batch "
                "calculation hook, so tiled prediction was not active. Use the "
                "built-in BasicGuider/CFGGuider for v1 and verify custom guiders separately."
            )

        intermediate_device = _comfy_model_management().intermediate_device()
        samples = samples.to(intermediate_device)

        output = latent.copy()
        output.pop("downscale_ratio_spacial", None)
        output.pop("downscale_ratio_temporal", None)
        output["samples"] = samples
        output["deno_ltx_step_fused_tiling"] = {
            "horizontal_tiles": int(horizontal_tiles),
            "vertical_tiles": int(vertical_tiles),
            "overlap": int(overlap),
            "blend_mode": str(blend_mode),
            "prediction_calls": int(predictor.call_count),
        }

        if "x0" in x0_output:
            x0 = tiled_guider.model_patcher.model.process_latent_out(x0_output["x0"].cpu())
            denoised = latent.copy()
            denoised.pop("downscale_ratio_spacial", None)
            denoised.pop("downscale_ratio_temporal", None)
            denoised["samples"] = x0.to(intermediate_device)
            denoised["deno_ltx_step_fused_tiling"] = output["deno_ltx_step_fused_tiling"].copy()
        else:
            denoised = output

        return output, denoised

    @staticmethod
    def _stock_sample(noise, guider, sampler, sigmas, latent):
        source = latent["samples"]
        noise_mask = latent.get("noise_mask")
        x0_output: dict[str, Any] = {}
        callback = _latent_preview().prepare_callback(
            guider.model_patcher, sigmas.shape[-1] - 1, x0_output
        )
        samples = guider.sample(
            noise.generate_noise(latent),
            source,
            sampler,
            sigmas,
            denoise_mask=noise_mask,
            callback=callback,
            disable_pbar=not _comfy_utils().PROGRESS_BAR_ENABLED,
            seed=noise.seed,
        ).to(_comfy_model_management().intermediate_device())

        output = latent.copy()
        output.pop("downscale_ratio_spacial", None)
        output.pop("downscale_ratio_temporal", None)
        output["samples"] = samples
        if "x0" in x0_output:
            denoised = latent.copy()
            denoised.pop("downscale_ratio_spacial", None)
            denoised.pop("downscale_ratio_temporal", None)
            denoised["samples"] = guider.model_patcher.model.process_latent_out(
                x0_output["x0"].cpu()
            ).to(_comfy_model_management().intermediate_device())
        else:
            denoised = output
        return output, denoised


NODE_CLASS_MAPPINGS = {
    "DenoLTXTiledSpatialUpscaler": DenoLTXTiledSpatialUpscaler,
    "DenoLTXStepFusedTiledSampler": DenoLTXStepFusedTiledSampler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoLTXTiledSpatialUpscaler": "[BETA] (Deno) LTX Tiled Spatial Upscaler",
    "DenoLTXStepFusedTiledSampler": "[BETA] (Deno) LTX Step-Fused Tiled Sampler",
}
