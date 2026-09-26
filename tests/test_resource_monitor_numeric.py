import json
from types import SimpleNamespace

import pytest

import deno_resource_monitor


@pytest.mark.parametrize(
    "value",
    [float("nan"), float("inf"), float("-inf"), "Infinity", 10**1000],
    ids=["nan", "positive-infinity", "negative-infinity", "infinity-text", "overflow"],
)
def test_nonfinite_metrics_become_unavailable(value):
    assert deno_resource_monitor._number(value) is None
    assert deno_resource_monitor._integer(value) is None


def test_corrupt_gpu_metrics_preserve_other_metrics_and_valid_json():
    psutil = SimpleNamespace(
        cpu_percent=lambda interval=None: float("inf"),
        virtual_memory=lambda: SimpleNamespace(total=4096, used=1024, percent=25),
    )
    nvml = SimpleNamespace(
        nvmlInit=lambda: None,
        nvmlDeviceGetCount=lambda: 2,
        nvmlDeviceGetHandleByIndex=lambda index: index,
        nvmlDeviceGetName=lambda handle: f"GPU {handle}",
        nvmlDeviceGetUtilizationRates=lambda handle: SimpleNamespace(
            gpu=float("nan") if handle == 0 else 40,
        ),
        nvmlDeviceGetMemoryInfo=lambda handle: SimpleNamespace(
            total=float("inf") if handle == 0 else 1024,
            used=256,
        ),
        nvmlDeviceGetTemperature=lambda handle, _sensor: float("-inf") if handle == 0 else 55,
    )

    snapshot = deno_resource_monitor.DenoResourceSampler(psutil, nvml).sample()

    assert snapshot["ok"] is True
    assert snapshot["cpu_percent"] is None
    assert snapshot["ram_percent"] == 25
    assert snapshot["gpus"][0] == {
        "index": 0,
        "name": "GPU 0",
        "gpu_percent": None,
        "vram_total": None,
        "vram_used": 256,
        "vram_percent": None,
        "temperature": None,
    }
    assert snapshot["gpus"][1] == {
        "index": 1,
        "name": "GPU 1",
        "gpu_percent": 40,
        "vram_total": 1024,
        "vram_used": 256,
        "vram_percent": 25,
        "temperature": 55,
    }
    assert json.loads(json.dumps(snapshot, allow_nan=False)) == snapshot
