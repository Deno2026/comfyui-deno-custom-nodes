@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "TOOL_DIR=%~dp0"
set "LOG=%TOOL_DIR%DENO_RTX_VFX_install_log.txt"
set "RUNTIME_PATH_FILE=%TOOL_DIR%DENO_RTX_VFX_runtime_path.txt"
set "RUNTIME_PATH_TMP=%TEMP%\deno_nvvfx_runtime_path.txt"
set "PRESTARTUP_SCRIPT=%TOOL_DIR%..\prestartup_script.py"
set "PYTHON_EXE="
set "PYTHON_SOURCE="
set "PIP_INSTALL_ARGS=--force-reinstall --no-build-isolation"

echo ============================================================
echo  DENO RTX VFX Easy Install
echo ============================================================
echo.
echo This installs NVIDIA's official nvidia-vfx Python package
echo into the Python used by this ComfyUI install.
echo If nvidia-vfx is already installed, it will be reinstalled cleanly.
echo It uses the normal ComfyUI Python package path when possible.
echo If that path fails verification, it prepares an ASCII runtime fallback.
echo.
echo It does not ask for passwords and does not download random DLLs.
echo Log file:
echo %LOG%
echo.
echo Progress [--------------------] 0%% Starting.
echo.

echo [1/6] Checking DENO node startup hook...
echo Progress [###-----------------] 15%% Checking node files.
if not exist "%PRESTARTUP_SCRIPT%" (
  echo [FAIL] This deno-custom-nodes install is too old for RTX VFX setup.
  echo.
  echo Missing:
  echo %PRESTARTUP_SCRIPT%
  echo.
  echo Update deno-custom-nodes from GitHub or ComfyUI Manager first,
  echo then run this BAT again from deno-custom-nodes\tools.
  call :FAIL_CODE 1
  pause
  exit /b 1
)
findstr /C:"DENO_RTX_VFX_runtime_path.txt" "%PRESTARTUP_SCRIPT%" >nul
if errorlevel 1 (
  echo [FAIL] This deno-custom-nodes startup hook is not the RTX VFX aware version.
  echo.
  echo Update deno-custom-nodes from GitHub or ComfyUI Manager first,
  echo then run this BAT again from deno-custom-nodes\tools.
  call :FAIL_CODE 1
  pause
  exit /b 1
)
findstr /C:"Preferred NVIDIA VFX runtime path" "%PRESTARTUP_SCRIPT%" >nul
if errorlevel 1 (
  echo [FAIL] This deno-custom-nodes startup hook is not the RTX VFX aware version.
  echo.
  echo Update deno-custom-nodes from GitHub or ComfyUI Manager first,
  echo then run this BAT again from deno-custom-nodes\tools.
  call :FAIL_CODE 1
  pause
  exit /b 1
)
echo Node startup hook ready.
echo Progress [#####---------------] 25%% Node files ready.
echo.

if not "%COMFYUI_PYTHON%"=="" (
  if exist "%COMFYUI_PYTHON%" (
    set "PYTHON_EXE=%COMFYUI_PYTHON%"
    set "PYTHON_SOURCE=COMFYUI_PYTHON custom path"
  ) else (
    echo [FAIL] COMFYUI_PYTHON is set, but that file was not found:
    echo "%COMFYUI_PYTHON%"
    echo.
    echo Remove the wrong COMFYUI_PYTHON value, or set it to the python.exe
    echo that actually launches your ComfyUI.
    call :FAIL_CODE 1
    pause
    exit /b 1
  )
)

if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\..\python_embeded\python.exe" (
  set "PYTHON_EXE=%TOOL_DIR%..\..\..\..\python_embeded\python.exe"
  set "PYTHON_SOURCE=auto-detected ComfyUI Portable python_embeded"
)
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\.venv\Scripts\python.exe" (
  set "PYTHON_EXE=%TOOL_DIR%..\..\..\.venv\Scripts\python.exe"
  set "PYTHON_SOURCE=auto-detected ComfyUI .venv"
)
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\venv\Scripts\python.exe" (
  set "PYTHON_EXE=%TOOL_DIR%..\..\..\venv\Scripts\python.exe"
  set "PYTHON_SOURCE=auto-detected ComfyUI venv"
)
if "%PYTHON_EXE%"=="" if exist "%TOOL_DIR%..\..\..\ComfyUI.venv\Scripts\python.exe" (
  set "PYTHON_EXE=%TOOL_DIR%..\..\..\ComfyUI.venv\Scripts\python.exe"
  set "PYTHON_SOURCE=auto-detected ComfyUI.venv"
)

if "%PYTHON_EXE%"=="" (
  echo [FAIL] Could not find ComfyUI Python.
  echo.
  echo Move this BAT file back to:
  echo ComfyUI\custom_nodes\deno-custom-nodes\tools
  echo.
  echo Or set COMFYUI_PYTHON to your ComfyUI python.exe path and run again.
  call :FAIL_CODE 1
  pause
  exit /b 1
)

echo [2/6] Install target:
echo Progress [#######-------------] 35%% ComfyUI Python found.
echo %PYTHON_SOURCE%
echo "%PYTHON_EXE%"
echo.

echo Checking selected Python...
set "PYTHON_CHECK=%TEMP%\deno_rtx_python_check.txt"
if exist "%PYTHON_CHECK%" del /f /q "%PYTHON_CHECK%" >nul 2>nul
"%PYTHON_EXE%" -c "import sys; print('DENO_PYTHON_OK', sys.version_info[0], sys.version_info[1]); raise SystemExit(0 if sys.version_info >= (3, 10) else 12)" > "%PYTHON_CHECK%" 2>> "%LOG%"
if errorlevel 1 (
  echo [FAIL] The selected file is not a supported Python 3.10+ executable.
  echo.
  echo Selected path:
  echo "%PYTHON_EXE%"
  echo.
  if exist "%PYTHON_CHECK%" type "%PYTHON_CHECK%"
  echo.
  echo Set COMFYUI_PYTHON to the python.exe that actually launches your ComfyUI,
  echo or run this BAT from ComfyUI\custom_nodes\deno-custom-nodes\tools.
  call :FAIL_CODE 1
  pause
  exit /b 1
)
findstr /C:"DENO_PYTHON_OK" "%PYTHON_CHECK%" >nul
if errorlevel 1 (
  echo [FAIL] The selected file did not behave like Python.
  echo.
  echo Selected path:
  echo "%PYTHON_EXE%"
  echo.
  if exist "%PYTHON_CHECK%" type "%PYTHON_CHECK%"
  echo.
  echo Set COMFYUI_PYTHON to the python.exe that actually launches your ComfyUI.
  call :FAIL_CODE 1
  pause
  exit /b 1
)
type "%PYTHON_CHECK%"
echo.

echo [3/6] Making sure ComfyUI is closed...
echo Progress [#########-----------] 45%% Checking running processes.
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
  call :FAIL_CODE 1
  pause
  exit /b 1
)
if errorlevel 1 (
  echo [FAIL] Could not verify that ComfyUI is closed.
  echo.
  echo Close ComfyUI completely, then run this BAT again.
  echo See log:
  echo %LOG%
  call :FAIL_CODE 1
  pause
  exit /b 1
)
echo OK - ComfyUI is not running with the selected Python.
echo Progress [###########---------] 55%% ComfyUI is closed.
echo.

echo [4/6] Checking NVIDIA GPU...
echo Progress [############--------] 60%% Checking NVIDIA GPU.
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
    call :FAIL_CODE 1
    pause
    exit /b 1
  )
  echo [WARN] GPU check override is ON. Continuing anyway.
) else (
  type "%TEMP%\deno_rtx_gpu.txt"
)
echo Progress [#############-------] 65%% GPU check complete.
echo.

if not "%DENO_RTX_VFX_YES%"=="1" (
  echo Ready to install RTX VFX into this ComfyUI Python:
  echo "%PYTHON_EXE%"
  echo.
  echo Choose Y if this is the ComfyUI you just closed.
  echo Choose N if this path looks wrong, or if you use a different ComfyUI app.
  echo.
  echo Tip: If this BAT is inside the ComfyUI you want to use,
  echo      this is normally the correct Python.
  echo.
  choice /C YN /N /M "Install RTX VFX here?  Y=Install / N=Cancel: "
  if errorlevel 2 (
    echo [CANCELLED] No changes were made.
    call :COLOR_LINE Yellow "INSTALL CANCELLED - no changes were made"
    echo.
    echo To target another ComfyUI, run this from Command Prompt:
    echo set COMFYUI_PYTHON=C:\path\to\your\ComfyUI\python.exe
    echo "%~f0"
    echo.
    pause
    exit /b 0
  )
)

echo [5/6] Installing nvidia-vfx from NVIDIA official package index...
echo Reinstall mode is ON. Existing nvidia-vfx files will be overwritten cleanly.
echo This can take 1-5 minutes. Live pip output is shown below and saved to the log.
echo Progress [##############------] 70%% Download and install started.
echo.

(
  echo ===== DENO RTX VFX Easy Install =====
  echo Date: %DATE% %TIME%
  echo Python: %PYTHON_EXE%
  "%PYTHON_EXE%" -V
  echo.
) > "%LOG%" 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Continue'; $installArgs=@('-m','pip','install','--upgrade') + (($env:PIP_INSTALL_ARGS -split ' ') | Where-Object { $_ }) + @('--index-url','https://pypi.nvidia.com','nvidia-vfx'); & $env:PYTHON_EXE @installArgs 2>&1 | ForEach-Object { $line = [string]$_; Write-Host $line; [System.IO.File]::AppendAllText($env:LOG, $line + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false)) }; exit $LASTEXITCODE"

if errorlevel 1 (
  set "PIP_EXIT_CODE=!ERRORLEVEL!"
  echo [FAIL] nvidia-vfx install failed.
  echo See log:
  echo %LOG%
  echo.
  echo Common causes:
  echo - Network/security software blocked https://pypi.nvidia.com
  echo - The selected Python is not ComfyUI's Python
  echo - Python is older than 3.10
  echo - NVIDIA driver is too old
  call :FAIL_CODE !PIP_EXIT_CODE!
  pause
  exit /b !PIP_EXIT_CODE!
)
echo Progress [################----] 80%% Package install complete.
echo.

echo [6/6] Verifying NVIDIA VFX runtime from normal ComfyUI Python...
echo Progress [#################---] 85%% Verifying NVIDIA VFX runtime.
"%PYTHON_EXE%" -c "import os, torch, nvvfx; import nvvfx._lib_loader as loader; from nvvfx import VideoSuperRes; print('nvvfx', getattr(nvvfx, '__version__', 'unknown')); print('nvvfx path', nvvfx.__path__[0]); print('bundled libs', loader.get_libs_directory()); print('CUDA available', torch.cuda.is_available()); print('CUDA devices', torch.cuda.device_count()); print('GPU', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'not visible'); names=('LOW','MEDIUM','HIGH','ULTRA'); [(print('checking VSR', name), (lambda effect: (effect.close(), print('VideoSuperRes create ready', name)))(VideoSuperRes(quality=getattr(VideoSuperRes.QualityLevel, name), device=0))) for name in names]; print('Native nvvfx runtime ready')" >> "%LOG%" 2>&1
if not errorlevel 1 (
  type nul > "%RUNTIME_PATH_FILE%"
  echo Native nvvfx runtime is usable.
  echo DENO runtime override is disabled for this ComfyUI Python.
  echo Progress [###################-] 95%% Native runtime verified.
  echo.
  goto INSTALL_OK_NATIVE
)

echo Native nvvfx runtime failed verification.
echo Trying DENO ASCII runtime fallback...
echo Progress [##################--] 90%% Preparing fallback runtime.
echo.

if exist "%RUNTIME_PATH_TMP%" del /f /q "%RUNTIME_PATH_TMP%" >nul 2>nul
set "DENO_NVVFX_RUNTIME_ROOT=%PUBLIC%\DENO\nvvfx_runtime"
"%PYTHON_EXE%" -c "import os, sys, shutil; from pathlib import Path; import nvvfx; root=Path(os.environ['DENO_NVVFX_RUNTIME_ROOT']); src=Path(nvvfx.__path__[0]); dest=root / ('py%%d%%d' %% sys.version_info[:2]) / 'nvidia_vfx_0_1_0_1'; package=dest / 'nvvfx'; shutil.rmtree(dest, ignore_errors=True); shutil.copytree(src, package); print(str(dest))" > "%RUNTIME_PATH_TMP%" 2>> "%LOG%"
if errorlevel 1 (
  echo [FAIL] Could not prepare NVIDIA VFX runtime copy.
  echo See log:
  echo %LOG%
  call :FAIL_CODE 1
  pause
  exit /b 1
)
set /p DENO_NVVFX_RUNTIME_PATH=<"%RUNTIME_PATH_TMP%"
if "%DENO_NVVFX_RUNTIME_PATH%"=="" (
  echo [FAIL] Could not read NVIDIA VFX runtime path.
  echo See log:
  echo %LOG%
  call :FAIL_CODE 1
  pause
  exit /b 1
)
>"%RUNTIME_PATH_FILE%" echo %DENO_NVVFX_RUNTIME_PATH%
echo Runtime path:
echo %DENO_NVVFX_RUNTIME_PATH%
echo.

echo Verifying DENO ASCII NVIDIA VFX runtime fallback...
"%PYTHON_EXE%" -c "import os, sys, torch; sys.path.insert(0, os.environ['DENO_NVVFX_RUNTIME_PATH']); import nvvfx; import nvvfx._lib_loader as loader; from nvvfx import VideoSuperRes; expected=os.environ['DENO_NVVFX_RUNTIME_PATH']; actual=nvvfx.__path__[0]; print('nvvfx', getattr(nvvfx, '__version__', 'unknown')); print('nvvfx path', actual); print('expected path', expected); print('bundled libs', loader.get_libs_directory()); print('CUDA available', torch.cuda.is_available()); print('CUDA devices', torch.cuda.device_count()); print('GPU', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'not visible'); assert os.path.normcase(os.path.abspath(actual)).startswith(os.path.normcase(os.path.abspath(expected))), 'DENO runtime path was not used during verification'; names=('LOW','MEDIUM','HIGH','ULTRA'); [(print('checking VSR', name), (lambda effect: (effect.close(), print('VideoSuperRes create ready', name)))(VideoSuperRes(quality=getattr(VideoSuperRes.QualityLevel, name), device=0))) for name in names]; print('DENO ASCII nvvfx runtime ready')" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [FAIL] Install finished, but NVIDIA VFX runtime is not usable on this PC.
  echo See log:
  echo %LOG%
  echo.
  echo Common causes:
  echo - NVIDIA driver is too old
  echo - this GPU does not support NVIDIA VFX Video Super Resolution
  echo - CUDA is not visible from this ComfyUI Python
  echo - the selected Python belongs to a different ComfyUI install
  echo - NVIDIA's nvidia-vfx package cannot create VideoSuperRes on this GPU/driver combination
  call :FAIL_CODE 1
  pause
  exit /b 1
)
echo Progress [###################-] 95%% Fallback runtime verified.

:INSTALL_OK_DENO

call :SUCCESS_BANNER
echo [OK] NVIDIA RTX VFX is installed for this ComfyUI Python.
echo Progress [####################] 100%% Done.
echo.
echo IMPORTANT:
echo Restart ComfyUI completely before testing the node again.
echo The node will load NVIDIA VFX from:
echo %DENO_NVVFX_RUNTIME_PATH%
echo.
echo If a later ComfyUI error still says Loaded nvvfx path is under
echo python_embeded\Lib\site-packages, update deno-custom-nodes from GitHub
echo and run this BAT again from deno-custom-nodes\tools.
echo.
echo Then use:
echo (Deno Test) RTX VFX Easy Upscale
echo.
echo Log file:
echo %LOG%
pause
exit /b 0

:INSTALL_OK_NATIVE
call :SUCCESS_BANNER
echo [OK] NVIDIA RTX VFX is installed for this ComfyUI Python.
echo Progress [####################] 100%% Done.
echo.
echo IMPORTANT:
echo Restart ComfyUI completely before testing the node again.
echo The node will load NVIDIA VFX from the normal ComfyUI Python package path.
echo.
echo If a later ComfyUI error mentions the DENO runtime path under
echo C:\Users\Public\DENO, run this BAT again and restart ComfyUI.
echo.
echo Then use:
echo (Deno Test) RTX VFX Easy Upscale
echo.
echo Log file:
echo %LOG%
pause
exit /b 0

:SUCCESS_BANNER
call :COLOR_LINE Green "============================================================"
call :COLOR_LINE Green " INSTALL COMPLETE - NVIDIA RTX VFX is ready for ComfyUI"
call :COLOR_LINE Green "============================================================"
exit /b 0

:FAIL_CODE
set "DENO_INSTALL_ERROR_CODE=%~1"
if "%DENO_INSTALL_ERROR_CODE%"=="" set "DENO_INSTALL_ERROR_CODE=1"
call :COLOR_LINE Red "INSTALL FAILED - error code: %DENO_INSTALL_ERROR_CODE%"
exit /b 0

:COLOR_LINE
set "DENO_COLOR_NAME=%~1"
set "DENO_COLOR_TEXT=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$color=$env:DENO_COLOR_NAME; $text=$env:DENO_COLOR_TEXT; if ([string]::IsNullOrWhiteSpace($color)) { $color='White' }; Write-Host $text -ForegroundColor $color"
exit /b 0
