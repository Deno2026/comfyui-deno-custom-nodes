import json
import sys

import pytest

from test_image_resize_node import load_package


GENERIC_ENV = "DENO_LOCAL_LLM_API_KEY"
LM_STUDIO_ENV = "DENO_LOCAL_LLM_LM_STUDIO_API_KEY"
SECRET = "synthetic-local-llm-auth-token"


@pytest.fixture
def llm(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    for name in (GENERIC_ENV, LM_STUDIO_ENV):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(module, "_send_progress", lambda _event: None)
    return module, package.DenoLocalLLMRefiner()


def _chat_kwargs():
    return {
        "server_url": "http://127.0.0.1:1234/v1",
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


def _run_chat(node, **overrides):
    return node._run_lm_studio(**{**_chat_kwargs(), **overrides})


def _finished_chunk(answer="finished answer"):
    content = json.dumps({"deno_final_answer": answer})
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
    ("generic", "dedicated", "expected"),
    [
        ("generic-key", "dedicated-key", "dedicated-key"),
        (" generic-key ", None, "generic-key"),
        ("generic-key", " \t ", "generic-key"),
        (" \t ", None, None),
    ],
)
def test_lm_studio_key_precedence(llm, monkeypatch, generic, dedicated, expected):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, generic)
    if dedicated is not None:
        monkeypatch.setenv(LM_STUDIO_ENV, dedicated)
    headers = module._lm_studio_request_headers()
    assert headers == ({"Authorization": f"Bearer {expected}"} if expected else None)


def test_model_list_authentication_is_transport_only(llm, monkeypatch):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        return {"models": [{"key": "local-model", "type": "llm"}]}

    monkeypatch.setattr(module, "_http_json", fake_json)
    models = module.list_local_llm_models("LM Studio", "")
    assert models[0]["id"] == "local-model"
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


def test_chat_stream_authentication_does_not_enter_payload_result_or_progress(
    llm, monkeypatch
):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls, progress = [], []

    def fake_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        yield _finished_chunk()

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_send_progress", progress.append)
    result = _run_chat(node)
    assert result[0] == "finished answer"
    _assert_transport_only(calls, [result, progress])


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
        yield _finished_chunk()

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    result = _run_chat(node)
    assert result[0] == "finished answer"
    assert len(calls) == 2
    _assert_transport_only(calls, result)
    if retry == "reasoning":
        assert "reasoning_effort" not in calls[1][1]
        assert "[redacted]" in result[2]["reasoning_compatibility"]["error"]


def test_management_requests_use_bearer_without_storing_key(llm, monkeypatch):
    module, _node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    calls = []

    def fake_json(url, payload=None, **kwargs):
        calls.append((url, payload, kwargs))
        if url.endswith("/api/v1/models"):
            return {"models": [{"key": "local-model", "loaded_instances": [{"id": "instance-1"}]}]}
        return {"ok": True}

    monkeypatch.setattr(module, "_http_json", fake_json)
    module.unload_local_llm_model("LM Studio", "", "local-model")
    assert calls[-1][1] == {"instance_id": "instance-1"}
    _assert_transport_only(calls, None)


@pytest.mark.parametrize("action", ["models", "chat"])
def test_unauthorized_requests_explain_the_applicable_environment_key(
    llm, monkeypatch, action
):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)

    def unauthorized(*_args, **_kwargs):
        raise RuntimeError("Local LLM server returned HTTP 401: unauthorized")

    monkeypatch.setattr(module, "_http_json", unauthorized)
    monkeypatch.setattr(module, "_http_stream_sse", unauthorized)
    with pytest.raises(RuntimeError, match="HTTP 401") as error:
        if action == "models":
            module.list_local_llm_models("LM Studio", "http://127.0.0.1:1234/v1")
        else:
            _run_chat(node)
    assert GENERIC_ENV in str(error.value)
    assert LM_STUDIO_ENV in str(error.value)
    assert SECRET not in str(error.value)


@pytest.mark.parametrize("message", [
    "HTTP 503: model worker is busy",
    "HTTP 503: authentication service is unavailable",
    "HTTP 403: unauthorized",
])
def test_non_authentication_server_error_keeps_original_diagnostic(llm, message):
    module, _node = llm
    original = RuntimeError(message)
    assert module._lm_studio_authentication_error(original) is original
    assert str(original) == message


@pytest.mark.parametrize("transport", ["json", "sse"])
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
            module._http_json("http://127.0.0.1:1234/v1/models", headers=auth)
        else:
            list(module._http_stream_sse("http://127.0.0.1:1234/v1/chat/completions", {"model": "local-model"}, headers=auth))
    assert token not in str(error.value)
    if body_format == "escaped_json":
        # A JSON error shows only its message, with the request key redacted.
        assert "[redacted]" in str(error.value)
        assert "other-token-is-diagnostic" in str(error.value)
        assert "reflected" not in str(error.value)
    else:
        # A non-JSON body is never passed on to the user.
        assert str(error.value) == "Local LLM server returned HTTP 503"
    assert calls[0][3]["Authorization"] == f"Bearer {token}"
    assert token not in str(calls[0][2])


@pytest.mark.parametrize("token", [SECRET, 'synthetic/local"\\token'])
def test_stream_error_reflected_key_is_redacted(llm, monkeypatch, token):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, token)

    def fake_stream(*_args, **_kwargs):
        payload = {"error": {"message": f"HTTP 503: busy worker for key {token}"}}
        yield "message", json.loads(json.dumps(payload))

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    with pytest.raises(RuntimeError, match="HTTP 503") as error:
        _run_chat(node)
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
    assert list(before["optional"]) == ["image", "video_seconds", "audio_context", "save_result_in_files"]


def test_authenticated_refine_persists_answer_without_environment_key(llm, monkeypatch):
    module, node = llm
    monkeypatch.setenv(GENERIC_ENV, SECRET)
    monkeypatch.setenv(LM_STUDIO_ENV, SECRET)
    calls = []
    extra_pnginfo = [{"workflow": {"nodes": [
        {"id": 143, "type": "DenoLocalLLMRefiner", "properties": {}}
    ]}}]

    def fake_stream(url, payload, **kwargs):
        calls.append((url, payload, kwargs))
        yield _finished_chunk()

    monkeypatch.setattr(module, "_http_stream_sse", fake_stream)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kwargs: {})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kwargs: {})
    result = node.refine(
        provider="LM Studio",
        ollama_model="local-model",
        lm_studio_model="local-model",
        custom_server_url="http://127.0.0.1:1234/v1",
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
        save_result_in_files=True,
    )
    assert result["result"] == (["finished answer"],)
    saved = json.loads(json.dumps(extra_pnginfo))
    state = saved[0]["workflow"]["nodes"][0]["properties"]["deno_local_llm_state"]
    assert state["answer"] == "finished answer"
    _assert_transport_only(calls, [result, saved])
