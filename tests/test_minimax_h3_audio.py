from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import types
import wave

import numpy as np
import pytest

from test_image_resize_node import load_package


@pytest.fixture
def h3(monkeypatch, tmp_path):
    package = load_package()
    module = sys.modules[f"{package.__name__}.deno_minimax_h3_reference"]
    audio = sys.modules[f"{package.__name__}.deno_minimax_h3_audio"]
    monkeypatch.setattr(sys.modules["folder_paths"], "get_input_directory", lambda: str(tmp_path))
    return module, audio


def sources(*enabled):
    return json.dumps([{"id": f"file-{index}", "path": f"{index + 1}.wav", "enabled": state}
                       for index, state in enumerate(enabled)])


@pytest.mark.parametrize("payload, message", [
    ("{", "invalid JSON"),
    ("", "invalid JSON"),
    ("{}", "JSON array"),
    ('[{"id":"a","path":"a.wav","enabled":true,"trim_start":2}]', "unsupported"),
    (sources(True, False, True, False), "at most 3"),
    ('[{"id":"a","path":"a.wav","enabled":"false"}]', "true/false"),
    ('[{"id":"","path":"a.wav","enabled":true}]', "identity"),
    ('[{"id":"a","path":4,"enabled":false}]', "saved path"),
    ('[{"id":"a","path":"a.wav","enabled":true},{"id":"a","path":"b.wav","enabled":false}]', "identity"),
])
def test_malformed_audio_state_is_explicit(h3, payload, message):
    module, audio = h3
    with pytest.raises(ValueError, match=message):
        audio.parse_audio_sources(payload)
    assert message in module.DenoMiniMaxH3ReferenceImageLoader.VALIDATE_INPUTS("", audio_sources=payload)


def test_third_enabled_source_stays_physical_slot_four_and_skips_first_two(h3, monkeypatch, tmp_path):
    module, audio = h3
    calls = []
    expected = {"waveform": object(), "sample_rate": 44100}

    def decode(path):
        calls.append(path)
        return expected

    monkeypatch.setattr(module, "decode_reference_audio", decode)
    (tmp_path / "3.wav").write_bytes(b"fixture")
    rows = json.loads(sources(False, False, True))
    rows[0]["path"] = "../stale.wav"
    rows[1]["path"] = "missing.mp4"
    serialized = json.dumps(rows)
    loader = module.DenoMiniMaxH3ReferenceImageLoader
    assert loader.VALIDATE_INPUTS("", audio_sources=serialized) is True
    outputs = loader().load_reference_images("", audio_sources=serialized)
    assert outputs[:2] == (None, [])
    assert all(isinstance(value, module.ExecutionBlocker) and value.message is None for value in outputs[2:4])
    assert outputs[4] is expected
    assert calls == ["3.wav"]
    assert loader.RETURN_TYPES == ("DENO_MINIMAX_H3_REFERENCE_IMAGES", "IMAGE", "AUDIO", "AUDIO", "AUDIO")
    assert loader.RETURN_NAMES[:2] == ("ref_images", "image_list")
    assert loader.OUTPUT_IS_LIST == (False, True, False, False, False)


def test_disabled_only_state_fails_without_decoding(h3, monkeypatch):
    module, _audio = h3
    monkeypatch.setattr(module, "decode_reference_audio", lambda path: pytest.fail("disabled file read"))
    loader = module.DenoMiniMaxH3ReferenceImageLoader
    assert "No images are selected" in loader.VALIDATE_INPUTS("", audio_sources=sources(False, False, False))
    with pytest.raises(RuntimeError, match="Enable an image or audio"):
        loader().load_reference_images("", audio_sources=sources(False))


def test_audio_hash_tracks_slot_enable_order_and_active_contents_only(h3, monkeypatch, tmp_path):
    module, _audio = h3
    loader = module.DenoMiniMaxH3ReferenceImageLoader
    for index in range(1, 4):
        (tmp_path / f"{index}.wav").write_bytes(bytes([index]))
    rows = json.loads(sources(False, False, True))
    original = loader.IS_CHANGED("", audio_sources=json.dumps(rows))
    (tmp_path / "1.wav").write_bytes(b"changed disabled file")
    rows[1]["path"] = "../stale.wav"
    assert original == loader.IS_CHANGED("", audio_sources=json.dumps(rows))
    rows[0]["enabled"] = True
    assert original != loader.IS_CHANGED("", audio_sources=json.dumps(rows))
    rows[0]["enabled"] = False
    rows.reverse()
    assert original != loader.IS_CHANGED("", audio_sources=json.dumps(rows))
    rows.reverse()
    (tmp_path / "3.wav").write_bytes(b"changed enabled file")
    assert original != loader.IS_CHANGED("", audio_sources=json.dumps(rows))


@pytest.mark.parametrize("path", ["../outside.wav", "/absolute.wav", "C:\\outside.wav", "bad.mp4", "https://x/a.wav"])
def test_audio_paths_reject_escape_absolute_urls_and_video(h3, path):
    _module, audio = h3
    with pytest.raises(ValueError):
        audio.resolve_reference_audio_path(path)


def test_audio_folder_and_path_block_external_symlinks(h3, tmp_path):
    _module, audio = h3
    external = tmp_path.parent / "external-audio.wav"
    external.write_bytes(b"external")
    link = tmp_path / "linked.wav"
    try:
        link.symlink_to(external)
    except (OSError, NotImplementedError):
        pytest.skip("symlink privilege is unavailable")
    with pytest.raises(ValueError, match="outside"):
        audio.resolve_reference_audio_path("linked.wav")
    listing = audio.list_input_audio()
    assert listing["files"] == []
    assert listing["blocked_count"] == 1


def test_audio_folder_lists_nested_audio_and_excludes_video(h3, tmp_path):
    _module, audio = h3
    folder = tmp_path / "voice"
    folder.mkdir()
    (folder / "안녕.wav").write_bytes(b"audio")
    (folder / "clip.mp4").write_bytes(b"video")
    assert audio.list_input_audio()["folders"][0]["path"] == "voice"
    listing = audio.list_input_audio("voice")
    assert listing["path"] == "voice" and listing["parent"] == ""
    assert [entry["name"] for entry in listing["files"]] == ["voice/안녕.wav"]
    assert listing["files"][0]["path"] == "voice/안녕.wav"


class DynamicPrompt:
    def __init__(self, *enabled, other_loader=False):
        self.graph = {"loader": {"class_type": "DenoMiniMaxH3ReferenceImageLoader",
                                 "inputs": {"audio_sources": sources(*enabled)}},
                      "other": {"class_type": "LoadAudio", "inputs": {}}}
        if other_loader:
            self.graph["other"]["class_type"] = "DenoMiniMaxH3ReferenceImageLoader"
            self.graph["other"]["inputs"]["audio_sources"] = sources(True)

    def get_node(self, node_id):
        return self.graph[node_id]


def test_raw_links_omit_disabled_outputs_and_sort_by_enabled_card_order(h3):
    module, _audio = h3
    links = {"ref_audio_0": ["loader", 4], "ref_audio_1": ["loader", 2], "ref_audio_2": ["loader", 3]}
    assert module._ordered_audio_links(links, DynamicPrompt(False, False, True), None) == [["loader", 4]]
    assert module._ordered_audio_links(links, DynamicPrompt(True, False, True), None) == [["loader", 2], ["loader", 4]]
    assert module._ordered_audio_links(links, DynamicPrompt(True, True, True), None) == [
        ["loader", 2], ["loader", 3], ["loader", 4],
    ]


@pytest.mark.parametrize("links, graph, soundtrack, message", [
    ({"a": ["loader", 4]}, DynamicPrompt(True, False, True), None, "every enabled"),
    ({"a": ["loader", 2], "b": ["loader", 2]}, DynamicPrompt(True), None, "more than once"),
    ({"a": ["loader", 2], "b": ["other", 0]}, DynamicPrompt(True), None, "one DENO"),
    ({"a": ["loader", 2], "b": ["other", 2]}, DynamicPrompt(True, other_loader=True), None, "one DENO"),
    ({"a": ["loader", 2]}, DynamicPrompt(True), {"ref_video_audio_0": object()}, "soundtracks"),
    ({"a": ["loader", 4]}, DynamicPrompt(True), None, "no saved file"),
])
def test_badges_cannot_silently_disagree_with_actual_h3_tags(h3, links, graph, soundtrack, message):
    module, _audio = h3
    with pytest.raises(ValueError, match=message):
        module._ordered_audio_links(links, graph, soundtrack)


def test_external_audio_only_keeps_native_order_and_soundtracks(h3):
    module, _audio = h3
    direct_audio = {"waveform": object(), "sample_rate": 48000}
    links = {"a": ["other", 0], "b": direct_audio}
    assert module._ordered_audio_links(links, DynamicPrompt(), {"ref_video_audio_0": object()}) == [
        ["other", 0], direct_audio,
    ]


def test_wrapper_expands_native_child_without_disabled_dependency(h3, monkeypatch):
    module, _audio = h3
    wrapper = module.DenoMiniMaxH3ReferenceToVideo
    monkeypatch.setattr(wrapper, "hidden", types.SimpleNamespace(dynprompt=DynamicPrompt(False, False, True),
                                                                 unique_id="h3"), raising=False)
    result = wrapper.execute(clip="clip", prompt="<Audio 1>", width=32, height=32, length=5,
                             ref_audios={"ref_audio_0": ["loader", 2], "ref_audio_1": ["loader", 3],
                                         "ref_audio_2": ["loader", 4]})
    assert len(result.expand) == 1
    child = next(iter(result.expand.values()))
    assert child["class_type"] == "MiniMaxH3ReferenceToVideo"
    assert child["inputs"]["ref_audios.ref_audio_0"] == ["loader", 4]
    assert "ref_audios.ref_audio_1" not in child["inputs"]
    assert child["inputs"]["prompt"] == "<Audio 1>"


def test_preview_has_real_duration_peaks_and_browser_pcm_only(h3, monkeypatch):
    _module, audio = h3

    class ArrayTensor:
        def __init__(self, array):
            self.array = np.asarray(array)

        def __getitem__(self, item):
            return ArrayTensor(self.array[item])

        def detach(self):
            return self

        def cpu(self):
            return self

        def numpy(self):
            return self.array

    source = np.array([[[0.0, 0.25, -0.5, 0.75], [0.0, -0.25, 0.5, -0.75]]], dtype=np.float32)
    monkeypatch.setattr(audio, "decode_reference_audio", lambda path: {"waveform": ArrayTensor(source), "sample_rate": 4})
    info = audio.reference_audio_info("한국어 voice.wav")
    assert (info["duration"], info["sample_rate"], info["channels"]) == (1, 4, 2)
    assert len(info["peaks"]) == 128
    assert info["peaks"][:4] == [0, 0.25, 0.5, 0.75]
    assert info["preview_url"].startswith("/deno/h3/reference-audio-preview?")
    with wave.open(io.BytesIO(audio.reference_audio_preview("source.wav")), "rb") as wav:
        assert (wav.getnchannels(), wav.getframerate(), wav.getnframes(), wav.getsampwidth()) == (2, 4, 4, 2)
        pcm = np.frombuffer(wav.readframes(4), dtype="<i2").reshape(4, 2)
        np.testing.assert_allclose(pcm / 32767, source[0].T, atol=1 / 32767)
    np.testing.assert_array_equal(source[0, 0], [0.0, 0.25, -0.5, 0.75])
