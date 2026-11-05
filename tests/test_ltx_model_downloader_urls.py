"""LTX model downloader only hands out http(s) links and the Down button checks the scheme."""
import sys
from pathlib import Path

import pytest
from test_image_resize_node import load_package

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def downloader():
    package = load_package()
    return sys.modules[f"{package.__name__}.deno_ltx_model_downloader"]


@pytest.mark.parametrize(
    "url",
    [
        "https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/a.safetensors?download=true",
        "http://example.com/model.safetensors",
        "HTTPS://Example.com/model.safetensors",
        "  https://civitai.com/api/download/models/123  ",
    ],
)
def test_web_addresses_are_kept(downloader, url):
    assert downloader._safe_web_link(url) == url.strip()


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "javascript:alert(1)",
        "data:text/html,<b>x</b>",
        "file:///C:/Windows/system32/calc.exe",
        "ftp://example.com/model.safetensors",
        "steam://run/1",
        "//example.com/model.safetensors",
        "https://",
        "https:///model.safetensors",
        "example.com/model.safetensors",
        "http://[bad",
        None,
    ],
)
def test_non_web_addresses_are_dropped(downloader, url):
    assert downloader._safe_web_link(url) == ""


def test_default_package_rows_keep_their_huggingface_links(downloader, tmp_path):
    package = downloader._default_package()
    rows = downloader._public_package_files(str(tmp_path), package)
    assert rows
    for row, source in zip(rows, package["files"]):
        assert row["url"] == source["url"]
        assert row["url"].startswith("https://huggingface.co/")
        assert row["error"] == ""


def test_user_preset_rows_with_unsafe_links_are_blanked_with_a_reason(downloader, tmp_path):
    package = {
        "files": [
            {"url": "https://example.com/ok.safetensors", "target_subdir": "vae", "filename": "ok.safetensors"},
            {"url": "javascript:alert(1)", "target_subdir": "vae", "filename": "bad.safetensors"},
            {"url": "", "target_subdir": "vae", "filename": "empty.safetensors"},
        ]
    }
    ok, bad, empty = downloader._public_package_files(str(tmp_path), package)

    assert ok["url"] == "https://example.com/ok.safetensors"
    assert ok["error"] == ""
    assert bad["url"] == ""
    assert bad["error"] == downloader.DOWNLOAD_LINK_ERROR
    assert bad["filename"] == "bad.safetensors"
    assert empty["url"] == ""
    assert empty["error"] == ""


def test_down_button_checks_scheme_before_opening():
    script = (REPO_ROOT / "web" / "js" / "deno_ltx_model_downloader.js").read_text(encoding="utf-8")
    check = script.index("if (!isWebDownloadUrl(file.url))")
    opened = script.index("window.open(file.url")
    assert check < opened
    assert 'protocol === "https:" || protocol === "http:"' in script
    assert script.count("window.open(") == 1
