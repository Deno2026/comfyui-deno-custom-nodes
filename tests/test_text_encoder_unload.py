import importlib.util
import json
import math
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "deno_text_encoder_unload.py"
TEST_PACKAGE = "_deno_text_encoder_unload_test_package"


def _install_comfy_stubs(monkeypatch, *, with_match_type: bool):
    fake_comfy = ModuleType("comfy")
    fake_model_management = ModuleType("comfy.model_management")
    fake_comfy.model_management = fake_model_management
    monkeypatch.setitem(sys.modules, "comfy", fake_comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", fake_model_management)

    fake_comfy_api = ModuleType("comfy_api")
    fake_latest = ModuleType("comfy_api.latest")

    class ComfyNode:
        pass

    fake_io = SimpleNamespace(ComfyNode=ComfyNode)
    if with_match_type:

        class Template:
            def __init__(self, template_id):
                self.template_id = template_id

        class MatchInput:
            def __init__(self, input_id, template, optional=False, tooltip=None):
                self.id = input_id
                self.template = template
                self.optional = optional
                self.tooltip = tooltip

        class MatchOutput:
            def __init__(self, template, id=None, display_name=None, tooltip=None):
                self.template = template
                self.id = id
                self.display_name = display_name
                self.tooltip = tooltip

        class ClipInput:
            def __init__(self, input_id, tooltip=None):
                self.id = input_id
                self.tooltip = tooltip

        class Schema:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        fake_io = SimpleNamespace(
            Clip=SimpleNamespace(Input=ClipInput),
            ComfyNode=ComfyNode,
            MatchType=SimpleNamespace(
                Template=Template,
                Input=MatchInput,
                Output=MatchOutput,
            ),
            Schema=Schema,
        )

    fake_latest.io = fake_io
    fake_comfy_api.latest = fake_latest
    monkeypatch.setitem(sys.modules, "comfy_api", fake_comfy_api)
    monkeypatch.setitem(sys.modules, "comfy_api.latest", fake_latest)


def _load_module(monkeypatch, *, with_match_type: bool):
    for name in list(sys.modules):
        if name == TEST_PACKAGE or name.startswith(f"{TEST_PACKAGE}."):
            monkeypatch.delitem(sys.modules, name, raising=False)

    _install_comfy_stubs(monkeypatch, with_match_type=with_match_type)
    package = ModuleType(TEST_PACKAGE)
    package.__path__ = [str(REPO_ROOT)]
    monkeypatch.setitem(sys.modules, TEST_PACKAGE, package)

    module_name = f"{TEST_PACKAGE}.deno_text_encoder_unload"
    spec = importlib.util.spec_from_file_location(module_name, MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_v1_contract_preserves_any_type_and_runs_every_queue(monkeypatch):
    module = _load_module(monkeypatch, with_match_type=False)
    node = module.DenoTextEncoderUnload
    input_types = node.INPUT_TYPES()

    assert module._HAS_MATCH_TYPE is False
    assert list(input_types) == ["required", "optional"]
    assert list(input_types["required"]) == ["value", "clip"]
    assert list(input_types["optional"]) == ["wait_for"]
    any_type = input_types["required"]["value"][0]
    assert str(any_type) == "*"
    assert not (any_type != "CONDITIONING")
    assert not ("CONDITIONING" != any_type)
    assert json.dumps({"type": any_type}) == '{"type": "*"}'
    assert node.RETURN_TYPES == (any_type,)
    assert node.RETURN_NAMES == ("value",)
    assert node.OUTPUT_NODE is False
    assert math.isnan(node.IS_CHANGED())


def test_match_type_schema_binds_value_input_to_output_and_waits_separately(monkeypatch):
    module = _load_module(monkeypatch, with_match_type=True)
    node = module.DenoTextEncoderUnload
    node.DESCRIPTION = "DENO Custom Nodes v0.7.90\nDecorated description"
    schema = node.define_schema()

    assert module._HAS_MATCH_TYPE is True
    assert schema.node_id == "DenoTextEncoderUnload"
    assert schema.display_name == "(Deno) Text Encoder Unload"
    assert schema.description == node.DESCRIPTION
    assert [entry.id for entry in schema.inputs] == ["value", "clip", "wait_for"]
    assert schema.inputs[0].template is schema.outputs[0].template
    assert schema.inputs[2].template is not schema.outputs[0].template
    assert schema.inputs[2].optional is True
    assert schema.outputs[0].id == "value"
    assert math.isnan(node.fingerprint_inputs())
    assert math.isnan(node.IS_CHANGED())


@pytest.mark.parametrize("with_match_type", [False, True])
def test_execute_returns_same_object_and_targets_only_connected_clip(
    monkeypatch, with_match_type
):
    module = _load_module(monkeypatch, with_match_type=with_match_type)
    calls = []

    def record_unload(clip, **kwargs):
        calls.append((clip, kwargs))

    monkeypatch.setattr(module, "_unload_clip_patcher", record_unload)

    value = object()
    wait_for = object()
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cuda:0", offload_device="cpu")
    )
    node = module.DenoTextEncoderUnload()
    result = node.execute(value, clip, wait_for)

    assert result == (value,)
    assert result[0] is value
    assert calls == [
        (
            clip,
            {
                "missing_patcher_label": "connected CLIP/text encoder",
                "unavailable_feature_label": "Text Encoder Unload",
            },
        )
    ]


def test_gpu_only_clip_fails_before_claiming_vram_release(monkeypatch):
    module = _load_module(monkeypatch, with_match_type=False)
    calls = []
    monkeypatch.setattr(module, "_unload_clip_patcher", calls.append)
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cuda:0", offload_device="cuda:0")
    )

    with pytest.raises(RuntimeError, match=r"without --gpu-only"):
        module.DenoTextEncoderUnload().execute(object(), clip)

    assert calls == []


def test_cpu_resident_clip_is_a_safe_noop_target(monkeypatch):
    module = _load_module(monkeypatch, with_match_type=False)
    calls = []

    def record_unload(clip, **kwargs):
        calls.append((clip, kwargs))

    monkeypatch.setattr(module, "_unload_clip_patcher", record_unload)
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cpu", offload_device="cpu")
    )

    module.DenoTextEncoderUnload().execute("value", clip)

    assert calls == [
        (
            clip,
            {
                "missing_patcher_label": "connected CLIP/text encoder",
                "unavailable_feature_label": "Text Encoder Unload",
            },
        )
    ]


def test_generic_unload_errors_do_not_leak_audio_or_gemma_labels(monkeypatch):
    module = _load_module(monkeypatch, with_match_type=False)

    with pytest.raises(RuntimeError, match=r"connected CLIP/text encoder") as error:
        module.DenoTextEncoderUnload().execute("value", object())

    assert "Audio Analysis" not in str(error.value)
    assert "Gemma" not in str(error.value)

    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cpu", offload_device="cpu")
    )
    with pytest.raises(RuntimeError, match=r"Text Encoder Unload requires") as error:
        module.DenoTextEncoderUnload().execute("value", clip)

    assert "Gemma" not in str(error.value)


def test_registration_metadata_help_and_global_unload_boundary_are_declared():
    public_nodes = json.loads((REPO_ROOT / "node_list.json").read_text(encoding="utf-8"))
    init_source = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")
    metadata_source = (REPO_ROOT / "deno_node_metadata.py").read_text(encoding="utf-8")
    module_source = MODULE_PATH.read_text(encoding="utf-8")

    assert public_nodes["DenoTextEncoderUnload"] == "(Deno) Text Encoder Unload"
    assert '"deno_text_encoder_unload"' in init_source
    assert '"DenoTextEncoderUnload"' in init_source
    assert '"DenoTextEncoderUnload": {' in metadata_source
    assert '"DenoTextEncoderUnload": (' in metadata_source
    assert "unload_all_models" not in module_source
    assert "_unload_clip_patcher(" in module_source
    assert (REPO_ROOT / "web/js/docs/DenoTextEncoderUnload.md").is_file()
    assert (REPO_ROOT / "web/js/docs/DenoTextEncoderUnload/ko.md").is_file()
