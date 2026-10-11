import json
import sys

import pytest

from test_image_resize_node import load_package


GENERIC_ENV = "DENO_LOCAL_LLM_API_KEY"
LM_STUDIO_ENV = "DENO_LOCAL_LLM_LM_STUDIO_API_KEY"
UNSLOTH_ENV = "DENO_LOCAL_LLM_UNSLOTH_API_KEY"
SECRET = "synthetic-local-llm-auth-token"
GENERIC_PROVIDERS = ["llama.cpp", "vLLM", "Custom", "llama-swap"]
AUTH_PROVIDERS = ["LM Studio", *GENERIC_PROVIDERS]


@pytest.fixture
def llm(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    for name in (GENERIC_ENV, LM_STUDIO_ENV, UNSLOTH_ENV):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(module, "_send_progress", lambda _event: None)
    return module, package.DenoLocalLLMRefiner()


def _chat_kwargs():
    return {
        "server_url": "http://127.0.0.1:8000/v1",
        "model": "local-model",
        "system_prompt": "Keep the requested format.",
        "prompt": "Write the final answer.",
        "thinking": False,
        "seed": 7,
        "model_memory": "Keep loaded",
        "keep_minutes": 5,
        "image_attachments": [],
        "is_last": True,
        "node_id": "authentication-test-node",
        "index": 1,
        "total": 1,
    }


def _run_chat(node, provider, **overrides):
    kwargs = _chat_kwargs()
    kwargs.update(overrides)
    if provider == "LM Studio":
        return node._run_lm_studio(**kwargs)
    return node._run_openai_compatible(provider=provider, **kwargs)


def _finished_chunk(provider, answer="finished answer"):
    content = json.dumps({"deno_final_answer": answer}) if provider == "LM Studio" else answer
    return "message", {
        "choices": [{"delta": {"content": content}, "finish_reason": "stop"}]
    }


def _assert_transport_only(calls, result):
    assert calls
    for _url, payload, kwargs in calls:
        assert kwargs.get("headers") == {"Authorization": f"Bearer {SECRET}"}
        assert SECRET not in json.dumps(payload)
    assert SECRET not in json.dumps(result)


@pytest.mark.parametrize(
    ("provider", "generic", "dedicated", "expected"),
    [
        ("LM Studio", "generic-key", "dedicated-key", "dedicated-key"),
        ("LM Studio", " generic-key ", None, "generic-key"),
        ("LM Studio", "generic-key", " \t ", "generic-key"),
        ("LM Studio", " \t ", None, None),
        *[(provider, " generic-key ", "lm-only-key", "generic-key") for provider in GENERIC_PROVIDERS],
        ("Ollama", "generic-key", "lm-only-key", None),
    ],
)
def test_provider_headers_select_environment_key_without_cross_provider_leak(
    llm, monkeypatch, provider, generic, dedicated, expected
):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, generic)
    if dedicated is not None:
        monkeypatch.setenv(LM_STUDIO_ENV, dedicated)
    headers = (
        module._lm_studio_request_headers()
        if provider == "LM Studio"
        else module._openai_compatible_request_headers(provider)
    )
    assert headers == {"Authorization": f"Bearer {expected}"} if expected else not headers


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
def test_optional_authentication_preserves_servers_without_a_key(llm, provider):
    module, _node = llm
    headers = (
        module._lm_studio_request_headers()
        if provider == "LM Studio"
        else module._openai_compatible_request_headers(provider)
    )
    assert not headers


def test_unsloth_never_uses_the_generic_or_lm_studio_key(llm, monkeypatch):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    monkeypatch.setenv(LM_STUDIO_ENV, SECRET)
    with pytest.raises(RuntimeError, match=UNSLOTH_ENV):
        module._openai_compatible_request_headers("Unsloth")
    monkeypatch.setenv(UNSLOTH_ENV, " unsloth-only-key ")
    assert module._openai_compatible_request_headers("Unsloth") == {
        "Authorization": "Bearer unsloth-only-key"
    }


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
def test_model_list_authentication_is_transport_only(llm, monkeypatch, provider):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        if url.endswith("/running"):
            return {"running": [{"model": "local-model"}]}
        if provider == "LM Studio":
            return {"models": [{"key": "local-model", "type": "llm"}]}
        return {"data": [{"id": "local-model"}]}

    monkeypatch.setattr(module, "_http_json", fake_json)
    models = module.list_local_llm_models(provider, "http://127.0.0.1:8000/v1")
    assert models[0]["id"] == "local-model"
    if provider == "llama-swap":
        assert models[0]["loaded"] is True
        assert calls[1][0].endswith("/running")
    _assert_transport_only(calls, models)


def test_ollama_model_list_and_generation_do_not_send_generic_bearer(llm, monkeypatch):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        return {"models": [{"model": "local-model"}]}

    def fake_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        yield {"message": {"content": json.dumps({"deno_final_answer": "finished answer"})}, "done": False}
        yield {"done": True, "done_reason": "stop"}

    monkeypatch.setattr(module, "_http_json", fake_json)
    monkeypatch.setattr(module, "_http_stream_json_lines", fake_stream)
    models = module.list_local_llm_models("Ollama", "http://127.0.0.1:11434")
    result = node._run_ollama(**_chat_kwargs())
    assert result[0] == "finished answer"
    assert all(not call[2].get("headers") for call in calls)
    assert SECRET not in json.dumps([models, result, calls])


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
def test_chat_stream_authentication_does_not_enter_payload_result_or_progress(
    llm, monkeypatch, provider
):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls, progress = [], []

    def fake_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        yield _finished_chunk(provider)

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_send_progress", progress.append)
    result = _run_chat(node, provider)
    assert result[0] == "finished answer"
    _assert_transport_only(calls, [result, progress])


@pytest.mark.parametrize("provider", GENERIC_PROVIDERS)
def test_non_stream_diagnostic_request_reuses_generic_authentication(llm, monkeypatch, provider):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def empty_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        return iter(())

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        return {"choices": [{"message": {"content": "diagnostic answer"}}]}

    monkeypatch.setattr(module, "_http_stream_sse", empty_stream)
    monkeypatch.setattr(module, "_http_json", fake_json)
    result = _run_chat(node, provider)
    assert result[0] == "diagnostic answer"
    assert [call[1]["stream"] for call in calls] == [True, False]
    _assert_transport_only(calls, result)


@pytest.mark.parametrize("retry", ["reasoning", "finalization"])
def test_lm_studio_retries_preserve_auth_and_redact_persisted_error(llm, monkeypatch, retry):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, "unused-generic-key")
    monkeypatch.setenv(LM_STUDIO_ENV, SECRET)
    calls = []

    def fake_stream(url, payload, **kwargs):
        calls.append((url, dict(payload), kwargs))
        if len(calls) == 1:
            if retry == "reasoning":
                yield "message", {"error": {
                    "message": f"This model does not expose reasoning configuration: {SECRET}",
                    "param": "reasoning_effort",
                }}
            else:
                yield "message", {"choices": [{"delta": {"content": "invalid envelope"}, "finish_reason": "stop"}]}
            return
        yield _finished_chunk("LM Studio")

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    result = _run_chat(node, "LM Studio")
    assert result[0] == "finished answer"
    assert len(calls) == 2
    _assert_transport_only(calls, result)
    if retry == "reasoning":
        assert "reasoning_effort" not in calls[1][1]
        assert "[redacted]" in result[2]["reasoning_compatibility"]["error"]


@pytest.mark.parametrize("operation", ["lm_unload", "llama_cpp_unload", "llama_swap_running", "llama_swap_unload", "vllm_sleep_wake"])
def test_management_requests_use_bearer_without_storing_key(llm, monkeypatch, operation):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        if url.endswith("/api/v1/models"):
            return {"models": [{"key": "local-model", "loaded_instances": [{"id": "instance-1"}]}]}
        return {"running": [{"model": "local-model"}], "ok": True}

    def fake_success(url, **kwargs):
        calls.append((url, kwargs.get("error_payload"), kwargs))
        return 200, "unloaded"

    monkeypatch.setattr(module, "_http_json", fake_json)
    monkeypatch.setattr(module, "_http_expect_success", fake_success)
    root = "http://127.0.0.1:8000"
    if operation == "lm_unload":
        module._lm_unload_best_effort(root, "local-model")
        assert calls[-1][1] == {"instance_id": "instance-1"}
    elif operation == "llama_cpp_unload":
        module._llama_cpp_unload(root, "local-model")
    elif operation == "llama_swap_running":
        assert module._llama_swap_is_model_loaded(root, "local-model") is True
    elif operation == "llama_swap_unload":
        module._llama_swap_unload(root, "local-model")
    else:
        module._vllm_sleep(root, "local-model")
        assert module._vllm_wake_if_needed(root, "local-model") == {"action": "wake_up"}
        assert [call[0].rsplit("/", 1)[-1] for call in calls] == ["sleep?level=1", "wake_up"]
    _assert_transport_only(calls, None)


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
@pytest.mark.parametrize("action", ["models", "chat"])
def test_unauthorized_requests_explain_the_applicable_environment_key(
    llm, monkeypatch, provider, action
):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)

    def unauthorized(*_args, **_kwargs):
        raise RuntimeError("Local LLM server returned HTTP 401: unauthorized")

    monkeypatch.setattr(module, "_http_json", unauthorized)
    monkeypatch.setattr(module, "_http_stream_sse", unauthorized)
    with pytest.raises(RuntimeError, match="HTTP 401") as error:
        if action == "models":
            module.list_local_llm_models(provider, "http://127.0.0.1:8000/v1")
        else:
            _run_chat(node, provider)
    assert GENERIC_ENV in str(error.value)
    if provider == "LM Studio":
        assert LM_STUDIO_ENV in str(error.value)
    assert SECRET not in str(error.value)


@pytest.mark.parametrize("provider", [*AUTH_PROVIDERS, "Unsloth"])
@pytest.mark.parametrize("message", [
    "HTTP 503: model worker is busy",
    "HTTP 503: authentication service is unavailable",
    "HTTP 403: unauthorized",
])
def test_non_authentication_server_error_keeps_original_diagnostic(llm, provider, message):
    module, _node = llm
    original = RuntimeError(message)
    assert module._openai_compatible_authentication_error(provider, original) is original
    if provider == "LM Studio":
        assert module._lm_studio_authentication_error(original) is original
    elif provider == "Unsloth":
        assert module._unsloth_authentication_error(original) is original
    assert str(original) == message


@pytest.mark.parametrize("transport", ["json", "expect_success", "sse"])
@pytest.mark.parametrize("body_format", ["plain", "escaped_json"])
def test_http_error_redacts_only_request_bearer_and_preserves_status(
    llm, monkeypatch, transport, body_format
):
    module, _node = llm
    calls = []
    token = "synthetic/local+token" if body_format == "escaped_json" else SECRET
    diagnostic = f"worker unavailable; request key {token}; other-token-is-diagnostic"
    if body_format == "escaped_json":
        body = json.dumps({"error": {
            "message": diagnostic,
            "request": {"reflected_key": token, token: "reflected property name"},
        }}).replace("/", "\\/").encode()
        assert token not in body.decode()
        assert token in json.dumps(json.loads(body))
    else:
        body = diagnostic.encode()

    class Response:
        status = 503

        def read(self):
            return body

    class Connection:
        def request(self, method, path, body=None, headers=None):
            calls.append((method, path, body, headers))

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr(module, "_open_local_llm_http_connection", lambda _parsed, timeout: Connection())
    auth = {"Authorization": f"Bearer {token}"}
    with pytest.raises(RuntimeError, match="HTTP 503") as error:
        if transport == "json":
            module._http_json("http://127.0.0.1:8000/v1/models", headers=auth)
        elif transport == "expect_success":
            module._http_expect_success("http://127.0.0.1:8000/api/models/unload/local-model", method="POST", headers=auth)
        else:
            list(module._http_stream_sse("http://127.0.0.1:8000/v1/chat/completions", {"model": "local-model"}, headers=auth))
    assert token not in str(error.value)
    assert "[redacted]" in str(error.value)
    assert "other-token-is-diagnostic" in str(error.value)
    if body_format == "escaped_json":
        decoded_error = json.loads(str(error.value).partition(": ")[2])
        assert token not in json.dumps(decoded_error)
        assert decoded_error["error"]["request"] == {
            "reflected_key": "[redacted]", "[redacted]": "reflected property name",
        }
    assert calls[0][3]["Authorization"] == f"Bearer {token}"
    assert token not in str(calls[0][2])


@pytest.mark.parametrize("provider", AUTH_PROVIDERS)
@pytest.mark.parametrize("token", [SECRET, 'synthetic/local"\\token'])
def test_stream_error_reflected_key_is_redacted(llm, monkeypatch, provider, token):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, token)

    def fake_stream(*_args, **_kwargs):
        payload = {"error": {"message": f"HTTP 503: busy worker for key {token}"}}
        yield "message", json.loads(json.dumps(payload))

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    with pytest.raises(RuntimeError, match="HTTP 503") as error:
        _run_chat(node, provider)
    assert token not in str(error.value)
    assert "[redacted]" in str(error.value)


def test_authentication_stays_out_of_public_node_inputs(llm, monkeypatch):
    _module, node = llm
    before = node.INPUT_TYPES()
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    monkeypatch.setenv(LM_STUDIO_ENV, SECRET)
    assert node.INPUT_TYPES() == before
    assert SECRET not in json.dumps(before)
    assert list(before["required"]) == [
        "provider", "ollama_model", "lm_studio_model", "custom_server_url", "custom_model",
        "system_prompt", "thinking", "seed", "seed_mode", "model_memory", "keep_minutes",
        "comfy_vram_policy", "prompt",
    ]
    assert list(before["optional"]) == ["image", "video_seconds", "audio_context"]


@pytest.mark.parametrize("provider", ["LM Studio", "Custom"])
def test_authenticated_refine_persists_answer_without_environment_key(llm, monkeypatch, provider):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    monkeypatch.setenv(LM_STUDIO_ENV, SECRET)
    calls = []
    extra_pnginfo = [{"workflow": {"nodes": [
        {"id": 143, "type": "DenoLocalLLMRefiner", "properties": {}}
    ]}}]

    def fake_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        yield _finished_chunk(provider)

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    result = node.refine(
        provider=provider,
        ollama_model="local-model",
        lm_studio_model="local-model",
        custom_server_url="http://127.0.0.1:8000/v1",
        custom_model="local-model",
        system_prompt="",
        prompt=["Write the final answer."],
        thinking=False,
        seed=7,
        seed_mode="fixed",
        model_memory="Keep loaded",
        keep_minutes=5,
        comfy_vram_policy="Never unload before LLM call",
        unique_id=["143"],
        extra_pnginfo=extra_pnginfo,
    )
    assert result["result"] == (["finished answer"],)
    saved = json.loads(json.dumps(extra_pnginfo))
    state = saved[0]["workflow"]["nodes"][0]["properties"]["deno_local_llm_state"]
    assert state["answer"] == "finished answer"
    _assert_transport_only(calls, [result, saved])
