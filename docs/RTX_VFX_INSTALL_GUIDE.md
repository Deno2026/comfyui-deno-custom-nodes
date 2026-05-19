# DENO RTX VFX Install Guide

This guide is for Windows users who installed `deno-custom-nodes` from ComfyUI Manager and need NVIDIA RTX VFX for:

- `(Deno) RTX Video Super Resolution`
- `(Deno) RTX Video Super Resolution (2 Pass)`

The ComfyUI Manager package does not include the installer BAT file. The RTX node opens this GitHub guide instead, so the install steps stay easy to follow without putting installer scripts inside the Registry package.

## If You Are a Beginner, Copy This Into GPT First

If installing BAT/ZIP files feels confusing, copy the prompt below and paste it into ChatGPT or another GPT assistant. Ask it to guide you one step at a time while you look at your own Windows screen.

```text
I am a beginner using ComfyUI on Windows.

Please guide me step by step to install DENO RTX VFX for the ComfyUI node:
(Deno) RTX Video Super Resolution.

Use this official DENO GitHub guide as the source:
https://github.com/Deno2026/comfyui-deno-custom-nodes/blob/main/docs/RTX_VFX_INSTALL_GUIDE.md

Important safety checks:
1. Tell me to download only from the official Deno2026 GitHub repository.
2. Explain that the installer prepares NVIDIA's official nvidia-vfx Python package from NVIDIA's package index, https://pypi.nvidia.com.
3. Tell me not to run any BAT file from an unknown mirror, reupload, Discord attachment, or random website.
4. Tell me to close every ComfyUI window before running the installer.
5. Tell me that the ZIP normally downloads to my Windows Downloads folder.
6. Tell me to right-click install_rtx_vfx_bat.zip, choose Extract All, and open the extracted install_rtx_vfx_bat folder.
7. Tell me to double-click install_rtx_vfx.bat only after extraction.
8. When the black installer window shows a Python path and asks "Install RTX VFX here?", help me check that the path belongs to my ComfyUI install before I type Y.
9. If the path looks wrong, tell me to type N and stop instead of guessing.
10. After INSTALL COMPLETE, tell me to fully restart ComfyUI before testing the node again.

Please do not skip steps. Ask me what I see on screen after each step.
```

This GPT prompt is only a helper. It cannot guarantee safety by itself. The real safety rule is simple: use the official Deno2026 GitHub links on this page, check the shown ComfyUI Python path, and do not run installer files from unknown sources.

## Before You Start

- Use Windows 10 or Windows 11.
- Use an NVIDIA RTX GPU.
- Update your NVIDIA driver if it is old.
- Close every ComfyUI window before running the installer.
- Only download the ZIP from this Deno2026 GitHub repository.
- The installer uses NVIDIA's official `nvidia-vfx` Python package path from `https://pypi.nvidia.com`.
- The BAT shows the exact ComfyUI Python path before installing and lets you choose `Y` or `N`.
- The BAT does not ask for passwords.
- Do not use installer files from mirrors, reuploads, Discord attachments, or random websites.

## Step 1. Click `How to install` in the node

Open ComfyUI, add the RTX node, then click `How to install`.

![Step 1 - open install guide](images/rtx-vfx-install/step-1-open-guide.svg)

## Step 2. Download the installer ZIP

On this page, click this link:

[Download install_rtx_vfx_bat.zip](https://github.com/Deno2026/comfyui-deno-custom-nodes/raw/refs/heads/main/tools/install_rtx_vfx_bat.zip)

Your browser will usually save it into the Windows `Downloads` folder.

![Step 2 - download ZIP](images/rtx-vfx-install/step-2-download-zip.svg)

## Step 3. Extract the ZIP in `Downloads`

Open Windows File Explorer and go to `Downloads`.

Right-click `install_rtx_vfx_bat.zip`, then choose `Extract All`.

Press `Extract`.

![Step 3 - extract ZIP](images/rtx-vfx-install/step-3-extract-zip.svg)

## Step 4. Open the extracted folder

After extraction, open the new folder:

`install_rtx_vfx_bat`

Inside it, you should see:

- `install_rtx_vfx.bat`
- `README_RTX_VFX_EASY_INSTALL.md`

![Step 4 - open extracted folder](images/rtx-vfx-install/step-4-open-folder.svg)

## Step 5. Run `install_rtx_vfx.bat`

Double-click:

`install_rtx_vfx.bat`

If Windows shows a security warning, continue only if the file came from this official Deno2026 GitHub repository.

![Step 5 - run BAT](images/rtx-vfx-install/step-5-run-bat.svg)

## Step 6. Confirm the ComfyUI Python path

The black installer window will show the Python path it wants to modify.

If the path belongs to the ComfyUI you use, type:

```text
Y
```

Then press Enter.

If the path looks wrong, type:

```text
N
```

Then press Enter. Nothing is changed when you choose `N`.

![Step 6 - confirm Python](images/rtx-vfx-install/step-6-confirm-python.svg)

## Step 7. Wait for `INSTALL COMPLETE`

Do not close the black window while it is installing.

When you see `INSTALL COMPLETE`, press any key to close the window.

Then start ComfyUI again and run the RTX node.

![Step 7 - complete and restart](images/rtx-vfx-install/step-7-complete-restart.svg)

## If It Still Fails

Check these first:

- Did you fully close ComfyUI before running the BAT?
- Did you restart ComfyUI after the BAT completed?
- Does your PC have an NVIDIA RTX GPU?
- Is your NVIDIA driver recent?
- Is another RTX/Broadcast node loading conflicting NVIDIA VFX DLLs first?

If the error mentions NVIDIA Broadcast/NGX VFX DLLs, disable the other Broadcast-based RTX node and restart ComfyUI before testing DENO RTX VFX again.
