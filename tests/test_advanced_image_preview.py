"""Retired external/URL preview routes cannot perform network or filesystem reads."""
import ast
import inspect
import sys
import pytest
from test_image_resize_node import load_package


def test_image_loader_has_no_network_transport_or_custom_preview_routes():
    package = load_package()
    advanced = sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]
    source = inspect.getsource(advanced)
    tree = ast.parse(source)
    imports = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
    assert not imports.intersection({"socket", "urllib", "urllib3", "requests", "httpx", "aiohttp"})
    assert not any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.decorator_list for n in tree.body)
    for removed in ("_read_remote_image_bytes", "_resolve_remote_image_addresses", "deno_advanced_remote_image_preview", "deno_advanced_external_image_view", "deno_advanced_external_folder_images"):
        assert not hasattr(advanced, removed)


@pytest.mark.parametrize("source", ["https://example.com/image.png", "http://127.0.0.1/x", "http://169.254.169.254/x", "file:///private/a.png", r"\\server\share\a.png"])
def test_legacy_urls_fail_with_migration_message_without_resolving_paths(monkeypatch, source):
    package = load_package()
    advanced = sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]
    def forbidden(*args, **kwargs):
        raise AssertionError("Unsupported source touched the filesystem")
    monkeypatch.setattr(advanced.os.path, "realpath", forbidden)
    assert advanced._open_image_source(source) is None
    assert "Upload" in advanced._validate_active_sources(source, "")
    assert advanced._validate_active_sources(source, source) is True
    failures = []
    assert advanced._expand_image_sources([source], True, failures) == []
    assert failures == [source]
