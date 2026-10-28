"""Slot expansion must preserve the original workflow and API contracts."""
import importlib.util
from pathlib import Path
import sys
import types

import pytest


@pytest.fixture
def loader_module(monkeypatch):
    comfy = types.ModuleType("comfy")
    comfy.__path__ = []
    for name in ("lora", "lora_convert", "utils"):
        child = types.ModuleType(f"comfy.{name}")
        setattr(comfy, name, child)
        monkeypatch.setitem(sys.modules, f"comfy.{name}", child)
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    paths = types.ModuleType("folder_paths")
    paths.get_filename_list = lambda _folder: [f"lora-{i}.safetensors" for i in range(1, 65)]
    monkeypatch.setitem(sys.modules, "folder_paths", paths)
    comfy.lora.model_lora_keys_unet = lambda _model, keys: keys
    comfy.lora.model_lora_keys_clip = lambda _clip, keys: keys
    comfy.lora_convert.convert_lora = lambda state: state
    comfy.lora.load_lora = lambda state, _keys: state
    spec = importlib.util.spec_from_file_location(
        "multi_lora_capacity", Path(__file__).resolve().parents[1] / "deno_multi_lora_loader.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Patcher:
    model = object()
    cond_stage_model = object()

    def __init__(self, patches=()):
        self.patches = list(patches)

    def clone(self):
        return Patcher(self.patches)

    def add_patches(self, state, strength):
        self.patches.append((state, strength))


def test_schema_appends_optional_slots_after_all_original_values(loader_module):
    schema = loader_module.DenoMultiLoraLoader.INPUT_TYPES()
    original = ["model", "active_loras"]
    for i in range(1, 9):
        original.extend(f"{p}_{i}" for p in ("enabled", "lora", "model_strength", "clip_strength"))
    for i in range(1, 9):
        original.extend((f"trigger_{i}", f"description_{i}"))
    assert list(schema["required"]) == original
    assert next(iter(schema["optional"])) == "clip"
    assert schema["required"]["active_loras"][1]["max"] == 64
    assert len(schema["optional"]) == 1 + 56 * 6
    assert schema["optional"]["lora_64"][0][0] == "__none__"
    assert "description_64" in schema["optional"]
    assert loader_module.DenoMultiLoraLoader.RETURN_NAMES == ("model", "clip")


@pytest.mark.parametrize("count", [8, 9, 16, 64])
@pytest.mark.parametrize("with_clip", [False, True])
def test_all_slots_apply_in_order_with_independent_strengths(loader_module, count, with_clip):
    loader = loader_module.DenoMultiLoraLoader()
    loader._load_lora_dict = lambda name: name if name != "__none__" else None
    kwargs = {}
    for i in range(1, count + 1):
        kwargs.update({f"lora_{i}": f"lora-{i}.safetensors",
                       f"model_strength_{i}": i / 10, f"clip_strength_{i}": -i / 10})
    model, clip = Patcher(), Patcher() if with_clip else None
    out_model, out_clip = loader.load_multi_lora(model, clip, count, **kwargs)
    assert out_model.patches == [(f"lora-{i}.safetensors", i / 10) for i in range(1, count + 1)]
    assert not model.patches
    if with_clip:
        assert out_clip.patches == [(f"lora-{i}.safetensors", -i / 10) for i in range(1, count + 1)]
        assert not clip.patches
    else:
        assert out_clip is None


def test_new_slots_validate_missing_files_and_active_strengths(loader_module):
    validate = loader_module.DenoMultiLoraLoader.VALIDATE_INPUTS
    assert validate(64, lora_64="lora-64.safetensors") is True
    assert "slot 64" in validate(64, lora_64="missing.safetensors")
    assert "finite" in validate(64, model_strength_64=float("nan"))
    assert validate(64, enabled_64=False, lora_64="missing.safetensors", clip_strength_64=float("nan")) is True
    assert validate(8, lora_64="missing.safetensors") is True
    assert "between 0 and 64" in validate(65)


def test_old_api_prompt_needs_no_new_slot_inputs(loader_module):
    model, clip = object(), object()
    assert loader_module.DenoMultiLoraLoader().load_multi_lora(model, clip, 8) == (model, clip)
