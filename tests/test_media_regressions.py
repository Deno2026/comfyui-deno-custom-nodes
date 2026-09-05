"""Network-free URL boundary checks and CPU video comparison regressions."""

import http.client
import io
import ipaddress
import socket
import ssl
import sys
import urllib.error
from types import SimpleNamespace

import pytest
import torch

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

    def settimeout(self, timeout):
        self.timeout = timeout

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
    assert all(sock.closed for sock in sockets)


def test_https_pins_address_but_preserves_hostname_verification(advanced, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, *_args, **_kw:
                        numeric_dns_answer(host, port) or [answer("8.8.8.8", port)])
    connections, requests, _sockets = fake_transport(monkeypatch, [IMAGE_RESPONSE])
    tls_calls = []
    handler = next(h for h in advanced._REMOTE_IMAGE_OPENER.handlers
                   if isinstance(h, advanced._DenoPinnedHTTPSHandler))
    # Python 3.11 creates the default TLS context in HTTPSConnection; newer
    # urllib versions may create it in HTTPSHandler instead.
    context = advanced._pinned_remote_connection(http.client.HTTPSConnection, [])(
        "images.public.test", context=handler._context,
    )._context
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED

    def wrap_socket(sock, *, server_hostname):
        tls_calls.append(server_hostname)
        return sock

    monkeypatch.setattr(context, "wrap_socket", wrap_socket)
    monkeypatch.setattr(handler, "_context", context)
    assert advanced._read_remote_image_bytes("https://images.public.test/image.png") == b"image"
    assert connections == [("8.8.8.8", 443)]
    assert tls_calls == ["images.public.test"]
    assert b"Host: images.public.test\r\n" in b"".join(requests)


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
    handler = next(h for h in advanced._REMOTE_IMAGE_OPENER.handlers
                   if isinstance(h, advanced._DenoPinnedHTTPSHandler))
    context = ssl.create_default_context()
    monkeypatch.setattr(context, "wrap_socket", lambda sock, **_kw: sock)
    monkeypatch.setattr(handler, "_context", context)
    if allowed:
        assert advanced._read_remote_image_bytes("http://public.test/image.png") == b"image"
        assert connections == [("8.8.8.8", 80), ("1.1.1.1", 443)]
    else:
        with pytest.raises(ValueError, match="redirect target"):
            advanced._read_remote_image_bytes("http://public.test/image.png")
        assert connections == [("8.8.8.8", 80)]
    assert calls == ["public.test", "other.test"]
    assert all(sock.closed for sock in sockets)


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
    if last_address_succeeds:
        assert advanced._read_remote_image_bytes("http://public.test/image.png") == b"image"
        assert b"Host: public.test\r\n" in b"".join(requests)
    else:
        with pytest.raises(urllib.error.URLError, match="last address timed out"):
            advanced._read_remote_image_bytes("http://public.test/image.png")
        assert requests == []
    assert dns_calls == [("public.test", 80)]
    assert connections == [("8.8.8.8", 80), ("1.1.1.1", 80)]
    assert len(sockets) == 2
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
