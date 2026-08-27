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
    build_curve_adaln_patch_specs,
    build_patch_specs,
    fit_adaln_curve_basis,
    fuse_heads,
    fuse_heads_for_sigmas,
    load_head_bank,
    make_pdd_projection_forward,
    minimax_h3_time_embedding_curve,
    parse_config,
    select_model_compatible_pairs,
    shifted_sigmas,
    validate_model_adaln_layout,
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


def _simple_schedule(steps):
    return tuple(
        VIDEO_SHIFT * base / (1.0 + (VIDEO_SHIFT - 1.0) * base)
        for base in ((steps - index) / steps for index in range(steps + 1))
    )


SIMPLE_SCHEDULES = {steps: _simple_schedule(steps) for steps in range(4, 13)}


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
@pytest.mark.parametrize("steps", range(4, 13))
def test_dynamic_fusion_accepts_simple_4_through_12_step_schedules(steps):
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
@pytest.mark.parametrize(
    ("steps", "split_index"),
    [
        (steps, split_index)
        for steps in range(4, 13)
        for split_index in range(1, steps)
    ],
)
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
@pytest.mark.parametrize(
    "schedule",
    [
        _simple_schedule(3),
        _simple_schedule(16),
        (1.0, 0.97, 0.83, 0.41, 0.0),
        (0.8, 0.63, 0.31, 0.1),
    ],
)
def test_dynamic_fusion_has_no_artificial_step_or_endpoint_gate(schedule):
    config = PDDConfig(32, 4, 1, 1.0, ())
    bank = load_head_bank(_small_head_state(fill="range"), config)
    fused = fuse_heads_for_sigmas(bank, schedule)
    assert tuple(fused.video_weight.shape) == (len(schedule) - 1, 1, 1)
    assert tuple(fused.audio_weight.shape) == (len(schedule) - 1, 1, 1)
    assert torch.isfinite(fused.video_weight).all()
    assert torch.isfinite(fused.audio_weight).all()


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


@requires_real_torch
def test_non_pruned_int8_uses_full_width_adaln_path():
    base = "transformer_blocks.0.adaln_proj.linear"
    pairs = {base: (torch.zeros(2, 5), torch.zeros(7, 2))}
    model_state = {
        "diffusion_model.blocks.0.adaln_proj.linear.weight": torch.zeros(
            7,
            5,
            dtype=torch.int8,
        )
    }
    assert validate_model_adaln_layout(pairs, model_state, False) == "full"
    compatible, skipped = select_model_compatible_pairs(pairs, False)
    assert compatible == pairs
    assert skipped == ()


@requires_real_torch
def test_pruned_branch_is_selected_by_structure_not_weight_dtype():
    base = "transformer_blocks.0.adaln_proj.linear"
    pairs = {base: (torch.zeros(2, 5), torch.zeros(7, 2))}
    model_state = {
        "diffusion_model.blocks.0.adaln_proj.linear.weight": torch.zeros(
            7,
            2,
            dtype=torch.float16,
        )
    }
    table = torch.zeros(9, 2, dtype=torch.float32)
    assert validate_model_adaln_layout(pairs, model_state, True, table) == "curve"
    compatible, skipped = select_model_compatible_pairs(pairs, True)
    assert compatible == {}
    assert skipped == (base,)


@requires_real_torch
def test_curve_adaln_rebase_matches_dense_lora_including_dc_bias():
    torch.manual_seed(123)
    dense_width = 5
    curve_width = 2
    rank = 3
    output_width = 7
    alpha = 1.5
    base = "transformer_blocks.0.adaln_proj.linear"
    down = torch.randn(rank, dense_width, dtype=torch.float16)
    up = torch.randn(output_width, rank, dtype=torch.bfloat16)
    c = torch.randn(dense_width)
    basis = torch.randn(dense_width, curve_width)
    model_state = {
        "diffusion_model.blocks.0.adaln_proj.linear.weight": torch.zeros(
            output_width,
            curve_width,
        ),
        "diffusion_model.blocks.0.adaln_proj.linear.bias": torch.zeros(output_width),
    }
    specs = build_curve_adaln_patch_specs(
        {base: (down, up)},
        model_state,
        c,
        basis,
        alpha,
    )
    assert len(specs) == 1
    spec = specs[0]
    coordinates = torch.randn(11, curve_width)
    dense_inputs = c[None] + coordinates @ basis.T
    scale = alpha / rank
    dense_effect = scale * ((dense_inputs @ down.float().T) @ up.float().T)
    curve_effect = coordinates @ spec.weight_delta.T + spec.bias_delta
    assert torch.allclose(curve_effect, dense_effect, atol=2.0e-5, rtol=2.0e-5)
    assert not torch.allclose(spec.bias_delta, torch.zeros_like(spec.bias_delta))


@requires_real_torch
def test_curve_basis_fit_reconstructs_native_time_embedding_curve():
    torch.manual_seed(456)
    time_embedder = {
        "time_embedder.proj_in.weight": torch.randn(6, 4),
        "time_embedder.proj_in.bias": torch.randn(6),
        "time_embedder.proj_out.weight": torch.randn(2, 6),
        "time_embedder.proj_out.bias": torch.randn(2),
    }
    dense_curve = minimax_h3_time_embedding_curve(time_embedder, 33)
    table = dense_curve.to(torch.float32)
    c, basis, residual = fit_adaln_curve_basis(table, time_embedder)
    reconstructed = c[None] + table @ basis.T
    assert residual < 1.0e-6
    assert torch.allclose(reconstructed, dense_curve.float(), atol=2.0e-5, rtol=2.0e-5)


@requires_real_torch
def test_native_final_layer_stays_in_control_with_projection_only_patch():
    class QuantLikeProjection(torch.nn.Module):
        def forward(self, hidden):
            raise AssertionError("native projection must be replaced by the PDD head")

    class NativeFinalLayer(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.video_out = QuantLikeProjection()
            self.audio_out = QuantLikeProjection()
            self.calls = []

        def forward(self, x, t_emb, *, marker):
            self.calls.append(marker)
            modulated = x + t_emb + 3.0
            return self.video_out(modulated), self.audio_out(modulated * 2.0)

    class Plan:
        def for_device(self, _device):
            return (
                torch.tensor([[[2.0, -1.0]]]),
                torch.tensor([[0.5]]),
                torch.tensor([[[1.5, 0.25]]]),
                torch.tensor([[-0.75]]),
            )

    class Runtime:
        shift_video = VIDEO_SHIFT
        shift_audio = AUDIO_SHIFT

        def current_step(self):
            return Plan(), 0, 1.0, 0.5

    final_layer = NativeFinalLayer()
    video_module = final_layer.video_out
    audio_module = final_layer.audio_out
    final_forward = final_layer.forward
    runtime = Runtime()
    final_layer.video_out.forward = make_pdd_projection_forward(video_module, runtime, True)
    final_layer.audio_out.forward = make_pdd_projection_forward(audio_module, runtime, False)

    x = torch.tensor([[1.0, 2.0]])
    t_emb = torch.tensor([[0.25, -0.5]])
    video, audio = final_layer(x, t_emb, marker="native-sentinel")
    modulated = x + t_emb + 3.0
    expected_video = torch.nn.functional.linear(
        modulated,
        torch.tensor([[2.0, -1.0]]),
        torch.tensor([0.5]),
    ) / 0.5
    factor = audio_inner_velocity_factor(1.0, 0.5, VIDEO_SHIFT, AUDIO_SHIFT)
    expected_audio = torch.nn.functional.linear(
        modulated * 2.0,
        torch.tensor([[1.5, 0.25]]),
        torch.tensor([-0.75]),
    ) * factor
    assert final_layer.calls == ["native-sentinel"]
    assert final_layer.forward == final_forward
    assert final_layer.video_out is video_module
    assert final_layer.audio_out is audio_module
    assert torch.allclose(video, expected_video)
    assert torch.allclose(audio, expected_audio)


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


def test_full_model_candidates_never_cross_ref2va_and_fl2va_families(tmp_path):
    source_path = REPO_ROOT / "deno_minimax_h3_acc_loader.py"
    module = ast.parse(source_path.read_text(encoding="utf-8"))
    function = next(
        item
        for item in module.body
        if isinstance(item, ast.FunctionDef) and item.name == "_full_h3_model_candidates"
    )

    filenames = [
        "minimax_h3_fl2va_int8_convrot.safetensors",
        "minimax_h3_ref2va_int8_convrot.safetensors",
        "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
        "another_model.safetensors",
    ]

    class FolderPathsStub:
        @staticmethod
        def get_filename_list(folder_name):
            assert folder_name == "diffusion_models"
            return list(filenames)

        @staticmethod
        def get_full_path(folder_name, filename):
            assert folder_name == "diffusion_models"
            return str(tmp_path / filename)

    namespace = {"os": os, "folder_paths": FolderPathsStub()}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source_path), "exec"), namespace)
    candidates = namespace["_full_h3_model_candidates"]

    assert candidates("MiniMax-H3-Ref2VA-Acc-8Step.safetensors") == [
        str(tmp_path / "minimax_h3_ref2va_int8_convrot.safetensors")
    ]
    assert candidates("MiniMax-H3-FL2VA-Acc-8Step.safetensors") == [
        str(tmp_path / "minimax_h3_fl2va_int8_convrot.safetensors")
    ]

    filenames[:] = ["minimax_h3_fl2va_int8_convrot.safetensors"]
    assert candidates("MiniMax-H3-Ref2VA-Acc-8Step.safetensors") == []


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
    class_namespace = {
        "folder_paths": type(
            "FolderPathsStub",
            (),
            {"get_filename_list": staticmethod(lambda _name: ["example.safetensors"])},
        ),
        "MODEL_FOLDER": "minimax_h3_acc_loras",
    }
    exec(
        compile(ast.Module(body=[loader], type_ignores=[]), str(source_path), "exec"),
        class_namespace,
    )
    required = class_namespace["DenoMiniMaxH3AccLoader"].INPUT_TYPES()["required"]
    assert list(required) == ["model", "acc_lora"]
    assert '"DenoMiniMaxH3AccLoader": "(Deno) MiniMax H3 Acc LoRA Loader"' in source
    assert "select_model_compatible_pairs" in source
    assert "folder_paths.add_model_folder_path(MODEL_FOLDER, lora_path)" in source
    patch_paths = [
        call.args[0].value
        for call in ast.walk(loader)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "add_object_patch"
        and call.args
        and isinstance(call.args[0], ast.Constant)
    ]
    assert patch_paths == [
        "diffusion_model.final_layer.video_out.forward",
        "diffusion_model.final_layer.audio_out.forward",
    ]
    assert "add_callback_with_key" in source
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader.md").is_file()
    assert (REPO_ROOT / "web/js/docs/DenoMiniMaxH3AccLoader/ko.md").is_file()
