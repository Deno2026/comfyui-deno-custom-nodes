"""Input-only image loading: old opt-ins, URLs and directory links cannot extend access."""
import hashlib
import os
import subprocess
import sys
from pathlib import Path
import pytest
from PIL import Image
from test_image_resize_node import load_package


@pytest.fixture
def image_modules(monkeypatch, tmp_path):
    package = load_package()
    board = sys.modules[f"{package.__name__}.deno_multi_image_board"]
    advanced = sys.modules[f"{package.__name__}.deno_advanced_image_source_loader"]
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    monkeypatch.setattr(sys.modules["folder_paths"], "get_input_directory", lambda: str(input_dir))
    board._cached_image_is_valid.cache_clear()
    board._cached_file_sha256.cache_clear()
    return board, advanced, input_dir


def save_reference(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (12, 8), (13, 37, 92)).save(path)


def test_old_root_opt_in_cannot_enable_external_reads(image_modules, monkeypatch, tmp_path):
    board, advanced, input_dir = image_modules
    outside = tmp_path / "private" / "outside.png"
    inside = input_dir / "nested" / "inside.png"
    save_reference(outside)
    save_reference(inside)
    monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(outside.parent))
    assert board._approved_image_roots() == [os.path.realpath(input_dir)]
    assert board._resolve_path(str(outside)) is None
    assert board._resolve_input_source_path(str(outside.parent)) is None
    assert advanced._open_image_source(str(outside)) is None
    assert "Upload" in advanced._validate_active_sources(str(outside), "")
    assert "Upload" in board.DenoMultiImageLoader.VALIDATE_INPUTS(str(outside))
    with pytest.raises(ValueError, match="Upload"):
        board._hash_file_contents(hashlib.sha256(), str(outside))
    assert board._resolve_path("nested/inside.png") == os.path.realpath(inside)
    assert board._resolve_path(str(inside)) == os.path.realpath(inside)
    with advanced._open_image_source("nested/inside.png") as image:
        assert image.size == (12, 8)
    board._hash_file_contents(hashlib.sha256(), str(inside))


def test_external_absolute_paths_rejected_before_canonical_resolution(image_modules, monkeypatch, tmp_path):
    board, advanced, _ = image_modules
    outside = str(tmp_path / "private" / "secret.png")
    def forbidden(*args, **kwargs):
        raise AssertionError("External path reached filesystem resolution")
    monkeypatch.setattr(board.os.path, "realpath", forbidden)
    assert board._resolve_path(outside) is None
    assert advanced._open_image_source(outside) is None


@pytest.mark.parametrize("source", [r"\\server\share\x.png", "//server/share/x.png", r"\\?\C:\x.png", "https://example.com/x.png", "file:///private/x.png", "x.png:secret", "C:relative.png", "../outside.png"])
def test_unsupported_sources_do_not_resolve(image_modules, monkeypatch, source):
    board, advanced, _ = image_modules
    # Drive-relative paths must be refused on every platform, before probing them.
    assert board._resolve_path(source) is None
    assert board._resolve_input_source_path(source) is None
    assert advanced._open_image_source(source) is None


def test_disabled_legacy_sources_preserve_saved_workflow_and_cache(image_modules, tmp_path):
    board, advanced, input_dir = image_modules
    save_reference(input_dir / "keep.png")
    blocked = [str(tmp_path / "private/old.png"), "https://example.com/old.png"]
    disabled = "\n".join(blocked)
    sources = "keep.png\n" + disabled
    assert advanced._validate_active_sources(sources, disabled) is True
    assert board.DenoMultiImageLoader.VALIDATE_INPUTS(sources, disabled_image_paths=disabled) is True
    args = dict(mode="Manual Input", ratio_preset="16:9", megapixels=1.0, width=64, height=64, divisible_by="32", interpolation="nearest", resize_method="Center Crop (Fill)")
    assert board.DenoMultiImageLoader.IS_CHANGED(sources, disabled_image_paths=disabled, **args) == board.DenoMultiImageLoader.IS_CHANGED("keep.png", **args)
    args.update(recursive_folders=True, list_output_mode="Original Size")
    assert advanced.DenoAdvancedImageSourceLoader.IS_CHANGED(sources, disabled_image_paths=disabled, **args) == advanced.DenoAdvancedImageSourceLoader.IS_CHANGED("keep.png", **args)
    with pytest.raises(RuntimeError, match="Upload"):
        advanced.DenoAdvancedImageSourceLoader().load_images(disabled, **args)


def test_input_directory_link_cannot_escape_even_with_old_root_opt_in(image_modules, monkeypatch, tmp_path):
    board, advanced, input_dir = image_modules
    outside = tmp_path / "outside"
    save_reference(outside / "private.png")
    save_reference(input_dir / "keep.png")
    link = input_dir / "linked"
    if os.name == "nt":
        # A junction fixture needs no elevation; it is removed without traversing its target.
        result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True)
        assert result.returncode == 0, result.stderr
    else:
        link.symlink_to(outside, target_is_directory=True)
    try:
        monkeypatch.setenv("DENO_EXTERNAL_IMAGE_ROOTS", str(outside))
        assert board._resolve_path("linked/private.png") is None
        assert board._resolve_input_source_path("linked") is None
        assert advanced._expand_image_sources([str(input_dir)], True) == [str(input_dir / "keep.png")]
        assert board._list_input_folder_entries("")["blocked_count"] == 1
        with pytest.raises(ValueError, match="Upload"):
            board._hash_file_contents(hashlib.sha256(), str(link / "private.png"))
    finally:
        if os.name == "nt":
            os.rmdir(link)
        else:
            link.unlink()
