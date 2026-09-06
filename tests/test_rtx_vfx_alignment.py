"""VFX width workaround contracts, using real CPU tensors and borrowed SDK buffers."""

import importlib.util
from pathlib import Path
import sys
import types

import pytest
import torch
import torch.nn.functional as F


pytestmark = pytest.mark.skipif(
    not hasattr(torch, "from_dlpack"), reason="VFX tensor regressions require real torch."
)
REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def vfx_modules(monkeypatch):
    # Import only these nodes and their helpers, without ComfyUI registration.
    package_name = "_rtx_alignment_test"
    package = types.ModuleType(package_name)
    package.__path__ = [str(REPO_ROOT)]
    monkeypatch.setitem(sys.modules, package_name, package)
    modules = {}
    for filename in (
        "deno_resolution_common", "deno_rtx_vfx_runtime",
        "deno_rtx_vfx_easy_upscale", "deno_rtx_vfx_video_finisher",
    ):
        name = f"{package_name}.{filename}"
        spec = importlib.util.spec_from_file_location(name, REPO_ROOT / f"{filename}.py")
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        modules[filename] = module
    return (
        modules["deno_rtx_vfx_easy_upscale"],
        modules["deno_rtx_vfx_video_finisher"],
    )


class BorrowedEffect:
    """The SDK owns this buffer and overwrites it on the next run or close."""

    def __init__(self, output_width, output_height, *, same_size=False):
        self.output_width = output_width
        self.output_height = output_height
        self.same_size = same_size
        self.inputs = []
        self.buffer = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        if self.buffer is not None:
            self.buffer.fill_(float("nan"))

    def load(self):
        assert self.output_width % 8 == 0

    def run(self, frame):
        assert frame.is_contiguous()
        self.inputs.append(frame.clone())
        if self.same_size:
            assert tuple(frame.shape[-2:]) == (self.output_height, self.output_width)
            pixels = frame
        else:
            pixels = F.interpolate(
                frame.unsqueeze(0), size=(self.output_height, self.output_width),
                mode="bilinear", align_corners=False,
            ).squeeze(0)
        if self.buffer is None:
            self.buffer = torch.empty_like(pixels)
        self.buffer.copy_(pixels)
        return types.SimpleNamespace(image=self.buffer)


@pytest.mark.parametrize("target_width", [2152, 2153, 2154, 2156, 2160])
def test_upscale_retains_requested_width_and_input(vfx_modules, target_width):
    easy, _ = vfx_modules
    # A ramp makes an accidental crop detectably different from resampling.
    frame = torch.linspace(0.0, 1.0, 3 * 5 * 1408).reshape(3, 5, 1408)
    original = frame.clone()
    native_width = easy._vfx_output_width(target_width)
    assert native_width == ((target_width + 7) // 8) * 8
    with BorrowedEffect(native_width, 7) as effect:
        effect.load()
        result = easy._run_vfx_frame(effect, frame, target_width, 7)
        expected = effect.buffer.clone()
        if target_width != native_width:
            expected = F.interpolate(
                expected.unsqueeze(0), size=(7, target_width),
                mode="bilinear", align_corners=False,
            ).squeeze(0)
        assert result.shape == (3, 7, target_width)
        torch.testing.assert_close(result, expected, rtol=0, atol=0)
        torch.testing.assert_close(effect.inputs[0], original, rtol=0, atol=0)
    assert torch.isfinite(result).all(), "closing the SDK must not invalidate the result"
    torch.testing.assert_close(frame, original, rtol=0, atol=0)


def test_aligned_output_is_exact_and_owns_its_memory(vfx_modules, monkeypatch):
    easy, _ = vfx_modules
    frame = torch.arange(3 * 5 * 16, dtype=torch.float32).reshape(3, 5, 16)
    effect = BorrowedEffect(16, 5, same_size=True)

    def unexpected_resize(*_args, **_kwargs):
        pytest.fail("aligned frames must not be padded or resampled")

    monkeypatch.setattr(easy, "F", types.SimpleNamespace(
        pad=unexpected_resize, interpolate=unexpected_resize,
    ))
    first = easy._run_vfx_frame(effect, frame, 16, 5)
    second = easy._run_vfx_frame(effect, torch.zeros_like(frame), 16, 5)
    torch.testing.assert_close(first, frame, rtol=0, atol=0)
    assert first.data_ptr() != effect.buffer.data_ptr()
    assert torch.count_nonzero(second) == 0


@pytest.mark.parametrize("width", [1, 9, 14, 16])
def test_same_size_pads_only_right_edge_then_crops(vfx_modules, width):
    easy, _ = vfx_modules
    frame = torch.arange(3 * 5 * width, dtype=torch.float32).reshape(3, 5, width)
    original = frame.clone()
    native_width = easy._vfx_output_width(width)
    with BorrowedEffect(native_width, 5, same_size=True) as effect:
        result = easy._run_vfx_frame(effect, frame, width, 5, same_size=True)
        padded = effect.inputs[0]
        torch.testing.assert_close(padded[:, :, :width], original, rtol=0, atol=0)
        if width != native_width:
            expected_edge = original[:, :, -1:].expand(-1, -1, native_width - width)
            torch.testing.assert_close(padded[:, :, width:], expected_edge, rtol=0, atol=0)
        torch.testing.assert_close(result, original, rtol=0, atol=0)
    torch.testing.assert_close(result, original, rtol=0, atol=0)
    torch.testing.assert_close(frame, original, rtol=0, atol=0)


class CpuTorch:
    """Route only the nodes' CUDA boundary to CPU; tensor math stays real."""

    cuda = types.SimpleNamespace(is_available=lambda: True, device_count=lambda: 1)

    def __getattr__(self, name):
        return getattr(torch, name)

    @staticmethod
    def device(name):
        return torch.device("cpu" if str(name).startswith("cuda:") else name)


@pytest.fixture
def cpu_nodes(vfx_modules, monkeypatch):
    easy, finisher = vfx_modules
    effects = []

    class VideoSuperRes:
        QualityLevel = types.SimpleNamespace(
            MEDIUM="MEDIUM", DENOISE_MEDIUM="DENOISE_MEDIUM", DEBLUR_MEDIUM="DEBLUR_MEDIUM"
        )

    def create_effect(_api, _quality, _device, mode):
        effect = BorrowedEffect(0, 0, same_size=mode.startswith(("Denoise", "Deblur")))
        effect.mode = mode
        effects.append(effect)
        return effect

    for module in vfx_modules:
        monkeypatch.setattr(module, "torch", CpuTorch())
        monkeypatch.setattr(module, "_import_vfx", lambda: VideoSuperRes)
        monkeypatch.setattr(module, "_create_vfx_effect", create_effect)
    return easy, finisher, effects


@pytest.mark.parametrize("dtype_name", ["float16", "float32", "float64"])
@pytest.mark.parametrize("kind", [
    "single", "single_denoise", "single_deblur", "two_pass", "denoise_only", "deblur_only",
])
def test_nodes_keep_batch_dtype_device_and_route_aligned_effects(cpu_nodes, dtype_name, kind):
    easy, finisher, effects = cpu_nodes
    dtype = getattr(torch, dtype_name)
    # Distinct frames catch reuse of the SDK's output buffer. Alpha remains untouched.
    images = torch.stack([
        torch.full((7, 14, 4), 0.2, dtype=dtype),
        torch.full((7, 14, 4), 0.8, dtype=dtype),
    ])
    original = images.clone()
    settings = dict(
        images=images, resize_type="Manual", scale=2.0, megapixels=2.0,
        width=22, height=11, divisible_by="1", ratio_preset="16:9",
        resize_method="Center Crop (Fill)",
    )
    if kind.startswith("single"):
        mode = {
            "single": "VSR Medium", "single_denoise": "Denoise Medium",
            "single_deblur": "Deblur Medium",
        }[kind]
        (out,) = easy.DenoRTXVFXEasyUpscale().apply_vfx(
            mode=mode, device=0, **settings,
        )
    else:
        (out,) = finisher.DenoRTXVFXVideoFinisher().apply_finisher(
            first_pass="Deblur" if kind == "deblur_only" else "Denoise",
            first_quality="Medium",
            upscale_pass="VSR" if kind == "two_pass" else "Off",
            upscale_quality="Medium", **settings,
        )
    same_size = kind not in {"single", "two_pass"}
    assert out.shape == ((2, 7, 14, 3) if same_size else (2, 11, 22, 3))
    assert out.dtype == images.dtype and out.device == images.device
    for index in range(2):
        expected = torch.full_like(out[index], images[index, 0, 0, 0].float().item())
        torch.testing.assert_close(out[index], expected, rtol=1e-6, atol=1e-7)
    torch.testing.assert_close(images, original, rtol=0, atol=0)
    assert len(effects) == (2 if kind == "two_pass" else 1)
    for effect in effects:
        assert len(effect.inputs) == 2
        assert effect.output_width == (16 if effect.same_size else 24)
        assert effect.output_height == (7 if effect.same_size else 11)
        assert all(frame.dtype == torch.float32 for frame in effect.inputs)
        assert all(frame.shape[2] == (16 if effect.same_size else 14) for frame in effect.inputs)
        assert torch.isnan(effect.buffer).all(), "SDK closure must not corrupt stored batch frames"
