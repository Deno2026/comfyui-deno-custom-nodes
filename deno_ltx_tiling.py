from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable, Literal, Sequence

import torch


BlendMode = Literal["hann", "cosine"]


@dataclass(frozen=True)
class TileSpec:
    """One spatial tile in latent coordinates."""

    row: int
    col: int
    y0: int
    y1: int
    x0: int
    x1: int
    fade_top: int
    fade_bottom: int
    fade_left: int
    fade_right: int

    @property
    def height(self) -> int:
        return self.y1 - self.y0

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def shape(self) -> tuple[int, int]:
        return self.height, self.width


def _axis_plan(total: int, count: int, overlap: int) -> tuple[list[int], int]:
    if total < 1:
        raise ValueError(f"Axis size must be positive, got {total}.")
    if count < 1:
        raise ValueError(f"Tile count must be at least 1, got {count}.")
    if overlap < 0:
        raise ValueError(f"Overlap cannot be negative, got {overlap}.")

    if count == 1 or total == 1:
        return [0], total

    tile_size = math.ceil((total + (count - 1) * overlap) / count)
    tile_size = min(tile_size, total)

    if overlap >= tile_size:
        raise ValueError(
            f"Overlap ({overlap}) must be smaller than the derived tile size "
            f"({tile_size}) for axis size {total} and count {count}."
        )

    travel = total - tile_size
    starts = [int(round(i * travel / (count - 1))) for i in range(count)]
    starts[0] = 0
    starts[-1] = travel

    if len(set(starts)) != len(starts):
        raise ValueError(
            f"Requested {count} tiles on an axis of size {total}, but integer "
            f"rounding produced duplicate starts {starts}. Reduce tile count."
        )

    return starts, tile_size


def build_tile_plan(
    height: int,
    width: int,
    vertical_tiles: int,
    horizontal_tiles: int,
    overlap: int,
) -> list[TileSpec]:
    """Create a deterministic 2D tile plan in latent coordinates."""

    y_starts, tile_h = _axis_plan(height, vertical_tiles, overlap)
    x_starts, tile_w = _axis_plan(width, horizontal_tiles, overlap)

    y_ends = [min(start + tile_h, height) for start in y_starts]
    x_ends = [min(start + tile_w, width) for start in x_starts]

    specs: list[TileSpec] = []
    for row, (y0, y1) in enumerate(zip(y_starts, y_ends)):
        fade_top = max(0, y_ends[row - 1] - y0) if row > 0 else 0
        fade_bottom = max(0, y1 - y_starts[row + 1]) if row < len(y_starts) - 1 else 0

        for col, (x0, x1) in enumerate(zip(x_starts, x_ends)):
            fade_left = max(0, x_ends[col - 1] - x0) if col > 0 else 0
            fade_right = max(0, x1 - x_starts[col + 1]) if col < len(x_starts) - 1 else 0

            specs.append(
                TileSpec(
                    row=row,
                    col=col,
                    y0=y0,
                    y1=y1,
                    x0=x0,
                    x1=x1,
                    fade_top=fade_top,
                    fade_bottom=fade_bottom,
                    fade_left=fade_left,
                    fade_right=fade_right,
                )
            )

    validate_tile_plan(specs, height, width)
    return specs


def validate_tile_plan(specs: Sequence[TileSpec], height: int, width: int) -> None:
    if not specs:
        raise ValueError("Tile plan is empty.")

    coverage = torch.zeros((height, width), dtype=torch.int16)
    for spec in specs:
        if not (0 <= spec.y0 < spec.y1 <= height):
            raise ValueError(f"Invalid vertical tile bounds: {spec}")
        if not (0 <= spec.x0 < spec.x1 <= width):
            raise ValueError(f"Invalid horizontal tile bounds: {spec}")
        coverage[spec.y0:spec.y1, spec.x0:spec.x1] += 1

    if int(coverage.min()) < 1:
        missing = int((coverage == 0).sum())
        raise ValueError(f"Tile plan leaves {missing} spatial positions uncovered.")


def _complementary_cosine_rise(
    length: int, *, dtype: torch.dtype, device: torch.device
) -> torch.Tensor:
    if length <= 0:
        return torch.empty((0,), dtype=dtype, device=device)
    index = torch.arange(length, dtype=dtype, device=device)
    return 0.5 * (1.0 - torch.cos(torch.pi * index / length))


def _complementary_cosine_fall(
    length: int, *, dtype: torch.dtype, device: torch.device
) -> torch.Tensor:
    if length <= 0:
        return torch.empty((0,), dtype=dtype, device=device)
    index = torch.arange(length, dtype=dtype, device=device)
    return 0.5 * (1.0 + torch.cos(torch.pi * index / length))


def make_window_1d(
    size: int,
    fade_before: int,
    fade_after: int,
    *,
    dtype: torch.dtype,
    device: torch.device,
    mode: BlendMode = "hann",
) -> torch.Tensor:
    """Create an edge-aware complementary overlap window."""

    if size < 1:
        raise ValueError(f"Window size must be positive, got {size}.")
    if mode not in ("hann", "cosine"):
        raise ValueError(f"Unsupported blend mode: {mode}")

    fade_before = min(max(int(fade_before), 0), size)
    fade_after = min(max(int(fade_after), 0), size)

    window = torch.ones((size,), dtype=dtype, device=device)
    if fade_before:
        window[:fade_before] = _complementary_cosine_rise(
            fade_before, dtype=dtype, device=device
        )
    if fade_after:
        window[-fade_after:] = _complementary_cosine_fall(
            fade_after, dtype=dtype, device=device
        )
    return window


def make_window_2d(
    height: int,
    width: int,
    *,
    fade_top: int,
    fade_bottom: int,
    fade_left: int,
    fade_right: int,
    dtype: torch.dtype,
    device: torch.device,
    mode: BlendMode = "hann",
) -> torch.Tensor:
    vertical = make_window_1d(
        height,
        fade_top,
        fade_bottom,
        dtype=dtype,
        device=device,
        mode=mode,
    )
    horizontal = make_window_1d(
        width,
        fade_left,
        fade_right,
        dtype=dtype,
        device=device,
        mode=mode,
    )
    return vertical[:, None] * horizontal[None, :]


def make_spec_window(
    spec: TileSpec,
    *,
    dtype: torch.dtype,
    device: torch.device,
    mode: BlendMode = "hann",
) -> torch.Tensor:
    """Return a broadcastable [1,1,1,H,W] window for a tile."""

    window = make_window_2d(
        spec.height,
        spec.width,
        fade_top=spec.fade_top,
        fade_bottom=spec.fade_bottom,
        fade_left=spec.fade_left,
        fade_right=spec.fade_right,
        dtype=dtype,
        device=device,
        mode=mode,
    )
    return window.view(1, 1, 1, spec.height, spec.width)


def scaled_fades(spec: TileSpec, scale_h: float, scale_w: float) -> tuple[int, int, int, int]:
    return (
        int(round(spec.fade_top * scale_h)),
        int(round(spec.fade_bottom * scale_h)),
        int(round(spec.fade_left * scale_w)),
        int(round(spec.fade_right * scale_w)),
    )


def describe_plan(specs: Iterable[TileSpec]) -> str:
    return ", ".join(
        f"r{tile.row}c{tile.col}[y={tile.y0}:{tile.y1},x={tile.x0}:{tile.x1},"
        f"fade={tile.fade_top}/{tile.fade_bottom}/{tile.fade_left}/{tile.fade_right}]"
        for tile in specs
    )
