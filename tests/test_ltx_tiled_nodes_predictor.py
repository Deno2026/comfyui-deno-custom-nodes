import types
from pathlib import Path
import sys

import pytest
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from deno_ltx_tiled_nodes import (
    DenoLTXStepFusedTiledSampler,
    StepFusedTilePredictor,
    UnsupportedTiledConditioning,
)
from deno_ltx_tiling import build_tile_plan


pytestmark = pytest.mark.skipif(
    not hasattr(torch, "zeros"),
    reason="LTX tiled predictor tests require real torch tensor ops.",
)


class _FakeCond:
    def __init__(self, cond):
        self.cond = cond

    def _copy_with(self, cond):
        return _FakeCond(cond)


class _FakeModel:
    diffusion_model = types.SimpleNamespace(vae_scale_factors=(8, 32, 32))


def test_step_fused_predictor_calls_calc_once_per_tile_and_fuses_shape(monkeypatch):
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)
    calls = []

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        calls.append((tuple(x_in.shape), conds))
        return [torch.ones_like(x_in) * 3.0, torch.ones_like(x_in) * -2.0]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        blend_mode="hann",
    )
    result = predictor(
        {
            "input": torch.zeros((1, 2, 3, 6, 4)),
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[], []],
            "model_options": {},
        }
    )

    assert predictor.call_count == 1
    assert len(calls) == len(plan)
    assert [shape[-2:] for shape, _conds in calls] == [(4, 4), (4, 4)]
    assert len(result) == 2
    assert result[0].shape == (1, 2, 3, 6, 4)
    assert result[1].shape == (1, 2, 3, 6, 4)
    assert torch.allclose(result[0], torch.full_like(result[0], 3.0))
    assert torch.allclose(result[1], torch.full_like(result[1], -2.0))


def test_step_fused_predictor_crops_full_spatial_model_cond(monkeypatch):
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)
    cropped_shapes = []

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        wrapped = conds[0][0]["model_conds"]["denoise_mask"]
        cropped_shapes.append(tuple(wrapped.cond.shape))
        return [torch.zeros_like(x_in), torch.zeros_like(x_in)]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        blend_mode="hann",
    )
    predictor(
        {
            "input": torch.zeros((1, 2, 3, 6, 4)),
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[{"model_conds": {"denoise_mask": _FakeCond(torch.ones((1, 1, 3, 6, 4)))}}], []],
            "model_options": {},
        }
    )

    assert cropped_shapes == [(1, 1, 3, 4, 4), (1, 1, 3, 4, 4)]


def test_step_fused_predictor_crops_ltx_guide_metadata(monkeypatch):
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)
    keyframe_shapes = []
    guide_entries = []

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        model_conds = conds[0][0]["model_conds"]
        keyframe_shapes.append(tuple(model_conds["keyframe_idxs"].cond.shape))
        guide_entries.append(model_conds["guide_attention_entries"].cond[0])
        return [torch.zeros_like(x_in), torch.zeros_like(x_in)]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    keyframe_idxs = torch.zeros((1, 3, 24, 2), dtype=torch.float32)
    guide_entry = {
        "pre_filter_count": 24,
        "latent_shape": [1, 6, 4],
        "pixel_mask": torch.ones((1, 1, 1, 192, 128), dtype=torch.float32),
    }
    predictor = StepFusedTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        blend_mode="hann",
    )
    predictor(
        {
            "input": torch.zeros((1, 2, 3, 6, 4)),
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[{"model_conds": {
                "keyframe_idxs": _FakeCond(keyframe_idxs),
                "guide_attention_entries": _FakeCond([guide_entry]),
            }}], []],
            "model_options": {},
        }
    )

    assert keyframe_shapes == [(1, 3, 16, 2), (1, 3, 16, 2)]
    assert [entry["pre_filter_count"] for entry in guide_entries] == [16, 16]
    assert [entry["latent_shape"] for entry in guide_entries] == [[1, 4, 4], [1, 4, 4]]
    assert [tuple(entry["pixel_mask"].shape) for entry in guide_entries] == [
        (1, 1, 1, 128, 128),
        (1, 1, 1, 128, 128),
    ]


@pytest.mark.parametrize("unsupported_key", ["area", "control", "gligen"])
def test_step_fused_predictor_rejects_unsupported_conditioning(monkeypatch, unsupported_key):
    def fake_calc_cond_batch(*_args, **_kwargs):
        raise AssertionError("unsupported conditioning should fail before model calls")

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)
    predictor = StepFusedTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        blend_mode="hann",
    )

    with pytest.raises(UnsupportedTiledConditioning):
        predictor(
            {
                "input": torch.zeros((1, 2, 3, 6, 4)),
                "sigma": torch.tensor([0.5]),
                "model": _FakeModel(),
                "conds": [[{unsupported_key: object(), "model_conds": {}}], []],
                "model_options": {},
            }
        )


def test_step_fused_sampler_rejects_nested_latents_before_sampling():
    nested = types.SimpleNamespace(is_nested=True)

    with pytest.raises(TypeError, match="video-only"):
        DenoLTXStepFusedTiledSampler._validate_samples(nested)
