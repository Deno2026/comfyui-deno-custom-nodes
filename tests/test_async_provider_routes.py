"""Slow provider I/O must leave ComfyUI's event loop available."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import sys
import threading

import pytest

from test_image_resize_node import load_package


@pytest.mark.parametrize("route", ["models", "unload", "translate"])
@pytest.mark.parametrize("fail", [False, True])
def test_provider_routes_run_blocking_calls_off_the_event_loop(monkeypatch, route, fail):
    package = load_package()
    refiner = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    director = sys.modules[f"{package.__name__}.deno_ideogram_director"]
    started = threading.Event()
    release = threading.Event()
    calls = []
    loop_thread = threading.get_ident()

    def provider(*args):
        calls.append((threading.get_ident(), args))
        started.set()
        assert release.wait(2), "provider blocked the event loop"
        if fail:
            raise RuntimeError("provider unavailable")
        return {
            "models": [{"id": "test-model"}],
            "unload": {"ok": True},
            "translate": ({"high_level_description": "translated"}, 1, 1, "English"),
        }[route]

    response = lambda payload, status=200: (status, payload)
    monkeypatch.setattr(refiner, "_json_response", response)
    monkeypatch.setattr(director.web, "json_response", response)
    if route == "models":
        monkeypatch.setattr(refiner, "list_local_llm_models", provider)
        handler = refiner._handle_list_models
    elif route == "unload":
        monkeypatch.setattr(refiner, "unload_local_llm_model", provider)
        handler = refiner._handle_unload_model
    else:
        monkeypatch.setattr(director, "_translate_caption_for_view", provider)
        handler = director._deno_ideogram_director_translate_caption

    class Request:
        async def json(self):
            return {
                "provider": "Ollama", "server_url": "http://127.0.0.1:11434",
                "model": "test-model", "caption": {"high_level_description": "원문"},
                "target": "English", "purpose": "queue_preflight",
            }

    async def run():
        task = asyncio.create_task(handler(Request()))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            # This callback must run while the provider is still waiting.
            await asyncio.sleep(0)
            assert not task.done()
            assert calls[0][0] != loop_thread
        finally:
            release.set()
        return await task

    status, payload = asyncio.run(run())
    if fail:
        assert status == (502 if route == "translate" else 400)
        assert payload["error"]
    else:
        assert status == 200
        if route == "models":
            assert payload["models"] == [{"id": "test-model"}]
        elif route == "unload":
            assert payload == {"ok": True}
        else:
            assert payload["caption"] == {"high_level_description": "translated"}
            assert calls[0][1][-2:] == (5.0, 1)


def test_translation_cache_remains_bounded_under_concurrent_routes(monkeypatch):
    package = load_package()
    engine = sys.modules[f"{package.__name__}.deno_translate_engine"]
    monkeypatch.setattr(engine, "_CACHE_LIMIT", 4)

    def exercise(worker):
        for index in range(200):
            key = (worker + index) % 8
            engine._cache_set(key, str(key))
            value = engine._cache_get(key)
            assert value is None or value == str(key)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(exercise, range(8)))
    assert len(engine._CACHE) <= 4
