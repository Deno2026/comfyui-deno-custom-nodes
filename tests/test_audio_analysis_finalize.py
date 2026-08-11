import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "deno_audio_analysis_finalize.py"


@pytest.fixture
def finalize_module(monkeypatch):
    fake_comfy = ModuleType("comfy")
    fake_model_management = ModuleType("comfy.model_management")
    fake_comfy.model_management = fake_model_management
    monkeypatch.setitem(sys.modules, "comfy", fake_comfy)
    monkeypatch.setitem(
        sys.modules,
        "comfy.model_management",
        fake_model_management,
    )
    spec = importlib.util.spec_from_file_location("_deno_audio_analysis_finalize_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class _FakeModelManagement:
    def __init__(self):
        self.calls = []

    def unload_model_and_clones(self, patcher, **kwargs):
        self.calls.append(("unload_model_and_clones", patcher, kwargs))

    def soft_empty_cache(self, **kwargs):
        self.calls.append(("soft_empty_cache", kwargs))

    def unload_all_models(self):
        pytest.fail("Audio Analysis Finalize must not unload unrelated models")


def test_public_node_contract(finalize_module):
    node = finalize_module.DenoAudioAnalysisFinalize
    input_types = node.INPUT_TYPES()

    assert list(input_types) == ["required"]
    assert list(input_types["required"]) == ["analysis", "clip", "model_after_run"]
    assert input_types["required"]["analysis"] == ("STRING", {"forceInput": True})
    assert input_types["required"]["clip"] == ("CLIP",)
    assert input_types["required"]["model_after_run"] == (
        ["Unload after run", "Keep loaded"],
        {"default": "Unload after run"},
    )
    assert node.RETURN_TYPES == ("STRING",)
    assert node.RETURN_NAMES == ("audio_context",)
    assert node.FUNCTION == "finalize"
    assert node.CATEGORY == "Deno/Audio"


def test_public_registration_and_metadata_are_declared():
    public_nodes = json.loads((REPO_ROOT / "node_list.json").read_text(encoding="utf-8"))
    init_source = (REPO_ROOT / "__init__.py").read_text(encoding="utf-8")
    metadata_source = (REPO_ROOT / "deno_node_metadata.py").read_text(encoding="utf-8")

    assert public_nodes["DenoAudioAnalysisFinalize"] == "(Deno) Audio Analysis Finalizer"
    assert '"deno_audio_analysis_finalize"' in init_source
    assert '"DenoAudioAnalysisFinalize"' in init_source
    assert '"(Deno) Audio Analysis Finalizer"' in init_source
    assert '"DenoAudioAnalysisFinalize": {' in metadata_source
    assert '"DenoAudioAnalysisFinalize": (' in metadata_source


@pytest.mark.parametrize(
    ("analysis", "expected"),
    [
        (
            "<think>first draft</think>discarded\n</THINK>\nAUDIO_CLASS: Music",
            "AUDIO_CLASS: Music",
        ),
        (
            "orphan Straße reasoning close</ThInK>VOCAL_PRESENCE: None",
            "VOCAL_PRESENCE: None",
        ),
    ],
)
def test_think_prefixes_are_removed_without_leaking_reasoning(finalize_module, analysis, expected):
    assert finalize_module._sanitize_analysis(analysis) == expected


def test_chatter_is_dropped_and_multiline_fields_use_canonical_order(finalize_module):
    analysis = """
Here is the analysis you requested:
### PERFORMANCE_CUES
Match cuts to the kick.
Hold on the final decay.

**AUDIO_CLASS:** Hybrid score
and environmental recording
MAJOR_SOUND_SOURCES:
- low synth pulse
- metal impacts
VOCAL_PRESENCE: No intelligible speech
ENERGY_AND_RHYTHM: Slow opening,
then a regular fast pulse.
TIMED_ACOUSTIC_EVENTS: 00:03 impact
00:08 riser
UNCERTAINTIES: The distant texture may be wind.
"""

    assert finalize_module._sanitize_analysis(analysis) == (
        "AUDIO_CLASS: Hybrid score\n"
        "and environmental recording\n"
        "VOCAL_PRESENCE: No intelligible speech\n"
        "MAJOR_SOUND_SOURCES: - low synth pulse\n"
        "- metal impacts\n"
        "ENERGY_AND_RHYTHM: Slow opening,\n"
        "then a regular fast pulse.\n"
        "TIMED_ACOUSTIC_EVENTS: 00:03 impact\n"
        "00:08 riser\n"
        "PERFORMANCE_CUES: Match cuts to the kick.\n"
        "Hold on the final decay.\n"
        "UNCERTAINTIES: The distant texture may be wind."
    )


def test_code_fences_and_blank_separated_tail_chatter_are_removed(finalize_module):
    analysis = """```text
AUDIO_CLASS: Music
VOCAL_PRESENCE: Sung vocals
UNCERTAINTIES: None

Hope this helps. Let me know if you want another version.
```"""

    assert finalize_module._sanitize_analysis(analysis) == (
        "AUDIO_CLASS: Music\n"
        "VOCAL_PRESENCE: Sung vocals\n"
        "UNCERTAINTIES: None"
    )


def test_closing_code_fence_ends_the_active_field(finalize_module):
    analysis = "AUDIO_CLASS: Music\n```\nThis prose is outside the schema."

    assert finalize_module._sanitize_analysis(analysis) == "AUDIO_CLASS: Music"


@pytest.mark.parametrize(
    "analysis",
    [
        "",
        "Ordinary assistant chatter with no structured fields.",
        "<think>AUDIO_CLASS is probably music</think>Done.",
        "AUDIO CLASSES: music\nVOCALS: none",
        "AUDIO_CLASS:\nVOCAL_PRESENCE:",
    ],
)
def test_no_usable_supported_fields_fails_closed(finalize_module, analysis):
    with pytest.raises(RuntimeError, match="did not return any usable supported fields"):
        finalize_module._sanitize_analysis(analysis)


@pytest.mark.parametrize(
    "analysis",
    [
        "<think>unfinished reasoning\nAUDIO_CLASS: Speech",
        "<THINK>draft</think>AUDIO_CLASS: Speech<ThInK>second draft",
    ],
)
def test_unfinished_think_block_fails_closed(finalize_module, analysis):
    with pytest.raises(RuntimeError, match="unfinished <think> block"):
        finalize_module._sanitize_analysis(analysis)


@pytest.mark.parametrize("sanitizer_error", [False, True])
def test_unload_after_run_targets_exact_clip_patcher_even_when_sanitizer_fails(
    finalize_module, monkeypatch, sanitizer_error
):
    manager = _FakeModelManagement()
    patcher = object()
    clip = SimpleNamespace(patcher=patcher)
    monkeypatch.setattr(finalize_module, "comfy_model_management", manager)

    if sanitizer_error:
        def fail_sanitizer(_analysis):
            raise RuntimeError("sanitize failed")

        monkeypatch.setattr(finalize_module, "_sanitize_analysis", fail_sanitizer)
        with pytest.raises(RuntimeError, match="sanitize failed"):
            finalize_module.DenoAudioAnalysisFinalize().finalize(
                "AUDIO_CLASS: music", clip, "Unload after run"
            )
    else:
        assert finalize_module.DenoAudioAnalysisFinalize().finalize(
            "AUDIO_CLASS: music", clip, "Unload after run"
        ) == ("AUDIO_CLASS: music",)

    assert manager.calls == [
        ("unload_model_and_clones", patcher, {"all_devices": True}),
        ("soft_empty_cache", {"force": True}),
    ]


def test_keep_loaded_does_not_inspect_or_unload_clip(finalize_module, monkeypatch):
    manager = _FakeModelManagement()
    monkeypatch.setattr(finalize_module, "comfy_model_management", manager)

    result = finalize_module.DenoAudioAnalysisFinalize().finalize(
        "VOCAL_PRESENCE: None", object(), "Keep loaded"
    )

    assert result == ("VOCAL_PRESENCE: None",)
    assert manager.calls == []


def test_unload_after_run_requires_clip_patcher_with_clear_error(finalize_module, monkeypatch):
    manager = _FakeModelManagement()
    monkeypatch.setattr(finalize_module, "comfy_model_management", manager)

    with pytest.raises(RuntimeError, match=r"CLIP input has no clip\.patcher"):
        finalize_module.DenoAudioAnalysisFinalize().finalize(
            "AUDIO_CLASS: music", object(), "Unload after run"
        )

    assert manager.calls == []


def test_targeted_unload_requires_supported_comfy_api(finalize_module, monkeypatch):
    manager = SimpleNamespace(soft_empty_cache=lambda **_kwargs: None)
    monkeypatch.setattr(finalize_module, "comfy_model_management", manager)

    with pytest.raises(RuntimeError, match="ComfyUI 0.23.0 or newer"):
        finalize_module.DenoAudioAnalysisFinalize().finalize(
            "AUDIO_CLASS: music",
            SimpleNamespace(patcher=object()),
            "Unload after run",
        )


def test_unload_never_calls_global_or_unrelated_model_cleanup(finalize_module, monkeypatch):
    unrelated_model = object()

    class GuardedManager(_FakeModelManagement):
        def unload_model_and_clones(self, patcher, **kwargs):
            assert patcher is not unrelated_model
            super().unload_model_and_clones(patcher, **kwargs)

    manager = GuardedManager()
    target_patcher = object()
    monkeypatch.setattr(finalize_module, "comfy_model_management", manager)

    finalize_module.DenoAudioAnalysisFinalize().finalize(
        "UNCERTAINTIES: None",
        SimpleNamespace(patcher=target_patcher, unrelated=unrelated_model),
        "Unload after run",
    )

    assert manager.calls[0] == (
        "unload_model_and_clones",
        target_patcher,
        {"all_devices": True},
    )


def test_older_targeted_unload_signature_is_supported(finalize_module, monkeypatch):
    calls = []

    class LegacyManager:
        def unload_model_and_clones(self, patcher):
            calls.append(("unload_model_and_clones", patcher))

        def soft_empty_cache(self, force=False):
            calls.append(("soft_empty_cache", force))

    patcher = object()
    monkeypatch.setattr(finalize_module, "comfy_model_management", LegacyManager())

    assert finalize_module.DenoAudioAnalysisFinalize().finalize(
        "AUDIO_CLASS: Speech",
        SimpleNamespace(patcher=patcher),
        "Unload after run",
    ) == ("AUDIO_CLASS: Speech",)
    assert calls == [
        ("unload_model_and_clones", patcher),
        ("soft_empty_cache", True),
    ]
