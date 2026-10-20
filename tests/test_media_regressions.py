"""CPU video comparison regressions."""

import sys
from types import SimpleNamespace

import pytest
import torch


import deno_video_compare as compare


requires_real_torch = pytest.mark.skipif(
    not hasattr(torch, "tensor"), reason="Video comparison requires real torch."
)


@requires_real_torch
@pytest.mark.parametrize("toggle", ["A", "B"])
@pytest.mark.parametrize("swap", [False, True])
def test_video_toggle_output_holds_selected_display_side(toggle, swap):
    a = torch.zeros((24, 2, 2, 3))
    b = torch.ones_like(a)
    result = compare._composite_frames("Toggle", a, b, 0.5, swap, toggle, 24)
    expected = float((toggle == "B") != swap)
    assert torch.equal(result, torch.full_like(a, expected))


@requires_real_torch
@pytest.mark.parametrize("count_a,count_b", [(48, 24), (24, 48), (1, 24), (24, 1), (24, 24)])
@pytest.mark.parametrize("swap", [False, True])
@pytest.mark.parametrize("mode", ["Slider", "Side by Side", "Difference", "Toggle"])
def test_video_output_matches_a_anchored_preview_duration(count_a, count_b, swap, mode, monkeypatch, tmp_path):
    a = torch.zeros((count_a, 2, 2, 3))
    b = torch.linspace(0, 1, count_b).reshape(-1, 1, 1, 1).expand(-1, 2, 2, 3)
    monkeypatch.setitem(sys.modules, "folder_paths", SimpleNamespace(get_temp_directory=lambda: str(tmp_path)))
    # Real node payload and full-resolution output; disk encoding is unrelated.
    monkeypatch.setattr(compare, "_export_frame_sequence", lambda video, side, _dir, indices, *_args:
                        ([f"{side}-{i}.webp" for i in indices], 2, 2))
    result = compare.DenoVideoCompare().compare_videos(
        mode, 0.5, "B", swap, 24, video_a=a, video_b=b,
    )
    frames = result["result"][0]
    meta = result["ui"]["deno_video_compare"][0]
    assert len(frames) == count_a
    assert len(frames) / 24 == pytest.approx(meta["duration"], abs=0.0001)
    assert meta["frame_count"] == max(count_a, count_b)
    if mode == "Toggle" and not swap:
        expected_indices = compare._sample_indices(count_b, count_a)
        assert torch.equal(frames, b[expected_indices])


@requires_real_torch
@pytest.mark.parametrize("swap", [False, True])
def test_video_only_b_owns_fallback_duration(swap):
    b = torch.rand((17, 2, 2, 3))
    frames = compare._composite_frames("Toggle", None, b, 0.5, swap, "A", 24)
    assert torch.equal(frames, b)
    assert len(frames) / 24 == compare._shared_timeline_fps(0, 17, 24)[0]
