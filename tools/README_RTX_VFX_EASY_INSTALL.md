# DENO RTX VFX Easy Install

This optional helper is for users who want to use `(Deno) RTX Video Super Resolution` from ComfyUI without manually finding the right Python environment.

The DENO node uses NVIDIA's official `nvidia-vfx` / `nvvfx.VideoSuperRes` path. The installer only prepares that optional NVIDIA dependency for the ComfyUI Python you choose.

## Who can use this

- Windows PC with an NVIDIA RTX GPU
- Recent NVIDIA driver
- ComfyUI using Python 3.10 or newer
- Internet access to `https://pypi.nvidia.com`

## Easiest install flow

1. Start ComfyUI.
2. Add `(Deno) RTX Video Super Resolution`.
3. Run it once with an image.
4. If NVIDIA VFX is already available, you are done.
5. If NVIDIA VFX is missing, click the node's `How to install` button.
6. Follow the visual web install guide:
   <https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/>
7. Close every ComfyUI window/process before running the BAT.

## How to install NVIDIA VFX

If you are reading this file from the DENO `tools` folder, start at step 2.

1. Open the visual web install guide:
   <https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/>
2. Click the ZIP download link on that guide page.
3. Open your ComfyUI folder, then open:
   `custom_nodes\deno-custom-nodes\tools`
4. Move `install_rtx_vfx_bat.zip` from `Downloads` into that `tools` folder.
5. Right-click the ZIP inside `tools`, choose `Extract All`, and press `Extract`.
6. Double-click `install_rtx_vfx.bat` from the extracted installer files inside `tools`:
   `install_rtx_vfx.bat`
7. The black installer window shows the Windows path it will modify.
8. If that path is inside the ComfyUI app you just closed, type `Y` and press Enter.
9. If the path looks wrong or unfamiliar, type `N` and press Enter. Nothing is changed when you choose `N`.
10. Wait until it says `INSTALL COMPLETE`.
11. Press any key to close the installer window.
12. Start ComfyUI again. A full restart is required.
13. Add `(Deno) RTX Video Super Resolution` and run it again.

The BAT file installs NVIDIA's official `nvidia-vfx` Python package into the Python used by this ComfyUI install. It does not install random DLL files and does not ask for passwords.
It downloads from NVIDIA's package index at `https://pypi.nvidia.com`.
It first verifies the normal `nvvfx` package path used by that ComfyUI Python. If that normal path can create NVIDIA's `VideoSuperRes` effect, DENO does not force any custom runtime path.
If the normal path fails, the BAT copies the NVIDIA VFX Python runtime to `C:\Users\Public\DENO\nvvfx_runtime` and records that path for the node. This fallback avoids native NVIDIA DLL path issues on Windows installs that live under non-English user folders.
The DENO node includes a ComfyUI `prestartup_script.py` hook. When ComfyUI starts, that hook reads the recorded fallback runtime path and prefers it before any RTX node can lock a different `nvvfx` package path. If the BAT verified the normal ComfyUI Python path, the marker is left empty and no override is used.
The BAT checks that this startup hook exists before it reports success. If it says the DENO node install is too old, update `deno-custom-nodes` first and run the latest BAT again.
The recorded fallback runtime path is guarded by the ComfyUI Python version. For example, Python 3.12 only accepts the prepared `py312` runtime path and ignores stale paths made for another Python version.
After install, it checks whether NVIDIA's `VideoSuperRes` effect can actually be created on this PC for the standard VSR quality levels. If that check fails, the package may be installed correctly but the GPU, driver, or selected Python environment is not usable for RTX VFX.
When ComfyUI starts, the DENO node prefers the recorded `C:\Users\Public\DENO\nvvfx_runtime` path only if the fallback marker is active. If the normal ComfyUI Python path works, DENO uses the same `nvvfx` package path as other RTX nodes.
The node never tries to unload and reload NVIDIA's native extension inside a running ComfyUI process. If another extension already loaded `nvvfx` from a conflicting path, close every ComfyUI window/process completely and start ComfyUI again.

For ComfyUI Manager / Registry installs, the RTX nodes show a `How to install` button that opens the visual web install guide. The BAT and ZIP stay on GitHub instead of inside the Manager package so the Registry security scanner does not block the node pack.

ZIP download:
<https://github.com/Deno2026/comfyui-deno-custom-nodes/raw/refs/heads/main/tools/install_rtx_vfx_bat.zip>

The BAT intentionally refuses to continue if ComfyUI is still running with the selected Python. Close ComfyUI first, then run it again.

The BAT shows the exact Windows path it will modify and asks `Install RTX VFX here?`.

- Choose `Y` if the shown path is inside the ComfyUI app you just closed.
- Choose `N` if the path looks wrong or you use a different ComfyUI app. Nothing is changed when you choose `N`.
- Seeing words like `python_embeded` or `python.exe` is normal. The beginner rule is simpler: the shown path must be inside your ComfyUI folder.
- For custom installs, set `COMFYUI_PYTHON` to the correct `python.exe` path and run the BAT again.
- When you choose `Y`, the BAT reinstalls `nvidia-vfx` into that Python so old or broken files are overwritten cleanly.

The BAT stops if no NVIDIA GPU is detected. Only advanced users should bypass that check:

```bat
set DENO_RTX_VFX_SKIP_GPU_CHECK=1
install_rtx_vfx.bat
```

The BAT uses a clean reinstall by default. Running it again is safe when you want to repair or refresh the NVIDIA VFX package for the same ComfyUI install.

## What the node UI shows

The current public node name is `(Deno) RTX Video Super Resolution`.

The node UI has:

- effect buttons: `Video SR`, `High Bitrate`, `Denoise`, `Deblur`
- a separate `Quality` selector: `Low`, `Medium`, `High`, `Ultra`
- a short mode-coach line explaining the selected effect
- a link to NVIDIA's official Video Super Resolution documentation
- resize buttons for upscaling modes: `Keep Ratio`, `Manual`, `Preset Ratio`

`Denoise` and `Deblur` keep the original size, so the node hides resize controls for those modes.

If you see an older test name such as `(Deno Test) RTX VFX Easy Upscale` in notes or installer output, search for `(Deno) RTX Video Super Resolution` in ComfyUI. That is the current user-facing node name.

## Official NVIDIA references

- Video Super Resolution filter: <https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html>
- NVIDIA VFX Python bindings: <https://docs.nvidia.com/maxine/vfx-python/latest/index.html>
- VideoSuperRes Python API: <https://docs.nvidia.com/maxine/vfx-python/latest/api.html>
- Windows VFX SDK install reference: <https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/InstalltheVFXSDK.html>

The DENO BAT does not require users to manually install the full VFX SDK through NGC. It uses the `nvidia-vfx` Python package path first, then prepares the DENO ASCII runtime fallback only if the normal package path fails verification.

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
- NVIDIA VFX installed, but `VideoSuperRes` cannot be created on this GPU/driver combination
- another RTX node loaded NVIDIA Broadcast/NGX VFX DLLs before DENO's `VideoSuperRes` path ran
- another Broadcast-based RTX node still works because it uses a different NVIDIA Broadcast/Upscale path; this can still block DENO's `nvidia-vfx` `VideoSuperRes` path inside the same ComfyUI process
- Windows or the NVIDIA runtime blocked the native VFX DLLs from the original install path
- the DENO runtime path was not prepared, or ComfyUI was not restarted after running the BAT
- another RTX node imported `nvvfx` before the DENO prestartup hook was active; update the node, run the latest BAT, and restart ComfyUI completely

If your ComfyUI uses a custom Python path, set `COMFYUI_PYTHON` to that `python.exe` path and run the BAT again.

If the BAT picked a different Python path from your ComfyUI install, set `COMFYUI_PYTHON` to the correct `python.exe` path and run the BAT again.
