@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "TOOL_DIR=%~dp0"
set "LOG=%TOOL_DIR%DENO_RTX_VFX_install_log.txt"
set "PYTHON_EXE="

echo ============================================================
echo  DENO RTX VFX Easy Install
echo ============================================================
echo.
echo This installs NVIDIA's official nvidia-vfx Python package
echo into the Python used by this ComfyUI install.
echo.
echo It does not ask for passwords and does not download random DLLs.
echo Log file:
echo %LOG%
echo.

if not "%COMFYUI_PYTHON%"=="" (
  if exist "%COMFYUI_PYTHON%" set "PYTHON_EXE=%COMFYUI_PYTHON%"
)

if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\..\python_embeded\python.exe" set "PYTHON_EXE=%TOOL_DIR%..\..\..\..\python_embeded\python.exe"
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\.venv\Scripts\python.exe" set "PYTHON_EXE=%TOOL_DIR%..\..\..\.venv\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\venv\Scripts\python.exe" set "PYTHON_EXE=%TOOL_DIR%..\..\..\venv\Scripts\python.exe"
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\ComfyUI.venv\Scripts\python.exe" set "PYTHON_EXE=%TOOL_DIR%..\..\..\ComfyUI.venv\Scripts\python.exe"

if "%PYTHON_EXE%"=="" (
  echo [FAIL] Could not find ComfyUI Python.
  echo.
  echo Move this BAT file back to:
  echo ComfyUI\custom_nodes\deno-custom-nodes\tools
  echo.
  echo Or set COMFYUI_PYTHON to your ComfyUI python.exe path and run again.
  pause
  exit /b 1
)

echo [1/4] Using Python:
echo %PYTHON_EXE%
echo.

echo [2/4] Checking NVIDIA GPU...
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader > "%TEMP%\deno_rtx_gpu.txt" 2>> "%LOG%"
if errorlevel 1 (
  echo [WARN] nvidia-smi was not found or no NVIDIA GPU is visible.
  echo RTX VFX requires a supported NVIDIA RTX GPU and current NVIDIA driver.
) else (
  type "%TEMP%\deno_rtx_gpu.txt"
)
echo.

echo [3/4] Installing nvidia-vfx from NVIDIA official package index...
echo This uses force reinstall, so a broken existing install is overwritten.
echo This can take 1-5 minutes. The window may look still while downloading.
echo.

(
  echo ===== DENO RTX VFX Easy Install =====
  echo Date: %DATE% %TIME%
  echo Python: %PYTHON_EXE%
  "%PYTHON_EXE%" -V
  echo.
  "%PYTHON_EXE%" -m pip install --upgrade --force-reinstall --no-build-isolation --index-url https://pypi.nvidia.com nvidia-vfx
) > "%LOG%" 2>&1

if errorlevel 1 (
  echo [FAIL] nvidia-vfx install failed.
  echo See log:
  echo %LOG%
  echo.
  echo Common causes:
  echo - Network/security software blocked https://pypi.nvidia.com
  echo - The selected Python is not ComfyUI's Python
  echo - Python is older than 3.10
  echo - NVIDIA driver is too old
  pause
  exit /b 1
)

echo [4/4] Verifying import...
"%PYTHON_EXE%" -c "import nvvfx; from nvvfx import VideoSuperRes; print('nvvfx', getattr(nvvfx, '__version__', 'unknown')); print('VideoSuperRes ready')" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [FAIL] Install finished, but nvvfx import failed.
  echo See log:
  echo %LOG%
  pause
  exit /b 1
)

echo [OK] NVIDIA RTX VFX is installed for this ComfyUI Python.
echo Restart ComfyUI and use:
echo (Deno Test) RTX VFX Easy Upscale
echo.
echo Log file:
echo %LOG%
pause
exit /b 0
