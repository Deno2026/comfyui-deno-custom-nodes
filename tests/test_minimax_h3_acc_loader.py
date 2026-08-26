from __future__ import annotations

import ast
import math
from pathlib import Path

import pytest
import torch

from deno_minimax_h3_pdd_core import (
    AUDIO_SHIFT,
    VIDEO_SHIFT,
    PDDConfig,
    audio_inner_velocity_factor,
    build_patch_specs,
    fuse_heads,
    parse_config,
    select_exact_step,
    shifted_sigmas,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
requires_real_torch = pytest.mark.skipif(
    not all(hasattr(torch, name) for name in ("arange", "linspace", "zeros")),
    reason="tensor math requires the real torch package rather than the lightweight CI stub",
)


def test_official_config_is_eight_model_evaluations():
    config = parse_config(
        {
            "pdd_num_steps": "32",
            "pdd_block_size": "4",
            "lora_rank": "64",
            "lora_alpha": "64.0",
            "lora_targets": "to_q,to_k,to_v,to_out.0,ff.net.0.proj,ff.net.2,adaln_proj.linear",
        }
    )
    assert config.nfe == 8
    assert config.rank == 64


@requires_real_torch
def test_video_schedule_matches_official_comfy_boundaries():
    actual = shifted_sigmas(VIDEO_SHIFT, 32)[::4]
    expected = torch.tensor(
        [
            1.0,
            0.9882352941,
            0.9729729730,
            0.9523809524,
            0.9230769231,
            0.8780487805,
            0.8,
            0.6315789474,
            0.0,
        ],
        dtype=torch.float64,
    )
    assert torch.allclose(actual, expected, atol=1.0e-10, rtol=0.0)


@requires_real_torch
def test_head_fusion_is_delta_weighted():
    config = PDDConfig(
        4,
        2,
        1,
        1.0,
        tuple(
            sorted(
                {
                    "to_q",
                    "to_k",
                    "to_v",
                    "to_out.0",
                    "ff.net.0.proj",
                    "ff.net.2",
                    "adaln_proj.linear",
                }
            )
        ),
    )
    state = {
        "proj_out.weight": torch.arange(4, dtype=torch.float32).view(4, 1, 1).expand(4, 96, 5376),
        "proj_out.bias": torch.arange(4, dtype=torch.float32).view(4, 1).expand(4, 96),
        "audio_proj_out.weight": torch.arange(4, dtype=torch.float32).view(4, 1, 1).expand(4, 32, 5376),
        "audio_proj_out.bias": torch.arange(4, dtype=torch.float32).view(4, 1).expand(4, 32),
    }
    fused = fuse_heads(state, config)
    deltas = shifted_sigmas(VIDEO_SHIFT, 4)
    deltas = deltas[:-1] - deltas[1:]
    assert float(fused.video_weight[0, 0, 0]) == pytest.approx(float(deltas[1]), abs=1.0e-6)
    assert tuple(fused.video_weight.shape) == (2, 96, 5376)


@requires_real_torch
def test_qkv_offsets_and_swiglu_half_swap():
    rank = 2
    down = torch.zeros(rank, 5)
    pairs = {
        "transformer_blocks.0.attn.to_q": (down, torch.zeros(7, rank)),
        "transformer_blocks.0.attn.to_k": (down, torch.zeros(7, rank)),
        "transformer_blocks.0.attn.to_v": (down, torch.zeros(7, rank)),
        "transformer_blocks.0.ff.net.0.proj": (
            down,
            torch.cat((torch.full((11, rank), 1.0), torch.full((11, rank), 2.0))),
        ),
    }
    model_state = {
        "diffusion_model.blocks.0.attn.qkv_proj.weight": torch.zeros(21, 5),
        "diffusion_model.blocks.0.mlp.fc1.weight": torch.zeros(22, 5),
    }
    specs = build_patch_specs(pairs, model_state)
    offsets = [spec.patch_key[1] for spec in specs if isinstance(spec.patch_key, tuple)]
    assert (0, 0, 7) in offsets
    assert (0, 7, 7) in offsets
    assert (0, 14, 7) in offsets
    ffn = [
        spec
        for spec in specs
        if isinstance(spec.patch_key, tuple) and "fc1" in spec.patch_key[0]
    ]
    assert float(ffn[0].up[0, 0]) == 2.0
    assert float(ffn[1].up[0, 0]) == 1.0


@requires_real_torch
def test_other_sigma_schedules_are_rejected():
    bounds = tuple(float(value) for value in shifted_sigmas(VIDEO_SHIFT, 32)[::4])
    assert select_exact_step(bounds[0], bounds[1], bounds) == 0
    with pytest.raises(ValueError, match="exact trained 8-step sigma boundaries"):
        select_exact_step(1.0, 0.9, bounds)


def test_audio_factor_is_finite_and_positive():
    value = audio_inner_velocity_factor(1.0, 0.9882352941, VIDEO_SHIFT, AUDIO_SHIFT)
    assert value > 0.0
    assert math.isfinite(value)


def test_public_node_surface_is_three_outputs_and_deno_named():
    source_path = REPO_ROOT / "deno_minimax_h3_acc_loader.py"
    source = source_path.read_text(encoding="utf-8")
    module = ast.parse(source)
    loader = next(
        item
        for item in module.body
        if isinstance(item, ast.ClassDef) and item.name == "DenoMiniMaxH3AccLoader"
    )
    assignments = {
        item.targets[0].id: ast.literal_eval(item.value)
        for item in loader.body
        if isinstance(item, ast.Assign)
        and len(item.targets) == 1
        and isinstance(item.targets[0], ast.Name)
        and item.targets[0].id in {"RETURN_TYPES", "RETURN_NAMES", "CATEGORY"}
    }
    assert assignments["RETURN_TYPES"] == ("MODEL", "SAMPLER", "SIGMAS")
    assert assignments["RETURN_NAMES"] == ("model", "sampler", "sigmas")
    assert assignments["CATEGORY"] == "Deno/MiniMax H3"
    assert '"DenoMiniMaxH3AccLoader": "(Deno) MiniMax H3 Acc LoRA Loader"' in source
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader.md").is_file()
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader/ko.md").is_file()
