from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "deno_ltx_tiled_nodes.py"


def test_step_fused_sampler_uses_comfyui_cond_batch_hook():
    source = SOURCE.read_text(encoding="utf-8")

    assert "sampler_calc_cond_batch_function" in source
    assert "_comfy_samplers().calc_cond_batch" in source
    assert "predictor.call_count == 0" in source
    assert "return self._stock_sample" in source


def test_ltx_tiled_nodes_reject_unsupported_boundary_paths():
    source = SOURCE.read_text(encoding="utf-8")

    assert "LTX AV packed/nested sampling is not supported in v1" in source
    assert "ControlNet-style conditioning is not supported" in source
    assert "GLIGEN conditioning is unsupported in v1" in source
    assert "Regional conditioning areas are unsupported in v1" in source


def test_ltx_tiled_nodes_do_not_touch_ai_studio_or_wdc_namespaces():
    source = SOURCE.read_text(encoding="utf-8")

    assert "ltx_ai_studio" not in source.lower()
    assert "DenoLTXAIStudio" not in source
    assert "WhatDreamsCost" not in source
    assert "LTXDirector" not in source
