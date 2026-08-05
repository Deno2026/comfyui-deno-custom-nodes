from pathlib import Path
import sys
import types

import pytest
import torch


if not hasattr(torch, "nn") or not hasattr(torch.nn, "Module"):
    pytest.skip(
        "LTX tiled upscaler contract tests require real torch modules.",
        allow_module_level=True,
    )

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from deno_ltx_tiled_nodes import (
    DenoLTXTiledSpatialUpscaler,
    UPSCALER_MEMORY_BYTES_PER_TILE_ELEMENT,
)


class _RecordingUpscaleModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.scale = torch.nn.Parameter(torch.tensor(1.0, dtype=torch.float32))
        self.to_calls = []
        self.cpu_calls = 0
        self.forward_calls = []

    def to(self, *args, **kwargs):
        self.to_calls.append((args, kwargs))
        return super().to(*args, **kwargs)

    def cpu(self):
        self.cpu_calls += 1
        return super().cpu()

    def forward(self, tensor):
        self.forward_calls.append(
            {
                "shape": tuple(tensor.shape),
                "dtype": tensor.dtype,
                "device": tensor.device,
            }
        )
        return tensor * self.scale


class _FakeModelPatcher:
    def __init__(self, model, *, load_device=torch.device("cpu")):
        self.model = model
        self.load_device = load_device
        self.model_dtype_calls = 0

    def model_dtype(self):
        self.model_dtype_calls += 1
        return torch.float32


class _IdentityStatistics:
    def un_normalize(self, tensor):
        return tensor

    def normalize(self, tensor):
        return tensor


class _FakeModelManagement:
    def __init__(self, *, raw_model_bytes=128):
        self.raw_model_bytes = raw_model_bytes
        self.get_device_calls = 0
        self.module_size_calls = []
        self.free_memory_calls = []
        self.load_models_gpu_calls = []

    def get_torch_device(self):
        self.get_device_calls += 1
        return torch.device("cpu")

    def intermediate_device(self):
        return torch.device("cpu")

    def module_size(self, model):
        self.module_size_calls.append(model)
        return self.raw_model_bytes

    def free_memory(self, memory_required, device):
        self.free_memory_calls.append((memory_required, device))

    def load_models_gpu(self, models, *, memory_required):
        self.load_models_gpu_calls.append((list(models), memory_required))


def _vae_with_identity_statistics():
    return types.SimpleNamespace(
        first_stage_model=types.SimpleNamespace(
            per_channel_statistics=_IdentityStatistics()
        )
    )


def _run_upscaler(monkeypatch, upscale_model, model_management):
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_model_patcher",
        lambda: types.SimpleNamespace(ModelPatcher=_FakeModelPatcher),
    )
    monkeypatch.setattr(
        "deno_ltx_tiled_nodes._comfy_model_management",
        lambda: model_management,
    )
    source = torch.arange(32, dtype=torch.float32).reshape((1, 2, 1, 4, 4))
    result, = DenoLTXTiledSpatialUpscaler().upscale(
        {
            "samples": source,
            "noise_mask": torch.ones_like(source),
            "workflow_tag": "contract-test",
        },
        upscale_model,
        _vae_with_identity_statistics(),
        horizontal_tiles=1,
        vertical_tiles=1,
        overlap=1,
        aggressive_memory_cleanup=False,
    )
    assert torch.equal(result["samples"], source)
    assert "noise_mask" not in result
    assert result["workflow_tag"] == "contract-test"
    return source, result


def test_tiled_upscaler_uses_model_patcher_lifecycle_without_treating_it_as_module(
    monkeypatch,
):
    inner_model = _RecordingUpscaleModel()
    patcher = _FakeModelPatcher(inner_model)
    model_management = _FakeModelManagement()

    source, _ = _run_upscaler(monkeypatch, patcher, model_management)

    activation_bytes = source.numel() * UPSCALER_MEMORY_BYTES_PER_TILE_ELEMENT
    assert not hasattr(patcher, "parameters")
    assert patcher.model_dtype_calls == 1
    assert model_management.get_device_calls == 0
    assert model_management.module_size_calls == []
    assert model_management.free_memory_calls == []
    assert model_management.load_models_gpu_calls == [([patcher], activation_bytes)]
    assert len(inner_model.forward_calls) == 1
    assert inner_model.forward_calls[0]["device"] == patcher.load_device
    # Another legacy test intentionally re-imports torch in-process; compare
    # the stable dtype name so this lifecycle assertion remains order-safe.
    assert str(inner_model.forward_calls[0]["dtype"]) == str(torch.float32)
    assert inner_model.to_calls == []
    assert inner_model.cpu_calls == 0


def test_tiled_upscaler_preserves_raw_nn_module_fallback_lifecycle(monkeypatch):
    raw_model = _RecordingUpscaleModel()
    model_management = _FakeModelManagement(raw_model_bytes=256)

    source, _ = _run_upscaler(monkeypatch, raw_model, model_management)

    activation_bytes = source.numel() * UPSCALER_MEMORY_BYTES_PER_TILE_ELEMENT
    assert model_management.get_device_calls == 1
    assert model_management.module_size_calls == [raw_model]
    assert model_management.free_memory_calls == [
        (256 + activation_bytes, torch.device("cpu"))
    ]
    assert model_management.load_models_gpu_calls == []
    assert len(raw_model.forward_calls) == 1
    assert raw_model.forward_calls[0]["dtype"] == raw_model.scale.dtype
    assert len(raw_model.to_calls) == 1
    assert raw_model.cpu_calls == 1
