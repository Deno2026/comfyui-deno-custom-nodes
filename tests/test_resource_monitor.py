from pathlib import Path

import deno_resource_monitor


REPO_ROOT = Path(__file__).resolve().parents[1]


class _Memory:
    total = 128 * 1024**3
    used = 64 * 1024**3
    percent = 50.0


class _Psutil:
    def __init__(self):
        self.cpu_calls = 0

    def cpu_percent(self, interval=None):
        assert interval is None
        self.cpu_calls += 1
        return 37.5

    @staticmethod
    def virtual_memory():
        return _Memory()


class _GpuMemory:
    total = 96 * 1024**3
    used = 24 * 1024**3


class _GpuUtilization:
    gpu = 42


class _Nvml:
    NVML_TEMPERATURE_GPU = 0

    def __init__(self):
        self.init_calls = 0

    def nvmlInit(self):
        self.init_calls += 1

    @staticmethod
    def nvmlDeviceGetCount():
        return 1

    @staticmethod
    def nvmlDeviceGetHandleByIndex(index):
        return f"gpu-{index}"

    @staticmethod
    def nvmlDeviceGetName(_handle):
        return b"Test GPU"

    @staticmethod
    def nvmlDeviceGetUtilizationRates(_handle):
        return _GpuUtilization()

    @staticmethod
    def nvmlDeviceGetMemoryInfo(_handle):
        return _GpuMemory()

    @staticmethod
    def nvmlDeviceGetTemperature(_handle, sensor):
        assert sensor == 0
        return 55


def test_resource_sampler_collects_expected_metrics_on_demand():
    psutil = _Psutil()
    nvml = _Nvml()
    sampler = deno_resource_monitor.DenoResourceSampler(psutil, nvml)

    snapshot = sampler.sample()

    assert snapshot["ok"] is True
    assert snapshot["cpu_percent"] == 37.5
    assert snapshot["ram_total"] == 128 * 1024**3
    assert snapshot["ram_used"] == 64 * 1024**3
    assert snapshot["ram_percent"] == 50.0
    assert snapshot["gpus"] == [{
        "index": 0,
        "name": "Test GPU",
        "gpu_percent": 42.0,
        "vram_total": 96 * 1024**3,
        "vram_used": 24 * 1024**3,
        "vram_percent": 25.0,
        "temperature": 55.0,
    }]
    assert nvml.init_calls == 1

    sampler.sample()
    assert nvml.init_calls == 1
    assert psutil.cpu_calls == 3  # one prime plus two real samples


class _BrokenNvml:
    @staticmethod
    def nvmlInit():
        raise RuntimeError("NVML unavailable")


def test_resource_sampler_keeps_cpu_ram_when_nvml_is_unavailable():
    sampler = deno_resource_monitor.DenoResourceSampler(_Psutil(), _BrokenNvml())

    snapshot = sampler.sample()

    assert snapshot["cpu_percent"] == 37.5
    assert snapshot["ram_percent"] == 50.0
    assert snapshot["gpus"] == []


def test_resource_monitor_frontend_coexists_with_crystools_by_default():
    script = (REPO_ROOT / "web" / "js" / "deno_resource_monitor.js").read_text(encoding="utf-8")

    assert 'const MODE_AUTO = "Auto";' in script
    assert 'defaultValue: MODE_AUTO' in script
    assert 'api.fetchApi("/extensions"' in script
    assert 'crystools-monitors-root' in script
    assert 'if (!crystools.known || crystools.loaded)' in script
    assert 'destroyMonitor();' in script
    assert 'api.fetchApi("/deno/resource-monitor"' in script
    assert 'document.visibilityState === "hidden"' in script
    assert 'JSON.stringify({ unload_models: true, free_memory: true })' in script
    assert 'api.fetchApi("/queue"' in script
    assert 'Comfy.Memory.AllowManualUnload' in script
    assert 'mdi mdi-vacuum-outline' in script


def test_resource_monitor_has_no_permanent_backend_broadcast_thread():
    source = (REPO_ROOT / "deno_resource_monitor.py").read_text(encoding="utf-8")

    assert "send_sync" not in source
    assert "while True" not in source
    assert "Thread(" not in source
    assert '@routes.get("/deno/resource-monitor")' in source


def test_resource_monitor_registration_and_notice_are_packaged():
    init_source = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")
    notice = (REPO_ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

    assert "register_deno_resource_monitor_routes" in init_source
    assert "Copyright (c) 2023 Crystian" in notice
    assert "MIT License" in notice
