# DENO RTX VFX Easy Install

This optional helper is for users who want to use NVIDIA RTX Video Super Resolution from ComfyUI without manually finding the right Python environment.

## Who can use this

- Windows PC with an NVIDIA RTX GPU
- Recent NVIDIA driver
- ComfyUI using Python 3.10, 3.11, or 3.12
- Internet access to `https://pypi.nvidia.com`

## Easiest install flow

1. Start ComfyUI.
2. Add `(Deno Test) RTX VFX Easy Upscale`.
3. Run it once with an image.
4. If NVIDIA VFX is missing, continue below.

## How to install NVIDIA VFX

1. Close ComfyUI.
2. Open this folder:
   `ComfyUI/custom_nodes/deno-custom-nodes/tools`
3. Double-click:
   `install_rtx_vfx.bat`
4. Wait until it says `[OK] NVIDIA RTX VFX is installed`.
5. Start ComfyUI again.
6. Add `(Deno Test) RTX VFX Easy Upscale` and run it again.

The BAT file installs NVIDIA's official `nvidia-vfx` Python package into the Python used by this ComfyUI install. It does not install random DLL files and does not ask for passwords.

## If it fails

Open the log file next to the BAT:

`DENO_RTX_VFX_install_log.txt`

Common causes:

- NVIDIA driver is too old
- Windows security or network software blocked `https://pypi.nvidia.com`
- the BAT could not find the ComfyUI Python
- this PC does not have a supported NVIDIA RTX GPU

If your ComfyUI uses a custom Python path, set `COMFYUI_PYTHON` to that `python.exe` path and run the BAT again.

If the BAT picked a different Python path from your ComfyUI install, set `COMFYUI_PYTHON` to the correct `python.exe` path and run the BAT again.
