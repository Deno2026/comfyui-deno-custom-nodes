from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deno_film_grain import (DenoFilmGrain, _apply_frame, _gaussian_numpy, _grain_field,
                             _reference_grain_shape, _resolution_grain_field)


requires_torch = pytest.mark.skipif(not hasattr(torch, "from_numpy"), reason="Real torch unavailable")


def test_default_matches_original_two_layer_formula():
    ndimage = pytest.importorskip("scipy.ndimage")
    shape, seed = (47, 61), 2026100701
    rng = np.random.default_rng(seed)
    fine = ndimage.gaussian_filter(rng.standard_normal(shape, dtype=np.float32), 0.45, mode="reflect")
    coarse = ndimage.gaussian_filter(rng.standard_normal(shape, dtype=np.float32), 1.15, mode="reflect")
    fine /= fine.std()
    coarse /= coarse.std()
    field = np.tanh((0.75 * fine + 0.25 * coarse) / 2.4) * 2.4
    field -= field.mean()
    field /= field.std()
    source = np.random.default_rng(3).random((*shape, 4), dtype=np.float32)
    original = source.copy()
    luminance = np.einsum("ijk,k->ij", source[..., :3], np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    tone = (0.5 + 0.6 * (1.0 - luminance)) * np.sqrt(np.clip(4 * luminance * (1 - luminance), 0, 1))
    expected = np.clip(source[..., :3] + field[..., None] * (9 / 255) * tone[..., None], 0, 1)
    output = np.empty_like(source)
    _apply_frame(source, output, amount=9, grain_size=1, roughness=.25, tone_weighted=True, seed=seed)
    np.testing.assert_allclose(output[..., :3], expected, atol=2e-7)
    np.testing.assert_array_equal(output[..., 3], source[..., 3])
    np.testing.assert_array_equal(source, original)


@pytest.mark.parametrize("shape", [(1, 1), (1, 7), (8, 1), (11, 17)])
@pytest.mark.parametrize("sigma", [.1125, .45, 1.15, 4.6])
def test_numpy_blur_matches_scipy_including_small_boundaries(shape, sigma):
    ndimage = pytest.importorskip("scipy.ndimage")
    field = np.random.default_rng(6).standard_normal(shape, dtype=np.float32)
    np.testing.assert_allclose(_gaussian_numpy(field, sigma), ndimage.gaussian_filter(field, sigma, mode="reflect"), atol=2e-7)


def test_numpy_path_runs_without_scipy(monkeypatch):
    monkeypatch.setitem(sys.modules, "scipy.ndimage", None)
    field = _grain_field((20, 31), 5, 1.0, .25)
    assert np.isfinite(field).all()
    assert abs(field.mean()) < 1e-6
    assert abs(field.std() - 1.0) < 1e-6
    np.testing.assert_array_equal(field, _grain_field((20, 31), 5, 1.0, .25))


def test_single_pixel_and_black_white_are_safe():
    for shape, value in [((1, 1, 4), .4), ((4, 6, 3), 0.), ((4, 6, 3), 1.)]:
        source = np.full(shape, value, dtype=np.float32)
        out = np.empty_like(source)
        _apply_frame(source, out, amount=9, grain_size=1, roughness=.25, tone_weighted=True, seed=1)
        np.testing.assert_array_equal(out, source)


@requires_torch
@pytest.mark.parametrize("dtype", ["float16", "float32", "float64", "bfloat16"])
@pytest.mark.parametrize("grain_scale_mode", ["pixels", "resolution"])
def test_input_alpha_dtype_and_noncontiguous_layout_preserved(dtype, grain_scale_mode):
    images = torch.from_numpy(np.random.default_rng(8).random((2, 19, 23, 4))).to(getattr(torch, dtype))
    images = images.transpose(1, 2)
    images.requires_grad_(True)
    before = images.clone()
    result, = DenoFilmGrain().apply(images, grain_scale_mode=grain_scale_mode)
    assert result.shape == images.shape and result.dtype == images.dtype
    assert result.device.type == "cpu"
    assert not result.requires_grad and images.requires_grad
    assert torch.equal(images, before)
    assert torch.equal(result[..., 3], before[..., 3])
    assert torch.isfinite(result).all() and result[..., :3].min() >= 0 and result[..., :3].max() <= 1
    assert not torch.equal(result[..., :3], before[..., :3])


@requires_torch
def test_changing_fixed_reproducibility_and_chunk_continuity():
    images = torch.full((5, 19, 23, 3), .5)
    node = DenoFilmGrain()
    result, = node.apply(images, seed=(1 << 64) - 2)
    again, = node.apply(images, seed=(1 << 64) - 2)
    assert torch.equal(result, again) and not torch.equal(result[0], result[1])
    head, = node.apply(images[:2], seed=(1 << 64) - 2)
    tail, = node.apply(images[2:], seed=(1 << 64) - 2, frame_offset=2)
    assert torch.equal(result, torch.cat([head, tail]))
    fixed, = node.apply(images, temporal_mode="fixed")
    assert torch.equal(fixed[0], fixed[-1])


def test_bypass_ignores_inactive_stale_settings_without_copying():
    images = object()
    assert DenoFilmGrain().apply(images, enabled=False, temporal_mode="legacy")[0] is images
    assert DenoFilmGrain().apply(images, amount=0, grain_size=float("nan"))[0] is images
    assert DenoFilmGrain().apply(images, enabled=False, processing_batch_size="stale")[0] is images
    assert DenoFilmGrain().apply(images, enabled=False, grain_scale_mode="stale")[0] is images
    assert DenoFilmGrain().apply(images, amount=0, grain_scale_mode="stale")[0] is images


@pytest.mark.parametrize("kwargs", [{"amount": float("nan")}, {"grain_size": 0}, {"roughness": 2},
    {"temporal_mode": "unknown"}, {"seed": -1}, {"seed": 1.5}, {"frame_offset": -1},
    {"processing_batch_size": 0}, {"processing_batch_size": 5}, {"processing_batch_size": 1.5},
    {"grain_scale_mode": "unknown"}])
def test_unknown_or_invalid_active_parameters_fail(kwargs):
    with pytest.raises(ValueError):
        DenoFilmGrain().apply(None, **kwargs)


@requires_torch
def test_invalid_input_and_nonfinite_pixels_fail():
    for images in (torch.empty((0, 4, 5, 3)), torch.zeros((1, 4, 5, 2)), torch.zeros((1, 4, 5, 3), dtype=torch.uint8),
                   torch.full((1, 4, 5, 3), float("nan"))):
        with pytest.raises(ValueError):
            DenoFilmGrain().apply(images)


@requires_torch
def test_cuda_input_preserved_and_output_uses_cpu():
    if not torch.cuda.is_available():
        pytest.skip("CUDA unavailable")
    images = torch.full((2, 16, 24, 3), .5, device="cuda")
    before = images.clone()
    output, = DenoFilmGrain().apply(images)
    assert output.device.type == "cpu" and torch.equal(images, before)


@requires_torch
@pytest.mark.parametrize("grain_scale_mode", ["pixels", "resolution"])
def test_local_rng_does_not_change_global_numpy_or_torch_rng(grain_scale_mode):
    images = torch.full((1, 12, 16, 3), .5)
    numpy_before = np.random.get_state()
    torch_before = torch.random.get_rng_state()
    DenoFilmGrain().apply(images, grain_scale_mode=grain_scale_mode)
    after = np.random.get_state()
    assert numpy_before[0] == after[0] and numpy_before[2:] == after[2:]
    np.testing.assert_array_equal(numpy_before[1], after[1])
    assert torch.equal(torch_before, torch.random.get_rng_state())


@requires_torch
@pytest.mark.parametrize("mode", ["changing", "fixed"])
@pytest.mark.parametrize("grain_scale_mode", ["pixels", "resolution"])
def test_cpu_processing_groups_preserve_every_frame_and_chunk_sequence(mode, grain_scale_mode):
    images = torch.from_numpy(np.random.default_rng(16).random((7, 31, 23, 4), dtype=np.float32))
    before = images.clone()
    node = DenoFilmGrain()
    expected, = node.apply(images, temporal_mode=mode, frame_offset=9, grain_scale_mode=grain_scale_mode)
    for group_size in (2, 3, 4):
        actual, = node.apply(images, temporal_mode=mode, frame_offset=9, processing_batch_size=group_size,
                             grain_scale_mode=grain_scale_mode)
        assert torch.equal(actual, expected)
        assert torch.equal(images, before)
    head, = node.apply(images[:3], temporal_mode=mode, frame_offset=9,
                       processing_batch_size=2, grain_scale_mode=grain_scale_mode)
    tail, = node.apply(images[3:], temporal_mode=mode, frame_offset=12,
                       processing_batch_size=4, grain_scale_mode=grain_scale_mode)
    assert torch.equal(torch.cat([head, tail]), expected)


def test_added_batch_setting_does_not_shift_existing_schema_fields():
    schema = DenoFilmGrain.INPUT_TYPES()
    assert list(schema['required']) == ['images', 'enabled', 'amount', 'grain_size', 'roughness',
        'tone_weighted', 'temporal_mode', 'seed', 'frame_offset']
    assert list(schema['optional']) == ['processing_batch_size', 'grain_scale_mode']
    assert schema['required']['amount'][1]['default'] == 6.0
    assert schema['optional']['grain_scale_mode'][0] == ["resolution", "pixels"]
    assert schema['optional']['grain_scale_mode'][1]['default'] == "resolution"


@pytest.mark.parametrize("height,width,reference", [
    (720, 1280, (1536, 2731)),
    (1080, 1920, (1536, 2731)),
    (1536, 2752, (1536, 2752)),
    (2160, 3840, (1536, 2731)),
    (1920, 1080, (2731, 1536)),
    (2752, 1536, (2752, 1536)),
    (2160, 2160, (1536, 1536)),
])
def test_resolution_reference_grid_uses_short_edge_and_keeps_aspect(height, width, reference):
    assert _reference_grain_shape((height, width)) == reference


@requires_torch
def test_resolution_mode_at_reference_has_exact_legacy_result():
    images = torch.full((1, 1536, 2752, 3), .5)
    node = DenoFilmGrain()
    legacy, = node.apply(images)
    adaptive, = node.apply(images, grain_scale_mode="resolution")
    assert torch.equal(adaptive, legacy)


@requires_torch
def test_omitted_mode_preserves_pixels_and_resolution_resamples_only_grain():
    images = torch.full((1, 128, 192, 3), .5)
    node = DenoFilmGrain()
    legacy, = node.apply(images, grain_size=4, amount=9, roughness=.6)
    pixels, = node.apply(images, grain_size=4, amount=9, roughness=.6, grain_scale_mode="pixels")
    assert torch.equal(pixels, legacy)
    adaptive, = node.apply(images, grain_size=4, amount=9, roughness=.6, tone_weighted=False,
                            grain_scale_mode="resolution")
    field = _grain_field((1536, 2304), 2026100701, 4, .6)
    with Image.fromarray(field) as reference:
        with reference.resize((192, 128), Image.Resampling.LANCZOS) as sampled:
            noise = np.array(sampled, dtype=np.float32)
    noise *= 9 / 255
    expected = torch.from_numpy(np.clip(.5 + noise[..., None], 0, 1)).expand_as(images)
    assert torch.equal(adaptive, expected)
    assert not torch.equal(adaptive, pixels)


def test_resolution_resampling_keeps_filtered_power_and_returns_writable_field():
    shape = (720, 1280)
    field = _grain_field((1536, 2731), 12, 1, .25)
    with Image.fromarray(field) as reference:
        with reference.resize((1280, 720), Image.Resampling.LANCZOS) as sampled:
            expected = np.array(sampled, dtype=np.float32)
    actual = _resolution_grain_field(shape, 12, 1, .25)
    np.testing.assert_array_equal(actual, expected)
    assert actual.flags.writeable and actual.dtype == np.float32
    # Normalizing again would make small displayed pixels excessively strong.
    assert 0 < actual.std() < .8 * field.std()


@requires_torch
def test_extreme_aspect_reference_grid_fails_before_output_or_noise_allocation(monkeypatch):
    images = torch.full((1, 1, 4096, 3), .5)
    import deno_film_grain
    def forbidden(*args, **kwargs):
        pytest.fail("Resolution grid must be checked before allocation")
    monkeypatch.setattr(deno_film_grain.torch, "empty", forbidden)
    monkeypatch.setattr(deno_film_grain, "_grain_field", forbidden)
    with pytest.raises(ValueError, match="16,777,216-pixel memory limit.*Fixed pixels"):
        DenoFilmGrain().apply(images, grain_scale_mode="resolution")
    assert DenoFilmGrain().apply(images, enabled=False, grain_scale_mode="resolution")[0] is images


@requires_torch
def test_selected_default_is_amount_six_and_legacy_strength_is_not_clamped():
    images = torch.full((1, 19, 23, 3), .5)
    node = DenoFilmGrain()
    default, = node.apply(images)
    selected, = node.apply(images, amount=6.0)
    strong, = node.apply(images, amount=24.0)
    assert torch.equal(default, selected)
    assert not torch.equal(default, strong)


@requires_torch
@pytest.mark.parametrize("grain_scale_mode", ["pixels", "resolution"])
def test_grouped_cuda_input_observes_callers_nondefault_stream(grain_scale_mode):
    if not torch.cuda.is_available():
        pytest.skip('CUDA unavailable')
    node = DenoFilmGrain()
    expected, = node.apply(torch.full((5, 16, 24, 4), .5), grain_scale_mode=grain_scale_mode)
    stream = torch.cuda.Stream()
    with torch.cuda.stream(stream):
        images = torch.empty((5, 16, 24, 4), device='cuda')
        torch.cuda._sleep(10000000)
        images.fill_(.5)
        actual, = node.apply(images, processing_batch_size=4, grain_scale_mode=grain_scale_mode)
    assert torch.equal(expected, actual)
