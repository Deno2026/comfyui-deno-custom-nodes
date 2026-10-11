"""Verify the manually installed NVIDIA VFX package without installing anything."""
import argparse
import importlib.metadata as metadata
import os
from pathlib import Path
import re
import sys


def _version_numbers(value):
    return tuple(map(int, re.findall(r"\d+", str(value))))


def verify_runtime(fallback_path=None):
    if fallback_path is not None:
        sys.path.insert(0, str(fallback_path))

    import torch
    import nvvfx
    import nvvfx._lib_loader as loader
    from nvvfx import VideoSuperRes

    installed = metadata.version("nvidia-vfx")
    loaded = getattr(nvvfx, "__version__", "unknown")
    sdk = nvvfx.get_sdk_version()
    print("installed nvidia-vfx", installed)
    print("loaded nvvfx", loaded)
    print("native SDK", sdk)
    assert _version_numbers(installed) >= (0, 2, 0, 0), "Installed nvidia-vfx must be 0.2.0.0 or newer"
    assert loaded == installed, "Loaded nvvfx does not match the installed package; an old runtime copy may be active"
    assert _version_numbers(sdk) >= (1, 3, 0), "Loaded NVIDIA VFX SDK must be 1.3.0 or newer"
    print("nvvfx path", nvvfx.__path__[0])
    if fallback_path is not None:
        expected = Path(fallback_path) / "nvvfx"
        assert Path(nvvfx.__path__[0]).resolve() == expected.resolve(), "DENO runtime path was not used during verification"
    print("bundled libs", loader.get_libs_directory())
    print("PyTorch", torch.__version__, "CUDA", torch.version.cuda)
    print("CUDA available", torch.cuda.is_available())
    print("CUDA devices", torch.cuda.device_count())
    print("GPU", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "not visible")
    for name in ("LOW", "MEDIUM", "HIGH", "ULTRA"):
        print("checking VSR", name)
        effect = VideoSuperRes(quality=getattr(VideoSuperRes.QualityLevel, name), device=0)
        effect.close()
        print("VideoSuperRes create ready", name)

    frame = torch.zeros((3, 360, 640), device="cuda:0", dtype=torch.float32)
    effect = VideoSuperRes(quality=VideoSuperRes.QualityLevel.MEDIUM, device=0)
    output = None
    try:
        effect.output_width = 1280
        effect.output_height = 720
        effect.load()
        output = torch.from_dlpack(effect.run(frame).image).clone()
        assert tuple(output.shape) == (3, 720, 1280), "NVIDIA VFX smoke returned an unexpected output shape"
        assert torch.isfinite(output).all().item(), "NVIDIA VFX smoke returned non-finite output"
    finally:
        effect.close()
        torch.cuda.synchronize(0)
        del output, frame
    print("VSR load/run smoke ready")
    print("DENO ASCII nvvfx runtime ready" if fallback_path is not None else "Native nvvfx runtime ready")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fallback", action="store_true", help="Verify the runtime copy prepared by the installer")
    args = parser.parse_args()
    fallback_path = None
    if args.fallback:
        raw_path = os.getenv("DENO_NVVFX_RUNTIME_PATH", "")
        if not raw_path or not Path(raw_path).is_absolute():
            parser.error("The installer must provide an absolute fallback runtime path")
        fallback_path = Path(raw_path)
    verify_runtime(fallback_path)


if __name__ == "__main__":
    main()
