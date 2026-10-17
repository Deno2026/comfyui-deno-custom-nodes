"""Untrusted save-route paths are screened before filesystem interpretation."""

import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import types

import pytest


@pytest.fixture
def director(monkeypatch, tmp_path):
    routes = {}

    class Routes:
        def post(self, path):
            def register(function):
                routes[path] = function
                return function
            return register

    folders = types.ModuleType("folder_paths")
    roots = {name: tmp_path / name for name in ("temp", "input", "output")}
    for root in roots.values():
        root.mkdir()
    folders.get_directory_by_type = lambda name: str(roots[name]) if name in roots else None
    folders.get_output_directory = lambda: str(roots["output"])

    def save_path(prefix, output_dir):
        relative = Path(prefix.replace("\\", "/"))
        destination = Path(output_dir) / relative.parent
        destination.mkdir(parents=True, exist_ok=True)
        return str(destination), relative.name, 1, str(relative.parent), prefix

    folders.get_save_image_path = save_path
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes()))
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = types.SimpleNamespace(json_response=lambda body, status=200: types.SimpleNamespace(
        status=status, text=json.dumps(body),
    ))
    monkeypatch.setitem(sys.modules, "folder_paths", folders)
    monkeypatch.setitem(sys.modules, "server", server)
    monkeypatch.setitem(sys.modules, "aiohttp", aiohttp)
    path = Path(__file__).resolve().parents[1] / "deno_ideogram_director.py"
    spec = importlib.util.spec_from_file_location("deno_director_save_security", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, roots, routes["/deno/ideogram_director/save"]


def invoke(route, payload):
    class Request:
        async def json(self):
            return payload

    response = asyncio.run(route(Request()))
    return response.status, json.loads(response.text)


UNSAFE_PATHS = [
    r"\\untrusted.invalid\share\image.png",
    "//untrusted.invalid/share/image.png",
    "\\/untrusted.invalid/share/image.png",
    "/\\untrusted.invalid/share/image.png",
    r"\\?\UNC\untrusted.invalid\share\image.png",
    r"\\.\C:\image.png",
    r"C:\image.png",
    "C:image.png",
    "/image.png",
    "\\image.png",
    "image.png:secret",
    "image\x00.png",
    "../image.png",
    r"nested\..\image.png",
    "nested/.. /image.png",
    "NUL.png",
    "NUL .png",
    "nested/COM1.png",
]


@pytest.mark.parametrize("field", ["filename", "subfolder", "prefix"])
@pytest.mark.parametrize("value", UNSAFE_PATHS)
def test_unsafe_request_paths_are_rejected_before_filesystem(director, monkeypatch, field, value):
    module, _roots, route = director
    calls = []

    def forbidden(*args, **kwargs):
        calls.append(args)
        raise AssertionError("An unsafe request reached filesystem interpretation")

    monkeypatch.setattr(module.os.path, "realpath", forbidden)
    monkeypatch.setattr(module.os.path, "isfile", forbidden)
    monkeypatch.setattr(module.shutil, "copyfile", forbidden)
    monkeypatch.setattr(module.folder_paths, "get_directory_by_type", forbidden)
    monkeypatch.setattr(module.folder_paths, "get_save_image_path", forbidden)
    payload = {"filename": "image.png", "subfolder": "", "type": "temp", "prefix": "Director"}
    payload[field] = value
    status, body = invoke(route, payload)
    assert status == 400
    assert "relative paths" in body["error"]
    assert calls == []


@pytest.mark.parametrize("payload", [None, [], "image.png", 1, False])
def test_non_object_body_is_rejected(director, payload):
    assert invoke(director[2], payload)[0] == 400


@pytest.mark.parametrize("field", ["filename", "subfolder", "type", "prefix"])
@pytest.mark.parametrize("value", [None, [], {}, 1, False])
def test_non_string_path_fields_are_rejected(director, field, value):
    payload = {"filename": "image.png", field: value}
    assert invoke(director[2], payload)[0] == 400


@pytest.mark.parametrize("source_type", ["temp", "input", "output"])
def test_valid_image_save_preserves_bytes_and_subfolder_prefix(director, source_type):
    _module, roots, route = director
    source = roots[source_type] / "generated" / "image.png"
    source.parent.mkdir()
    source.write_bytes(b"unchanged generated image bytes")
    status, body = invoke(route, {
        "filename": "image.png", "subfolder": "generated", "type": source_type,
        "prefix": "shots/%year%-%month%/Director",
    })
    assert status == 200
    assert body["type"] == "output"
    saved = roots["output"] / body["subfolder"] / body["saved"]
    assert saved.read_bytes() == source.read_bytes()
    assert "%year%-%month%" in body["subfolder"]


def test_symlink_escape_is_rejected_after_canonical_containment(director, monkeypatch, tmp_path):
    module, roots, route = director
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "image.png").write_bytes(b"private outside image")
    link = roots["temp"] / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            pytest.skip("This account cannot create directory symlinks")
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)],
            capture_output=True, text=True, errors="replace",
        )
        if result.returncode:
            pytest.skip("This Windows account cannot create directory links")
    calls = []
    monkeypatch.setattr(module.shutil, "copyfile", lambda *args: calls.append(args))
    status, _body = invoke(route, {"filename": "image.png", "subfolder": "linked"})
    assert status == 404
    assert calls == []
