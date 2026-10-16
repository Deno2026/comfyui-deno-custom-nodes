"""Translation requests cannot leave their approved destination or exceed bounds."""

import json
import socket
import ssl
import types

import pytest

import deno_translate_engine as engine


def _dns_records(*addresses):
    return [
        (
            socket.AF_INET6 if ":" in address else socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            (address, 443),
        )
        for address in addresses
    ]


@pytest.fixture
def network(monkeypatch):
    state = types.SimpleNamespace(
        dns=[], pools=[], requests=[], reads=[], status=200, headers={},
        body=b'{"translatedText":"hello"}', response_closed=False, pool_closed=False,
        connection_errors={}, read_error=None, closed_pools=[],
    )
    monkeypatch.delenv(engine._TRANSLATION_ALLOWED_ORIGINS_ENV, raising=False)

    def resolve(host, port, **kwargs):
        state.dns.append((host, port, kwargs))
        return _dns_records("8.8.8.8", "2001:4860:4860::8888")

    class Response:
        @property
        def status(self):
            return state.status

        @property
        def headers(self):
            return state.headers

        def read(self, amount, **kwargs):
            state.reads.append((amount, kwargs))
            if state.read_error is not None:
                raise state.read_error
            return state.body[:amount]

        def close(self):
            state.response_closed = True

    class Pool:
        def __init__(self, **kwargs):
            state.pools.append(kwargs)
            self.host = kwargs["host"]

        def urlopen(self, *args, **kwargs):
            state.requests.append((args, kwargs))
            if self.host in state.connection_errors:
                raise state.connection_errors[self.host]
            return Response()

        def close(self):
            state.pool_closed = True
            state.closed_pools.append(self.host)

    monkeypatch.setattr(engine.socket, "getaddrinfo", resolve)
    monkeypatch.setattr(engine.urllib3, "HTTPSConnectionPool", Pool)
    monkeypatch.setattr(engine.urllib3, "HTTPConnectionPool", Pool)
    return state


@pytest.mark.parametrize("url", [
    "https://user:secret@custom.example",
    "https://user@custom.example",
    "https://custom.example\\@169.254.169.254",
    "https://custom.example/\ntranslate",
    "https://custom.example/\ttranslate",
    "https://custom.example\r",
    "https://custom.example/a b",
    "https://custom.example?key=secret",
    "https://custom.example?",
    "https://custom.example#section",
    "https://custom.example#",
    "file:///etc/passwd",
    "https://custom.example:0",
    "https://custom.example:65536",
    "https://%31%32%37.0.0.1",
])
def test_custom_url_rejects_ambiguous_or_credential_bearing_urls(network, url):
    with pytest.raises(ValueError):
        engine._normalize_libretranslate_endpoint(url, require_custom=True)
    assert network.dns == network.requests == []


@pytest.mark.parametrize("address", [
    "10.1.2.3", "172.16.0.1", "192.168.1.2", "169.254.169.254",
    "100.100.100.200", "168.63.129.16", "0.0.0.0", "224.0.0.1",
    "[fc00::1]", "[fe80::1]", "[ff02::1]", "[::]",
    "[::ffff:127.0.0.1]", "[::ffff:8.8.8.8]", "[2002:0a00:0001::1]",
])
def test_private_metadata_and_transition_literals_are_never_allowed(network, monkeypatch, address):
    url = "https://" + address
    monkeypatch.setenv(engine._TRANSLATION_ALLOWED_ORIGINS_ENV, url)
    with pytest.raises(ValueError, match="public address or loopback"):
        engine._normalize_libretranslate_endpoint(url, require_custom=True)
    assert network.dns == network.requests == []


def test_custom_origin_requires_host_configuration_even_for_loopback(network):
    for url in ("https://custom.example", "http://localhost:5000", "http://127.0.0.1:5000"):
        with pytest.raises(ValueError, match="DENO_TRANSLATION_ALLOWED_ORIGINS"):
            engine._normalize_libretranslate_endpoint(url, require_custom=True)
    assert network.dns == network.requests == []


def test_transport_itself_rejects_unapproved_custom_origin(network):
    with pytest.raises(ValueError, match="not approved"):
        engine._request_translation_json("https://custom.example/translate", body=b"private prompt")
    assert network.dns == network.requests == []


def test_custom_origin_match_is_exact_and_dns_free(network, monkeypatch):
    monkeypatch.setenv(
        engine._TRANSLATION_ALLOWED_ORIGINS_ENV,
        "https://other.example; https://CUSTOM.example:443, http://localhost:5000",
    )
    assert engine._normalize_libretranslate_endpoint(
        "https://custom.example/api", require_custom=True,
    ) == "https://custom.example/api/translate"
    assert engine._normalize_libretranslate_endpoint(
        "http://localhost:5000/", require_custom=True,
    ) == "http://localhost:5000/translate"
    assert engine._normalize_libretranslate_endpoint(
        "https://custom.example/api/translate/", require_custom=True,
    ) == "https://custom.example/api/translate/"
    for url in ("https://custom.example:444", "https://custom.example.attacker.test", "http://127.0.0.1:5000"):
        with pytest.raises(ValueError, match="not approved"):
            engine._normalize_libretranslate_endpoint(url, require_custom=True)
    assert network.dns == network.requests == []


def test_plain_http_cannot_be_enabled_for_a_remote_origin(network, monkeypatch):
    monkeypatch.setenv(engine._TRANSLATION_ALLOWED_ORIGINS_ENV, "http://custom.example")
    with pytest.raises(ValueError, match="https"):
        engine._normalize_libretranslate_endpoint("http://custom.example", require_custom=True)
    assert network.dns == network.requests == []


def test_invalid_allowlist_path_cannot_approve_an_origin(network, monkeypatch):
    monkeypatch.setenv(engine._TRANSLATION_ALLOWED_ORIGINS_ENV, "https://custom.example/api")
    with pytest.raises(ValueError, match="invalid origin"):
        engine._normalize_libretranslate_endpoint("https://custom.example", require_custom=True)


@pytest.mark.parametrize("addresses", [
    ("127.0.0.1",), ("169.254.169.254",), ("192.168.1.2",),
    ("8.8.8.8", "10.0.0.1"), ("8.8.8.8", "::1"),
])
def test_every_dns_answer_must_be_public_before_any_text_is_sent(network, monkeypatch, addresses):
    monkeypatch.setattr(engine.socket, "getaddrinfo", lambda *args, **kwargs: _dns_records(*addresses))
    with pytest.raises(ValueError, match="only to public"):
        engine._request_gtx("private prompt", "ko", "en")
    assert network.pools == network.requests == []


def test_no_dns_answers_fails_before_transmission(network, monkeypatch):
    monkeypatch.setattr(engine.socket, "getaddrinfo", lambda *args, **kwargs: [])
    with pytest.raises(ValueError, match="did not resolve"):
        engine._request_gtx("private prompt", "ko", "en")
    assert network.pools == network.requests == []


def test_https_connects_only_to_validated_ip_and_keeps_host_sni_and_certificate_checks(network, monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://169.254.169.254:8080")
    monkeypatch.setenv("ALL_PROXY", "http://192.168.1.1:8080")
    engine._request_gtx("a prompt", "ko", "en")
    assert len(network.dns) == 1
    assert network.dns[0][:2] == ("translate.googleapis.com", 443)
    pool = network.pools[0]
    assert pool["host"] == "8.8.8.8"
    assert pool["assert_hostname"] == pool["server_hostname"] == "translate.googleapis.com"
    assert pool["cert_reqs"] == ssl.CERT_REQUIRED
    assert "_proxy" not in pool
    args, kwargs = network.requests[0]
    assert args[0] == "GET"
    assert args[1].startswith("/translate_a/single?")
    assert kwargs["headers"]["Host"] == "translate.googleapis.com"
    assert kwargs["redirect"] is kwargs["retries"] is kwargs["preload_content"] is False
    assert network.response_closed is network.pool_closed is True


def test_rebinding_cannot_replace_the_numeric_pool_destination(network, monkeypatch):
    calls = []

    def rebind_after_first_lookup(*args, **kwargs):
        calls.append(args)
        return _dns_records("8.8.8.8" if len(calls) == 1 else "169.254.169.254")

    monkeypatch.setattr(engine.socket, "getaddrinfo", rebind_after_first_lookup)
    engine._request_gtx("private prompt", "ko", "en")
    assert len(calls) == 1
    assert network.pools[0]["host"] == "8.8.8.8"


@pytest.mark.parametrize("exception", [
    engine.urllib3.exceptions.NewConnectionError(None, "unreachable"),
    engine.urllib3.exceptions.ConnectTimeoutError("connection timed out"),
])
def test_connection_failure_tries_next_prevalidated_ip_with_same_tls_identity(network, exception):
    network.connection_errors["8.8.8.8"] = exception
    assert engine._request_libretranslate("private prompt", "ko", "en") == "hello"
    assert len(network.dns) == 1
    assert [pool["host"] for pool in network.pools] == ["8.8.8.8", "2001:4860:4860::8888"]
    assert network.closed_pools == ["8.8.8.8", "2001:4860:4860::8888"]
    for pool in network.pools:
        assert pool["server_hostname"] == pool["assert_hostname"] == "libretranslate.com"
        assert pool["cert_reqs"] == ssl.CERT_REQUIRED
    assert len(network.requests) == 2
    assert network.requests[0] == network.requests[1]


def test_connection_fallback_shares_one_timeout_budget(network, monkeypatch):
    times = iter((100.0, 100.0, 106.0))
    monkeypatch.setattr(engine.time, "monotonic", lambda: next(times))
    network.connection_errors["8.8.8.8"] = engine.urllib3.exceptions.ConnectTimeoutError("first failed")
    assert engine._request_libretranslate("private prompt", "ko", "en", timeout=10.0) == "hello"
    assert [pool["timeout"].total for pool in network.pools] == [10.0, 4.0]
    assert [pool["timeout"].connect_timeout for pool in network.pools] == [5.0, 4.0]


def test_connection_fallback_stops_when_timeout_budget_is_exhausted(network, monkeypatch):
    times = iter((100.0, 100.0, 111.0))
    monkeypatch.setattr(engine.time, "monotonic", lambda: next(times))
    network.connection_errors["8.8.8.8"] = engine.urllib3.exceptions.ConnectTimeoutError("first failed")
    with pytest.raises(engine.urllib3.exceptions.ConnectTimeoutError, match="timeout exhausted"):
        engine._request_libretranslate("private prompt", "ko", "en", timeout=10.0)
    assert len(network.requests) == len(network.pools) == 1
    assert network.closed_pools == ["8.8.8.8"]


def test_all_connection_failures_close_every_pool_and_raise_last_error(network):
    network.connection_errors["8.8.8.8"] = engine.urllib3.exceptions.NewConnectionError(None, "first failed")
    final_error = engine.urllib3.exceptions.NewConnectionError(None, "second failed")
    network.connection_errors["2001:4860:4860::8888"] = final_error
    with pytest.raises(engine.urllib3.exceptions.NewConnectionError) as caught:
        engine._request_libretranslate("private prompt", "ko", "en")
    assert caught.value is final_error
    assert network.closed_pools == ["8.8.8.8", "2001:4860:4860::8888"]


@pytest.mark.parametrize("exception", [
    engine.urllib3.exceptions.SSLError("certificate identity mismatch"),
    engine.urllib3.exceptions.ProtocolError("connection closed after sending request"),
    engine.urllib3.exceptions.ReadTimeoutError(None, "/translate", "response timed out"),
])
def test_tls_protocol_and_response_timeouts_never_try_another_ip(network, exception):
    network.connection_errors["8.8.8.8"] = exception
    with pytest.raises(type(exception)):
        engine._request_libretranslate("private prompt", "ko", "en")
    assert len(network.requests) == len(network.pools) == 1
    assert network.closed_pools == ["8.8.8.8"]


@pytest.mark.parametrize("status", [401, 429, 500, 503])
def test_http_error_response_never_tries_another_ip(network, status):
    network.status = status
    with pytest.raises(RuntimeError, match="HTTP %s" % status):
        engine._request_libretranslate("private prompt", "ko", "en")
    assert len(network.requests) == len(network.pools) == 1
    assert network.response_closed is True


def test_exception_after_response_never_replays_the_request(network):
    network.read_error = engine.urllib3.exceptions.ConnectTimeoutError("body read failed")
    with pytest.raises(engine.urllib3.exceptions.ConnectTimeoutError, match="body read failed"):
        engine._request_libretranslate("private prompt", "ko", "en")
    assert len(network.requests) == len(network.pools) == 1
    assert network.response_closed is True


def test_real_urllib3_connection_keeps_numeric_destination_and_tls_identity():
    # Constructing a connection does not open a socket. This verifies that the
    # installed urllib3 passes these options through to its TLS connection.
    pool = engine.urllib3.HTTPSConnectionPool(
        "8.8.8.8", port=443, cert_reqs=ssl.CERT_REQUIRED,
        assert_hostname="translate.googleapis.com", server_hostname="translate.googleapis.com",
    )
    try:
        connection = pool._new_conn()
        assert connection.host == "8.8.8.8"
        assert connection.server_hostname == "translate.googleapis.com"
        assert connection.assert_hostname == "translate.googleapis.com"
        assert connection.cert_reqs == ssl.CERT_REQUIRED
    finally:
        pool.close()


@pytest.mark.parametrize("url, address, host", [
    ("http://localhost:5000", "127.0.0.1", "localhost:5000"),
    ("http://127.0.0.2:5000", "127.0.0.2", "127.0.0.2:5000"),
    ("http://[::1]:5000", "::1", "[::1]:5000"),
])
def test_opted_in_local_server_is_pinned_without_dns(network, monkeypatch, url, address, host):
    monkeypatch.setenv(engine._TRANSLATION_ALLOWED_ORIGINS_ENV, url)
    assert engine._request_libretranslate("안녕", "ko", "en", url=url, require_custom=True) == "hello"
    assert network.dns == []
    assert network.pools[0]["host"] == address
    args, kwargs = network.requests[0]
    assert args == ("POST", "/translate")
    assert kwargs["headers"]["Host"] == host
    assert json.loads(kwargs["body"])["q"] == "안녕"


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_redirect_cannot_replay_translation_text(network, status):
    network.status = status
    network.headers = {"Location": "http://169.254.169.254/private"}
    with pytest.raises(RuntimeError, match="redirects are disabled"):
        engine._request_libretranslate("private prompt", "ko", "en")
    assert len(network.requests) == 1
    assert network.requests[0][1]["redirect"] is False
    assert network.reads == []
    assert network.response_closed is network.pool_closed is True


@pytest.mark.parametrize("declared_length", [True, False])
def test_response_body_has_a_hard_limit(network, declared_length):
    network.body = b"x" * (engine._MAX_TRANSLATION_RESPONSE_BYTES + 1)
    if declared_length:
        network.headers = {"Content-Length": str(len(network.body))}
    with pytest.raises(RuntimeError, match="2 MiB limit"):
        engine._request_libretranslate("a prompt", "ko", "en")
    if declared_length:
        assert network.reads == []
    else:
        assert network.reads == [(engine._MAX_TRANSLATION_RESPONSE_BYTES + 1, {"decode_content": False})]
    assert network.response_closed is network.pool_closed is True


def test_compressed_response_is_rejected_before_decompression(network):
    network.headers = {"Content-Encoding": "gzip"}
    with pytest.raises(RuntimeError, match="compressed response"):
        engine._request_libretranslate("a prompt", "ko", "en")
    assert network.reads == []
    assert network.requests[0][1]["headers"]["Accept-Encoding"] == "identity"


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan"), None, "invalid"])
def test_timeout_must_be_finite_and_positive(network, timeout):
    with pytest.raises(ValueError, match="finite positive"):
        engine._request_gtx("a prompt", "ko", "en", timeout=timeout)
    assert network.dns == network.requests == []


def test_excessive_timeout_is_bounded(network):
    engine._request_libretranslate("a prompt", "ko", "en", timeout=1000000)
    timeout = network.pools[0]["timeout"]
    assert 0 < timeout.total <= engine._MAX_TRANSLATION_TIMEOUT_SECONDS
    assert timeout.connect_timeout <= 5.0


def test_provider_results_and_routing_remain_compatible(network):
    network.body = b'{"responseData":{"translatedText":"hello"}}'
    assert engine._request_mymemory("안녕", "ko", "en") == "hello"
    assert network.pools[-1]["server_hostname"] == "api.mymemory.translated.net"
    network.body = b'[[["hello",null,null]]]'
    assert engine._request_translation("안녕", "ko", "en", engine="Google") == "hello"


@pytest.mark.parametrize("alias, expected", [
    (None, "Google"), ("", "Google"), ("gtx", "Google"), ("google-translate", "Google"),
    ("my_memory", "MyMemory"), ("libre translate", "LibreTranslate"),
    ("custom libretranslate", "LibreTranslate Custom URL"),
])
def test_known_engine_aliases_keep_their_meaning(alias, expected):
    assert engine.normalize_translation_engine(alias) == expected


def test_unknown_engine_cannot_silently_send_text_to_google(network):
    with pytest.raises(ValueError, match="Unknown translation engine"):
        engine.translate_text("private prompt", "ko", "en", engine="unrecognized-provider")
    assert network.dns == network.requests == []


@pytest.mark.parametrize("value", [1, False, [], {}])
def test_non_string_engine_is_a_clear_validation_error(network, value):
    with pytest.raises(ValueError, match="listed engine names"):
        engine.normalize_translation_engine(value)
    assert network.dns == network.requests == []


@pytest.mark.parametrize("value", [1, False, [], {}])
def test_non_string_custom_url_is_a_clear_validation_error(network, value):
    with pytest.raises(ValueError, match="must be a string"):
        engine._normalize_libretranslate_endpoint(value, require_custom=True)
    assert network.dns == network.requests == []
