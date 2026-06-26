from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "deno_ltx_tiled_nodes.py"


def test_step_fused_sampler_uses_comfyui_cond_batch_hook():
    source = SOURCE.read_text(encoding="utf-8")

    assert "sampler_calc_cond_batch_function" in source
    assert "_comfy_samplers().calc_cond_batch" in source
    assert "predictor.call_count == 0" in source
    assert "falling back to output" not in source
    assert "denoised = output" not in source
    assert "Strict denoised_output mode" in source


def test_av_step_fused_sampler_reports_packed_av_outputs():
    source = SOURCE.read_text(encoding="utf-8")

    assert "_validate_av_output(" in source
    assert "expected a NestedTensor" in source
    assert "LTX2AudioLatentNormalizingSampling" in source
    assert "frozen_audio" in source


def test_ltx_tiled_nodes_reject_unsupported_boundary_paths():
    source = SOURCE.read_text(encoding="utf-8")

    assert "Deno LTX AV step-fused prediction expected packed nested" in source
    assert "Deno LTX AV Step-Fused Tiled Sampler expects an LTX AV nested" in source
    assert "DenoLTXAVStepFusedTiledSampler" in source
    assert "audio_mode='freeze'" in source
    assert "LTXVCropGuides before AV concat" in source
    assert "ltx2_audio_normalization" in source
    assert "_active_cond_value" in source
    assert "_collect_outer_wrapper_maps" in source
    assert "model_patcher" in source
    assert "AV sampler state" in source
    assert "AV tile prediction" in source
    assert "standard predict_noise" in source
    assert "ControlNet-style conditioning is not supported" in source
    assert "GLIGEN conditioning is unsupported in v1" in source
    assert "Regional conditioning areas are unsupported in v1" in source


def test_ltx_tiled_nodes_do_not_touch_ai_studio_or_wdc_namespaces():
    source = SOURCE.read_text(encoding="utf-8")

    assert "ltx_ai_studio" not in source.lower()
    assert "DenoLTXAIStudio" not in source
    assert "WhatDreamsCost" not in source
    assert "LTXDirector" not in source


def test_ltx_tiled_nodes_default_to_two_by_two_tiles():
    source = SOURCE.read_text(encoding="utf-8")

    assert source.count('"horizontal_tiles": (') >= 2
    assert source.count('"vertical_tiles": (') >= 2
    assert source.count('"default": 2') >= 4
    assert '"display_name": "Frame width split count"' in source
    assert '"display_name": "Frame height split count"' in source
    assert '"aggressive_memory_cleanup": ("BOOLEAN", {"default": True})' in source
    assert "horizontal_tiles=2" in source
    assert "vertical_tiles=2" in source
    assert "aggressive_memory_cleanup=True" in source
