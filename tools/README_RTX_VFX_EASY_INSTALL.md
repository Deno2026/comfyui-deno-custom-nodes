# DENO RTX VFX Easy Install

This optional helper is for users who want to use NVIDIA RTX Video Super Resolution from ComfyUI without manually finding the right Python environment.

## Who can use this

- Windows PC with an NVIDIA RTX GPU
- Recent NVIDIA driver
- ComfyUI using Python 3.10 or newer
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

For ComfyUI Manager / Registry installs, manual installer scripts may be excluded from the packaged install on purpose. If `install_rtx_vfx.bat` is not present in your local node folder, download it from the GitHub repository and place it in `ComfyUI/custom_nodes/deno-custom-nodes/tools`.

The BAT intentionally refuses to continue if ComfyUI is still running with the selected Python. Close ComfyUI first, then run it again.

The BAT shows the exact Python it will modify and asks `Install RTX VFX here?`.

- Choose `Y` if the shown path belongs to the ComfyUI you just closed.
- Choose `N` if the path looks wrong or you use a different ComfyUI app. Nothing is changed when you choose `N`.
- For custom installs, set `COMFYUI_PYTHON` to the correct `python.exe` path and run the BAT again.
- When you choose `Y`, the BAT reinstalls `nvidia-vfx` into that Python so old or broken files are overwritten cleanly.

The BAT stops if no NVIDIA GPU is detected. Only advanced users should bypass that check:

```bat
set DENO_RTX_VFX_SKIP_GPU_CHECK=1
install_rtx_vfx.bat
```

The BAT uses a clean reinstall by default. Running it again is safe when you want to repair or refresh the NVIDIA VFX package for the same ComfyUI install.

## ComfyUI Desktop and Stability Matrix

The installer tries these common Python locations automatically:

- Windows Portable: `ComfyUI_windows_portable/python_embeded/python.exe`
- ComfyUI Desktop: `ComfyUI/.venv/Scripts/python.exe`
- Stability Matrix: `ComfyUI/venv/Scripts/python.exe`

If your node folder is outside the normal ComfyUI folder, set `COMFYUI_PYTHON` to the Python path that actually launches ComfyUI.

ComfyUI Desktop users can open the Desktop Terminal and run:

```bat
python -c "import sys; print(sys.executable)"
```

Stability Matrix users usually need:

```bat
set COMFYUI_PYTHON=...\StabilityMatrix\Packages\ComfyUI\venv\Scripts\python.exe
install_rtx_vfx.bat
```

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
