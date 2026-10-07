"""CPU film grain for photos and decoded video frames, with frame-sized scratch."""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import torch


_MAX_SEED = (1 << 64) - 1


def _gaussian_numpy(field: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian with SciPy's half-sample symmetric boundary rule."""
    radius = int(4.0 * sigma + 0.5)
    if radius == 0:
        return field
    positions = np.arange(-radius, radius + 1, dtype=np.float64)
    weights = np.exp(-0.5 * (positions / sigma) ** 2)
    weights /= weights.sum()
    for axis in (0, 1):
        padding = [(0, 0), (0, 0)]
        padding[axis] = (radius, radius)
        padded = np.pad(field, padding, mode="symmetric")
        result = np.zeros_like(field)
        # Float64 accumulation matches ndimage's double-precision accumulator.
        for start in range(field.shape[axis]):
            window = [slice(None), slice(None)]
            window[axis] = slice(start, start + 2 * radius + 1)
            destination = [slice(None), slice(None)]
            destination[axis] = start
            result[tuple(destination)] = np.tensordot(
                weights, padded[tuple(window)], axes=(0, axis)
            )
        field = result
    return field


def _blur(field: np.ndarray, sigma: float) -> np.ndarray:
    try:
        from scipy.ndimage import gaussian_filter
    except ImportError:
        return _gaussian_numpy(field, sigma)
    return gaussian_filter(field, sigma, mode="reflect", output=field)


def _normalize(field: np.ndarray, *, center: bool = False) -> None:
    if center:
        field -= field.mean()
    deviation = float(field.std())
    if deviation > 1e-8:
        field /= deviation
    else:
        field.fill(0.0)


def _grain_field(shape, seed: int, grain_size: float, roughness: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    fine = _blur(rng.standard_normal(shape, dtype=np.float32), 0.45 * grain_size)
    _normalize(fine)
    coarse = _blur(rng.standard_normal(shape, dtype=np.float32), 1.15 * grain_size)
    _normalize(coarse)
    fine *= 1.0 - roughness
    coarse *= roughness
    fine += coarse
    del coarse
    fine /= 2.4
    np.tanh(fine, out=fine)
    fine *= 2.4
    _normalize(fine, center=True)
    return fine


def _apply_frame(source, destination, *, amount, grain_size, roughness, tone_weighted, seed):
    """Write one frame; neither source nor its alpha plane is modified."""
    # Bound the finite-value check too, rather than creating a whole RGB mask.
    for row in range(0, source.shape[0], 64):
        if not np.isfinite(source[row:row + 64]).all():
            raise ValueError("Film Grain requires finite image values; found NaN or infinity.")
    noise = _grain_field(source.shape[:2], seed, grain_size, roughness)
    if tone_weighted:
        luminance = np.einsum(
            "ijk,k->ij", source[..., :3], np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        )
        np.clip(luminance, 0.0, 1.0, out=luminance)
        weight = 1.0 - luminance
        weight *= luminance
        weight *= 4.0
        np.sqrt(weight, out=weight)
        luminance *= -0.6
        luminance += 1.1
        weight *= luminance
        noise *= weight
        del weight, luminance
    noise *= amount / 255.0
    for channel in range(3):
        np.add(source[..., channel], noise, out=destination[..., channel])
        np.clip(destination[..., channel], 0.0, 1.0, out=destination[..., channel])
    if source.shape[-1] == 4:
        destination[..., 3] = source[..., 3]


def _validate_settings(amount, grain_size, roughness, temporal_mode, seed, frame_offset):
    for name, value, minimum, maximum in (
        ("amount", amount, 0.0, 100.0),
        ("grain_size", grain_size, 0.25, 4.0),
        ("roughness", roughness, 0.0, 1.0),
    ):
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f"Film Grain {name} must be between {minimum} and {maximum}.")
    if temporal_mode not in ("changing", "fixed"):
        raise ValueError(f"Unknown Film Grain temporal_mode: {temporal_mode!r}.")
    for name, value in (("seed", seed), ("frame_offset", frame_offset)):
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= _MAX_SEED:
            raise ValueError(f"Film Grain {name} must be an integer between 0 and {_MAX_SEED}.")


class DenoFilmGrain:
    CATEGORY = "Deno/Image"
    FUNCTION = "apply"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_TOOLTIPS = ("Grain-applied frames on CPU, with original dimensions, dtype and alpha.",)
    DESCRIPTION = (
        "Add monochrome film grain after the final resize, before Save Image, "
        "Create Video or Video Combine. CPU processing uses small groups of 1–4 frames; "
        "choose 1 for the least temporary RAM. "
        "An enabled run still allocates one complete output IMAGE batch in RAM. "
        "RGB/RGBA size and dtype are preserved; alpha is unchanged. "
        "For native Save Video, connect images to Create Video first."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "images": ("IMAGE", {"tooltip": "Photo or decoded video frame batch, after the final resize."}),
            "enabled": ("BOOLEAN", {"default": True, "tooltip": "Off passes the original input through without copying."}),
            "amount": ("FLOAT", {"default": 6.0, "min": 0.0, "max": 100.0, "step": 0.01, "round": 0.001,
                "tooltip": "Legacy/API grain strength in 8-bit brightness units. The panel maps strength 0..1 to amount 0..12; its default is amount 6. The larger backend range preserves older workflows. 0 passes through."}),
            "grain_size": ("FLOAT", {"default": 1.0, "min": 0.25, "max": 4.0, "step": 0.05,
                "tooltip": "Scales grain blur only. 1 uses fine sigma 0.45px and coarse sigma 1.15px. Image detail is not blurred."}),
            "roughness": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.05,
                "tooltip": "Coarse grain proportion. 0.25 uses the original 75:25 fine/coarse mix."}),
            "tone_weighted": ("BOOLEAN", {"default": True,
                "tooltip": "Reduce grain near pure black and white, with emphasis on darker midtones."}),
            "temporal_mode": (["changing", "fixed"], {"default": "changing",
                "tooltip": "Changing varies the pattern per frame for video. Fixed keeps the same pattern for comparisons."}),
            "seed": ("INT", {"default": 2026100701, "min": 0, "max": _MAX_SEED,
                "tooltip": "Fixed seed reproduces the same grain. Changing uses seed + frame_offset + frame index."}),
            "frame_offset": ("INT", {"default": 0, "min": 0, "max": _MAX_SEED,
                "tooltip": "For separately processed video chunks, enter the first frame's global index. Otherwise keep 0."}),
        }, "optional": {
            "processing_batch_size": ("INT", {"default": 1, "min": 1, "max": 4, "step": 1,
                "tooltip": "Frames processed together on CPU. 1 minimizes temporary RAM; larger groups can improve speed. The complete output IMAGE batch still requires RAM. This does not change upstream generation VRAM."}),
        }}

    def apply(self, images, enabled=True, amount=6.0, grain_size=1.0, roughness=0.25,
              tone_weighted=True, temporal_mode="changing", seed=2026100701, frame_offset=0,
              processing_batch_size=1):
        if not enabled or amount == 0:
            return (images,)
        _validate_settings(amount, grain_size, roughness, temporal_mode, seed, frame_offset)
        if (isinstance(processing_batch_size, bool) or not isinstance(processing_batch_size, int)
                or not 1 <= processing_batch_size <= 4):
            raise ValueError("Film Grain processing_batch_size must be an integer between 1 and 4.")
        if (not isinstance(images, torch.Tensor) or images.ndim != 4
                or images.shape[-1] not in (3, 4) or any(d <= 0 for d in images.shape)
                or not images.is_floating_point()):
            raise ValueError("Film Grain requires a nonempty floating-point IMAGE batch [frames, height, width, 3 or 4].")
        try:
            from comfy.utils import ProgressBar
            from comfy.model_management import throw_exception_if_processing_interrupted
        except ImportError:
            progress = None
            check_interrupt = lambda: None
        else:
            progress = ProgressBar(images.shape[0])
            check_interrupt = throw_exception_if_processing_interrupted
        # Never move/clone the full input batch or allocate a full noise batch.
        output = torch.empty(tuple(images.shape), dtype=images.dtype, device="cpu")
        def prepare_frame(index):
            # Transfers stay on the caller's CUDA stream, before CPU workers.
            # Only this small processing group is copied, never the full video.
            cpu_frame = images[index].detach().to(device="cpu")
            source = cpu_frame.to(dtype=torch.float32).numpy()
            alpha = cpu_frame[..., 3] if images.shape[-1] == 4 else None
            return source, alpha

        def process_frame(index, source, alpha):
            frame_seed = (seed + frame_offset + index) & _MAX_SEED if temporal_mode == "changing" else seed
            if images.dtype == torch.bfloat16:
                destination = np.empty(source.shape, dtype=np.float32)
            else:
                destination = output[index].numpy()
            _apply_frame(source, destination, amount=amount, grain_size=grain_size,
                         roughness=roughness, tone_weighted=tone_weighted, seed=frame_seed)
            if images.dtype == torch.bfloat16:
                output[index].copy_(torch.from_numpy(destination))
            # Copy alpha directly from the original dtype, including float64.
            if alpha is not None:
                output[index, ..., 3].copy_(alpha)
            del source, destination
        group_size = min(processing_batch_size, images.shape[0])
        if group_size == 1:
            for index in range(images.shape[0]):
                check_interrupt()
                process_frame(index, *prepare_frame(index))
                if progress is not None:
                    progress.update(1)
        else:
            # Submit only the current small group; futures never retain a video
            # worth of decoded frames or grain fields. Each worker owns one
            # disjoint output frame and a local RNG.
            with ThreadPoolExecutor(max_workers=group_size, thread_name_prefix="deno-grain") as pool:
                for first in range(0, images.shape[0], group_size):
                    check_interrupt()
                    prepared = [(index, *prepare_frame(index))
                                for index in range(first, min(first + group_size, images.shape[0]))]
                    futures = [pool.submit(process_frame, *frame) for frame in prepared]
                    for future in futures:
                        check_interrupt()
                        future.result()
                        if progress is not None:
                            progress.update(1)
                    del futures, prepared
        return (output,)
