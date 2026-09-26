"""Lightweight, on-demand resource telemetry for the DENO top bar.

The metric selection follows the useful part of ComfyUI-Crystools' monitor
(CPU, RAM, GPU, VRAM, and GPU temperature), while deliberately avoiding its
always-running broadcast thread.  See THIRD_PARTY_NOTICES.md.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from typing import Any, Optional


_ROUTE_REGISTERED = False
_SAMPLER = None
_UNSET = object()


def _number(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _integer(value: Any) -> Optional[int]:
    number = _number(value)
    return None if number is None else int(number)


def _decode_text(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value or "")


class DenoResourceSampler:
    """Collect one resource snapshot only when the frontend asks for it."""

    def __init__(self, psutil_module=_UNSET, nvml_module=_UNSET):
        self._lock = threading.Lock()
        self._psutil = self._load_psutil() if psutil_module is _UNSET else psutil_module
        self._nvml = self._load_nvml() if nvml_module is _UNSET else nvml_module
        self._nvml_ready = False
        self._nvml_attempted = False
        self._nvml_warning_logged = False

        # psutil documents the first non-blocking cpu_percent() result as a
        # meaningless baseline. Prime it without delaying ComfyUI startup.
        if self._psutil is not None:
            try:
                self._psutil.cpu_percent(interval=None)
            except Exception:
                pass

    @staticmethod
    def _load_psutil():
        try:
            import psutil

            return psutil
        except Exception as exc:
            logging.warning("[DENO] Resource Monitor CPU/RAM metrics unavailable: %s", exc)
            return None

    @staticmethod
    def _load_nvml():
        try:
            import pynvml

            return pynvml
        except Exception as exc:
            logging.warning("[DENO] Resource Monitor NVIDIA metrics unavailable: %s", exc)
            return None

    def _ensure_nvml(self) -> bool:
        if self._nvml_ready:
            return True
        if self._nvml_attempted or self._nvml is None:
            return False

        self._nvml_attempted = True
        try:
            self._nvml.nvmlInit()
            self._nvml_ready = True
        except Exception as exc:
            if not self._nvml_warning_logged:
                logging.warning("[DENO] Resource Monitor could not initialize NVML: %s", exc)
                self._nvml_warning_logged = True
        return self._nvml_ready

    def _cpu_ram(self):
        result = {
            "cpu_percent": None,
            "ram_total": None,
            "ram_used": None,
            "ram_percent": None,
        }
        if self._psutil is None:
            return result

        try:
            result["cpu_percent"] = _number(self._psutil.cpu_percent(interval=None))
        except Exception:
            pass

        try:
            memory = self._psutil.virtual_memory()
            result.update({
                "ram_total": _integer(getattr(memory, "total", None)),
                "ram_used": _integer(getattr(memory, "used", None)),
                "ram_percent": _number(getattr(memory, "percent", None)),
            })
        except Exception:
            pass
        return result

    def _gpu_field(self, method_name, *args):
        try:
            method = getattr(self._nvml, method_name)
            return method(*args)
        except Exception:
            return None

    def _gpus(self):
        if not self._ensure_nvml():
            return []

        try:
            count = int(self._nvml.nvmlDeviceGetCount())
        except Exception:
            return []

        result = []
        for index in range(max(0, count)):
            try:
                handle = self._nvml.nvmlDeviceGetHandleByIndex(index)
            except Exception:
                continue

            name = _decode_text(self._gpu_field("nvmlDeviceGetName", handle))
            utilization = self._gpu_field("nvmlDeviceGetUtilizationRates", handle)
            memory = self._gpu_field("nvmlDeviceGetMemoryInfo", handle)
            temperature = self._gpu_field(
                "nvmlDeviceGetTemperature",
                handle,
                getattr(self._nvml, "NVML_TEMPERATURE_GPU", 0),
            )

            total = _integer(getattr(memory, "total", None))
            used = _integer(getattr(memory, "used", None))
            percent = None
            if total and used is not None:
                percent = (used / total) * 100.0

            result.append({
                "index": index,
                "name": name or f"GPU {index}",
                "gpu_percent": _number(getattr(utilization, "gpu", None)),
                "vram_total": total,
                "vram_used": used,
                "vram_percent": percent,
                "temperature": _number(temperature),
            })
        return result

    def sample(self):
        # aiohttp can dispatch overlapping requests from multiple open tabs.
        # Serializing the tiny NVML snapshot keeps vendor bindings predictable.
        with self._lock:
            snapshot = self._cpu_ram()
            snapshot.update({
                "ok": True,
                "sampled_at": int(time.time() * 1000),
                "gpus": self._gpus(),
            })
            return snapshot


def get_resource_snapshot():
    global _SAMPLER
    if _SAMPLER is None:
        _SAMPLER = DenoResourceSampler()
    return _SAMPLER.sample()


def register_deno_resource_monitor_routes():
    global _ROUTE_REGISTERED
    if _ROUTE_REGISTERED:
        return

    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return

    routes = getattr(getattr(PromptServer, "instance", None), "routes", None)
    if routes is None:
        return

    @routes.get("/deno/resource-monitor")
    async def deno_resource_monitor(_request):
        response = web.json_response(get_resource_snapshot())
        response.headers["Cache-Control"] = "no-store"
        return response

    _ROUTE_REGISTERED = True
