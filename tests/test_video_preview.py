"""CPU regression coverage for streaming preview frame conversion."""

from fractions import Fraction
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
import pytest
import torch


pytestmark = pytest.mark.skipif(
    not hasattr(torch, "tensor"), reason="Video preview conversion requires real torch."
)

import deno_video_preview as preview_module


class CaptureStream:
    def __init__(self, codec, rate):
        self.codec = codec
        self.rate = rate
        self.codec_context = SimpleNamespace(frame_size=1024)
        self.frames = []
        self.flushed = False

    def encode(self, frame=None):
        if frame is None:
            self.flushed = True
        else:
            self.frames.append(frame)
        return [(self.codec, frame)]


class CaptureAV:
    def __init__(self, stable_path):
        self.stable_path = stable_path
        self.streams = []
        self.packets = []
        self.closed = False
        self.VideoFrame = SimpleNamespace(from_ndarray=self.capture_frame)
        self.AudioFrame = SimpleNamespace(from_ndarray=self.capture_frame)
        self.codec = SimpleNamespace(Codec=lambda *_args: SimpleNamespace(
            audio_rates=[96000, 88200, 64000, 48000, 44100, 32000, 24000,
                         22050, 16000, 12000, 11025, 8000, 7350]
        ))

    @staticmethod
    def capture_frame(array, **kwargs):
        assert array.flags.c_contiguous
        return SimpleNamespace(array=array.copy(), **kwargs)

    def open(self, path, mode, options):
        self.partial_path = Path(path)
        assert self.partial_path != self.stable_path
        assert mode == "w"
        assert options == {"movflags": "+faststart"}
        self.partial_path.write_bytes(b"partial-preview")
        return self

    def add_stream(self, codec, rate):
        assert not self.packets, "Every stream must exist before the first mux."
        stream = CaptureStream(codec, rate)
        self.streams.append(stream)
        return stream

    def mux(self, packet):
        self.packets.append(packet)

    def close(self):
        assert self.stable_path.read_bytes() == b"previous-preview"
        self.partial_path.write_bytes(b"complete-preview")
        self.closed = True


@pytest.fixture
def capture_preview(monkeypatch, tmp_path):
    monkeypatch.setitem(
        sys.modules, "folder_paths", SimpleNamespace(get_temp_directory=lambda: str(tmp_path))
    )
    workflow = {"workflow": {"id": "streaming-preview"}}
    path, filename, subfolder = preview_module._stable_preview_path("7", "streaming-preview")
    stable_path = Path(path)
    stable_path.write_bytes(b"previous-preview")
    av = CaptureAV(stable_path)
    monkeypatch.setattr(preview_module, "_require_av", lambda: av)

    def run(images, audio=None):
        result = preview_module.DenoVideoPreview().preview(
            images, frame_rate=25, audio=audio, unique_id="7", extra_pnginfo=workflow
        )
        assert result["result"][0] is images
        assert av.closed
        assert stable_path.read_bytes() == b"complete-preview"
        assert not av.partial_path.exists()
        assert result["ui"] == {"deno_video_preview": [{
            "filename": filename,
            "subfolder": subfolder,
            "type": "temp",
            "frame_rate": 25,
            "width": images.shape[2] // 2 * 2,
            "height": images.shape[1] // 2 * 2,
            "frame_count": images.shape[0],
            "has_audio": audio is not None,
        }]}
        return av

    return run


@pytest.mark.parametrize("dtype_name", ["float16", "float32", "float64"])
@pytest.mark.parametrize("channels", [3, 4])
@pytest.mark.parametrize("height,width", [(4, 6), (5, 7)])
def test_streamed_preview_preserves_legacy_rgb_bytes_and_input(
    capture_preview, dtype_name, channels, height, width
):
    values = torch.tensor(
        [-float("inf"), -2.0, -0.01, -0.0, 0.0, 0.5 / 255, 1.5 / 255,
         0.25, 0.5, 0.75, 254.5 / 255, 1.0, 1.01, 2.0, float("inf"), float("nan")],
        dtype=getattr(torch, dtype_name), device="cpu",
    )
    count = 3 * height * width * channels
    # Transposed spatial axes exercise non-contiguous IMAGE input as well.
    images = values.repeat((count + len(values) - 1) // len(values))[:count]
    images = images.reshape(3, width, height, channels).transpose(1, 2)
    before = images.numpy().tobytes()
    out_h, out_w = height // 2 * 2, width // 2 * 2
    legacy = images[..., :3].clamp(0.0, 1.0)
    expected = [
        legacy[index, :out_h, :out_w].mul(255.0).round().to(torch.uint8).numpy()
        for index in range(len(images))
    ]

    av = capture_preview(images)

    assert images.numpy().tobytes() == before
    stream, = av.streams
    assert stream.codec == "libx264"
    assert stream.rate == 25
    assert (stream.width, stream.height, stream.pix_fmt) == (out_w, out_h, "yuv420p")
    assert stream.options == {"crf": "16", "preset": "veryfast"}
    assert stream.time_base == Fraction(1, 25)
    assert stream.flushed
    assert len(stream.frames) == len(expected)
    for index, (frame, expected_array) in enumerate(zip(stream.frames, expected)):
        assert frame.format == "rgb24"
        assert frame.pts == index
        assert frame.time_base == Fraction(1, 25)
        np.testing.assert_array_equal(frame.array, expected_array)


def test_preview_clamp_allocation_is_bounded_to_one_cropped_rgb_frame(
    capture_preview, monkeypatch
):
    images = torch.linspace(-1, 2, 8 * 5 * 7 * 4, device="cpu").reshape(8, 5, 7, 4)
    clamp = torch.Tensor.clamp
    allocations = []

    def record_clamp(tensor, *args, **kwargs):
        result = clamp(tensor, *args, **kwargs)
        allocations.append((tuple(tensor.shape), result.untyped_storage().nbytes()))
        return result

    monkeypatch.setattr(torch.Tensor, "clamp", record_clamp)
    capture_preview(images)

    frame_bytes = 4 * 6 * 3 * images.element_size()
    assert allocations == [((4, 6, 3), frame_bytes)] * 8
    assert frame_bytes < images[..., :3].numel() * images.element_size()


def test_streamed_preview_preserves_audio_frames_and_timing(capture_preview):
    images = torch.zeros((2, 3, 5, 4), device="cpu")
    waveform = torch.linspace(-2, 2, 2 * 1050, device="cpu").reshape(1, 2, 1050)
    original = waveform.clone()
    av = capture_preview(images, audio={"waveform": waveform, "sample_rate": 48000})

    video, audio = av.streams
    assert torch.equal(waveform, original)
    assert video.flushed and audio.flushed
    assert (audio.codec, audio.rate, audio.bit_rate) == ("aac", 48000, 192000)
    assert [frame.pts for frame in audio.frames] == [0, 1024]
    for frame in audio.frames:
        assert frame.sample_rate == 48000
        assert frame.time_base == Fraction(1, 48000)
        assert (frame.format, frame.layout) == ("fltp", "stereo")
    actual_audio = np.concatenate([frame.array for frame in audio.frames], axis=1)
    np.testing.assert_array_equal(actual_audio, waveform[0].clamp(-1, 1).numpy())
    assert [codec for codec, _ in av.packets] == ["libx264"] * 3 + ["aac"] * 3


def test_preview_selects_supported_aac_rate_preserving_input_timing(capture_preview):
    images = torch.zeros((3, 16, 16, 3), device="cpu")
    waveform = torch.zeros((1, 2, 19200), device="cpu")
    av = capture_preview(images, audio={"waveform": waveform, "sample_rate": 192000})
    audio = av.streams[1]
    assert audio.rate == 96000
    assert all(frame.sample_rate == 192000 for frame in audio.frames)
    assert all(frame.time_base == Fraction(1, 192000) for frame in audio.frames)
    assert sum(frame.array.shape[1] for frame in audio.frames) == 19200


@pytest.mark.parametrize("sample_rate", [48000, 192000])
@pytest.mark.parametrize("channels", [1, 2])
def test_real_aac_preview_keeps_video_and_audio_duration(monkeypatch, tmp_path, sample_rate, channels):
    av = pytest.importorskip("av")
    monkeypatch.setattr(preview_module, "_require_av", lambda: av)
    monkeypatch.setitem(sys.modules, "folder_paths", SimpleNamespace(
        get_temp_directory=lambda: str(tmp_path)
    ))
    images = torch.zeros((3, 16, 16, 3), device="cpu")
    waveform = torch.zeros((1, channels, sample_rate // 10), device="cpu")
    result = preview_module.DenoVideoPreview().preview(
        images, frame_rate=24,
        audio={"waveform": waveform, "sample_rate": sample_rate},
        unique_id="audio-rate", extra_pnginfo={"workflow": {"id": "aac-regression"}},
    )
    assert result["result"][0] is images
    meta = result["ui"]["deno_video_preview"][0]
    assert meta["has_audio"] is True
    path = tmp_path / meta["subfolder"] / meta["filename"]
    with av.open(str(path)) as container:
        assert len(container.streams.video) == 1
        assert len(container.streams.audio) == 1
        stream = container.streams.audio[0]
        assert stream.rate == (96000 if sample_rate == 192000 else 48000)
        assert abs(float(stream.duration * stream.time_base) - 0.1) < 0.025
        assert len(list(container.decode(video=0))) == 3
    with av.open(str(path)) as container:
        assert sum(frame.samples for frame in container.decode(audio=0)) > 0
