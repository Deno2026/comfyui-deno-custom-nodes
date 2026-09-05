"""Network-free URL boundary checks and CPU video comparison regressions."""

import io
import ipaddress
import socket
import ssl
import sys
import urllib.error
from types import SimpleNamespace

import pytest
import torch
import urllib3

from test_image_resize_node import load_package

import deno_video_compare as compare


requires_real_torch = pytest.mark.skipif(
    not hasattr(torch, "tensor"), reason="Video comparison requires real torch."
)


@pytest.fixture
def advanced():
    package = load_package()
    return sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]


def answer(address, port):
    if ":" in address:
        return (socket.AF_INET6, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port, 0, 0))
    return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port))


def numeric_dns_answer(host, port):
    """Model getaddrinfo parsing a numeric IP without a hostname DNS query."""
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return None
    return [answer(str(address), port)]


class FakeSocket:
    def __init__(self, response, connections, requests):
        self.response = response
        self.connections = connections
        self.requests = requests
        self.closed = False
        self.timeout_values = []

    def settimeout(self, timeout):
        self.timeout = timeout
        self.timeout_values.append(timeout)

    def setsockopt(self, *args):
        pass

    def connect(self, address):
        self.connections.append(address)
        if isinstance(self.response, OSError):
            raise self.response

    def sendall(self, data):
        self.requests.append(data)

    def makefile(self, *_args):
        return io.BytesIO(self.response)

    def getpeercert(self):
        return self.peer_certificate

    def close(self):
        self.closed = True


def fake_transport(monkeypatch, responses):
    connections, requests, sockets = [], [], []
    pending = iter(responses)

    def new_socket(*_args):
        sock = FakeSocket(next(pending), connections, requests)
        sockets.append(sock)
        return sock

    monkeypatch.setattr(socket, "socket", new_socket)
    return connections, requests, sockets


def fake_tls(monkeypatch, certificate_hostname):
    calls = []

    def wrap_socket(context, sock, *, server_hostname, **_kwargs):
        calls.append((server_hostname, context.verify_mode))
        sock.peer_certificate = {"subjectAltName": [("DNS", certificate_hostname)]}
        return sock

    monkeypatch.setattr(ssl.SSLContext, "wrap_socket", wrap_socket)
    return calls


def track_pools(monkeypatch):
    pools = []

    def factory(pool_type):
        def create(*args, **kwargs):
            pool = pool_type(*args, **kwargs)
            pools.append(pool)
            return pool
        return create

    for name in ("HTTPConnectionPool", "HTTPSConnectionPool"):
        monkeypatch.setattr(urllib3, name, factory(getattr(urllib3, name)))
    return pools


IMAGE_RESPONSE = b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 5\r\n\r\nimage"


@pytest.mark.parametrize("address", ["8.8.8.8", "2001:4860:4860::8888"])
def test_remote_image_connects_only_to_validated_dns_answer(advanced, monkeypatch, address):
    dns_calls = []
    numeric_calls = []

    def rebinding_dns(host, port, *_args, **_kwargs):
        numeric = numeric_dns_answer(host, port)
        if numeric is not None:
            numeric_calls.append((host, port))
            return numeric
        dns_calls.append((host, port))
        return [answer(address if len(dns_calls) == 1 else "127.0.0.1", port)]

    monkeypatch.setattr(socket, "getaddrinfo", rebinding_dns)
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:9999")
    connections, requests, sockets = fake_transport(monkeypatch, [IMAGE_RESPONSE])
    assert advanced._read_remote_image_bytes("http://public.test:8188/image.png?x=1") == b"image"
    assert dns_calls == [("public.test", 8188)]
    assert numeric_calls == [(address, 8188)]
    assert connections == [answer(address, 8188)[4]]
    wire_request = b"".join(requests)
    assert b"Host: public.test:8188\r\n" in wire_request
    assert b"GET /image.png?x=1 HTTP/1.1\r\n" in wire_request
    assert advanced.REMOTE_IMAGE_MAX_BYTES == 64 * 1024 * 1024
    assert all(sock.timeout_values and set(sock.timeout_values) == {20} for sock in sockets)
    assert all(sock.closed for sock in sockets)


@pytest.mark.parametrize("certificate_hostname,allowed", [
    ("images.public.test", True), ("wrong.public.test", False),
])
def test_https_pins_address_but_preserves_hostname_verification(
    advanced, monkeypatch, certificate_hostname, allowed,
):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or
                        [answer("8.8.8.8", port), answer("1.1.1.1", port)])
    connections, requests, sockets = fake_transport(monkeypatch, [IMAGE_RESPONSE])
    tls_calls = fake_tls(monkeypatch, certificate_hostname)
    pools = track_pools(monkeypatch)
    if allowed:
        assert advanced._read_remote_image_bytes("https://images.public.test:8443/image.png") == b"image"
        assert b"Host: images.public.test:8443\r\n" in b"".join(requests)
    else:
        with pytest.raises(urllib.error.URLError) as failure:
            advanced._read_remote_image_bytes("https://images.public.test:8443/image.png")
        assert isinstance(failure.value.reason, urllib3.exceptions.SSLError)
        assert requests == []
    assert connections == [("8.8.8.8", 8443)]
    assert tls_calls == [("images.public.test", ssl.CERT_REQUIRED)]
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


@pytest.mark.parametrize("target_address,allowed", [("1.1.1.1", True), ("127.0.0.1", False)])
def test_remote_redirect_resolves_and_pins_each_target(advanced, monkeypatch, target_address, allowed):
    calls = []

    def resolve(host, port, *_args, **_kwargs):
        numeric = numeric_dns_answer(host, port)
        if numeric is not None:
            return numeric
        calls.append(host)
        return [answer("8.8.8.8" if host == "public.test" else target_address, port)]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    redirect = b"HTTP/1.1 302 Found\r\nLocation: https://other.test/image.png\r\nContent-Length: 0\r\n\r\n"
    connections, _requests, sockets = fake_transport(monkeypatch, [redirect, IMAGE_RESPONSE])
    fake_tls(monkeypatch, "other.test")
    pools = track_pools(monkeypatch)
    if allowed:
        assert advanced._read_remote_image_bytes("http://public.test/image.png") == b"image"
        assert connections == [("8.8.8.8", 80), ("1.1.1.1", 443)]
    else:
        with pytest.raises(ValueError, match="redirect target"):
            advanced._read_remote_image_bytes("http://public.test/image.png")
        assert connections == [("8.8.8.8", 80)]
    assert calls == ["public.test", "other.test"]
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


@pytest.mark.parametrize("addresses", [[], ["127.0.0.1"], ["8.8.8.8", "10.0.0.1"], ["::1"], ["100.64.0.1"]])
def test_remote_rejects_empty_or_nonpublic_dns_answers_without_connecting(advanced, monkeypatch, addresses):
    monkeypatch.setattr(socket, "getaddrinfo", lambda _host, port, **_kw: [answer(ip, port) for ip in addresses])
    connections, _requests, _sockets = fake_transport(monkeypatch, [])
    with pytest.raises(ValueError, match="not allowed"):
        advanced._read_remote_image_bytes("http://public.test/image.png")
    assert connections == []


@pytest.mark.parametrize("last_address_succeeds", [True, False])
def test_remote_tries_validated_addresses_and_releases_failed_transports(
    advanced, monkeypatch, last_address_succeeds,
):
    dns_calls = []

    def resolve(host, port, *_args, **_kwargs):
        numeric = numeric_dns_answer(host, port)
        if numeric is not None:
            return numeric
        dns_calls.append((host, port))
        return [answer("8.8.8.8", port), answer("1.1.1.1", port)]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    responses = [ConnectionRefusedError("first address unavailable")]
    responses.append(IMAGE_RESPONSE if last_address_succeeds else
                     TimeoutError("last address timed out"))
    connections, requests, sockets = fake_transport(monkeypatch, responses)
    pools = track_pools(monkeypatch)
    if last_address_succeeds:
        assert advanced._read_remote_image_bytes("http://public.test/image.png") == b"image"
        assert b"Host: public.test\r\n" in b"".join(requests)
    else:
        with pytest.raises(urllib.error.URLError) as failure:
            advanced._read_remote_image_bytes("http://public.test/image.png")
        assert isinstance(failure.value.reason, urllib3.exceptions.ConnectTimeoutError)
        assert requests == []
    assert dns_calls == [("public.test", 80)]
    assert connections == [("8.8.8.8", 80), ("1.1.1.1", 80)]
    assert len(sockets) == 2
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


def test_remote_http_error_does_not_retry_another_validated_ip(advanced, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or
                        [answer("8.8.8.8", port), answer("1.1.1.1", port)])
    response = b"HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n"
    connections, _requests, sockets = fake_transport(monkeypatch, [response])
    pools = track_pools(monkeypatch)
    with pytest.raises(urllib.error.HTTPError) as failure:
        advanced._read_remote_image_bytes("http://public.test/image.png")
    assert failure.value.code == 503
    assert connections == [("8.8.8.8", 80)]
    assert len(pools) == 1
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


@pytest.mark.parametrize("response,exception,match", [
    (b"HTTP/1.1 302 Found\r\nContent-Length: 0\r\n\r\n",
     ValueError, "Location header"),
    (b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\n\r\nimage",
     ValueError, "content type"),
    (IMAGE_RESPONSE, ValueError, "too large"),
    (b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 6\r\n\r\nimage",
     urllib.error.URLError, "IncompleteRead"),
])
def test_remote_rejections_release_partial_responses(
    advanced, monkeypatch, response, exception, match,
):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or
                        [answer("8.8.8.8", port), answer("1.1.1.1", port)])
    if match == "too large":
        monkeypatch.setattr(advanced, "REMOTE_IMAGE_MAX_BYTES", 4)
    connections, _requests, sockets = fake_transport(monkeypatch, [response])
    pools = track_pools(monkeypatch)
    with pytest.raises(exception, match=match):
        advanced._read_remote_image_bytes("http://public.test/image.png")
    assert connections == [("8.8.8.8", 80)]
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


def test_remote_redirect_limit_is_bounded_and_releases_every_response(advanced, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or [answer("8.8.8.8", port)])
    redirect = b"HTTP/1.1 302 Found\r\nLocation: /next.png\r\nContent-Length: 0\r\n\r\n"
    connections, _requests, sockets = fake_transport(monkeypatch, [redirect] * 6)
    pools = track_pools(monkeypatch)
    with pytest.raises(ValueError, match="too many times"):
        advanced._read_remote_image_bytes("http://public.test/image.png")
    assert advanced.REMOTE_IMAGE_MAX_REDIRECTS == 5
    assert len(connections) == len(pools) == 6
    assert all(sock.closed for sock in sockets)
    assert all(pool.pool is None for pool in pools)


def test_remote_relative_redirect_preserves_origin_and_query(advanced, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or [answer("8.8.8.8", port)])
    redirect = b"HTTP/1.1 302 Found\r\nLocation: ../next.png?x=2\r\nContent-Length: 0\r\n\r\n"
    _connections, requests, sockets = fake_transport(monkeypatch, [redirect, IMAGE_RESPONSE])
    assert advanced._read_remote_image_bytes("http://public.test/images/image.png?x=1") == b"image"
    wire = b"".join(requests)
    assert b"GET /images/image.png?x=1 HTTP/1.1\r\n" in wire
    assert b"GET /next.png?x=2 HTTP/1.1\r\n" in wire
    assert wire.count(b"Host: public.test\r\n") == 2
    assert all(sock.closed for sock in sockets)


def test_remote_ipv6_url_preserves_bracketed_host_and_port(advanced, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port))
    connections, requests, sockets = fake_transport(monkeypatch, [IMAGE_RESPONSE])
    assert advanced._read_remote_image_bytes(
        "http://[2001:4860:4860::8888]:8188/image.png",
    ) == b"image"
    assert connections == [("2001:4860:4860::8888", 8188, 0, 0)]
    assert b"Host: [2001:4860:4860::8888]:8188\r\n" in b"".join(requests)
    assert all(sock.closed for sock in sockets)


@requires_real_torch
@pytest.mark.parametrize("toggle", ["A", "B"])
@pytest.mark.parametrize("swap", [False, True])
def test_video_toggle_output_holds_selected_display_side(toggle, swap):
    a = torch.zeros((24, 2, 2, 3))
    b = torch.ones_like(a)
    result = compare._composite_frames("Toggle", a, b, 0.5, swap, toggle, 24)
    expected = float((toggle == "B") != swap)
    assert torch.equal(result, torch.full_like(a, expected))


@requires_real_torch
@pytest.mark.parametrize("count_a,count_b", [(48, 24), (24, 48), (1, 24), (24, 1), (24, 24)])
@pytest.mark.parametrize("swap", [False, True])
@pytest.mark.parametrize("mode", ["Slider", "Side by Side", "Difference", "Toggle"])
def test_video_output_matches_a_anchored_preview_duration(count_a, count_b, swap, mode, monkeypatch, tmp_path):
    a = torch.zeros((count_a, 2, 2, 3))
    b = torch.linspace(0, 1, count_b).reshape(-1, 1, 1, 1).expand(-1, 2, 2, 3)
    monkeypatch.setitem(sys.modules, "folder_paths", SimpleNamespace(get_temp_directory=lambda: str(tmp_path)))
    # Real node payload and full-resolution output; disk encoding is unrelated.
    monkeypatch.setattr(compare, "_export_frame_sequence", lambda video, side, _dir, indices, *_args:
                        ([f"{side}-{i}.webp" for i in indices], 2, 2))
    result = compare.DenoVideoCompare().compare_videos(
        mode, 0.5, "B", swap, 24, video_a=a, video_b=b,
    )
    frames = result["result"][0]
    meta = result["ui"]["deno_video_compare"][0]
    assert len(frames) == count_a
    assert len(frames) / 24 == pytest.approx(meta["duration"], abs=0.0001)
    assert meta["frame_count"] == max(count_a, count_b)
    if mode == "Toggle" and not swap:
        expected_indices = compare._sample_indices(count_b, count_a)
        assert torch.equal(frames, b[expected_indices])


@requires_real_torch
@pytest.mark.parametrize("swap", [False, True])
def test_video_only_b_owns_fallback_duration(swap):
    b = torch.rand((17, 2, 2, 3))
    frames = compare._composite_frames("Toggle", None, b, 0.5, swap, "A", 24)
    assert torch.equal(frames, b)
    assert len(frames) / 24 == compare._shared_timeline_fps(0, 17, 24)[0]
