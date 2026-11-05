"""CPU tile planning and step-synchronous blending for the MiniMax H3 Tiled Sampler.

No ComfyUI or model imports. The node supplies an already noise-scaled,
model-space video state and a denoised-video predictor. All tiles read the same
state at each sigma; predictions are blended with cosine weights before one
global Euler update. Noise is never re-injected here.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
import math

import torch

# Defaults are the tested 16GB setting: 1920x1088 becomes 3x2 tiles of 896x704
# with at least 256x320 px overlap. All four sizes are multiples of 32 px.
TILE_WIDTH = 896
TILE_HEIGHT = 704
MIN_OVERLAP_X = 256
MIN_OVERLAP_Y = 320
LATENT_PX = 16
PX_ALIGN = 32  # H3 2x2 latent patches


def tile_layout(tile_width: int, tile_height: int, overlap_x: int, overlap_y: int):
    """Latent (tile_h, tile_w) and (overlap_h, overlap_w) from pixel sizes."""
    for name, value in (("Tile width", tile_width), ("Tile height", tile_height),
                        ("Overlap X", overlap_x), ("Overlap Y", overlap_y)):
        if value <= 0 or value % PX_ALIGN:
            raise ValueError(f"{name} must be a positive multiple of {PX_ALIGN} px (got {value})")
    if overlap_x >= tile_width or overlap_y >= tile_height:
        raise ValueError(f"Overlap {overlap_x}x{overlap_y} px must be smaller than the tile "
                         f"{tile_width}x{tile_height} px")
    return ((tile_height // LATENT_PX, tile_width // LATENT_PX),
            (overlap_y // LATENT_PX, overlap_x // LATENT_PX))


def schedule_from_sigmas(values) -> tuple[float, ...]:
    schedule = tuple(float(s) for s in values)
    if (not 2 <= len(schedule) <= 4 or not all(math.isfinite(s) for s in schedule)
            or not 0 < schedule[0] < 1 or schedule[-1] != 0
            or any(a <= b for a, b in zip(schedule, schedule[1:]))):
        raise ValueError(
            "Connect only the final 1-3 steps of the first-pass schedule "
            "(for example the low_sigmas output of SplitSigmas): 2-4 values, "
            "starting below 1.0, strictly decreasing, ending at 0. "
            f"Received {len(schedule)} values starting at {schedule[0] if schedule else None}.")
    return schedule


@dataclass(frozen=True)
class Tile:
    y0: int
    y1: int
    x0: int
    x1: int
    top: int = 0
    bottom: int = 0
    left: int = 0
    right: int = 0


def axis_starts(total: int, window: int, overlap: int) -> tuple[int, ...]:
    """Even latent coordinates retain the H3 2x2 patch / 32px alignment."""
    if any(not isinstance(n, int) or isinstance(n, bool) for n in (total, window, overlap)):
        raise ValueError("Dimensions must be integers")
    if total <= 0 or window <= 0 or overlap < 0 or overlap >= window:
        raise ValueError("Require positive dimensions and 0 <= overlap < window")
    if any(n % 2 for n in (total, window, overlap)):
        raise ValueError("Latent dimensions and overlaps must be even (32px alignment)")
    if total <= window:
        return (0,)
    starts = list(range(0, total - window + 1, window - overlap))
    if starts[-1] != total - window:
        starts.append(total - window)
    return tuple(starts)


def make_tiles(height: int, width: int, tile_h=48, tile_w=64, overlap_h=12, overlap_w=16):
    ys = axis_starts(height, tile_h, overlap_h)
    xs = axis_starts(width, tile_w, overlap_w)
    h, w = min(height, tile_h), min(width, tile_w)
    return tuple(
        Tile(y, y + h, x, x + w,
             ys[yi - 1] + h - y if yi else 0,
             y + h - ys[yi + 1] if yi + 1 < len(ys) else 0,
             xs[xi - 1] + w - x if xi else 0,
             x + w - xs[xi + 1] if xi + 1 < len(xs) else 0)
        for yi, y in enumerate(ys) for xi, x in enumerate(xs)
    )


def feather(tile: Tile) -> torch.Tensor:
    """Positive cosine weights; outside canvas edges keep full weight."""
    def axis(length, before, after):
        weight = torch.ones(length, dtype=torch.float32)
        for count, reverse in ((before, False), (after, True)):
            if not count:
                continue
            phase = torch.arange(1, count + 1, dtype=torch.float32) / (count + 1)
            ramp = 0.5 - 0.5 * torch.cos(phase * math.pi)
            if reverse:
                weight[-count:] = torch.minimum(weight[-count:], ramp.flip(0))
            else:
                weight[:count] = torch.minimum(weight[:count], ramp)
        return weight

    wy = axis(tile.y1 - tile.y0, tile.top, tile.bottom)
    wx = axis(tile.x1 - tile.x0, tile.left, tile.right)
    return (wy[:, None] * wx[None, :]).clamp_min(1e-6)[None, None, None]


def consensus_euler(
    initial_video: torch.Tensor,
    fixed_audio: torch.Tensor,
    sigmas: Sequence[float],
    predict_tile: Callable[[torch.Tensor, torch.Tensor, float, Tile], torch.Tensor],
    *,
    tile_h=48,
    tile_w=64,
    overlap_h=12,
    overlap_w=16,
    reverse_tiles=False,
    on_step: Callable[[int, torch.Tensor], None] | None = None,
    check_interrupt: Callable[[], None] | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Return CPU video + unchanged audio after 1--3 deterministic Euler steps.

    predict_tile takes an independent CPU float32 [B,C,T,h,w] tile, original
    audio, sigma and canvas coordinates. It must return *denoised video*, not
    velocity/noise or a next-sigma state. The adapter owns model-space conversion,
    noise scaling (once), frozen-audio conditioning and GPU transfers. The full
    temporal extent stays in each tile. No temporal splitting or model I/O occurs.
    """
    if initial_video.ndim != 5 or not initial_video.is_floating_point():
        raise ValueError("Video must be floating point [B,C,T,H,W]")
    if min(initial_video.shape) < 1 or not torch.isfinite(initial_video).all():
        raise ValueError("Video must be nonempty and finite")
    if not fixed_audio.is_floating_point() or not torch.isfinite(fixed_audio).all():
        raise ValueError("Audio must be floating point and finite")
    schedule = tuple(float(s) for s in sigmas)
    if not 2 <= len(schedule) <= 4 or not all(math.isfinite(s) for s in schedule):
        raise ValueError("Supply 1--3 steps as 2--4 finite sigmas")
    if schedule[-1] != 0 or any(a <= b for a, b in zip(schedule, schedule[1:])):
        raise ValueError("Sigmas must strictly decrease from positive values to zero")
    tiles = make_tiles(*initial_video.shape[-2:], tile_h, tile_w, overlap_h, overlap_w)
    if reverse_tiles:
        tiles = tuple(reversed(tiles))
    x = initial_video.detach().to(device="cpu", dtype=torch.float32).clone()
    audio = fixed_audio.detach().cpu().clone()
    weights = torch.zeros((1, 1, 1, *x.shape[-2:]), dtype=torch.float32)
    for tile in tiles:
        weights[..., tile.y0:tile.y1, tile.x0:tile.x1] += feather(tile)
    if not torch.all(weights > 0):
        raise RuntimeError("Tile plan does not cover the whole canvas")

    with torch.no_grad():
        for step, (sigma, next_sigma) in enumerate(zip(schedule, schedule[1:])):
            prediction = torch.zeros_like(x)
            for tile in tiles:
                if check_interrupt is not None:
                    check_interrupt()
                region = (..., slice(tile.y0, tile.y1), slice(tile.x0, tile.x1))
                # Defensive copies prevent a predictor from changing the shared
                # step state, another tile's input, or the caller's audio.
                tile_input = x[region].clone()
                out = predict_tile(tile_input, audio.clone(), sigma, tile)
                if not isinstance(out, torch.Tensor) or out.shape != tile_input.shape:
                    raise ValueError("Predictor must return a denoised video tile of the same shape")
                out = out.detach().to(device="cpu", dtype=torch.float32)
                if not torch.isfinite(out).all():
                    raise ValueError("Predictor returned a non-finite tile")
                prediction[region] += out * feather(tile)
                del out, tile_input
            prediction.div_(weights)
            # One global update, after *all* tiles have predicted this sigma.
            x = x + ((x - prediction) / sigma) * (next_sigma - sigma)
            if on_step is not None:
                on_step(step, x.clone())
    return x.to(dtype=initial_video.dtype), audio
