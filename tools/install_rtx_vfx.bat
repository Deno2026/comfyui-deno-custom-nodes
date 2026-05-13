@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "TOOL_DIR=%~dp0"
set "LOG=%TOOL_DIR%DENO_RTX_VFX_install_log.txt"
set "PYTHON_EXE="
set "PIP_REPAIR_ARGS="

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

echo [1/5] Using Python:
echo %PYTHON_EXE%
echo.

echo [2/5] Making sure ComfyUI is closed...
set "RUNNING_LOG=%TEMP%\deno_rtx_running_comfyui.txt"
if exist "%RUNNING_LOG%" del /f /q "%RUNNING_LOG%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $target=[System.IO.Path]::GetFullPath($env:PYTHON_EXE); $hits=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $target) -and ($_.CommandLine -match '(^|[\\\/])main\.py(\s|$)' -or $_.CommandLine -match 'ComfyUI') }); if ($hits.Count -gt 0) { $lines=[string[]]($hits | ForEach-Object { 'PID=' + $_.ProcessId + ' ' + $_.CommandLine }); $encoding=New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllLines($env:RUNNING_LOG, $lines, $encoding); exit 2 }" >> "%LOG%" 2>&1
if errorlevel 2 (
  echo [FAIL] ComfyUI is still running with this Python.
  echo.
  echo Close ComfyUI completely, then run this BAT again.
  echo.
  echo Detected process:
  type "%RUNNING_LOG%"
  echo.
  pause
  exit /b 1
)
if errorlevel 1 (
  echo [FAIL] Could not verify that ComfyUI is closed.
  echo.
  echo Close ComfyUI completely, then run this BAT again.
  echo See log:
  echo %LOG%
  pause
  exit /b 1
)
echo OK - ComfyUI is not running with the selected Python.
echo.

echo [3/5] Checking NVIDIA GPU...
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader > "%TEMP%\deno_rtx_gpu.txt" 2>> "%LOG%"
if errorlevel 1 (
  echo [FAIL] nvidia-smi was not found or no NVIDIA GPU is visible.
  echo.
  echo RTX VFX requires a supported NVIDIA RTX GPU and current NVIDIA driver.
  echo If you are sure this PC has a supported GPU, update the NVIDIA driver,
  echo restart Windows, then run this BAT again.
  echo.
  echo Advanced override:
  echo set DENO_RTX_VFX_SKIP_GPU_CHECK=1
  echo install_rtx_vfx.bat
  echo.
  if not "%DENO_RTX_VFX_SKIP_GPU_CHECK%"=="1" (
    pause
    exit /b 1
  )
  echo [WARN] GPU check override is ON. Continuing anyway.
) else (
  type "%TEMP%\deno_rtx_gpu.txt"
)
echo.

if not "%DENO_RTX_VFX_YES%"=="1" (
  echo This will install NVIDIA VFX into this exact Python:
  echo %PYTHON_EXE%
  echo.
  echo If this is not the Python used by your ComfyUI, choose N and set COMFYUI_PYTHON first.
  choice /C YN /N /M "Continue installation? [Y/N] "
  if errorlevel 2 (
    echo [CANCELLED] No changes were made.
    pause
    exit /b 1
  )
)

echo [4/5] Installing nvidia-vfx from NVIDIA official package index...
if "%DENO_RTX_VFX_REPAIR%"=="1" (
  set "PIP_REPAIR_ARGS=--force-reinstall --no-build-isolation"
  echo Repair mode is ON. A broken existing nvidia-vfx install will be overwritten.
) else (
  echo Repair mode is OFF. Existing working installs will not be force-reinstalled.
)
echo This can take 1-5 minutes. The window may look still while downloading.
echo.

(
  echo ===== DENO RTX VFX Easy Install =====
  echo Date: %DATE% %TIME%
  echo Python: %PYTHON_EXE%
  "%PYTHON_EXE%" -V
  echo.
  "%PYTHON_EXE%" -m pip install --upgrade %PIP_REPAIR_ARGS% --index-url https://pypi.nvidia.com nvidia-vfx
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

echo [5/5] Verifying import...
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
