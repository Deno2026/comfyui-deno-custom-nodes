"""Remote thumbnails must use execution's network boundary and stay off the UI loop."""

import asyncio
import io
import sys
import threading
import time
from types import SimpleNamespace

import pytest
from PIL import Image, PngImagePlugin

from test_image_resize_node import load_package


@pytest.fixture
def advanced(monkeypatch):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]
    monkeypatch.setattr(module.web, "json_response", lambda payload, status=200, headers=None:
                        SimpleNamespace(status=status, payload=payload, headers=headers or {}))
    monkeypatch.setattr(module.web, "Response", lambda body, content_type, headers:
                        SimpleNamespace(status=200, body=body, content_type=content_type, headers=headers),
                        raising=False)
    return module


def request(url):
    return SimpleNamespace(query={"url": url}, remote="127.0.0.1")


def png_bytes(size=(1280, 640)):
    output = io.BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("private-note", "must not be forwarded")
    Image.new("RGBA", size, (255, 0, 0, 128)).save(output, format="PNG", pnginfo=metadata)
    return output.getvalue()


def test_remote_preview_uses_backend_reader_and_returns_only_raster_pixels(advanced, monkeypatch):
    sources = []
    source = "http://public.test/image?signature=a%2Bb&expires=5"
    monkeypatch.setattr(advanced, "_read_remote_image_bytes", lambda url:
                        sources.append(url) or png_bytes())
    response = asyncio.run(advanced.deno_advanced_remote_image_preview(request(source)))
    assert sources == [source]
    assert response.status == 200
    assert response.content_type == "image/png"
    assert response.headers == {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    with Image.open(io.BytesIO(response.body)) as preview:
        assert preview.size == (640, 320)
        assert preview.mode == "RGBA"
        assert preview.getpixel((0, 0)) == (255, 0, 0, 128)
        assert "private-note" not in preview.info


@pytest.mark.parametrize("url", ["", "/external/image.png", "file:///private.png", "ftp://public.test/a.png"])
def test_remote_preview_does_not_accept_file_paths_or_non_http_urls(advanced, monkeypatch, url):
    monkeypatch.setattr(advanced, "_read_remote_image_bytes", lambda _url:
                        pytest.fail("invalid preview source must not be fetched"))
    response = asyncio.run(advanced.deno_advanced_remote_image_preview(request(url)))
    assert response.status == 400
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/private.png", "http://user:secret@public.test/image.png",
])
def test_remote_preview_preserves_public_address_and_credential_boundaries(advanced, monkeypatch, url):
    monkeypatch.setattr(advanced.socket, "getaddrinfo", lambda *_args, **_kwargs:
                        [(2, 1, 6, "", ("127.0.0.1", 80))])
    monkeypatch.setattr(advanced, "_open_remote_image_response", lambda *_args:
                        pytest.fail("blocked preview must not connect"))
    response = asyncio.run(advanced.deno_advanced_remote_image_preview(request(url)))
    assert response.status == 400
    assert response.headers["Cache-Control"] == "no-store"
    assert "secret" not in str(response.payload)


@pytest.mark.parametrize("payload", [b"<html>private page</html>", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"])
def test_remote_preview_does_not_forward_remote_markup(advanced, monkeypatch, payload):
    monkeypatch.setattr(advanced, "_read_remote_image_bytes", lambda _url: payload)
    response = asyncio.run(advanced.deno_advanced_remote_image_preview(request("https://public.test/image")))
    assert response.status == 400
    assert not hasattr(response, "body")


def test_remote_preview_decode_is_bounded_before_thumbnailing(advanced, monkeypatch):
    monkeypatch.setattr(advanced, "REMOTE_IMAGE_PREVIEW_MAX_PIXELS", 100)
    monkeypatch.setattr(advanced, "_read_remote_image_bytes", lambda _url: png_bytes((11, 10)))
    response = asyncio.run(advanced.deno_advanced_remote_image_preview(request("https://public.test/image.png")))
    assert response.status == 400


def test_remote_preview_runs_outside_event_loop_with_bounded_parallelism(advanced, monkeypatch):
    state = {"active": 0, "maximum": 0}
    lock = threading.Lock()
    ui_thread = threading.get_ident()

    def preview(_url):
        assert threading.get_ident() != ui_thread
        with lock:
            state["active"] += 1
            state["maximum"] = max(state["maximum"], state["active"])
        time.sleep(0.02)
        with lock:
            state["active"] -= 1
        return b"png"

    monkeypatch.setattr(advanced, "_remote_image_preview_bytes", preview)

    async def exercise():
        tasks = [asyncio.create_task(advanced.deno_advanced_remote_image_preview(
            request(f"https://public.test/{index}.png"))) for index in range(6)]
        await asyncio.sleep(0.005)
        assert any(not task.done() for task in tasks), "event loop must respond during image fetching"
        return await asyncio.wait_for(asyncio.gather(*tasks), timeout=5)

    responses = asyncio.run(exercise())
    assert all(response.status == 200 for response in responses)
    assert state["maximum"] == 4


def test_external_file_previews_stay_localhost_only(advanced):
    remote_request = SimpleNamespace(query={"path": "/private/image.png"}, remote="192.168.1.20")
    response = asyncio.run(advanced.deno_advanced_external_image_view(remote_request))
    assert response.status == 403
    assert "localhost" in response.payload["error"]
