import math
import copy
import types
from pathlib import Path
import sys

import pytest
import torch

pytestmark = pytest.mark.skipif(
    not hasattr(torch, "zeros"),
    reason="LTX tiled tensor tests require real torch tensor ops.",
)

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from deno_ltx_tiled_nodes import (
    DenoLTXAVStepFusedTiledSampler,
    StepFusedAVTilePredictor,
    UnsupportedTiledConditioning,
    _make_av_freeze_noise_mask,
)
from deno_ltx_tiling import build_tile_plan


class _FakeCond:
    def __init__(self, cond):
        self.cond = cond

    def _copy_with(self, cond):
        return _FakeCond(cond)


class _FakeModel:
    diffusion_model = types.SimpleNamespace(vae_scale_factors=(8, 32, 32))


class _FakeCFGGuider:
    def predict_noise(self, *_args, **_kwargs):
        raise AssertionError("predict_noise should not be called by these unit tests")


class _FakeNestedTensor:
    is_nested = True

    def __init__(self, tensors):
        self.tensors = list(tensors)

    def unbind(self):
        return self.tensors


def _fake_pack_latents(latents):
    shapes = []
    tensors = []
    for tensor in latents:
        shapes.append(tensor.shape)
        tensors.append(tensor.reshape(tensor.shape[0], 1, -1))
    return torch.cat(tensors, dim=-1), shapes


def _fake_unpack_latents(combined_latent, latent_shapes):
    output_tensors = []
    for shape in latent_shapes:
        cut = math.prod(shape[1:])
        tens = combined_latent[:, :, :cut]
        combined_latent = combined_latent[:, :, cut:]
        output_tensors.append(tens.reshape([tens.shape[0]] + list(shape)[1:]))
    return output_tensors


def _make_guide_keyframes(guide_frames, height, width, *, scale=32):
    coords = torch.zeros((1, 3, guide_frames, height, width, 2), dtype=torch.long)
    for frame in range(guide_frames):
        coords[:, 0, frame, :, :, 0] = frame
        coords[:, 0, frame, :, :, 1] = frame + 1
    for y in range(height):
        coords[:, 1, :, y, :, 0] = y * scale
        coords[:, 1, :, y, :, 1] = (y + 1) * scale
    for x in range(width):
        coords[:, 2, :, :, x, 0] = x * scale
        coords[:, 2, :, :, x, 1] = (x + 1) * scale
    return coords.reshape(1, 3, guide_frames * height * width, 2)


def _make_guide_entries(guide_frames, height, width, *, scale=32):
    entries = []
    for index in range(guide_frames):
        pixel_mask = torch.ones((1, 1, 1, height * scale, width * scale)) * (index + 1)
        entries.append({
            "pre_filter_count": height * width,
            "latent_shape": [1, height, width],
            "strength": 0.9 + index * 0.05,
            "pixel_mask": pixel_mask,
        })
    return entries


@pytest.fixture
def fake_comfy_latent_utils(monkeypatch):
    def fake_calc_cond_batch(_model, _conds, x_in, _sigma, _model_options):
        return [x_in, x_in]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_utils",
        lambda: types.SimpleNamespace(
            pack_latents=_fake_pack_latents,
            unpack_latents=_fake_unpack_latents,
            PROGRESS_BAR_ENABLED=False,
        ),
    )
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_nested_tensor",
        lambda: types.SimpleNamespace(NestedTensor=_FakeNestedTensor),
    )
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(
            CFGGuider=_FakeCFGGuider,
            calc_cond_batch=fake_calc_cond_batch,
        ),
    )


def _patch_av_sampler_runtime(monkeypatch):
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_sample",
        lambda: types.SimpleNamespace(
            fix_empty_latent_channels=lambda _patcher, samples, *_args: samples
        ),
    )
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_model_management",
        lambda: types.SimpleNamespace(intermediate_device=lambda: torch.device("cpu")),
    )

    def fake_prepare_callback(_model_patcher, _steps, x0_output):
        def callback(*_args, **_kwargs):
            return None

        callback.x0_output = x0_output
        return callback

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._latent_preview",
        lambda: types.SimpleNamespace(prepare_callback=fake_prepare_callback),
    )


class _FakeNoise:
    seed = 123

    def generate_noise(self, latent):
        samples = latent["samples"]
        return _FakeNestedTensor([torch.zeros_like(part) for part in samples.unbind()])


class _FakeSamplerGuider(_FakeCFGGuider):
    def __init__(
        self,
        *,
        x0_video=None,
        x0_audio=None,
        raw_x0=None,
        set_x0=True,
        output_video=None,
        output_audio=None,
        model_options=None,
        original_conds=None,
        patcher_wrappers=None,
        hook_input_extra=False,
        hook_conds=None,
    ):
        self.model_options = model_options or {}
        self.original_conds = original_conds or {}
        self.x0_video = x0_video
        self.x0_audio = x0_audio
        self.raw_x0 = raw_x0
        self.set_x0 = set_x0
        self.output_video = output_video
        self.output_audio = output_audio
        self.hook_input_extra = hook_input_extra
        self.hook_conds = hook_conds
        self.model_patcher = types.SimpleNamespace(
            model=types.SimpleNamespace(process_latent_out=lambda value: value),
            wrappers=patcher_wrappers or {},
        )

    def sample(
        self,
        _noise,
        source,
        _sampler,
        sigmas,
        denoise_mask=None,
        callback=None,
        disable_pbar=True,
        seed=None,
    ):
        hook = self.model_options["sampler_calc_cond_batch_function"]
        packed, shapes = _fake_pack_latents(source.unbind())
        hook_input = packed
        if self.hook_input_extra:
            hook_input = torch.cat([packed, torch.zeros((packed.shape[0], packed.shape[1], 1))], dim=-1)
        if callable(self.hook_conds):
            hook_conds = self.hook_conds(shapes)
        elif self.hook_conds is not None:
            hook_conds = self.hook_conds
        else:
            hook_conds = [[{"model_conds": {"latent_shapes": _FakeCond(shapes)}}], []]
        hook(
            {
                "input": hook_input,
                "sigma": sigmas[:1],
                "model": _FakeModel(),
                "conds": hook_conds,
                "model_options": self.model_options,
            }
        )

        if self.set_x0:
            if self.raw_x0 is not None:
                callback.x0_output["x0"] = self.raw_x0
            else:
                callback.x0_output["x0"], _ = _fake_pack_latents([
                    self.x0_video,
                    self.x0_audio,
                ])

        sampled_video, sampled_audio = source.unbind()
        assert denoise_mask.unbind()[1].count_nonzero() == 0
        assert seed == 123
        assert disable_pbar is True
        return _FakeNestedTensor([
            self.output_video if self.output_video is not None else sampled_video + 1.0,
            self.output_audio if self.output_audio is not None else sampled_audio,
        ])


def test_av_predictor_tiles_video_with_full_audio_context(monkeypatch, fake_comfy_latent_utils):
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.arange(16, dtype=torch.float32).reshape(1, 1, 4, 4)
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)
    seen_shapes = []

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        tile_shapes = conds[0][0]["model_conds"]["latent_shapes"].cond
        seen_shapes.append(tile_shapes)
        tile_video, full_audio = _fake_unpack_latents(x_in, tile_shapes)
        assert tuple(full_audio.shape) == tuple(audio.shape)
        pred_audio = torch.full_like(full_audio, 123.0)
        cond_pred, _ = _fake_pack_latents([torch.ones_like(tile_video) * 4.0, pred_audio])
        uncond_pred, _ = _fake_pack_latents([torch.ones_like(tile_video) * -2.0, pred_audio])
        return [cond_pred, uncond_pred]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )
    result = predictor(
        {
            "input": packed,
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[{"model_conds": {"latent_shapes": _FakeCond(global_shapes)}}], []],
            "model_options": {},
        }
    )

    assert predictor.call_count == 1
    assert len(seen_shapes) == len(plan)
    assert [tuple(shape[0]) for shape in seen_shapes] == [
        (1, 2, 3, 4, 4),
        (1, 2, 3, 4, 4),
    ]
    assert [tuple(shape[1]) for shape in seen_shapes] == [tuple(audio.shape), tuple(audio.shape)]
    assert len(result) == 2
    cond_video, cond_audio = _fake_unpack_latents(result[0], global_shapes)
    uncond_video, uncond_audio = _fake_unpack_latents(result[1], global_shapes)
    assert torch.allclose(cond_video, torch.full_like(video, 4.0))
    assert torch.allclose(uncond_video, torch.full_like(video, -2.0))
    assert torch.allclose(cond_audio, audio)
    assert torch.allclose(uncond_audio, audio)


def test_av_predictor_one_by_one_matches_stock_video_predictions(
    monkeypatch,
    fake_comfy_latent_utils,
):
    video = torch.arange(120, dtype=torch.float32).reshape(1, 2, 3, 5, 4) / 100.0
    audio = torch.linspace(-0.25, 0.5, steps=16, dtype=torch.float32).reshape(1, 1, 4, 4)
    packed, global_shapes = _fake_pack_latents([video, audio])
    sigma = torch.tensor([0.375])
    cfg_scale = 3.25
    stock_model = _FakeModel()
    conds = [
        [{
            "model_conds": {
                "latent_shapes": _FakeCond(global_shapes),
                "branch_bias": _FakeCond(torch.tensor([0.75])),
                "frame_rate": _FakeCond(24.0),
                "ref_audio": _FakeCond({"sentinel": "preserve"}),
            }
        }],
        [{
            "model_conds": {
                "latent_shapes": _FakeCond(global_shapes),
                "branch_bias": _FakeCond(torch.tensor([-0.125])),
                "frame_rate": _FakeCond(24.0),
                "ref_audio": _FakeCond({"sentinel": "preserve"}),
            }
        }],
    ]
    call_records = []

    def branch_shapes(conds_in):
        return [
            [tuple(shape) for shape in cond_list[0]["model_conds"]["latent_shapes"].cond]
            for cond_list in conds_in
        ]

    def snapshot_metadata(value):
        if torch.is_tensor(value):
            return value.detach().cpu().clone()
        return copy.deepcopy(value)

    def branch_metadata(conds_in):
        return [
            {
                "frame_rate": snapshot_metadata(
                    cond_list[0]["model_conds"]["frame_rate"].cond
                ),
                "ref_audio": snapshot_metadata(
                    cond_list[0]["model_conds"]["ref_audio"].cond
                ),
            }
            for cond_list in conds_in
        ]

    def reference_calc_cond_batch(_model, conds_in, x_in, sigma_in, model_options):
        transformer_options = model_options.get("transformer_options", {})
        sample_sigmas = transformer_options.get("sample_sigmas")
        call_records.append({
            "model": _model,
            "input": x_in.clone(),
            "shapes": branch_shapes(conds_in),
            "branch_metadata": branch_metadata(conds_in),
            "top_level_keys": set(model_options),
            "custom_option": model_options.get("custom_option"),
            "transformer_keys": set(transformer_options),
            "existing_context": transformer_options.get("existing_context"),
            "sample_sigmas": sample_sigmas.clone() if sample_sigmas is not None else None,
            "has_tile_marker": "deno_ltx_av_tile" in transformer_options,
            "has_recursive_hook": "sampler_calc_cond_batch_function" in model_options,
        })

        predictions = []
        for cond_list in conds_in:
            model_conds = cond_list[0]["model_conds"]
            latent_shapes = model_conds["latent_shapes"].cond
            input_video, input_audio = _fake_unpack_latents(x_in, latent_shapes)
            branch_bias = model_conds["branch_bias"].cond.reshape(1, 1, 1, 1, 1)
            audio_context = input_audio.mean().reshape(1, 1, 1, 1, 1)
            sigma_context = sigma_in.reshape(1, 1, 1, 1, 1)

            pred_video = input_video * 0.25 + audio_context + sigma_context + branch_bias
            pred_audio = input_audio * 10.0 + branch_bias.flatten()[0]
            packed_prediction, _ = _fake_pack_latents([pred_video, pred_audio])
            predictions.append(packed_prediction)
        return predictions

    previous_call_count = 0
    fallback_call_count = 0

    def previous_calculator(args_in):
        nonlocal previous_call_count
        previous_call_count += 1
        return reference_calc_cond_batch(
            args_in["model"],
            args_in["conds"],
            args_in["input"],
            args_in["sigma"],
            args_in["model_options"],
        )

    def unexpected_fallback(*_args, **_kwargs):
        nonlocal fallback_call_count
        fallback_call_count += 1
        raise AssertionError(
            "Base calc_cond_batch must not be called when a previous calculator is installed."
        )

    base_model_options = {
        "sampler_calc_cond_batch_function": previous_calculator,
        "custom_option": "must-survive",
        "transformer_options": {
            "existing_context": {"enabled": True},
            "sample_sigmas": torch.tensor([0.375, 0.0]),
        },
    }
    stock_predictions = reference_calc_cond_batch(
        stock_model,
        conds,
        packed,
        sigma,
        base_model_options,
    )

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=unexpected_fallback),
    )

    predictor = StepFusedAVTilePredictor(
        plan=build_tile_plan(height=5, width=4, vertical_tiles=1, horizontal_tiles=1, overlap=1),
        full_height=5,
        full_width=4,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
        previous_calculator=previous_calculator,
    )
    tiled_predictions = predictor(
        {
            "input": packed,
            "sigma": sigma,
            "model": stock_model,
            "conds": conds,
            "model_options": base_model_options,
        }
    )

    stock_cond_video, stock_cond_audio = _fake_unpack_latents(stock_predictions[0], global_shapes)
    stock_uncond_video, stock_uncond_audio = _fake_unpack_latents(stock_predictions[1], global_shapes)
    tiled_cond_video, tiled_cond_audio = _fake_unpack_latents(tiled_predictions[0], global_shapes)
    tiled_uncond_video, tiled_uncond_audio = _fake_unpack_latents(tiled_predictions[1], global_shapes)

    stock_cfg_video = stock_uncond_video + cfg_scale * (stock_cond_video - stock_uncond_video)
    tiled_cfg_video = tiled_uncond_video + cfg_scale * (tiled_cond_video - tiled_uncond_video)

    assert predictor.call_count == 1
    assert previous_call_count == 1
    assert fallback_call_count == 0
    assert torch.allclose(tiled_cond_video, stock_cond_video)
    assert torch.allclose(tiled_uncond_video, stock_uncond_video)
    assert torch.allclose(tiled_cfg_video, stock_cfg_video)
    assert torch.allclose(tiled_cond_audio, audio)
    assert torch.allclose(tiled_uncond_audio, audio)
    assert not torch.allclose(stock_cond_audio, audio)
    assert not torch.allclose(stock_uncond_audio, audio)

    assert len(call_records) == 2
    assert call_records[0]["model"] is stock_model
    assert call_records[1]["model"] is stock_model
    assert torch.allclose(call_records[0]["input"], call_records[1]["input"])
    assert call_records[0]["shapes"] == call_records[1]["shapes"]
    assert call_records[1]["branch_metadata"] == call_records[0]["branch_metadata"]
    assert call_records[0]["has_recursive_hook"] is True
    assert call_records[1]["has_recursive_hook"] is False
    assert call_records[1]["top_level_keys"] == call_records[0]["top_level_keys"] - {
        "sampler_calc_cond_batch_function",
    }
    assert call_records[1]["custom_option"] == call_records[0]["custom_option"]
    assert call_records[1]["existing_context"] == call_records[0]["existing_context"]
    assert torch.equal(call_records[1]["sample_sigmas"], call_records[0]["sample_sigmas"])
    assert call_records[0]["has_tile_marker"] is False
    assert call_records[1]["has_tile_marker"] is True
    assert call_records[1]["transformer_keys"] == (
        call_records[0]["transformer_keys"] | {"deno_ltx_av_tile"}
    )
    assert "deno_ltx_av_tile" not in base_model_options["transformer_options"]
    assert base_model_options["sampler_calc_cond_batch_function"] is previous_calculator
    assert base_model_options["custom_option"] == "must-survive"
    assert base_model_options["transformer_options"]["existing_context"] == {"enabled": True}
    assert torch.equal(base_model_options["transformer_options"]["sample_sigmas"], torch.tensor([0.375, 0.0]))
    assert conds[0][0]["model_conds"]["ref_audio"].cond == {"sentinel": "preserve"}
    assert conds[1][0]["model_conds"]["ref_audio"].cond == {"sentinel": "preserve"}


def test_av_sampler_validates_nested_video_audio_latents():
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.zeros((1, 1, 4, 4))
    nested = _FakeNestedTensor([video, audio])

    assert DenoLTXAVStepFusedTiledSampler._validate_av_samples(nested) == (video, audio)

    with pytest.raises(TypeError, match="nested"):
        DenoLTXAVStepFusedTiledSampler._validate_av_samples(video)

    with pytest.raises(ValueError, match="exactly two"):
        DenoLTXAVStepFusedTiledSampler._validate_av_samples(
            _FakeNestedTensor([video, audio, audio])
        )


def test_av_freeze_noise_mask_preserves_video_and_zeros_audio(fake_comfy_latent_utils):
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    mask = _make_av_freeze_noise_mask({}, video, audio)
    video_mask, audio_mask = mask.unbind()

    assert torch.allclose(video_mask, torch.ones_like(video))
    assert torch.allclose(audio_mask, torch.zeros_like(audio))


def test_av_sampler_one_by_one_matches_stock_frozen_audio_sampler(
    monkeypatch,
    fake_comfy_latent_utils,
):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.arange(120, dtype=torch.float32).reshape(1, 2, 3, 5, 4) / 50.0
    audio = torch.linspace(-0.5, 0.75, steps=16, dtype=torch.float32).reshape(1, 1, 4, 4)
    video_mask = torch.zeros_like(video)
    video_mask[..., ::2, :] = 1.0
    expected_video_noise = torch.full_like(video, 0.125)
    expected_audio_noise = torch.full_like(audio, -0.375)
    cfg_scale = 2.75
    sigmas = torch.tensor([0.6, 0.3, 0.0])
    sampler_sentinel = object()
    stock_model = _FakeModel()
    previous_call_count = 0
    fallback_call_count = 0
    process_latent_out_call_count = 0
    callback_objects = []
    prepare_callback_steps = []
    video_token_count = math.prod(video.shape[1:])

    def make_conds(latent_shapes):
        return [
            [{"model_conds": {
                "latent_shapes": _FakeCond(latent_shapes),
                "branch_bias": _FakeCond(torch.tensor([0.5])),
                "ref_audio": _FakeCond({"sentinel": "preserve"}),
            }}],
            [{"model_conds": {
                "latent_shapes": _FakeCond(latent_shapes),
                "branch_bias": _FakeCond(torch.tensor([-0.25])),
                "ref_audio": _FakeCond({"sentinel": "preserve"}),
            }}],
        ]

    def reference_calc_cond_batch(_model, conds_in, x_in, sigma_in, _model_options):
        predictions = []
        for cond_list in conds_in:
            model_conds = cond_list[0]["model_conds"]
            latent_shapes = model_conds["latent_shapes"].cond
            input_video, input_audio = _fake_unpack_latents(x_in, latent_shapes)
            branch_bias = model_conds["branch_bias"].cond.reshape(1, 1, 1, 1, 1)
            audio_context = input_audio.mean().reshape(1, 1, 1, 1, 1)
            sigma_context = sigma_in.reshape(1, 1, 1, 1, 1)
            pred_video = input_video * 0.125 + audio_context + sigma_context + branch_bias
            pred_audio = input_audio + branch_bias.flatten()[0]
            packed_prediction, _ = _fake_pack_latents([pred_video, pred_audio])
            predictions.append(packed_prediction)
        return predictions

    def previous_calculator(args_in):
        nonlocal previous_call_count
        previous_call_count += 1
        return reference_calc_cond_batch(
            args_in["model"],
            args_in["conds"],
            args_in["input"],
            args_in["sigma"],
            args_in["model_options"],
        )

    def unexpected_fallback(*_args, **_kwargs):
        nonlocal fallback_call_count
        fallback_call_count += 1
        raise AssertionError(
            "Base calc_cond_batch must not be called when a previous calculator is installed."
        )

    def process_latent_out(value):
        nonlocal process_latent_out_call_count
        process_latent_out_call_count += 1
        processed = value.clone()
        processed[:, :, :video_token_count] = processed[:, :, :video_token_count] + 0.03125
        return processed

    def fake_prepare_callback(_model_patcher, _steps, x0_output):
        prepare_callback_steps.append(int(_steps))
        calls = []

        def callback(step, x0, x, total_steps):
            x0_output["x0"] = x0
            calls.append({
                "step": int(step),
                "x0": x0.clone(),
                "x": x.clone(),
                "total_steps": int(total_steps),
            })

        callback.calls = calls
        callback_objects.append(callback)
        return callback

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._latent_preview",
        lambda: types.SimpleNamespace(prepare_callback=fake_prepare_callback),
    )

    class _DeterministicAVNoise:
        seed = 987

        def generate_noise(self, latent):
            latent_video, latent_audio = latent["samples"].unbind()
            assert tuple(latent_video.shape) == tuple(video.shape)
            assert tuple(latent_audio.shape) == tuple(audio.shape)
            return _FakeNestedTensor([
                expected_video_noise.clone(),
                expected_audio_noise.clone(),
            ])

    class _FullParitySamplerGuider(_FakeCFGGuider):
        original_conds = {}

        def __init__(self):
            self.model_options = {
                "sampler_calc_cond_batch_function": previous_calculator,
                "custom_option": "must-survive",
                "transformer_options": {"sample_sigmas": sigmas.clone()},
            }
            self.model_patcher = types.SimpleNamespace(
                model=types.SimpleNamespace(process_latent_out=process_latent_out),
                wrappers={},
            )

        def sample(
            self,
            noise,
            source,
            sampler,
            sigmas_in,
            denoise_mask=None,
            callback=None,
            disable_pbar=True,
            seed=None,
        ):
            assert sampler is sampler_sentinel
            assert torch.equal(sigmas_in, sigmas)
            assert seed == 987
            assert disable_pbar is True

            noise_video, noise_audio = noise.unbind()
            assert torch.equal(noise_video, expected_video_noise)
            assert torch.equal(noise_audio, expected_audio_noise)

            source_video, source_audio = source.unbind()
            received_video_mask, received_audio_mask = denoise_mask.unbind()
            assert tuple(received_video_mask.shape) == tuple(video_mask.shape)
            assert torch.equal(received_video_mask, video_mask)
            assert tuple(received_audio_mask.shape) == tuple(audio.shape)
            assert torch.equal(received_audio_mask, torch.zeros_like(audio))
            assert torch.count_nonzero(received_audio_mask) == 0

            state_video = source_video + noise_video * sigmas_in[0]
            total_steps = len(sigmas_in) - 1
            for step_index in range(total_steps):
                packed_state, latent_shapes = _fake_pack_latents([state_video, source_audio])
                hook = self.model_options["sampler_calc_cond_batch_function"]
                predictions = hook({
                    "input": packed_state,
                    "sigma": sigmas_in[step_index:step_index + 1],
                    "model": stock_model,
                    "conds": make_conds(latent_shapes),
                    "model_options": self.model_options,
                })

                cond_video, _cond_audio = _fake_unpack_latents(predictions[0], latent_shapes)
                uncond_video, _uncond_audio = _fake_unpack_latents(predictions[1], latent_shapes)
                cfg_video = uncond_video + cfg_scale * (cond_video - uncond_video)
                sigma_delta = sigmas_in[step_index] - sigmas_in[step_index + 1]
                proposed_video = state_video + cfg_video * sigma_delta * 0.1
                proposed_x0 = state_video - cfg_video * (step_index + 1) * 0.05
                state_video = (
                    proposed_video * received_video_mask
                    + source_video * (1.0 - received_video_mask)
                )
                x0_video = (
                    proposed_x0 * received_video_mask
                    + source_video * (1.0 - received_video_mask)
                )
                packed_x0, _ = _fake_pack_latents([x0_video, source_audio])
                packed_current, _ = _fake_pack_latents([state_video, source_audio])
                callback(step_index, packed_x0, packed_current, total_steps)

            return _FakeNestedTensor([state_video, source_audio])

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(
            CFGGuider=_FakeCFGGuider,
            calc_cond_batch=unexpected_fallback,
        ),
    )

    def run_stock_frozen_audio_sampler():
        guider = _FullParitySamplerGuider()
        source = _FakeNestedTensor([video.clone(), audio.clone()])
        latent = {
            "samples": source,
            "noise_mask": _FakeNestedTensor([video_mask.clone(), torch.ones_like(audio)]),
            "workflow_tag": "preserve",
            "downscale_ratio_spacial": 8,
            "downscale_ratio_temporal": 2,
        }
        mask = _make_av_freeze_noise_mask(latent, video, audio)
        x0_output = {}
        callback = fake_prepare_callback(guider.model_patcher, len(sigmas) - 1, x0_output)
        noise = _DeterministicAVNoise()
        samples = guider.sample(
            noise.generate_noise(latent),
            source,
            sampler_sentinel,
            sigmas,
            denoise_mask=mask,
            callback=callback,
            disable_pbar=True,
            seed=noise.seed,
        )
        sampled_video, sampled_audio = samples.unbind()
        x0_video, x0_audio = _fake_unpack_latents(
            guider.model_patcher.model.process_latent_out(x0_output["x0"]),
            [sampled_video.shape, audio.shape],
        )
        output = {
            "samples": _FakeNestedTensor([sampled_video, sampled_audio]),
            "noise_mask": mask,
            "workflow_tag": latent["workflow_tag"],
        }
        denoised = {
            "samples": _FakeNestedTensor([x0_video, x0_audio]),
            "noise_mask": mask,
            "workflow_tag": latent["workflow_tag"],
        }
        return output, denoised

    stock_output, stock_denoised = run_stock_frozen_audio_sampler()
    deno_output, deno_denoised = DenoLTXAVStepFusedTiledSampler().sample(
        _DeterministicAVNoise(),
        _FullParitySamplerGuider(),
        sampler_sentinel,
        sigmas,
        {
            "samples": _FakeNestedTensor([video.clone(), audio.clone()]),
            "noise_mask": _FakeNestedTensor([video_mask.clone(), torch.ones_like(audio)]),
            "workflow_tag": "preserve",
            "downscale_ratio_spacial": 8,
            "downscale_ratio_temporal": 2,
        },
        horizontal_tiles=1,
        vertical_tiles=1,
        overlap=1,
        audio_mode="freeze",
        blend_mode="hann",
    )

    stock_output_video, stock_output_audio = stock_output["samples"].unbind()
    stock_denoised_video, stock_denoised_audio = stock_denoised["samples"].unbind()
    deno_output_video, deno_output_audio = deno_output["samples"].unbind()
    deno_denoised_video, deno_denoised_audio = deno_denoised["samples"].unbind()

    assert previous_call_count == 4
    assert fallback_call_count == 0
    assert process_latent_out_call_count == 2
    assert prepare_callback_steps == [len(sigmas) - 1, len(sigmas) - 1]
    assert torch.allclose(deno_output_video, stock_output_video)
    assert torch.allclose(deno_denoised_video, stock_denoised_video)
    assert torch.equal(deno_output_audio, stock_output_audio)
    assert torch.equal(deno_denoised_audio, stock_denoised_audio)
    assert torch.equal(deno_output_audio, audio)
    assert torch.equal(deno_denoised_audio, audio)
    assert deno_output["workflow_tag"] == stock_output["workflow_tag"]
    assert deno_denoised["workflow_tag"] == stock_denoised["workflow_tag"]
    assert "downscale_ratio_spacial" not in deno_output
    assert "downscale_ratio_temporal" not in deno_output
    assert "downscale_ratio_spacial" not in deno_denoised
    assert "downscale_ratio_temporal" not in deno_denoised
    assert len(callback_objects) == 2
    for callback in callback_objects:
        assert len(callback.calls) == len(sigmas) - 1
        assert callback.calls[-1]["step"] == len(sigmas) - 2
        assert callback.calls[-1]["total_steps"] == len(sigmas) - 1
    assert torch.equal(callback_objects[0].calls[-1]["x0"], callback_objects[1].calls[-1]["x0"])
    assert torch.equal(callback_objects[0].calls[-1]["x"], callback_objects[1].calls[-1]["x"])

    for latent in (deno_output, deno_denoised):
        output_video_mask, output_audio_mask = latent["noise_mask"].unbind()
        assert tuple(output_video_mask.shape) == tuple(video_mask.shape)
        assert torch.equal(output_video_mask, video_mask)
        assert tuple(output_audio_mask.shape) == tuple(audio.shape)
        assert torch.equal(output_audio_mask, torch.zeros_like(audio))
        assert torch.count_nonzero(output_audio_mask) == 0

    assert deno_output["deno_ltx_av_step_fused_tiling"]["prediction_calls"] == len(sigmas) - 1
    assert deno_denoised["deno_ltx_av_step_fused_tiling"]["prediction_calls"] == len(sigmas) - 1


def test_av_sampler_freezes_audio_output_and_denoised_output(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4)) * 5.0
    x0_video = torch.ones_like(video) * 7.0

    sampler = DenoLTXAVStepFusedTiledSampler()
    output, denoised = sampler.sample(
        _FakeNoise(),
        _FakeSamplerGuider(x0_video=x0_video, x0_audio=audio.clone()),
        object(),
        torch.tensor([1.0, 0.0]),
        {"samples": _FakeNestedTensor([video, audio])},
        overlap=2,
    )

    output_video, output_audio = output["samples"].unbind()
    denoised_video, denoised_audio = denoised["samples"].unbind()
    assert torch.allclose(output_video, video + 1.0)
    assert torch.allclose(output_audio, audio)
    assert torch.allclose(denoised_video, x0_video)
    assert torch.allclose(denoised_audio, audio)


def test_av_sampler_rejects_missing_callback_x0(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    with pytest.raises(RuntimeError, match="Strict denoised_output"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(set_x0=False),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_packed_x0_extra_elements(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))
    packed, _ = _fake_pack_latents([torch.ones_like(video), audio.clone()])
    packed = torch.cat([packed, torch.zeros((1, 1, 1))], dim=-1)

    with pytest.raises(RuntimeError, match="Invalid packed AV x0 shape"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(raw_x0=packed),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_changed_x0_audio(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))
    x0_audio = torch.ones_like(audio) * 99.0

    with pytest.raises(RuntimeError, match="AV x0 audio changed"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(x0_video=torch.ones_like(video), x0_audio=x0_audio),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_output_shape_changes(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    with pytest.raises(RuntimeError, match="output video shape mismatch"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(
                x0_video=torch.ones_like(video),
                x0_audio=audio.clone(),
                output_video=torch.zeros((1, 2, 3, 5, 4)),
            ),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )

    with pytest.raises(RuntimeError, match="output audio shape mismatch"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(
                x0_video=torch.ones_like(video),
                x0_audio=audio.clone(),
                output_audio=torch.zeros((1, 1, 4, 3)),
            ),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_5d_audio_latent():
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.zeros((1, 1, 4, 4, 1))

    with pytest.raises(ValueError, match="Expected LTX AV audio latent"):
        DenoLTXAVStepFusedTiledSampler._validate_av_samples(
            _FakeNestedTensor([video, audio])
        )


def test_av_sampler_accepts_guide_metadata_before_sampling(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    active_entries = [
        {"keyframe_idxs": _FakeCond(torch.zeros((1, 3, 1, 2)))},
        {"guide_attention_entries": [object()]},
        [object(), {"keyframe_idxs": _FakeCond(torch.zeros((1, 3, 1, 2)))}],
        {"model_conds": {"keyframe_idxs": _FakeCond(torch.zeros((1, 3, 1, 2)))}},
        {"model_conds": {"guide_attention_entries": _FakeCond([object()])}},
    ]

    for entry in active_entries:
        if True:
            DenoLTXAVStepFusedTiledSampler().sample(
                _FakeNoise(),
                _FakeSamplerGuider(
                    x0_video=torch.ones_like(video),
                    x0_audio=audio.clone(),
                    original_conds={"positive": [entry]},
                ),
                object(),
                torch.tensor([1.0, 0.0]),
                {"samples": _FakeNestedTensor([video, audio])},
                overlap=2,
            )


@pytest.mark.parametrize("guide_frames", [1, 2])
def test_av_predictor_crops_guide_metadata_per_tile(
    monkeypatch,
    fake_comfy_latent_utils,
    guide_frames,
):
    height, width = 4, 6
    video = torch.zeros((1, 2, 3 + guide_frames, height, width))
    audio = torch.ones((1, 1, 4, 4))
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=height, width=width, vertical_tiles=1, horizontal_tiles=2, overlap=2)
    keyframes = _make_guide_keyframes(guide_frames, height, width)
    guide_entries = _make_guide_entries(guide_frames, height, width)
    seen = []

    def make_cond_list():
        return [{
            "keyframe_idxs": _FakeCond(keyframes.clone()),
            "guide_attention_entries": _FakeCond(copy.deepcopy(guide_entries)),
            "model_conds": {
                "latent_shapes": _FakeCond(global_shapes),
                "keyframe_idxs": _FakeCond(keyframes.clone()),
                "guide_attention_entries": _FakeCond(copy.deepcopy(guide_entries)),
            },
        }]

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        tile_shapes = conds[0][0]["model_conds"]["latent_shapes"].cond
        tile_video, full_audio = _fake_unpack_latents(x_in, tile_shapes)
        assert tile_video.shape[2] == video.shape[2]
        assert tuple(full_audio.shape) == tuple(audio.shape)

        entry = conds[0][0]
        model_conds = entry["model_conds"]
        seen.append({
            "tile_video_shape": tuple(tile_video.shape),
            "top_keyframes": entry["keyframe_idxs"].cond.clone(),
            "model_keyframes": model_conds["keyframe_idxs"].cond.clone(),
            "top_entries": copy.deepcopy(entry["guide_attention_entries"].cond),
            "model_entries": copy.deepcopy(model_conds["guide_attention_entries"].cond),
        })
        packed_prediction, _ = _fake_pack_latents([tile_video + 1.0, full_audio])
        return [packed_prediction]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=height,
        full_width=width,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )
    result = predictor({
        "input": packed,
        "sigma": torch.tensor([0.5]),
        "model": _FakeModel(),
        "conds": [make_cond_list(), make_cond_list()],
        "model_options": {},
    })

    output_video, output_audio = _fake_unpack_latents(result[0], global_shapes)
    assert tuple(output_video.shape) == tuple(video.shape)
    assert torch.equal(output_audio, audio)
    assert len(seen) == len(plan)
    for spec, record in zip(plan, seen):
        assert record["tile_video_shape"] == (1, 2, 3 + guide_frames, spec.height, spec.width)
        expected_tokens = guide_frames * spec.height * spec.width
        for keyframe_tensor in (record["top_keyframes"], record["model_keyframes"]):
            assert tuple(keyframe_tensor.shape) == (1, 3, expected_tokens, 2)
            reshaped = keyframe_tensor.reshape(1, 3, guide_frames, spec.height, spec.width, 2)
            assert float(reshaped[:, 1, ..., 0].min()) >= 0.0
            assert float(reshaped[:, 2, ..., 0].min()) >= 0.0
            assert float(reshaped[:, 1, ..., 1].max()) <= spec.height * 32.0
            assert float(reshaped[:, 2, ..., 1].max()) <= spec.width * 32.0
        for entries in (record["top_entries"], record["model_entries"]):
            assert len(entries) == guide_frames
            for item in entries:
                assert item["pre_filter_count"] == spec.height * spec.width
                assert item["latent_shape"] == [1, spec.height, spec.width]
                assert tuple(item["pixel_mask"].shape[-2:]) == (
                    spec.height * 32,
                    spec.width * 32,
                )


def test_av_predictor_ratio_crops_nonstandard_pixel_mask_resolution(
    monkeypatch,
    fake_comfy_latent_utils,
):
    height, width = 4, 6
    mask_height, mask_width = 10, 14
    video = torch.zeros((1, 2, 4, height, width))
    audio = torch.ones((1, 1, 4, 4))
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=height, width=width, vertical_tiles=1, horizontal_tiles=2, overlap=2)
    guide_entries = [{
        "pre_filter_count": height * width,
        "latent_shape": [1, height, width],
        "pixel_mask": torch.ones((1, 1, 1, mask_height, mask_width)),
    }]
    seen_masks = []

    def fake_calc_cond_batch(_model, conds, x_in, _sigma, _model_options):
        tile_shapes = conds[0][0]["model_conds"]["latent_shapes"].cond
        tile_video, full_audio = _fake_unpack_latents(x_in, tile_shapes)
        seen_masks.append(conds[0][0]["guide_attention_entries"].cond[0]["pixel_mask"].clone())
        packed_prediction, _ = _fake_pack_latents([tile_video + 1.0, full_audio])
        return [packed_prediction]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=height,
        full_width=width,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )
    predictor({
        "input": packed,
        "sigma": torch.tensor([0.5]),
        "model": _FakeModel(),
        "conds": [[{
            "guide_attention_entries": _FakeCond(copy.deepcopy(guide_entries)),
            "model_conds": {"latent_shapes": _FakeCond(global_shapes)},
        }]],
        "model_options": {},
    })

    assert len(seen_masks) == len(plan)
    for spec, mask in zip(plan, seen_masks):
        expected_h = math.ceil(spec.y1 * mask_height / height) - math.floor(spec.y0 * mask_height / height)
        expected_w = math.ceil(spec.x1 * mask_width / width) - math.floor(spec.x0 * mask_width / width)
        assert tuple(mask.shape[-2:]) == (expected_h, expected_w)
        assert tuple(mask.shape[-2:]) != (mask_height, mask_width)


def test_av_predictor_rejects_downscaled_guide_entries(
    monkeypatch,
    fake_comfy_latent_utils,
):
    height, width = 4, 6
    video = torch.zeros((1, 2, 4, height, width))
    audio = torch.ones((1, 1, 4, 4))
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=height, width=width, vertical_tiles=1, horizontal_tiles=2, overlap=2)
    guide_entries = [{
        "pre_filter_count": height * width,
        "latent_shape": [1, height // 2, width // 2],
        "pixel_mask": torch.ones((1, 1, 1, height * 32, width * 32)),
    }]

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=height,
        full_width=width,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )

    with pytest.raises(UnsupportedTiledConditioning, match="Downscaled or dilated IC-LoRA"):
        predictor({
            "input": packed,
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[{
                "guide_attention_entries": _FakeCond(copy.deepcopy(guide_entries)),
                "model_conds": {"latent_shapes": _FakeCond(global_shapes)},
            }]],
            "model_options": {},
        })


def test_av_predictor_rejects_unusable_pixel_mask_shape(
    fake_comfy_latent_utils,
):
    height, width = 4, 6
    video = torch.zeros((1, 2, 4, height, width))
    audio = torch.ones((1, 1, 4, 4))
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=height, width=width, vertical_tiles=1, horizontal_tiles=2, overlap=2)
    guide_entries = [{
        "pre_filter_count": height * width,
        "latent_shape": [1, height, width],
        "pixel_mask": torch.ones((height * 32, width * 32)),
    }]

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=height,
        full_width=width,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )

    with pytest.raises(UnsupportedTiledConditioning, match="pixel_mask must be a tensor"):
        predictor({
            "input": packed,
            "sigma": torch.tensor([0.5]),
            "model": _FakeModel(),
            "conds": [[{
                "guide_attention_entries": _FakeCond(copy.deepcopy(guide_entries)),
                "model_conds": {"latent_shapes": _FakeCond(global_shapes)},
            }]],
            "model_options": {},
        })


def test_av_sampler_allows_cropped_none_guides(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    output, denoised = DenoLTXAVStepFusedTiledSampler().sample(
        _FakeNoise(),
        _FakeSamplerGuider(
            x0_video=torch.ones_like(video),
            x0_audio=audio.clone(),
            original_conds={
                "positive": [
                    {
                        "keyframe_idxs": None,
                        "guide_attention_entries": _FakeCond(None),
                        "model_conds": {
                            "keyframe_idxs": _FakeCond(None),
                            "guide_attention_entries": None,
                        },
                    }
                ]
            },
        ),
        object(),
        torch.tensor([1.0, 0.0]),
        {"samples": _FakeNestedTensor([video, audio])},
        overlap=2,
    )

    assert torch.allclose(output["samples"].unbind()[1], audio)
    assert torch.allclose(denoised["samples"].unbind()[1], audio)


def test_av_sampler_allows_partial_sigma_raw_audio_drift(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4)) * 5.0
    raw_partial_audio = torch.ones_like(audio) * 5.6667

    output, denoised = DenoLTXAVStepFusedTiledSampler().sample(
        _FakeNoise(),
        _FakeSamplerGuider(
            x0_video=torch.ones_like(video),
            x0_audio=audio.clone(),
            output_audio=raw_partial_audio,
        ),
        object(),
        torch.tensor([0.8, 0.4]),
        {"samples": _FakeNestedTensor([video, audio])},
        overlap=2,
    )

    assert torch.allclose(output["samples"].unbind()[1], audio)
    assert torch.allclose(denoised["samples"].unbind()[1], audio)
    assert not torch.allclose(raw_partial_audio, audio)


def test_av_sampler_rejects_packed_sampler_state_extra_elements(
    monkeypatch,
    fake_comfy_latent_utils,
):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    with pytest.raises(RuntimeError, match="Invalid packed AV sampler state"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(
                x0_video=torch.ones_like(video),
                x0_audio=audio.clone(),
                hook_input_extra=True,
            ),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_incompatible_outer_wrappers(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    with pytest.raises(RuntimeError, match="ltx2_audio_normalization"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(
                model_options={
                    "transformer_options": {
                        "wrappers": {"outer_sample": {"ltx2_audio_normalization": [object()]}}
                    }
                }
            ),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_sampler_rejects_model_patcher_outer_wrappers(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    with pytest.raises(RuntimeError, match="ltx2_audio_normalization"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _FakeSamplerGuider(
                patcher_wrappers={"outer_sample": {"ltx2_audio_normalization": [object()]}}
            ),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )


def test_av_predictor_rejects_packed_tile_prediction_extra_elements(
    monkeypatch,
    fake_comfy_latent_utils,
):
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))
    packed, global_shapes = _fake_pack_latents([video, audio])
    plan = build_tile_plan(height=6, width=4, vertical_tiles=2, horizontal_tiles=1, overlap=2)

    def fake_calc_cond_batch(_model, _conds, x_in, _sigma, _model_options):
        extra = torch.zeros((x_in.shape[0], x_in.shape[1], 1))
        return [torch.cat([x_in, extra], dim=-1)]

    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_samplers",
        lambda: types.SimpleNamespace(calc_cond_batch=fake_calc_cond_batch),
    )

    predictor = StepFusedAVTilePredictor(
        plan=plan,
        full_height=6,
        full_width=4,
        global_video_shape=global_shapes[0],
        global_audio_shape=global_shapes[1],
        blend_mode="hann",
    )

    with pytest.raises(RuntimeError, match="Invalid packed AV tile prediction shape"):
        predictor(
            {
                "input": packed,
                "sigma": torch.tensor([0.5]),
                "model": _FakeModel(),
                "conds": [[{"model_conds": {"latent_shapes": _FakeCond(global_shapes)}}], []],
                "model_options": {},
            }
        )


def test_av_sampler_rejects_custom_guider(monkeypatch, fake_comfy_latent_utils):
    _patch_av_sampler_runtime(monkeypatch)
    video = torch.zeros((1, 2, 3, 6, 4))
    audio = torch.ones((1, 1, 4, 4))

    class _CustomGuider:
        model_options = {}

        def predict_noise(self, *_args, **_kwargs):
            raise AssertionError("custom guider should fail before sampling")

    with pytest.raises(TypeError, match="standard predict_noise"):
        DenoLTXAVStepFusedTiledSampler().sample(
            _FakeNoise(),
            _CustomGuider(),
            object(),
            torch.tensor([1.0, 0.0]),
            {"samples": _FakeNestedTensor([video, audio])},
            overlap=2,
        )
