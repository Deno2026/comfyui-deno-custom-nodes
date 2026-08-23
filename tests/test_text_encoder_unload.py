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


def _install_comfy_stubs(monkeypatch, *, with_conditioning_io: bool):
    fake_comfy = ModuleType("comfy")
    fake_model_management = ModuleType("comfy.model_management")
    fake_comfy.model_management = fake_model_management
    monkeypatch.setitem(sys.modules, "comfy", fake_comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", fake_model_management)

    fake_comfy_execution = ModuleType("comfy_execution")
    fake_graph_utils = ModuleType("comfy_execution.graph_utils")

    class ExecutionBlocker:
        def __init__(self, message):
            self.message = message

    fake_graph_utils.ExecutionBlocker = ExecutionBlocker
    fake_comfy_execution.graph_utils = fake_graph_utils
    monkeypatch.setitem(sys.modules, "comfy_execution", fake_comfy_execution)
    monkeypatch.setitem(sys.modules, "comfy_execution.graph_utils", fake_graph_utils)

    fake_comfy_api = ModuleType("comfy_api")
    fake_latest = ModuleType("comfy_api.latest")

    class ComfyNode:
        pass

    fake_io = SimpleNamespace(ComfyNode=ComfyNode)
    if with_conditioning_io:

        class ConditioningInput:
            def __init__(
                self,
                input_id,
                display_name=None,
                optional=False,
                tooltip=None,
            ):
                self.id = input_id
                self.display_name = display_name
                self.optional = optional
                self.tooltip = tooltip

        class ConditioningOutput:
            def __init__(self, id=None, display_name=None, tooltip=None):
                self.id = id
                self.display_name = display_name
                self.tooltip = tooltip

        class ClipInput:
            def __init__(self, input_id, display_name=None, tooltip=None):
                self.id = input_id
                self.display_name = display_name
                self.tooltip = tooltip

        class Schema:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        fake_io = SimpleNamespace(
            Clip=SimpleNamespace(Input=ClipInput),
            ComfyNode=ComfyNode,
            Conditioning=SimpleNamespace(
                Input=ConditioningInput,
                Output=ConditioningOutput,
            ),
            Schema=Schema,
        )

    fake_latest.io = fake_io
    fake_comfy_api.latest = fake_latest
    monkeypatch.setitem(sys.modules, "comfy_api", fake_comfy_api)
    monkeypatch.setitem(sys.modules, "comfy_api.latest", fake_latest)


def _load_module(monkeypatch, *, with_conditioning_io: bool):
    for name in list(sys.modules):
        if name == TEST_PACKAGE or name.startswith(f"{TEST_PACKAGE}."):
            monkeypatch.delitem(sys.modules, name, raising=False)

    _install_comfy_stubs(monkeypatch, with_conditioning_io=with_conditioning_io)
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


def test_v1_contract_exposes_positive_and_optional_negative_and_runs_every_queue(
    monkeypatch,
):
    module = _load_module(monkeypatch, with_conditioning_io=False)
    node = module.DenoTextEncoderUnload
    input_types = node.INPUT_TYPES()

    assert module._HAS_CONDITIONING_IO is False
    assert list(input_types) == ["required", "optional"]
    assert list(input_types["required"]) == ["positive_conditioning", "text_encoder"]
    assert list(input_types["optional"]) == ["negative_conditioning"]
    assert input_types["required"]["positive_conditioning"][0] == "CONDITIONING"
    assert input_types["required"]["text_encoder"][0] == "CLIP"
    assert input_types["optional"]["negative_conditioning"][0] == "CONDITIONING"
    assert node.RETURN_TYPES == ("CONDITIONING", "CONDITIONING")
    assert node.RETURN_NAMES == ("positive_conditioning", "negative_conditioning")
    assert node.OUTPUT_NODE is False
    assert math.isnan(node.IS_CHANGED())


def test_conditioning_schema_exposes_required_and_optional_passthrough_lanes(monkeypatch):
    module = _load_module(monkeypatch, with_conditioning_io=True)
    node = module.DenoTextEncoderUnload
    node.DESCRIPTION = "DENO Custom Nodes preview\nDecorated description"
    schema = node.define_schema()

    assert module._HAS_CONDITIONING_IO is True
    assert schema.node_id == "DenoTextEncoderUnload"
    assert schema.display_name == "(Deno) Text Encoder Unload"
    assert schema.description == node.DESCRIPTION
    assert [entry.id for entry in schema.inputs] == [
        "positive_conditioning",
        "negative_conditioning",
        "text_encoder",
    ]
    assert [entry.display_name for entry in schema.inputs] == [
        "Positive Conditioning",
        "Negative Conditioning",
        "Text Encoder (CLIP)",
    ]
    assert schema.inputs[1].optional is True
    assert [entry.id for entry in schema.outputs] == [
        "positive_conditioning",
        "negative_conditioning",
    ]
    assert [entry.display_name for entry in schema.outputs] == [
        "Positive Conditioning",
        "Negative Conditioning",
    ]
    assert math.isnan(node.fingerprint_inputs())
    assert math.isnan(node.IS_CHANGED())


@pytest.mark.parametrize("with_conditioning_io", [False, True])
def test_execute_returns_same_object_and_targets_only_connected_clip(
    monkeypatch, with_conditioning_io
):
    module = _load_module(monkeypatch, with_conditioning_io=with_conditioning_io)
    calls = []

    def record_unload(clip, **kwargs):
        calls.append((clip, kwargs))

    monkeypatch.setattr(module, "_unload_clip_patcher", record_unload)

    positive = object()
    negative = object()
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cuda:0", offload_device="cpu")
    )
    node = module.DenoTextEncoderUnload()
    result = node.execute(positive, clip, negative)

    assert result == (positive, negative)
    assert result[0] is positive
    assert result[1] is negative
    assert calls == [
        (
            clip,
            {
                "missing_patcher_label": "connected CLIP/text encoder",
                "unavailable_feature_label": "Text Encoder Unload",
            },
        )
    ]


@pytest.mark.parametrize("with_conditioning_io", [False, True])
def test_unconnected_optional_outputs_fail_clearly_only_when_used(
    monkeypatch, with_conditioning_io
):
    module = _load_module(monkeypatch, with_conditioning_io=with_conditioning_io)
    calls = []

    def record_unload(clip, **kwargs):
        calls.append((clip, kwargs))

    monkeypatch.setattr(module, "_unload_clip_patcher", record_unload)
    positive = object()
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cuda:0", offload_device="cpu")
    )

    result = module.DenoTextEncoderUnload().execute(positive, clip)

    assert result[0] is positive
    assert isinstance(result[1], module.ExecutionBlocker)
    assert result[1].message == (
        "Connect Negative Conditioning before using the Negative Conditioning output."
    )
    assert len(calls) == 1


def test_gpu_only_clip_fails_before_claiming_vram_release(monkeypatch):
    module = _load_module(monkeypatch, with_conditioning_io=False)
    calls = []
    monkeypatch.setattr(module, "_unload_clip_patcher", calls.append)
    clip = SimpleNamespace(
        patcher=SimpleNamespace(load_device="cuda:0", offload_device="cuda:0")
    )

    with pytest.raises(RuntimeError, match=r"without --gpu-only"):
        module.DenoTextEncoderUnload().execute(object(), clip)

    assert calls == []


def test_cpu_resident_clip_is_a_safe_noop_target(monkeypatch):
    module = _load_module(monkeypatch, with_conditioning_io=False)
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
    module = _load_module(monkeypatch, with_conditioning_io=False)

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
