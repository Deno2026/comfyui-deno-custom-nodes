"""LTX 2.3 preset loader only uses node classes ComfyUI has already loaded."""
import sys
from pathlib import Path

import pytest
from test_image_resize_node import load_package

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def loader(monkeypatch, tmp_path):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_ltx23_preset_loader"]
    custom_nodes = tmp_path / "custom_nodes"
    custom_nodes.mkdir()
    monkeypatch.setattr(module, "_find_custom_nodes_root", lambda: custom_nodes)
    monkeypatch.setattr(module.nodes, "NODE_CLASS_MAPPINGS", {}, raising=False)
    return module, custom_nodes


def test_loaded_gguf_class_is_returned_without_touching_pack_files(loader, monkeypatch):
    module, custom_nodes = loader

    class Advanced:
        pass

    class Plain:
        pass

    monkeypatch.setattr(module.nodes, "NODE_CLASS_MAPPINGS", {"UnetLoaderGGUF": Plain})
    assert module._get_gguf_loader_class() is Plain
    monkeypatch.setattr(
        module.nodes, "NODE_CLASS_MAPPINGS", {"UnetLoaderGGUF": Plain, "UnetLoaderGGUFAdvanced": Advanced}
    )
    assert module._get_gguf_loader_class() is Advanced
    assert list(custom_nodes.iterdir()) == []


def test_loaded_kj_vae_class_is_returned(loader, monkeypatch):
    module, _ = loader

    class VAELoaderKJ:
        pass

    monkeypatch.setattr(module.nodes, "NODE_CLASS_MAPPINGS", {"VAELoaderKJ": VAELoaderKJ})
    assert module._get_kj_vae_loader_class() is VAELoaderKJ


def test_installed_but_not_loaded_packs_give_clear_errors(loader):
    module, custom_nodes = loader
    (custom_nodes / "ComfyUI-GGUF").mkdir()
    (custom_nodes / "comfyui-kjnodes").mkdir()

    with pytest.raises(RuntimeError, match="installed, but its GGUF UNet loader is not loaded"):
        module._get_gguf_loader_class()
    with pytest.raises(RuntimeError, match="installed, but its VAELoaderKJ node is not loaded"):
        module._get_kj_vae_loader_class()
    assert "restart ComfyUI" in module.GGUF_NOT_LOADED_MESSAGE
    assert "Manager" in module.KJ_NOT_LOADED_MESSAGE


def test_missing_packs_give_install_guidance(loader):
    module, _ = loader

    with pytest.raises(RuntimeError) as gguf_error:
        module._get_gguf_loader_class()
    assert str(gguf_error.value) == module.GGUF_INSTALL_MESSAGE
    with pytest.raises(RuntimeError) as kj_error:
        module._get_kj_vae_loader_class()
    assert str(kj_error.value) == module.KJ_INSTALL_MESSAGE


def test_loader_source_never_executes_other_pack_files():
    source = (REPO_ROOT / "deno_ltx23_preset_loader.py").read_text(encoding="utf-8")
    assert "exec_module" not in source
    assert "spec_from_file_location" not in source
    assert "sys.modules" not in source
