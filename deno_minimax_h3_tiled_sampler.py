"""MiniMax H3 Tiled Sampler: step-synchronous tiled finishing for upscaled H3 latents.

At every sigma all tiles predict from the same global state; overlaps are blended
with cosine weights before one global Euler update. Audio stays frozen inside the
model call (denoise mask 0). Upscaling, attention and memory patches come from
upstream nodes that stay visible on the canvas.
"""
from __future__ import annotations

import hashlib
import json
import time

import torch
import torch.nn.functional as F

import comfy.model_management as mm
import comfy.nested_tensor
import comfy.patcher_extension
import comfy.sample
import comfy.samplers
import comfy.utils
from comfy_api.latest import io

try:
    from .deno_minimax_h3_tiling import (LATENT_PX, MIN_OVERLAP_X, MIN_OVERLAP_Y, PX_ALIGN, TILE_HEIGHT,
                                         TILE_WIDTH, consensus_euler, make_tiles, schedule_from_sigmas,
                                         tile_layout)
    from .deno_node_metadata import _with_version_prefix
except ImportError:
    from deno_minimax_h3_tiling import (LATENT_PX, MIN_OVERLAP_X, MIN_OVERLAP_Y, PX_ALIGN, TILE_HEIGHT,
                                        TILE_WIDTH, consensus_euler, make_tiles, schedule_from_sigmas,
                                        tile_layout)
    from deno_node_metadata import _with_version_prefix

CATEGORY = "Deno/MiniMax H3"
DESCRIPTION = ("Finishes an upscaled MiniMax H3 latent in tiles of the size you set. At every step all "
               "tiles read the same frame and are blended before one shared update, so tiles stay "
               "consistent. The model loads once for all tiles. Original audio is kept. Apply attention "
               "and memory nodes before this node.")


def streams(latent):
    value = latent["samples"]
    if not getattr(value, "is_nested", False) or len(value.unbind()) != 2:
        raise ValueError("Connect a finished MiniMax H3 video+audio LATENT (two streams)")
    video, audio = value.unbind()
    if video.ndim != 5 or video.shape[:2] != (1, 24):
        raise ValueError("Expected an H3 video latent [1,24,T,H,W]")
    if audio.ndim != 4 or audio.shape[:3] != (1, 32, 2):
        raise ValueError("Expected an H3 audio latent [1,32,2,T]")
    if video.shape[-2] % 2 or video.shape[-1] % 2:
        raise ValueError("H3 latent width and height must be multiples of 32 px")
    if "noise_mask" in latent:
        raise ValueError("Connect a finished LATENT without a noise mask")
    return video.detach().cpu(), audio.detach().cpu()


def peak_reset():
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()


def peak_stats():
    if not torch.cuda.is_available():
        return {}
    return {"torch_peak_allocated_gib": round(torch.cuda.max_memory_allocated() / 2**30, 3),
            "torch_peak_reserved_gib": round(torch.cuda.max_memory_reserved() / 2**30, 3)}


def with_report(values, result):
    text = json.dumps(values, ensure_ascii=False)
    print("[DenoH3Tiled] " + text, flush=True)
    return io.NodeOutput(*result, ui={"text": [text]})


def size_inputs():
    """Tile and overlap sizes in pixels; the widgets step by 32 and the sampler rejects other values."""
    return [
        io.Int.Input("tile_width", display_name="Tile width", default=TILE_WIDTH, min=256, max=8192, step=PX_ALIGN,
                     tooltip="Tile width in pixels, a multiple of 32. Larger tiles need more VRAM; a tile at least "
                             "as large as the frame runs it in one piece. Tested on 16GB: 896."),
        io.Int.Input("tile_height", display_name="Tile height", default=TILE_HEIGHT, min=256, max=8192, step=PX_ALIGN,
                     tooltip="Tile height in pixels, a multiple of 32. Tested on 16GB: 704."),
        io.Int.Input("overlap_x", display_name="Overlap X", default=MIN_OVERLAP_X, min=PX_ALIGN, max=4096,
                     step=PX_ALIGN, tooltip="Minimum overlap between side-by-side tiles in pixels, a multiple of 32 "
                                            "and smaller than the tile width. Tested: 256."),
        io.Int.Input("overlap_y", display_name="Overlap Y", default=MIN_OVERLAP_Y, min=PX_ALIGN, max=4096,
                     step=PX_ALIGN, tooltip="Minimum overlap between stacked tiles in pixels, a multiple of 32 "
                                            "and smaller than the tile height. Tested: 320."),
    ]


def crop_conditioning(conditioning, full_h, full_w, tile):
    """Independent reference images stay global; canvas keyframes follow the crop."""
    result = []
    for embedding, meta in conditioning:
        meta = dict(meta)
        if "area" in meta or "mask" in meta or "control" in meta:
            raise ValueError("Regional conditioning and ControlNet are not supported by the tiled sampler")
        if "minimax_keyframes" in meta:
            frames = []
            for original in meta["minimax_keyframes"]:
                frame = dict(original)
                value = frame.get("latent")
                if value is not None:
                    if value.ndim != 5:
                        raise ValueError("Expected a 5D H3 keyframe latent")
                    value = value.detach().cpu().float()
                    if value.shape[-2:] != (full_h, full_w):
                        value = F.interpolate(value, size=(value.shape[2], full_h, full_w),
                                              mode="trilinear", align_corners=False)
                    frame["latent"] = value[..., tile.y0:tile.y1, tile.x0:tile.x1].contiguous()
                frames.append(frame)
            meta["minimax_keyframes"] = frames
        result.append([embedding, meta])
    return result


class PredictionOnlySampler(comfy.samplers.KSAMPLER):
    """Use the complete native sampler setup, replacing only its ODE function."""
    def __init__(self, current_video, sigma):
        super().__init__(self.predict_once)
        self.current_video = current_video
        self.sigma = sigma
        self.prediction = None

    def predict_once(self, wrapped, state, sigmas, extra_args=None, callback=None, disable=None):
        shapes = wrapped.inner_model.inner_model.latent_shapes
        if len(shapes) != 2 or tuple(shapes[0]) != tuple(self.current_video.shape):
            raise ValueError("Native tile shape differs from the shared step state")
        video, audio = comfy.utils.unpack_latents(state, shapes)
        sigma = state.new_tensor(self.sigma).expand(state.shape[0])
        state = comfy.utils.pack_latents([self.current_video.to(video), audio])[0]
        prediction = wrapped(state, sigma, **extra_args)
        self.prediction = comfy.utils.unpack_latents(prediction, shapes)[0].detach().float().cpu().clone()
        return prediction


class RetainedPredictionSampler(comfy.samplers.KSAMPLER):
    """Keep one native sampling lifetime (one model load) across equal-sized tiles.

    Independent R2V references and frozen audio are identical for every tile; the
    caller supplies the current global-step video for each prediction. Native
    outer_sample owns loading, exception cleanup and final offloading.
    """
    def __init__(self, body):
        super().__init__(self.predict_all)
        self.body = body
        self.combined = None

    def predict_all(self, wrapped, state, sigmas, extra_args=None, **kwargs):
        def predict(current, sigma):
            predictor = PredictionOnlySampler(current, sigma)
            predictor.predict_once(wrapped, state, sigmas, extra_args=extra_args)
            return predictor.prediction
        self.combined = self.body(predict)
        # The native return is only a valid tile-shaped lifetime sentinel; the
        # full-canvas Euler result is returned through self.combined.
        return state


class DenoMiniMaxH3TiledSampler(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DenoMiniMaxH3TiledSampler",
            display_name="(Deno) MiniMax H3 Tiled Sampler",
            category=CATEGORY,
            description=_with_version_prefix(DESCRIPTION),
            inputs=[
                io.Model.Input("model", tooltip="H3 model after LoRAs, sigma shift and any attention or memory nodes."),
                io.Conditioning.Input("positive", tooltip="The same positive conditioning as the first pass."),
                io.Latent.Input("latent", tooltip="Upscaled H3 video+audio latent (for example from MiniMax H3 "
                                                  "Latent Upscale With Model)."),
                io.Sigmas.Input("sigmas", tooltip="The final 1-3 steps of the first-pass schedule, "
                                                  "for example SplitSigmas low_sigmas."),
                io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff, control_after_generate=True,
                             tooltip="Noise used to bring the upscaled latent back to the first sigma."),
                *size_inputs(),
            ],
            outputs=[io.Latent.Output("latent", tooltip="Finished H3 video+audio latent. The audio latent is the "
                                                        "input audio, unchanged.")],
        )

    @classmethod
    def execute(cls, model, positive, latent, sigmas, seed, tile_width, tile_height, overlap_x,
                overlap_y) -> io.NodeOutput:
        with torch.inference_mode():
            return cls.sample(model, positive, latent, sigmas, seed, tile_width, tile_height, overlap_x, overlap_y)

    @classmethod
    def sample(cls, model, positive, latent, sigmas, seed, tile_width, tile_height, overlap_x, overlap_y):
        video, audio = streams(latent)
        schedule = schedule_from_sigmas(sigmas.flatten().cpu())
        (tile_h, tile_w), (overlap_h, overlap_w) = tile_layout(int(tile_width), int(tile_height),
                                                               int(overlap_x), int(overlap_y))
        layout = dict(tile_h=tile_h, tile_w=tile_w, overlap_h=overlap_h, overlap_w=overlap_w)
        tiles = make_tiles(*video.shape[-2:], **layout)
        tile_px = [min(tile_w, video.shape[-1]) * LATENT_PX, min(tile_h, video.shape[-2]) * LATENT_PX]
        grid = [len({t.x0 for t in tiles}), len({t.y0 for t in tiles})]
        print(f"[DenoH3Tiled] {len(tiles)} tiles ({grid[0]}x{grid[1]}) of {tile_px[0]}x{tile_px[1]} for "
              f"{video.shape[-1] * LATENT_PX}x{video.shape[-2] * LATENT_PX}, overlap at least "
              f"{overlap_w * LATENT_PX}x{overlap_h * LATENT_PX}", flush=True)
        if model.get_callbacks(comfy.patcher_extension.CallbacksMP.ON_CLEANUP, "block_sparse_attention"):
            raise ValueError("Core BlockSparseAttention is not supported by the tiled sampler yet. "
                             "Connect the model before that node; H3-Optimizations sparse attention is supported.")
        working_model = model.clone(disable_dynamic=False)
        lifetime_counts = {"loads": 0, "pre_runs": 0, "cleanups": 0}

        def count_event(name):
            def record(*args, **kwargs):
                lifetime_counts[name] += 1
            return record

        for event, name in ((comfy.patcher_extension.CallbacksMP.ON_LOAD, "loads"),
                            (comfy.patcher_extension.CallbacksMP.ON_PRE_RUN, "pre_runs"),
                            (comfy.patcher_extension.CallbacksMP.ON_CLEANUP, "cleanups")):
            working_model.add_callback_with_key(event, "deno_h3_tiled_sampler_lifetime", count_event(name))
        latent_format = working_model.get_model_object("latent_format")
        sampling = working_model.get_model_object("model_sampling")
        if latent_format.__class__.__name__ != "MiniMaxH3AV":
            raise ValueError("Connect a native MiniMax H3 audio-video model")
        generator = torch.Generator(device="cpu").manual_seed(seed)
        noise_video = torch.randn(video.shape, generator=generator, dtype=torch.float32)
        noise_audio = torch.randn(audio.shape, generator=generator, dtype=torch.float32)
        clean = latent_format.process_in(video.float())
        # Match native CUDA elementwise rounding; only ~3 latent buffers, no full
        # canvas enters model preparation or attention.
        device = working_model.load_device
        initial = sampling.noise_scaling(torch.tensor(schedule[0], device=device),
                                        noise_video.to(device), clean.to(device), False).cpu()
        Nested = comfy.nested_tensor.NestedTensor
        sigma_tensor = torch.tensor(schedule, dtype=torch.float32)
        progress = comfy.utils.ProgressBar(len(tiles) * (len(schedule) - 1))
        tile_timings = []
        session_predict = None
        # Keyframes need tile-specific native conditioning, so they keep the
        # per-tile preparation path; independent references share one session.
        retained = not any("minimax_keyframes" in meta for _, meta in positive)
        started = time.monotonic()
        peak_reset()

        def native_inputs(tile, original_audio):
            region = (..., slice(tile.y0, tile.y1), slice(tile.x0, tile.x1))
            packed = Nested([video[region].contiguous(), original_audio])
            noise = Nested([noise_video[region].contiguous(), noise_audio])
            masks = Nested([torch.ones_like(packed.unbind()[0]), torch.zeros_like(original_audio)])
            return packed, noise, masks, crop_conditioning(positive, *video.shape[-2:], tile)

        def run_native(sampler, packed, noise, masks, conditioning):
            native = working_model.model
            old_shapes = native.latent_shapes
            try:
                comfy.sample.sample_custom(working_model, noise, 1.0, sampler, sigma_tensor,
                                           conditioning, conditioning, packed, noise_mask=masks,
                                           disable_pbar=True, seed=seed)
            finally:
                native.latent_shapes = old_shapes

        def predict(current, original_audio, sigma, tile):
            before = time.monotonic()
            if session_predict is not None:
                prediction = session_predict(current, sigma)
            else:
                predictor = PredictionOnlySampler(current, sigma)
                run_native(predictor, *native_inputs(tile, original_audio))
                prediction = predictor.prediction
            if prediction is None:
                raise RuntimeError("Native tile sampler did not return a prediction")
            tile_timings.append(round(time.monotonic() - before, 3))
            progress.update(1)
            print(f"[DenoH3Tiled] tile {len(tile_timings)}/{len(tiles) * (len(schedule) - 1)} "
                  f"sigma={sigma:.6f} seconds={tile_timings[-1]}", flush=True)
            return prediction

        def solve():
            return consensus_euler(initial, audio, schedule, predict, **layout,
                                   check_interrupt=mm.throw_exception_if_processing_interrupted)

        if retained:
            def in_session(native_predict):
                nonlocal session_predict
                session_predict = native_predict
                try:
                    return solve()
                finally:
                    session_predict = None
            session = RetainedPredictionSampler(in_session)
            run_native(session, *native_inputs(tiles[0], audio))
            if session.combined is None:
                raise RuntimeError("Native retained session did not finish the tiled solve")
            combined, unchanged_audio = session.combined
        else:
            combined, unchanged_audio = solve()
        refined = latent_format.process_out(combined).to(video.dtype)
        report = {"stage": "refine", "steps": len(schedule) - 1, "sigmas": schedule,
                  "tile_size": tile_px, "tile_grid": grid,
                  "min_overlap": [overlap_w * LATENT_PX, overlap_h * LATENT_PX],
                  "tiles_per_step": len(tiles), "model_calls": len(tile_timings),
                  "dynamic_model": working_model.is_dynamic(), "retained_model_session": retained,
                  "native_sampler_sessions": 1 if retained else len(tile_timings),
                  "model_lifetime_callbacks": dict(lifetime_counts),
                  "tile_seconds": tile_timings, "audio_equal": torch.equal(audio, unchanged_audio),
                  "audio_sha256": hashlib.sha256(unchanged_audio.contiguous().view(torch.uint8).numpy().tobytes()).hexdigest(),
                  "seconds": round(time.monotonic() - started, 3), **peak_stats()}
        result = dict(latent)
        result["samples"] = Nested([refined.cpu(), audio.clone()])
        return with_report(report, (result,))
