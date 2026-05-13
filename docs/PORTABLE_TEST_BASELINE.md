# ComfyUI Portable Test Baseline

This project uses a separate latest ComfyUI Windows Portable install as a pre-release compatibility baseline.

## Current Baseline

- Portable root: `E:\DENO-Share\comfyui-portable-testbeds\comfyui-v0.21.0-nvidia\ComfyUI_windows_portable`
- ComfyUI release: `v0.21.0`
- Portable asset: `ComfyUI_windows_portable_nvidia.7z`
- Portable Python: `3.13.12`
- Portable PyTorch: `2.11.0+cu130`
- Test port: `8191`
- Source repo: `E:\DENO-Repos\comfyui-deno-custom-nodes`

The portable install is runtime/test data. It is not the source repo and must not be treated as the Git origin.

## Release Gate

Before a public release, verify both:

1. The existing local Easy Install runtime still works.
2. The latest portable baseline can load the DENO node pack on a separate port.

For frontend changes, also open the real portable frontend and inspect the affected nodes visually before release approval.

## Repeatable Check

From the source repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\test_portable_baseline.ps1
```

For RTX VFX dependency testing in the portable Python:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\test_portable_baseline.ps1 -InstallRtxVfx
```

If the latest portable Python is not compatible with `nvidia-vfx`, document that as a release blocker or add a separate RTX-recommended portable baseline.

## 2026-05-14 Baseline Result

Status: passed local compatibility checks.

Verified:

- latest ComfyUI portable `v0.21.0` Nvidia asset downloaded and extracted
- DENO node pack synced from `E:\DENO-Repos\comfyui-deno-custom-nodes`
- portable ComfyUI started on port `8191`
- `/object_info` loaded these nodes:
  - `DenoResolutionSetup`
  - `DenoMultiImageLoader`
  - `DenoAdvancedImageSourceLoader`
  - `DenoRTXVFXEasyUpscale`
- `web/js/deno_node_help.js` served from the portable install
- RTX VFX installer installed `nvidia-vfx 0.1.0.1` into the portable Python
- later installer UX changed default behavior to reinstall `nvidia-vfx` cleanly after the user confirms the target Python
- actual RTX VFX runtime smoke passed:
  - `Denoise Low`: `64x64 -> 64x64`
  - `VSR Low`: `64x64 -> 128x128`

This is still a local machine result. Before public release, keep the final user-facing check separate from this automated baseline.
