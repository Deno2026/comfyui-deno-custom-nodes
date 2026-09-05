"""A/V strength regressions; optional native CPU math via COMFYUI_ROOT."""

import ast
import importlib.util
import logging
import os
from pathlib import Path
import sys
import types
from typing import Optional

import pytest
import torch


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def loader_module(monkeypatch):
    comfy = types.ModuleType("comfy")
    comfy.__path__ = []
    for name in ("lora", "lora_convert", "utils"):
        child = types.ModuleType(f"comfy.{name}")
        setattr(comfy, name, child)
        monkeypatch.setitem(sys.modules, f"comfy.{name}", child)
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "folder_paths", types.ModuleType("folder_paths"))
    comfy.lora.model_lora_keys_unet = lambda _model, keys: keys
    comfy.lora.model_lora_keys_clip = lambda _clip, keys: keys
    comfy.lora_convert.convert_lora = lambda state: state
    comfy.lora.load_lora = lambda state, _keys: state
    spec = importlib.util.spec_from_file_location(
        "ltx_scaling_under_test", REPO_ROOT / "deno_ltx_multi_lora_loader.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RecordingPatcher:
    model = object()
    cond_stage_model = object()

    def __init__(self, patches=()):
        self.patches = list(patches)

    def clone(self):
        return RecordingPatcher(self.patches)

    def add_patches(self, patches, strength):
        self.patches.extend((key, patch, strength) for key, patch in patches.items())


def load_patches(module, loaded, audio, video, strength=1.0):
    loader = module.DenoLTXMultiLoraLoader()
    loader._load_lora_dict = lambda _name: loaded
    model, clip = RecordingPatcher(), RecordingPatcher()
    result = loader.load_multi_lora(
        model, clip, 1, lora_1="example.safetensors",
        audio_1=audio, video_1=video, strength_1=strength,
    )
    assert not model.patches and not clip.patches
    assert result[0].patches == result[1].patches
    return result[0].patches


@pytest.mark.parametrize("scale", [0.0, 0.5, 1.0, 2.0])
@pytest.mark.parametrize("domain", ["audio", "video"])
def test_av_strength_reaches_native_patch_api_without_mutating_adapters(loader_module, scale, domain):
    # Reuse one object across keys: cached/shared adapters must remain untouched.
    weights = (object(), object(), None)
    adapter = types.SimpleNamespace(weights=weights)
    loaded = {
        "blocks.0.audio_attn.to_q.weight": adapter,
        "blocks.0.audio_ff.net.0.weight": ("diff", (object(),)),
        "blocks.0.audio_to_video_attn.to_q.weight": adapter,
        "blocks.0.attn.to_q.weight": adapter,
        "blocks.0.ff.net.0.weight": ("diff", (object(),)),
        ("blocks.0.video_to_audio_attn.to_q.weight", (0, 0, 2)): adapter,
        "blocks.0.norm.weight": adapter,
    }
    original_items = tuple(loaded.items())
    patches = load_patches(
        loader_module, loaded, scale if domain == "audio" else 1.0,
        scale if domain == "video" else 1.0, strength=-1.5,
    )
    actual = {key: (patch, strength) for key, patch, strength in patches}
    audio_keys = list(loaded)[:3]
    video_keys = list(loaded)[3:6]
    selected = audio_keys if domain == "audio" else video_keys
    for key, patch in loaded.items():
        expected = scale if key in selected else 1.0
        if expected == 0.0:
            assert key not in actual
        else:
            assert actual[key][0] is patch
            assert actual[key][1] == pytest.approx(-1.5 * expected)
    assert tuple(loaded.items()) == original_items
    assert adapter.weights is weights


def _exec_definitions(path, names, namespace):
    tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    body = [node for node in tree.body if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name in names]
    assert {node.name for node in body} == names
    exec(compile(ast.Module(body=body, type_ignores=[]), str(path), "exec"), namespace)


@pytest.fixture
def native_weight_math():
    root = os.environ.get("COMFYUI_ROOT")
    if not root or not hasattr(torch, "zeros"):
        pytest.skip("Set COMFYUI_ROOT and install torch for native CPU adapter checks")
    root = Path(root)
    base = type("WeightAdapterBase", (), {})
    # Execute the installed calculation definitions with CPU tensor casting only;
    # importing ComfyUI's model-management module would initialize GPU state.
    namespace = {
        "torch": torch, "Optional": Optional, "logging": logging,
        "WeightAdapterBase": base,
        "weight_adapter": types.SimpleNamespace(WeightAdapterBase=base),
        "comfy": types.SimpleNamespace(model_management=types.SimpleNamespace(
            cast_to_device=lambda value, device, dtype, **_kw: value.to(device=device, dtype=dtype)
        )),
    }
    for filename, name in (("lora.py", "LoRAAdapter"), ("lokr.py", "LoKrAdapter")):
        _exec_definitions(root / "comfy" / "weight_adapter" / filename, {name}, namespace)
    _exec_definitions(root / "comfy" / "lora.py", {"calculate_weight"}, namespace)
    return namespace


@pytest.mark.parametrize("kind", ["diff", "lokr", "lora_no_alpha", "lora_with_alpha"])
@pytest.mark.parametrize("scale", [0.0, 0.5, 1.0, 2.0])
def test_native_cpu_delta_matches_requested_scale(loader_module, native_weight_math, kind, scale):
    native = native_weight_math
    if kind == "diff":
        patch = ("diff", (torch.ones(4, 4),))
        base_delta = torch.ones(4, 4)
    elif kind == "lokr":
        patch = native["LoKrAdapter"](set(), (
            torch.ones(2, 2), torch.ones(2, 2), None, None, None, None, None, None, None,
        ))
        base_delta = torch.ones(4, 4)
    else:
        alpha = None if kind == "lora_no_alpha" else 0.5
        patch = native["LoRAAdapter"](set(), (
            torch.ones(4, 2), torch.ones(2, 4), alpha, None, None, None,
        ))
        base_delta = torch.full((4, 4), 2.0 if alpha is None else 0.5)
    key = "blocks.0.audio_attn.to_q.weight"
    original_weights = getattr(patch, "weights", None)
    records = load_patches(loader_module, {key: patch}, scale, 1.0, strength=-1.5)
    patches = [(strength, value, 1.0, None, None) for _, value, strength in records]
    actual = native["calculate_weight"](patches, torch.zeros(4, 4), key)
    expected = base_delta * (-1.5 * scale)
    assert actual.dtype == expected.dtype and actual.device == expected.device
    assert torch.equal(actual, expected)
    assert getattr(patch, "weights", None) is original_weights
