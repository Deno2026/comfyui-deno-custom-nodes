import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from test_image_resize_node import load_package


REPO_ROOT = Path(__file__).resolve().parents[1]


def _refine_kwargs(prompts):
    return {
        "provider": "Ollama",
        "ollama_model": "qwen3",
        "lm_studio_model": "google/gemma",
        "custom_server_url": "http://127.0.0.1:8000/v1",
        "custom_model": "custom-model",
        "system_prompt": "",
        "prompt": prompts,
        "thinking": False,
        "seed": 7,
        "seed_mode": "fixed",
        "model_memory": "Unload after run",
        "keep_minutes": 5,
        "comfy_vram_policy": "Never unload before LLM call",
        "unique_id": "cleanup-node",
    }


@pytest.mark.parametrize(
    "error_message",
    [
        "mid-batch generation failed",
        "Local LLM generation stopped.",
    ],
)
def test_local_llm_unload_after_run_cleans_aborted_mid_batch_without_masking_error(monkeypatch, error_message):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    calls = []
    unload_calls = []
    events = []
    original_error = RuntimeError(error_message)

    monkeypatch.setattr(module, "_send_progress", lambda payload: events.append(dict(payload)))
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    def run_single(**kwargs):
        calls.append(kwargs)
        if len(calls) == 2:
            raise original_error
        return "first answer", "", {}

    def fail_cleanup(provider, server_url, model):
        unload_calls.append((provider, server_url, model))
        raise RuntimeError("cleanup endpoint failed")

    monkeypatch.setattr(node, "_run_single", run_single)
    monkeypatch.setattr(module, "unload_local_llm_model", fail_cleanup)

    with pytest.raises(RuntimeError) as raised:
        node.refine(**_refine_kwargs(["first", "second", "third"]))

    assert raised.value is original_error
    assert [call["is_last"] for call in calls] == [False, False]
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]
    assert events[-1]["status"] == "error"
    assert events[-1]["error"] == error_message


def test_local_llm_terminal_preflight_failure_runs_fallback_cleanup_once(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("terminal request failed")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(node, "_run_single", lambda **_kwargs: (_ for _ in ()).throw(original_error))
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs.update({
        "provider": "vLLM",
        "custom_server_url": "http://127.0.0.1:8000/v1",
        "custom_model": "qwen3",
    })
    with pytest.raises(RuntimeError) as raised:
        node.refine(**kwargs)

    assert raised.value is original_error
    assert unload_calls == [("vLLM", "http://127.0.0.1:8000/v1", "qwen3")]


def test_local_llm_terminal_provider_cleanup_is_not_duplicated(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("terminal stream failed after provider cleanup")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})

    def fail_after_provider_cleanup(**kwargs):
        kwargs["cleanup_state"]["provider_cleanup_attempted"] = True
        raise original_error

    monkeypatch.setattr(node, "_run_single", fail_after_provider_cleanup)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs.update({"provider": "LM Studio", "lm_studio_model": "google/gemma"})
    with pytest.raises(RuntimeError) as raised:
        node.refine(**kwargs)

    assert raised.value is original_error
    assert unload_calls == []


def test_local_llm_lm_studio_terminal_stream_failure_runs_one_provider_cleanup(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("Local LLM generation stopped.")

    def fail_stream(*_args, **_kwargs):
        yield "chat.start", {"type": "chat.start"}
        raise original_error

    monkeypatch.setattr(module, "_http_stream_sse", fail_stream)
    monkeypatch.setattr(
        node,
        "_lm_unload_best_effort",
        lambda native_base, model: unload_calls.append((native_base, model)),
    )

    with pytest.raises(RuntimeError) as raised:
        node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma",
            system_prompt="",
            prompt="hello",
            thinking=True,
            seed=7,
            model_memory="Unload after run",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="cleanup-node",
            index=1,
            total=1,
        )

    assert raised.value is original_error
    assert unload_calls == [("http://127.0.0.1:1234", "google/gemma")]


def test_local_llm_ollama_terminal_failure_uses_explicit_cleanup_once(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    original_error = RuntimeError("Ollama stream stopped before completion")

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(node, "_run_single", lambda **_kwargs: (_ for _ in ()).throw(original_error))
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    with pytest.raises(RuntimeError) as raised:
        node.refine(**_refine_kwargs(["only prompt"]))

    assert raised.value is original_error
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]


def test_local_llm_ollama_completed_terminal_request_does_not_unload_twice_on_postprocess_error(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    def completed_provider_request(**kwargs):
        kwargs["cleanup_state"]["provider_cleanup_attempted"] = True
        return "answer", "", {}

    monkeypatch.setattr(node, "_run_single", completed_provider_request)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs["thinking"] = True
    with pytest.raises(RuntimeError, match="no Thinking/reasoning content"):
        node.refine(**kwargs)

    # The completed final Ollama request already used keep_alive=0. The
    # post-processing error must not trigger a second explicit unload call.
    assert unload_calls == []


def test_local_llm_ollama_continuation_failure_before_response_runs_explicit_cleanup_once(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    stream_calls = 0
    original_error = RuntimeError("continuation connection failed")

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        nonlocal stream_calls
        stream_calls += 1
        if stream_calls == 1:
            yield {"message": {"thinking": "unfinished reasoning"}, "done": False}
            yield {"done": True, "done_reason": "length", "prompt_eval_count": 10, "eval_count": 20}
            return
        raise original_error
        yield  # pragma: no cover - keep this function a generator

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_http_stream_json_lines", fake_stream)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs["thinking"] = True
    with pytest.raises(RuntimeError) as raised:
        node.refine(**kwargs)

    assert raised.value is original_error
    assert stream_calls == 2
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]


def test_local_llm_ollama_stop_between_thinking_and_continuation_does_not_start_retry(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    stream_calls = 0

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        nonlocal stream_calls
        stream_calls += 1
        yield {"message": {"thinking": "unfinished reasoning"}, "done": False}
        yield {"done": True, "done_reason": "length", "prompt_eval_count": 10, "eval_count": 20}
        module._CANCEL_LOCAL_LLM_KEYS.add(cancel_key)

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_http_stream_json_lines", fake_stream)
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["only prompt"])
    kwargs["thinking"] = True
    with pytest.raises(Exception, match="Local LLM generation stopped"):
        node.refine(**kwargs)

    assert stream_calls == 1
    assert unload_calls == [("Ollama", "http://127.0.0.1:11434", "qwen3")]


@pytest.mark.parametrize("recover_prompt_index", [0, 1])
def test_local_llm_ollama_continuation_preserves_batch_order_and_one_terminal_unload(
    monkeypatch,
    recover_prompt_index,
):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []
    explicit_unload_calls = []
    fallback_unload_calls = []
    prompt_attempts = {"first prompt": 0, "second prompt": 0}

    def fake_stream(url, payload, timeout=600.0, cancel_key=None):
        stream_payloads.append(payload)
        original_prompt = next(
            message["content"]
            for message in payload["messages"]
            if message.get("role") == "user"
        )
        prompt_attempts[original_prompt] += 1
        prompt_index = 0 if original_prompt == "first prompt" else 1
        if prompt_index == recover_prompt_index and payload["think"] is True:
            yield {"message": {"thinking": f"reasoning {prompt_index}"}, "done": False}
            yield {"done": True, "done_reason": "length", "prompt_eval_count": 10, "eval_count": 20}
            return
        yield {
            "message": {
                "thinking": "" if payload["think"] is False else f"reasoning {prompt_index}",
                "content": f"final {prompt_index}",
            },
            "done": False,
        }
        yield {"done": True, "done_reason": "stop", "prompt_eval_count": 11, "eval_count": 12}

    monkeypatch.setattr(module, "_send_progress", lambda _payload: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_http_stream_json_lines", fake_stream)
    monkeypatch.setattr(module, "_ensure_ollama_model_stays_loaded", lambda **_kwargs: {"checked": False})
    monkeypatch.setattr(
        module,
        "_ollama_unload_best_effort",
        lambda base, model: explicit_unload_calls.append((base, model)),
    )
    monkeypatch.setattr(
        module,
        "unload_local_llm_model",
        lambda *args: fallback_unload_calls.append(args) or {"ok": True},
    )

    kwargs = _refine_kwargs(["first prompt", "second prompt"])
    kwargs["thinking"] = True
    result = node.refine(**kwargs)

    assert result["result"][0] == ["final 0", "final 1"]
    assert prompt_attempts == {
        "first prompt": 2 if recover_prompt_index == 0 else 1,
        "second prompt": 2 if recover_prompt_index == 1 else 1,
    }
    terminal_keep_alive_count = sum(
        payload["keep_alive"] in (0, "0", "0m", "0s")
        for payload in stream_payloads
    )
    assert terminal_keep_alive_count + len(explicit_unload_calls) == 1
    assert fallback_unload_calls == []


def test_llama_swap_running_parser_matches_official_management_shape():
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]

    payload = {
        "running": [
            {
                "model": "models/Qwen3-8B",
                "state": "ready",
                "cmd": "llama-server --model qwen.gguf",
                "proxy": "http://127.0.0.1:12001",
                "ttl": 300,
                "name": "Qwen 3 8B",
                "description": "test model",
            },
            {
                "model": "models/starting-model",
                "state": "starting",
                "cmd": "llama-server --model starting.gguf",
                "proxy": "http://127.0.0.1:12002",
                "ttl": 300,
                "name": "",
                "description": "",
            },
        ]
    }

    assert module._llama_swap_running_model_ids(payload) == {
        "models/Qwen3-8B",
        "models/starting-model",
    }


def test_llama_swap_model_list_marks_loaded_models_from_running_endpoint(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    calls = []

    def fake_http_json(url, *args, **kwargs):
        calls.append(url)
        if url.endswith("/v1/models"):
            return {
                "object": "list",
                "data": [
                    {"id": "models/Qwen3-8B", "object": "model"},
                    {
                        "id": "qwen-default",
                        "object": "model",
                        "meta": {
                            "llamaswap": {
                                "type": "alias",
                                "modelID": "models/Qwen3-8B",
                            }
                        },
                    },
                    {"id": "models/Gemma-4B", "object": "model"},
                ],
            }
        if url.endswith("/running"):
            return {
                "running": [
                    {
                        "model": "models/Qwen3-8B",
                        "state": "ready",
                        "cmd": "",
                        "proxy": "",
                        "ttl": 300,
                        "name": "",
                        "description": "",
                    }
                ]
            }
        raise AssertionError(f"unexpected llama-swap URL: {url}")

    monkeypatch.setattr(module, "_http_json", fake_http_json)

    models = module.list_local_llm_models(
        module.PROVIDER_LLAMA_SWAP,
        "http://127.0.0.1:8000/v1",
    )

    assert calls == [
        "http://127.0.0.1:8000/v1/models",
        "http://127.0.0.1:8000/running",
    ]
    assert models == [
        {
            "id": "models/Qwen3-8B",
            "label": "models/Qwen3-8B",
            "loaded": True,
        },
        {
            "id": "qwen-default",
            "label": "qwen-default",
            "loaded": True,
        },
        {
            "id": "models/Gemma-4B",
            "label": "models/Gemma-4B",
            "loaded": False,
        },
    ]
    assert module._llama_swap_is_model_loaded(
        "http://127.0.0.1:8000",
        "qwen-default",
    ) is True
    assert calls[-1] == "http://127.0.0.1:8000/running"


def test_llama_swap_unload_accepts_plaintext_success_and_preserves_model_path(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    requests = []

    class FakeResponse:
        status = 200

        @staticmethod
        def read():
            return b"OK"

    class FakeConnection:
        def request(self, method, path, headers=None):
            requests.append((method, path, headers))

        @staticmethod
        def getresponse():
            return FakeResponse()

        @staticmethod
        def close():
            return None

    monkeypatch.setattr(
        module,
        "_open_local_llm_http_connection",
        lambda _parsed, timeout: FakeConnection(),
    )
    module._ACTIVE_LOCAL_LLM_KEYS.clear()
    module._CANCEL_LOCAL_LLM_KEYS.clear()

    result = module.unload_local_llm_model(
        module.PROVIDER_LLAMA_SWAP,
        "http://127.0.0.1:8000/v1",
        "team/Qwen 3#8B",
    )

    assert result["ok"] is True
    assert requests == [
        (
            "POST",
            "/api/models/unload/team/Qwen%203%238B",
            {"Accept": "*/*"},
        )
    ]


@pytest.mark.parametrize(
    ("model_memory", "stream_error", "expected_unloads"),
    [
        ("Unload after run", False, 1),
        ("Unload after run", True, 1),
        ("Keep loaded", False, 0),
    ],
)
def test_llama_swap_terminal_request_cleanup_occurs_exactly_once(
    monkeypatch,
    model_memory,
    stream_error,
    expected_unloads,
):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    unload_calls = []
    cleanup_state = {"provider_cleanup_attempted": False}

    def fake_stream(*_args, **_kwargs):
        if stream_error:
            raise RuntimeError("llama-swap stream failed")
        yield "message", {
            "choices": [
                {
                    "delta": {"content": "final answer"},
                    "finish_reason": "stop",
                }
            ]
        }

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(
        module,
        "_llama_swap_unload",
        lambda server_root, model: unload_calls.append((server_root, model)),
    )

    kwargs = {
        "provider": module.PROVIDER_LLAMA_SWAP,
        "server_url": "http://127.0.0.1:8000/v1",
        "model": "models/Qwen3-8B",
        "system_prompt": "",
        "prompt": "hello",
        "thinking": False,
        "seed": 7,
        "model_memory": model_memory,
        "keep_minutes": 5,
        "image_attachments": [],
        "is_last": True,
        "node_id": "llama-swap-cleanup",
        "index": 1,
        "total": 1,
        "cleanup_state": cleanup_state,
    }
    if stream_error:
        with pytest.raises(RuntimeError, match="llama-swap stream failed"):
            node._run_openai_compatible(**kwargs)
    else:
        answer, _thinking, raw = node._run_openai_compatible(**kwargs)
        assert answer == "final answer"
        assert raw["provider"] == module.PROVIDER_LLAMA_SWAP

    assert unload_calls == [
        ("http://127.0.0.1:8000", "models/Qwen3-8B")
    ] * expected_unloads
    assert cleanup_state["provider_cleanup_attempted"] is bool(expected_unloads)


def test_lm_studio_keep_loaded_runs_do_not_query_model_list_during_generation(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    model_list_calls = []
    stream_payloads = []

    with module._LM_STUDIO_MODELS_CACHE_LOCK:
        module._LM_STUDIO_MODELS_CACHE.clear()

    def fake_http_json(url, *_args, **_kwargs):
        if url.endswith("/api/v1/models"):
            model_list_calls.append(url)
            raise AssertionError("generation must not synchronously query LM Studio's model list")
        raise AssertionError(f"unexpected non-stream request: {url}")

    def fake_stream(_url, payload, **_kwargs):
        stream_payloads.append(dict(payload))
        yield "message.delta", {"type": "message.delta", "content": "ready"}
        yield "chat.end", {"type": "chat.end"}

    monkeypatch.setattr(module, "_http_json", fake_http_json)
    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    for _ in range(2):
        answer, _thinking, raw = node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma",
            system_prompt="",
            prompt="hello",
            thinking=False,
            seed=7,
            model_memory="Keep loaded",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="lm-studio-no-list-preflight",
            index=1,
            total=1,
        )
        assert answer == "ready"
        assert raw["reasoning"] == "off"
        assert raw["reasoning_requested"] == "off"
        assert raw["reasoning_compat_fallback"] is False

    assert model_list_calls == []
    assert [payload["reasoning"] for payload in stream_payloads] == ["off", "off"]


def test_lm_studio_retries_once_without_reasoning_only_when_off_is_explicitly_unsupported(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    with module._LM_STUDIO_MODELS_CACHE_LOCK:
        module._LM_STUDIO_MODELS_CACHE.clear()

    def fake_stream(_url, payload, **_kwargs):
        stream_payloads.append(dict(payload))
        if len(stream_payloads) == 1:
            raise RuntimeError("This model does not support the reasoning setting 'off'.")
        yield "message.delta", {"type": "message.delta", "content": "ready"}
        yield "chat.end", {"type": "chat.end"}

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    answer, thought, raw = node._run_lm_studio(
        server_url="http://127.0.0.1:1234/v1",
        model="local/non-reasoning-model",
        system_prompt="",
        prompt="hello",
        thinking=False,
        seed=7,
        model_memory="Keep loaded",
        keep_minutes=5,
        image_attachments=[],
        is_last=True,
        node_id="lm-studio-reasoning-compat",
        index=1,
        total=1,
    )

    assert answer == "ready"
    assert thought == ""
    assert stream_payloads[0]["reasoning"] == "off"
    assert "reasoning" not in stream_payloads[1]
    assert raw["reasoning"] is None
    assert raw["reasoning_requested"] == "off"
    assert raw["reasoning_compat_fallback"] is True


@pytest.mark.parametrize(
    ("partial_output", "error_message"),
    [
        (False, "LM Studio connection failed"),
        (True, "This model does not support the reasoning setting 'off'."),
    ],
)
def test_lm_studio_does_not_retry_unrelated_or_partial_output_failures(
    monkeypatch,
    partial_output,
    error_message,
):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node = package.DenoLocalLLMRefiner()
    stream_payloads = []

    with module._LM_STUDIO_MODELS_CACHE_LOCK:
        module._LM_STUDIO_MODELS_CACHE.clear()

    def fake_stream(_url, payload, **_kwargs):
        stream_payloads.append(dict(payload))
        if partial_output:
            yield "message.delta", {"type": "message.delta", "content": "partial"}
        raise RuntimeError(error_message)

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)

    with pytest.raises(RuntimeError, match="reasoning setting|connection failed"):
        node._run_lm_studio(
            server_url="http://127.0.0.1:1234/v1",
            model="google/gemma",
            system_prompt="",
            prompt="hello",
            thinking=False,
            seed=7,
            model_memory="Keep loaded",
            keep_minutes=5,
            image_attachments=[],
            is_last=True,
            node_id="lm-studio-no-retry",
            index=1,
            total=1,
        )

    assert len(stream_payloads) == 1
    assert stream_payloads[0]["reasoning"] == "off"


def test_local_llm_input_types_never_queries_lm_studio_during_prompt_validation(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    node_cls = package.NODE_CLASS_MAPPINGS["DenoLocalLLMRefiner"]
    provider_calls = []

    with module._LM_STUDIO_MODELS_CACHE_LOCK:
        module._LM_STUDIO_MODELS_CACHE.clear()

    def fake_list_models(provider, _server_url):
        provider_calls.append(provider)
        if provider == module.PROVIDER_LM_STUDIO:
            raise AssertionError("INPUT_TYPES must not synchronously query LM Studio")
        return [{"id": "qwen3", "label": "qwen3", "loaded": False}]

    monkeypatch.setattr(module, "list_local_llm_models", fake_list_models)

    cold_input_types = node_cls.INPUT_TYPES()
    assert cold_input_types["required"]["lm_studio_model"][0] == [""]
    assert module.PROVIDER_LM_STUDIO not in provider_calls

    module._cache_lm_studio_models(
        module.LM_STUDIO_DEFAULT_SERVER,
        [{"id": "google/gemma", "label": "Gemma", "loaded": True}],
    )
    warm_input_types = node_cls.INPUT_TYPES()
    assert warm_input_types["required"]["lm_studio_model"][0] == ["google/gemma"]
    assert module.PROVIDER_LM_STUDIO not in provider_calls


@pytest.mark.parametrize(
    "review",
    [
        "NOT OK",
        "not approved",
        "cannot approve",
        "not a PASS",
        '{"verdict":"NOT OK","reason":"subject is missing"}',
        '{"status":"not approved","reason":"quality is too low"}',
    ],
)
def test_ai_review_gate_rejects_negated_approval_phrases(review):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    gate = package.DenoAIReviewGate()
    image = object()

    result = gate.gate(review=review, image=image)

    assert result["ui"]["deno_llm_gate"][0]["passed"] is False
    assert result["ui"]["deno_llm_gate"][0]["verdict"] == "FAIL"
    assert isinstance(result["result"][0], module.ExecutionBlocker)


def test_ai_review_gate_keeps_explicit_positive_and_manual_approval_paths():
    package = load_package()
    gate = package.DenoAIReviewGate()
    image = object()

    for review in ("OK", "PASS", "APPROVE", "APPROVED", "not only OK but excellent"):
        result = gate.gate(review=review, image=image)
        assert result["ui"]["deno_llm_gate"][0]["passed"] is True
        assert result["result"][0] is image

    manual_pass = gate.gate(review="NOT OK", review_mode="Pass", image=image)
    approve_once = gate.gate(review="cannot approve", approve_once=True, image=image)
    assert manual_pass["ui"]["deno_llm_gate"][0]["source"] == "Manual pass"
    assert manual_pass["result"][0] is image
    assert approve_once["ui"]["deno_llm_gate"][0]["source"] == "Approve once"
    assert approve_once["result"][0] is image


def test_ai_reviewer_snapshot_paths_are_workflow_scoped_and_legacy_state_still_loads(tmp_path):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    sys.modules["folder_paths"].get_temp_directory = lambda: str(tmp_path)
    gate_cls = package.NODE_CLASS_MAPPINGS["DenoAIReviewGate"]
    gate = package.DenoAIReviewGate()
    image = np.zeros((1, 4, 5, 3), dtype=np.float32)
    image[0, 1, 2, 0] = 0.75
    workflow_a = {"workflow": {"id": "11111111-1111-4111-8111-111111111111"}}
    workflow_b = {"workflow": {"id": "22222222-2222-4222-8222-222222222222"}}

    assert gate_cls.INPUT_TYPES()["hidden"] == {
        "unique_id": "UNIQUE_ID",
        "extra_pnginfo": "EXTRA_PNGINFO",
    }

    preview_a = module._stable_reviewer_preview_path("42", workflow_a)
    preview_a_again = module._stable_reviewer_preview_path("42", workflow_a)
    preview_b = module._stable_reviewer_preview_path("42", workflow_b)
    snapshot_a = module._stable_reviewer_snapshot_path("42", workflow_a)
    snapshot_b = module._stable_reviewer_snapshot_path("42", workflow_b)
    legacy_snapshot = module._stable_reviewer_snapshot_path("42")

    assert preview_a == preview_a_again
    assert preview_a[1] != preview_b[1]
    assert snapshot_a[1] != snapshot_b[1]
    assert legacy_snapshot[1] == "deno_llm_reviewer_42.npy"

    failed_a = gate.gate(review="FAIL", image=image, unique_id="42", extra_pnginfo=workflow_a)
    failed_b = gate.gate(review="FAIL", image=image, unique_id="42", extra_pnginfo=workflow_b)
    info_a = failed_a["ui"]["deno_llm_gate"][0]
    info_b = failed_b["ui"]["deno_llm_gate"][0]
    assert info_a["preview_image"]["filename"] != info_b["preview_image"]["filename"]
    assert info_a["snapshot_image"]["filename"] != info_b["snapshot_image"]["filename"]

    legacy_meta = module._save_reviewer_snapshot_image(image, "42")
    assert legacy_meta["filename"] == "deno_llm_reviewer_42.npy"
    approved = gate.gate(
        review="Approved once.",
        approve_once=True,
        image=None,
        reviewer_state=json.dumps({"snapshot_image": legacy_meta}),
        unique_id="42",
        extra_pnginfo=workflow_b,
    )
    restored = np.asarray(approved["result"][0])
    assert approved["ui"]["deno_llm_gate"][0]["passed"] is True
    assert restored.shape == image.shape
    assert np.isclose(restored[0, 1, 2, 0], 0.75)


def test_local_llm_frontend_async_actions_are_latest_wins():
    node = shutil.which("node")
    assert node, "node executable is required for the Local LLM async-action harness"

    result = subprocess.run(
        [node, str(REPO_ROOT / "tests" / "js" / "local_llm_async_action_harness.mjs")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"


def test_local_llm_system_prompt_presets_use_durable_user_data():
    node = shutil.which("node")
    assert node, "node executable is required for the Local LLM preset-storage harness"

    result = subprocess.run(
        [node, str(REPO_ROOT / "tests" / "js" / "local_llm_preset_storage_harness.mjs")],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"node harness failed:\n{result.stdout}\n{result.stderr}"
