from __future__ import annotations

import ast
import math
import os
from pathlib import Path

import pytest
import torch

from deno_minimax_h3_pdd_core import (
    AUDIO_SHIFT,
    VIDEO_SHIFT,
    PDDConfig,
    audio_sigmas_for_video,
    audio_inner_velocity_factor,
    build_patch_specs,
    fuse_heads,
    fuse_heads_for_sigmas,
    load_head_bank,
    parse_config,
    select_model_compatible_pairs,
    shifted_sigmas,
    validate_sigma_schedule,
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


SIMPLE_SCHEDULES = {
    8: (
        1.0,
        0.9882352941,
        0.9729729730,
        0.9523809524,
        0.9230769231,
        0.8780487805,
        0.8,
        0.6315789474,
        0.0,
    ),
    9: (
        1.0,
        0.989702165,
        0.976773441,
        0.960057557,
        0.937605381,
        0.905852437,
        0.857509673,
        0.774978280,
        0.602150619,
        0.0,
    ),
    10: (
        1.0,
        0.990825653,
        0.979591846,
        0.965517223,
        0.947368383,
        0.923076928,
        0.888888896,
        0.837209284,
        0.75,
        0.571428597,
        0.0,
    ),
}


def _small_head_state(num_steps=32, fill="ones"):
    values = (
        torch.ones(num_steps, dtype=torch.float32)
        if fill == "ones"
        else torch.arange(num_steps, dtype=torch.float32)
    )
    return {
        "proj_out.weight": values.view(num_steps, 1, 1),
        "proj_out.bias": values.view(num_steps, 1),
        "audio_proj_out.weight": values.view(num_steps, 1, 1),
        "audio_proj_out.bias": values.view(num_steps, 1),
    }


@requires_real_torch
@pytest.mark.parametrize("steps", [8, 9, 10])
def test_dynamic_fusion_accepts_simple_8_9_and_10_step_schedules(steps):
    config = PDDConfig(32, 4, 1, 1.0, ())
    bank = load_head_bank(_small_head_state(), config)
    schedule = SIMPLE_SCHEDULES[steps]
    fused = fuse_heads_for_sigmas(bank, schedule)
    expected_video = torch.tensor(schedule[:-1]) - torch.tensor(schedule[1:])
    audio = audio_sigmas_for_video(schedule)
    expected_audio = torch.tensor(audio[:-1]) - torch.tensor(audio[1:])
    assert tuple(fused.video_weight.shape) == (steps, 1, 1)
    assert torch.allclose(fused.video_weight[:, 0, 0], expected_video, atol=2.0e-6, rtol=0.0)
    assert torch.allclose(fused.audio_weight[:, 0, 0], expected_audio, atol=2.0e-6, rtol=0.0)


@requires_real_torch
@pytest.mark.parametrize(("steps", "split_index"), [(8, 6), (9, 6)])
def test_split_schedule_reuses_the_same_complete_interval_heads(steps, split_index):
    config = PDDConfig(32, 4, 1, 1.0, ())
    bank = load_head_bank(_small_head_state(fill="range"), config)
    schedule = SIMPLE_SCHEDULES[steps]
    complete = fuse_heads_for_sigmas(bank, schedule)
    high_noise = fuse_heads_for_sigmas(bank, schedule[: split_index + 1])
    low_noise = fuse_heads_for_sigmas(bank, schedule[split_index:])
    combined_video = torch.cat((high_noise.video_weight, low_noise.video_weight))
    combined_audio = torch.cat((high_noise.audio_weight, low_noise.audio_weight))
    assert torch.allclose(combined_video, complete.video_weight, atol=1.0e-6, rtol=0.0)
    assert torch.allclose(combined_audio, complete.audio_weight, atol=1.0e-6, rtol=0.0)


@requires_real_torch
def test_invalid_sigma_schedules_still_fail_clearly():
    with pytest.raises(ValueError, match="strictly descending"):
        validate_sigma_schedule((1.0, 0.8, 0.8, 0.0))
    with pytest.raises(ValueError, match=r"within \[0, 1\]"):
        validate_sigma_schedule((1.1, 0.0))


def test_audio_factor_is_finite_and_positive():
    value = audio_inner_velocity_factor(1.0, 0.9882352941, VIDEO_SHIFT, AUDIO_SHIFT)
    assert value > 0.0
    assert math.isfinite(value)


def test_pruned_compatibility_skips_only_full_width_adaln_pairs():
    pairs = {
        "transformer_blocks.0.adaln_proj.linear": (object(), object()),
        "transformer_blocks.0.attn.to_q": (object(), object()),
        "token_refiner.refiner_blocks.0.attn.to_q": (object(), object()),
    }
    compatible, skipped = select_model_compatible_pairs(pairs, use_adaln_curves=True)
    assert skipped == ("transformer_blocks.0.adaln_proj.linear",)
    assert set(compatible) == {
        "transformer_blocks.0.attn.to_q",
        "token_refiner.refiner_blocks.0.attn.to_q",
    }


def test_full_model_keeps_every_lora_pair():
    pairs = {"transformer_blocks.0.adaln_proj.linear": (object(), object())}
    compatible, skipped = select_model_compatible_pairs(pairs, use_adaln_curves=False)
    assert compatible == pairs
    assert skipped == ()


def test_model_path_registration_includes_normal_and_dedicated_lora_roots(tmp_path):
    source_path = REPO_ROOT / "deno_minimax_h3_acc_loader.py"
    module = ast.parse(source_path.read_text(encoding="utf-8"))
    function = next(
        item
        for item in module.body
        if isinstance(item, ast.FunctionDef) and item.name == "_register_model_paths"
    )

    class FolderPathsStub:
        def __init__(self):
            self.models_dir = str(tmp_path / "models")
            self.lora_paths = [
                str(tmp_path / "models" / "loras"),
                str(tmp_path / "shared" / "loras"),
            ]
            self.registered = []
            self.folder_names_and_paths = {"minimax_h3_acc_loras": ([], set())}

        def get_folder_paths(self, folder_name):
            assert folder_name == "loras"
            return list(self.lora_paths)

        def add_model_folder_path(self, folder_name, path, is_default=False):
            self.registered.append((folder_name, path, is_default))

    stub = FolderPathsStub()
    namespace = {
        "os": os,
        "folder_paths": stub,
        "MODEL_FOLDER": "minimax_h3_acc_loras",
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source_path), "exec"), namespace)
    namespace["_register_model_paths"]()

    registered_paths = [path for _, path, _ in stub.registered]
    assert str(tmp_path / "models" / "loras") in registered_paths
    assert str(tmp_path / "shared" / "loras") in registered_paths
    assert str(tmp_path / "models" / "minimax_h3_acc_loras") in registered_paths
    assert str(tmp_path / "shared" / "minimax_h3_acc_loras") in registered_paths
    assert ".safetensors" in stub.folder_names_and_paths["minimax_h3_acc_loras"][1]


def test_public_node_surface_is_model_only_and_deno_named():
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
    assert assignments["RETURN_TYPES"] == ("MODEL",)
    assert assignments["RETURN_NAMES"] == ("model",)
    assert assignments["CATEGORY"] == "Deno/MiniMax H3"
    assert '"DenoMiniMaxH3AccLoader": "(Deno) MiniMax H3 Acc LoRA Loader"' in source
    assert "select_model_compatible_pairs" in source
    assert "folder_paths.add_model_folder_path(MODEL_FOLDER, lora_path)" in source
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader.md").is_file()
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader/ko.md").is_file()
