"""Host approval, origin checks and raster-only external image previews."""

import asyncio
import hashlib
import io
import os
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image, PngImagePlugin

from test_image_resize_node import load_package


@pytest.fixture
def image_modules(monkeypatch, tmp_path):
    package = load_package()
    board = sys.modules[f"{package.__name__}.deno_multi_image_board"]
    advanced = sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    monkeypatch.setattr(sys.modules["folder_paths"], "get_input_directory", lambda: str(input_dir))
    monkeypatch.delenv("DENO_EXTERNAL_IMAGE_ROOTS", raising=False)
    monkeypatch.setattr(advanced.web, "json_response", lambda payload, status=200, headers=None:
                        SimpleNamespace(status=status, payload=payload, headers=headers or {}))
    monkeypatch.setattr(advanced.web, "Response", lambda body, content_type, headers:
                        SimpleNamespace(status=200, body=body, content_type=content_type, headers=headers),
                        raising=False)
    return board, advanced, input_dir


def local_request(query, *, origin=None, host="localhost:8188", scheme="http", **extra_headers):
    headers = {"Host": host, **extra_headers}
    if origin is not None:
        headers["Origin"] = origin
    return SimpleNamespace(query=query, remote="127.0.0.1", headers=headers, scheme=scheme)


def save_reference(path, size=(12, 8)):
    path.parent.mkdir(exist_ok=True)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("private-note", "must not leave the server")
    Image.new("RGBA", size, (13, 37, 92, 128)).save(path, pnginfo=metadata)


def test_external_paths_require_host_approval_for_every_read(image_modules, monkeypatch, tmp_path):
    board, advanced, input_dir = image_modules
    outside = tmp_path / "references" / "saved.png"
    save_reference(outside)
    inside = input_dir / "upload.png"
    save_reference(inside)
    assert board._resolve_path("upload.png") == os.path.realpath(inside)
    assert board._resolve_path(str(inside)) == os.path.realpath(inside)
    assert board._resolve_path(str(outside)) is None
    assert board._resolve_external_path(str(outside)) is None
    assert advanced._normalize_external_root(str(outside.parent)) is None
    assert advanced._open_image_source(str(outside)) is None
    failures = []
    assert advanced._expand_image_sources([str(outside.parent)], True, failures) == []
    assert failures == [str(outside.parent)]
    assert "DENO_EXTERNAL_IMAGE_ROOTS" in advanced._validate_active_sources(str(outside), "")
    assert "DENO_EXTERNAL_IMAGE_ROOTS" in board.DenoMultiImageLoader.VALIDATE_INPUTS(str(outside))
    with pytest.raises(ValueError, match="DENO_EXTERNAL_IMAGE_ROOTS"):
        board._hash_file_contents(hashlib.sha256(), str(outside))

    # A request's root value must never grant permission to its own target.
    response = asyncio.run(advanced.deno_advanced_external_folder_images(
        local_request({"root": str(outside.parent)})))
    assert response.status == 403
    assert "DENO_EXTERNAL_IMAGE_ROOTS" in response.payload["error"]

    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(outside.parent))
    assert board._resolve_path(str(outside)) == os.path.realpath(outside)
    assert board._resolve_external_path(str(outside.parent)) == os.path.realpath(outside.parent)
    with advanced._open_image_source(str(outside)) as image:
        assert image.size == (12, 8)
        assert image.getpixel((0, 0)) == (13, 37, 92, 128)
    board._hash_file_contents(hashlib.sha256(), str(outside))


def test_disabled_unapproved_sources_do_not_block_validation_or_hashing(image_modules, monkeypatch, tmp_path):
    board, advanced, input_dir = image_modules
    inside = input_dir / "keep.png"
    save_reference(inside)
    outside = str(tmp_path / "private" / "old.png")
    sources = f"keep.png\n{outside}"
    assert advanced._validate_active_sources(sources, outside) is True
    assert board.DenoMultiImageLoader.VALIDATE_INPUTS(sources, disabled_image_paths=outside) is True
    kwargs = dict(mode="Manual Input", ratio_preset="16:9", megapixels=1.0, width=64,
                  height=64, divisible_by="32", interpolation="nearest", resize_method="Center Crop (Fill)")
    loader = board.DenoMultiImageLoader
    assert loader.IS_CHANGED(sources, disabled_image_paths=outside, **kwargs) == loader.IS_CHANGED("keep.png", **kwargs)
    advanced_loader = advanced.DenoAdvancedImageSourceLoader
    advanced_kwargs = {**kwargs, "recursive_folders": True, "list_output_mode": "Original Size"}
    assert advanced_loader.IS_CHANGED(sources, disabled_image_paths=outside, **advanced_kwargs) == advanced_loader.IS_CHANGED("keep.png", **advanced_kwargs)

    node = advanced_loader()
    monkeypatch.setattr(advanced, "_image_source_to_tensor", lambda _source: None)
    with pytest.raises(RuntimeError, match="DENO_EXTERNAL_IMAGE_ROOTS"):
        node.load_images(outside, **advanced_kwargs)


@pytest.mark.parametrize("unsafe_path", [
    r"\\attacker.example\share\image.png", "//attacker.example/share/image.png",
    r"\/attacker.example\share\image.png", r"/\attacker.example\share\image.png",
    r"\\?\C:\private\image.png", r"\\.\C:\private\image.png",
    r"C:\private\image.png:secret", "relative.png:secret", "file:///private/image.png",
])
def test_network_device_and_stream_paths_are_rejected_before_filesystem_access(image_modules, monkeypatch, unsafe_path):
    board, advanced, _input_dir = image_modules
    def forbidden(*_args, **_kwargs):
        pytest.fail("unsafe client path reached the filesystem")
    monkeypatch.setattr(board.os.path, "realpath", forbidden)
    monkeypatch.setattr(board.os.path, "isdir", forbidden)
    monkeypatch.setattr(board.os.path, "isfile", forbidden)
    monkeypatch.setattr(board.os, "stat", forbidden)
    assert board._resolve_path(unsafe_path) is None
    assert board._resolve_external_path(unsafe_path) is None
    assert board._resolve_input_path(unsafe_path) is None
    assert advanced._normalize_external_root(unsafe_path) is None
    assert advanced._open_image_source(unsafe_path) is None
    assert advanced._expand_image_sources([unsafe_path], True) == []


def test_root_configuration_accepts_only_explicit_absolute_folders(image_modules, monkeypatch, tmp_path):
    board, _advanced, input_dir = image_modules
    first, second = tmp_path / "first", tmp_path / "second"
    first.mkdir()
    second.mkdir()
    invalid = ["relative", str(tmp_path / "*"), "file:///private", r"\\attacker\share", str(Path(tmp_path.anchor))]
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", os.pathsep.join([str(first), *invalid, str(second)]))
    assert set(board._approved_image_roots()) == {
        os.path.realpath(input_dir), os.path.realpath(first), os.path.realpath(second),
    }


def test_traversal_cannot_escape_input_or_selected_external_root(image_modules, monkeypatch, tmp_path):
    board, advanced, input_dir = image_modules
    root = tmp_path / "approved"
    root.mkdir()
    other = root / "other"
    other.mkdir()
    selected = root / "selected"
    selected.mkdir()
    save_reference(other / "outside-selected.png")
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(root))
    assert board._resolve_external_path("../approved/other/outside-selected.png") is None
    assert board._resolve_path("../approved/other/outside-selected.png") is None
    response = asyncio.run(advanced.deno_advanced_external_folder_images(
        local_request({"root": str(selected), "path": "../other"})))
    assert response.status == 400


@pytest.mark.parametrize("route_name,query", [
    ("deno_advanced_external_folder_images", {"root": "/private"}),
    ("deno_advanced_external_image_view", {"path": "/private/image.png"}),
])
@pytest.mark.parametrize("host,origin,scheme", [
    ("localhost:8188", "https://attacker.example", "http"),
    ("localhost:8188", "http://localhost:9999", "http"),
    ("localhost:0", "http://localhost", "http"),
    ("localhost:8188", "https://localhost:8188", "http"),
    ("localhost:8188", "null", "http"),
    ("attacker.example:8188", "http://attacker.example:8188", "http"),
    ("attacker.example:8188", None, "http"),
])
def test_external_routes_reject_cross_origin_and_untrusted_host(image_modules, monkeypatch, route_name, query, host, origin, scheme):
    _board, advanced, _input_dir = image_modules
    monkeypatch.setattr(advanced, "_normalize_external_root", lambda *_args: pytest.fail("cross-origin request reached folder access"))
    monkeypatch.setattr(advanced, "_resolve_path", lambda *_args: pytest.fail("cross-origin request reached file access"))
    response = asyncio.run(getattr(advanced, route_name)(local_request(
        query, host=host, origin=origin, scheme=scheme,
        **{"X-Forwarded-Host": "localhost:8188", "X-Forwarded-Proto": "https"})))
    assert response.status == 403
    assert "origin" in response.payload["error"]


@pytest.mark.parametrize("origin", [None, "http://localhost:8188"])
def test_approved_local_preview_returns_only_bounded_raster_pixels(image_modules, monkeypatch, tmp_path, origin):
    _board, advanced, _input_dir = image_modules
    image_path = tmp_path / "approved" / "reference.png"
    save_reference(image_path, (1280, 640))
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(image_path.parent))
    thread = threading.get_ident()
    worker = advanced._local_image_preview_bytes
    def checked_worker(path):
        assert threading.get_ident() != thread
        return worker(path)
    monkeypatch.setattr(advanced, "_local_image_preview_bytes", checked_worker)
    response = asyncio.run(advanced.deno_advanced_external_image_view(local_request(
        {"path": str(image_path)}, origin=origin)))
    assert response.status == 200
    assert response.content_type == "image/png"
    assert response.headers == {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    with Image.open(io.BytesIO(response.body)) as image:
        assert image.size == (640, 320)
        # Pillow's premultiplied-alpha resize can round an RGB channel by one.
        assert all(abs(actual - expected) <= 1 for actual, expected in
                   zip(image.getpixel((0, 0)), (13, 37, 92, 128)))
        assert "private-note" not in image.info


def test_external_preview_never_forwards_nonimage_original_bytes(image_modules, monkeypatch, tmp_path):
    _board, advanced, _input_dir = image_modules
    image_path = tmp_path / "approved" / "not-image.png"
    image_path.parent.mkdir()
    secret = b"<html>secret credential is not a raster image</html>"
    image_path.write_bytes(secret)
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(image_path.parent))
    response = asyncio.run(advanced.deno_advanced_external_image_view(local_request({"path": str(image_path)})))
    assert response.status == 400
    assert not hasattr(response, "body")
    assert "secret" not in str(response.payload)


def test_external_preview_enforces_byte_and_pixel_limits(image_modules, monkeypatch, tmp_path):
    _board, advanced, _input_dir = image_modules
    image_path = tmp_path / "approved" / "reference.png"
    save_reference(image_path)
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(image_path.parent))
    monkeypatch.setattr(advanced, "REMOTE_IMAGE_MAX_BYTES", 8)
    with pytest.raises(ValueError, match="too large"):
        advanced._local_image_preview_bytes(str(image_path))
    monkeypatch.setattr(advanced, "REMOTE_IMAGE_MAX_BYTES", 65536)
    monkeypatch.setattr(advanced, "REMOTE_IMAGE_PREVIEW_MAX_PIXELS", 8)
    with pytest.raises(ValueError, match="too large"):
        advanced._local_image_preview_bytes(str(image_path))


def test_external_listing_and_recursive_expansion_exclude_links_outside_selected_root(image_modules, monkeypatch, tmp_path):
    board, advanced, _input_dir = image_modules
    root, outside = tmp_path / "approved", tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    save_reference(root / "inside.png")
    save_reference(outside / "secret.png")
    link = root / "external-link"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as error:
        if os.name != "nt":
            pytest.skip(f"directory links unavailable: {error}")
        result = subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(outside)],
                                check=False, capture_output=True, text=True)
        if result.returncode:
            pytest.skip(f"directory links unavailable: {result.stderr or result.stdout}")
    # Even a second approved root must not widen a selected folder's listing.
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", os.pathsep.join([str(root), str(outside)]))
    listing = advanced._list_external_folder_entries(str(root))
    assert listing["folders"] == []
    assert [Path(row["path"]).name for row in listing["files"]] == ["inside.png"]
    assert advanced._resolve_external_browser_dir(str(root), "external-link") is None
    assert advanced._expand_image_sources([str(root)], True) == [os.path.realpath(root / "inside.png")]

    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(root))
    assert board._resolve_path(str(link / "secret.png")) is None
    assert advanced._open_image_source(str(link / "secret.png")) is None


def test_external_listing_excludes_individual_file_links_outside_selected_root(image_modules, monkeypatch, tmp_path):
    board, advanced, _input_dir = image_modules
    root, outside = tmp_path / "approved", tmp_path / "other-approved"
    root.mkdir()
    outside.mkdir()
    save_reference(root / "inside.png")
    save_reference(outside / "secret.png")
    alias = root / "linked-secret.png"
    alias.write_bytes(b"stand-in for a file reparse point")
    real_realpath = os.path.realpath
    alias_path = os.path.normcase(str(alias))
    def resolve_file_link(path):
        if os.path.normcase(os.path.abspath(str(path))) == alias_path:
            return real_realpath(outside / "secret.png")
        return real_realpath(path)
    monkeypatch.setattr(board.os.path, "realpath", resolve_file_link)
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", os.pathsep.join([str(root), str(outside)]))
    listing = advanced._list_external_folder_entries(str(root))
    assert [Path(row["path"]).name for row in listing["files"]] == ["inside.png"]
    assert advanced._expand_image_sources([str(root)], True) == [real_realpath(root / "inside.png")]
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(root))
    assert board._resolve_path(str(alias)) is None
