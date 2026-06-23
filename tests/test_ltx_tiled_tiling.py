from pathlib import Path
import sys

import pytest
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from deno_ltx_tiling import build_tile_plan, make_spec_window


pytestmark = pytest.mark.skipif(
    not hasattr(torch, "zeros"),
    reason="LTX tiled tensor tests require real torch tensor ops.",
)


def _weight_map(height, width, vt, ht, overlap):
    specs = build_tile_plan(height, width, vt, ht, overlap)
    weights = torch.zeros((1, 1, 1, height, width), dtype=torch.float32)
    for spec in specs:
        window = make_spec_window(
            spec,
            dtype=torch.float32,
            device=torch.device("cpu"),
            mode="hann",
        )
        weights[:, :, :, spec.y0:spec.y1, spec.x0:spec.x1] += window
    return specs, weights


def test_portrait_two_vertical_tiles_cover_everything():
    specs, weights = _weight_map(40, 24, 2, 1, 8)
    assert len(specs) == 2
    assert torch.all(weights > 0)
    assert torch.allclose(weights, torch.ones_like(weights), atol=1e-6)


def test_two_by_two_grid_partition_of_unity():
    specs, weights = _weight_map(41, 25, 2, 2, 6)
    assert len(specs) == 4
    assert torch.all(weights > 0)
    assert torch.allclose(weights, torch.ones_like(weights), atol=1e-6)


def test_edge_aligned_plan_handles_rounding():
    specs, weights = _weight_map(47, 29, 3, 2, 7)
    assert len(specs) == 6
    assert specs[0].y0 == 0
    assert max(spec.y1 for spec in specs) == 47
    assert max(spec.x1 for spec in specs) == 29
    assert torch.all(weights > 0)
    assert torch.allclose(weights, torch.ones_like(weights), atol=1e-6)


def test_many_tile_plans_keep_weight_normalization_safe():
    for height in (12, 19, 40, 63):
        for width in (11, 26, 41):
            for vertical_tiles in (1, 2, 3, 4):
                for horizontal_tiles in (1, 2, 3, 4):
                    for overlap in (1, 3, 5, 8):
                        try:
                            _specs, weights = _weight_map(
                                height,
                                width,
                                vertical_tiles,
                                horizontal_tiles,
                                overlap,
                            )
                        except ValueError:
                            continue
                        assert torch.all(weights > 0)
                        assert torch.isfinite(weights).all()


def test_invalid_overlap_fails_loudly():
    try:
        build_tile_plan(10, 10, 2, 1, 9)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected invalid overlap to raise ValueError")
