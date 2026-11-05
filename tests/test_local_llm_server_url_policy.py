import asyncio
import json
import sys

import pytest

from test_image_resize_node import load_package


OPENAI_COMPATIBLE = ["llama.cpp", "vLLM", "Custom", "llama-swap", "Unsloth"]
HOSTILE_URLS = [
    "http://127.0.0.1:9999/manager/reboot",
    "http://127.0.0.1:9999/?x=1",
    "http://127.0.0.1:9999/api/v1/models?token=1",
    "http://192.168.1.50:1234/v1",
]


@pytest.fixture
def module(monkeypatch):
    package = load_package()
    refiner = sys.modules[f"{package.__name__}.deno_local_llm_refiner"]
    monkeypatch.delenv("DENO_LOCAL_LLM_API_KEY", raising=False)
    monkeypatch.delenv("DENO_LOCAL_LLM_LM_STUDIO_API_KEY", raising=False)
    monkeypatch.setenv("DENO_LOCAL_LLM_UNSLOTH_API_KEY", "synthetic-unsloth-key")
    refiner._WARM_LOCAL_LLM_KEYS.clear()
    refiner._ACTIVE_LOCAL_LLM_KEYS.clear()
    refiner._CANCEL_LOCAL_LLM_KEYS.clear()
    refiner._LM_STUDIO_MODELS_CACHE.clear()
    return refiner


def _record_http_json(module, monkeypatch, response=None):
    calls = []

    def fake_http_json(url, payload=None, method="GET", timeout=20.0, headers=None):
        calls.append((method, url))
        if response is not None:
            return response(url)
        if url.endswith("/api/tags") or url.endswith("/api/ps") or url.endswith("/models"):
            return {"models": [], "data": []}
        return {}

    monkeypatch.setattr(module, "_http_json", fake_http_json)
    monkeypatch.setattr(module, "_http_expect_success", lambda url, **_kwargs: (200, ""))
    return calls


# ---------------------------------------------------------------- effective address


@pytest.mark.parametrize("posted", ["", *HOSTILE_URLS])
def test_ollama_and_lm_studio_ignore_posted_server_address(module, posted):
    assert module._effective_local_llm_server_url("Ollama", posted) == module.OLLAMA_DEFAULT_SERVER
    assert module._effective_local_llm_server_url("LM Studio", posted) == module.LM_STUDIO_DEFAULT_SERVER
    assert module._effective_local_llm_server_url("Unknown provider", posted) == module.OLLAMA_DEFAULT_SERVER


def test_openai_compatible_keeps_typed_address_or_provider_default(module):
    for provider in OPENAI_COMPATIBLE:
        assert module._effective_local_llm_server_url(provider, " http://127.0.0.1:9000/v1 ") == "http://127.0.0.1:9000/v1"
        assert module._effective_local_llm_server_url(provider, "") == module._default_openai_compatible_server(provider)
    assert module._effective_local_llm_server_url("Custom Local Server", "") == module.CUSTOM_SERVER_DEFAULT


@pytest.mark.parametrize("posted", HOSTILE_URLS)
def test_route_functions_use_fixed_address_for_ollama(module, monkeypatch, posted):
    calls = _record_http_json(module, monkeypatch)
    module.list_local_llm_models("Ollama", posted)
    module.unload_local_llm_model("Ollama", posted, "qwen3")
    assert calls
    assert all(url.startswith("http://127.0.0.1:11434/") for _method, url in calls), calls
    assert ("GET", "http://127.0.0.1:11434/api/tags") in calls


@pytest.mark.parametrize("posted", HOSTILE_URLS)
def test_route_functions_use_fixed_address_for_lm_studio(module, monkeypatch, posted):
    calls = _record_http_json(module, monkeypatch)
    module.list_local_llm_models("LM Studio", posted)
    module.unload_local_llm_model("LM Studio", posted, "google/gemma")
    assert calls
    assert all(url.startswith("http://127.0.0.1:1234/") for _method, url in calls), calls
    assert ("GET", "http://127.0.0.1:1234/api/v1/models") in calls


@pytest.mark.parametrize("provider", ["Ollama", "LM Studio"])
def test_stop_and_unload_match_the_running_key_whatever_address_is_posted(module, provider):
    # What the node registers while running uses the fixed address, exactly like refine().
    running = module._mark_local_llm_active(
        provider, module._effective_local_llm_server_url(provider, "ignored"), "model-a"
    )
    try:
        stopped = module.stop_local_llm_generation(provider, "http://127.0.0.1:9999/other", "model-a")
        assert stopped["ok"] is True
        assert running in module._CANCEL_LOCAL_LLM_KEYS
        busy = module.unload_local_llm_model(provider, "http://127.0.0.1:9999/other", "model-a")
        assert busy["ok"] is False and busy.get("busy") is True
    finally:
        module._clear_local_llm_active(running)


@pytest.mark.parametrize("provider", ["Ollama", "LM Studio", *OPENAI_COMPATIBLE])
def test_refine_uses_the_same_address_as_the_route_functions(module, monkeypatch, provider):
    package = load_package()
    node = package.DenoLocalLLMRefiner()
    seen = []

    def fake_run_single(**kwargs):
        seen.append((kwargs["provider"], kwargs["server_url"]))
        return "answer", "", {}

    monkeypatch.setattr(module, "_send_progress", lambda _event: None)
    monkeypatch.setattr(module, "_unload_other_warm_local_llms", lambda **_kw: {"action": "none"})
    monkeypatch.setattr(module, "_prepare_comfy_vram_before_llm", lambda **_kw: {"action": "none"})
    monkeypatch.setattr(module, "_persist_local_llm_answer_in_workflow_metadata", lambda *_a, **_kw: None)
    monkeypatch.setattr(node, "_run_single", fake_run_single)
    typed = "http://127.0.0.1:9000/v1"
    node.refine(
        provider=provider, ollama_model="qwen3", lm_studio_model="google/gemma",
        custom_server_url=typed, custom_model="local-model", system_prompt="", thinking=False,
        seed=1, seed_mode="fixed", model_memory="Keep loaded", keep_minutes=5,
        comfy_vram_policy="Never unload before LLM call", prompt=["hi"],
    )
    assert seen == [(provider, module._effective_local_llm_server_url(provider, typed))]
    if provider in ("Ollama", "LM Studio"):
        assert seen[0][1] != typed


def test_http_handlers_ignore_posted_address_for_fixed_providers(module, monkeypatch):
    calls = _record_http_json(module, monkeypatch)
    monkeypatch.setattr(module, "_json_response", lambda payload, status=200: (status, payload))

    class Request:
        def __init__(self, body):
            self.body = body

        async def json(self):
            return self.body

    status, payload = asyncio.run(module._handle_list_models(Request({
        "provider": "Ollama", "server_url": "http://127.0.0.1:9999/manager/reboot?x=1",
    })))
    assert status == 200 and payload["models"] == []
    assert calls == [("GET", "http://127.0.0.1:11434/api/tags")]


# ---------------------------------------------------------------- OpenAI-compatible policy


@pytest.mark.parametrize("provider", OPENAI_COMPATIBLE)
@pytest.mark.parametrize(
    "typed, root",
    [
        ("http://127.0.0.1:8000/v1", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000/", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000/v1/", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000/v1/chat/completions", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000/v1/completions", "http://127.0.0.1:8000"),
        ("http://127.0.0.1:8000/v1/models/", "http://127.0.0.1:8000"),
        ("http://localhost:1234/v1", "http://localhost:1234"),
        ("https://127.0.0.1:8443/v1", "https://127.0.0.1:8443"),
        ("http://127.0.0.1/v1", "http://127.0.0.1"),
        ("", None),
    ],
)
def test_documented_server_addresses_are_accepted(module, provider, typed, root):
    server_root, openai_base = module._normalize_openai_compatible_urls(provider, typed)
    if root is None:
        root = module._default_openai_compatible_server(provider).removesuffix("/v1")
    assert server_root == root
    assert openai_base == f"{root}/v1"


def test_defaults_and_legacy_default_pass_the_policy(module):
    for provider in OPENAI_COMPATIBLE:
        default = module._default_openai_compatible_server(provider)
        assert module._normalize_openai_compatible_urls(provider, default)[1] == default
    legacy = module.LEGACY_CUSTOM_SERVER_DEFAULT
    assert module._normalize_openai_compatible_urls("Custom", legacy)[1] == legacy


def test_lan_address_in_environment_allow_list_is_accepted(module, monkeypatch):
    monkeypatch.setattr(
        module, "_read_process_environment",
        lambda name, default="": "192.168.1.50:1234" if name == module.LOCAL_LLM_ALLOWED_HOSTS_ENV else default,
    )
    assert module._normalize_openai_compatible_urls("Custom", "http://192.168.1.50:1234/v1") == (
        "http://192.168.1.50:1234", "http://192.168.1.50:1234/v1",
    )
    with pytest.raises(RuntimeError, match="DENO_LOCAL_LLM_ALLOWED_HOSTS"):
        module._normalize_openai_compatible_urls("Custom", "http://192.168.1.51:1234/v1")
    with pytest.raises(RuntimeError, match="Enter only the server address"):
        module._normalize_openai_compatible_urls("Custom", "http://192.168.1.50:1234/manager/reboot")


@pytest.mark.parametrize("provider", OPENAI_COMPATIBLE)
@pytest.mark.parametrize(
    "typed",
    [
        "http://127.0.0.1:8000/v1?x=1",
        "http://127.0.0.1:8000?x=1",
        "http://127.0.0.1:8000/v1?",
        "http://127.0.0.1:8000/v1#f",
        "http://127.0.0.1:8000/#f",
        "http://127.0.0.1:8000/v1;a=b",
        "http://127.0.0.1:8000/manager/reboot",
        "http://127.0.0.1:8000/v1/x",
        "http://127.0.0.1:8000/x/v1",
        "http://127.0.0.1:8000//v1",
        "http://127.0.0.1:8000/v1/models/extra",
        "http://127.0.0.1:8000/api/v1",
        "http://127.0.0.1:8000/V1",
    ],
)
def test_extra_path_query_or_fragment_is_refused(module, provider, typed):
    with pytest.raises(RuntimeError, match=r"Enter only the server address, for example http://127.0.0.1:8000/v1\."):
        module._normalize_openai_compatible_urls(provider, typed)
    with pytest.raises(RuntimeError, match="Enter only the server address"):
        module._canonical_local_llm_state_url(provider, typed)


def test_host_and_port_checks_still_run_first(module):
    with pytest.raises(RuntimeError, match="Only local LLM servers"):
        module._normalize_openai_compatible_urls("Custom", "http://example.com/v1")
    with pytest.raises(RuntimeError, match="username/password"):
        module._normalize_openai_compatible_urls("Custom", "http://user:pw@127.0.0.1:8000/v1")


def test_validate_inputs_reports_the_refused_address(module):
    package = load_package()
    node_cls = package.DenoLocalLLMRefiner
    ok = node_cls.VALIDATE_INPUTS(
        provider="Custom", ollama_model="", lm_studio_model="", custom_server_url="http://127.0.0.1:8000/v1",
        custom_model="m", seed_mode="fixed", model_memory="Unload after run",
        comfy_vram_policy="Never unload before LLM call",
    )
    assert ok is True
    refused = node_cls.VALIDATE_INPUTS(
        provider="Custom", ollama_model="", lm_studio_model="", custom_server_url="http://127.0.0.1:8000/v1?x=1",
        custom_model="m", seed_mode="fixed", model_memory="Unload after run",
        comfy_vram_policy="Never unload before LLM call",
    )
    assert isinstance(refused, str) and "Enter only the server address" in refused


def test_openai_compatible_requests_only_use_node_chosen_paths(module, monkeypatch):
    calls = _record_http_json(module, monkeypatch)
    module.list_local_llm_models("Custom", "http://127.0.0.1:8000/v1/chat/completions")
    module.list_local_llm_models("vLLM", "http://127.0.0.1:8000")
    assert [url for _method, url in calls] == [
        "http://127.0.0.1:8000/v1/models",
        "http://127.0.0.1:8000/v1/models",
    ]
    with pytest.raises(RuntimeError, match="Enter only the server address"):
        module.list_local_llm_models("Custom", "http://127.0.0.1:8000/manager/reboot")
    assert len(calls) == 2


def test_node_owned_query_is_still_sent(module, monkeypatch):
    sent = []

    class Response:
        status = 200

        def read(self):
            return b"{}"

    class Connection:
        def request(self, method, path, body=None, headers=None):
            sent.append((method, path))

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr(module, "_open_local_llm_http_connection", lambda _parsed, timeout: Connection())
    module._vllm_sleep("http://127.0.0.1:8000", "model-a")
    assert sent == [("POST", "/sleep?level=1")]


# ---------------------------------------------------------------- error text


class _FakeResponse:
    def __init__(self, status, body):
        self.status = status
        self._body = body if isinstance(body, bytes) else body.encode("utf-8")

    def read(self):
        return self._body


class _FakeConnection:
    def __init__(self, response):
        self._response = response

    def request(self, *_args, **_kwargs):
        pass

    def getresponse(self):
        return self._response

    def close(self):
        pass


def _serve(module, monkeypatch, status, body):
    monkeypatch.setattr(
        module, "_open_local_llm_http_connection",
        lambda _parsed, timeout: _FakeConnection(_FakeResponse(status, body)),
    )


HTML_PAGE = "<html><body>Internal admin page secret-admin-text</body></html>"


@pytest.mark.parametrize("call", ["json", "expect_success", "stream_lines"])
def test_html_error_body_is_not_returned(module, monkeypatch, call):
    _serve(module, monkeypatch, 500, HTML_PAGE)
    with pytest.raises(RuntimeError) as error:
        if call == "json":
            module._http_json("http://127.0.0.1:8000/v1/models")
        elif call == "expect_success":
            module._http_expect_success("http://127.0.0.1:8000/api/models/unload/x", method="POST")
        else:
            list(module._http_stream_json_lines("http://127.0.0.1:11434/api/chat", {"model": "m"}))
    assert str(error.value) == "Local LLM server returned HTTP 500"
    assert "secret-admin-text" not in str(error.value)


def test_plain_text_error_body_is_not_returned(module, monkeypatch):
    _serve(module, monkeypatch, 403, "forbidden: secret-admin-text")
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models")
    assert str(error.value) == "Local LLM server returned HTTP 403"


@pytest.mark.parametrize(
    "body, expected",
    [
        ({"error": {"message": "context length exceeded", "type": "invalid_request"}}, "context length exceeded"),
        ({"error": "model crashed"}, "model crashed"),
        ({"message": "bad request body"}, "bad request body"),
        ({"detail": "Not allowed here"}, "Not allowed here"),
        ({"error": {"type": "server_error"}}, "server_error"),
    ],
)
def test_json_error_message_is_shown(module, monkeypatch, body, expected):
    _serve(module, monkeypatch, 500, json.dumps(body))
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models")
    assert str(error.value) == f"Local LLM server returned HTTP 500: {expected}"


def test_json_without_an_error_string_shows_only_the_status(module, monkeypatch):
    _serve(module, monkeypatch, 500, json.dumps({"detail": [{"msg": "x", "input": "secret-admin-text"}], "other": "secret-admin-text"}))
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models")
    assert str(error.value) == "Local LLM server returned HTTP 500"


def test_json_error_message_is_capped_at_300_characters(module, monkeypatch):
    _serve(module, monkeypatch, 500, json.dumps({"error": {"message": "x" * 2000}}))
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models")
    assert str(error.value) == "Local LLM server returned HTTP 500: " + "x" * 300


def test_json_error_message_hides_the_request_key(module, monkeypatch):
    token = "synthetic-policy-token"
    _serve(module, monkeypatch, 401, json.dumps({"error": {"message": f"bad key {token}"}}))
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models", headers={"Authorization": f"Bearer {token}"})
    assert token not in str(error.value)
    assert "[redacted]" in str(error.value)


def test_model_not_found_hint_survives_for_json_errors(module, monkeypatch):
    _serve(module, monkeypatch, 404, json.dumps({"error": {"message": "model 'missing' not found"}}))
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:11434/api/chat", {"model": "missing"}, method="POST")
    text = str(error.value)
    assert text.startswith("Selected local LLM model is not available: missing.")
    assert "Server detail: model 'missing' not found" in text


def test_model_not_found_hint_never_shows_a_non_json_body(module, monkeypatch):
    _serve(module, monkeypatch, 404, "<html>404 not found secret-admin-text</html>")
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:11434/api/chat", {"model": "missing"}, method="POST")
    text = str(error.value)
    assert text.startswith("Selected local LLM model is not available: missing.")
    assert "secret-admin-text" not in text
    assert "Server detail" not in text


def test_extract_detail_returns_empty_for_anything_but_a_json_error(module):
    assert module._extract_local_llm_error_detail(HTML_PAGE) == ""
    assert module._extract_local_llm_error_detail("plain words") == ""
    assert module._extract_local_llm_error_detail("[1, 2]") == ""
    assert module._extract_local_llm_error_detail("") == ""
    assert module._extract_local_llm_error_detail('{"error": {"message": "  a\\n b "}}') == "a b"


def test_invalid_http_reply_does_not_echo_the_server_line(module, monkeypatch):
    import http.client

    class Connection:
        def request(self, *_args, **_kwargs):
            pass

        def getresponse(self):
            raise http.client.BadStatusLine("SSH-2.0-secret-banner")

        def close(self):
            pass

    monkeypatch.setattr(module, "_open_local_llm_http_connection", lambda _parsed, timeout: Connection())
    with pytest.raises(RuntimeError) as error:
        module._http_json("http://127.0.0.1:8000/v1/models")
    assert str(error.value).startswith("Could not reach local LLM server:")
    assert "secret-banner" not in str(error.value)
