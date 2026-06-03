@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title DENO Bernini Preview Backend Update

echo.
echo ============================================================
echo  DENO Bernini Preview Backend Update
echo ============================================================
echo.
echo This updates a TEST/COPIED ComfyUI backend to the draft Bernini
echo preview branch from kijai/ComfyUI.
echo.
echo Recommended:
echo   1. Close ComfyUI first.
echo   2. Copy the whole portable root folder for testing.
echo   3. Keep the inner folder name as ComfyUI.
echo   4. Put this BAT in the copied portable root or ComfyUI folder.
echo   5. Run it there.
echo.
echo Do NOT run this on your only working ComfyUI install unless you
echo already know how to restore it.
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git was not found in PATH.
    echo Install Git for Windows first, or use a ComfyUI portable package that includes git access.
    goto :fail
)

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Could not enter BAT folder.
    goto :fail
)

call :find_comfy_dir
if not defined COMFY_DIR (
    echo [ERROR] Could not find a ComfyUI folder.
    echo Put this BAT next to ComfyUI\main.py or inside a folder that contains a ComfyUI subfolder.
    goto :fail
)

if not exist "%COMFY_DIR%\.git" (
    echo [ERROR] This ComfyUI folder is not a git checkout:
    echo   %COMFY_DIR%
    echo.
    echo This preview updater only works with git-based portable/manual ComfyUI installs.
    goto :fail
)

echo Found ComfyUI:
echo   %COMFY_DIR%
echo.

for /f "delims=" %%A in ('git -C "%COMFY_DIR%" status --porcelain --untracked-files=no 2^>nul') do (
    set "DIRTY_WORKTREE=1"
)
if defined DIRTY_WORKTREE (
    echo [ERROR] This ComfyUI folder has local changes.
    echo The updater stopped so it does not overwrite tracked ComfyUI files.
    echo.
    git -C "%COMFY_DIR%" status --short --untracked-files=no
    goto :fail
)

echo Current backend:
git -C "%COMFY_DIR%" branch --show-current
git -C "%COMFY_DIR%" rev-parse --short HEAD
echo.
echo Target backend:
echo   kijai/ComfyUI bernini branch
echo   local branch: deno-bernini-preview
echo.
set /p CONFIRM=Type YES to update this TEST ComfyUI folder: 
if /I not "%CONFIRM%"=="YES" (
    echo Cancelled.
    goto :end
)

git -C "%COMFY_DIR%" remote get-url kijai >nul 2>nul
if errorlevel 1 (
    git -C "%COMFY_DIR%" remote add kijai https://github.com/kijai/ComfyUI.git
    if errorlevel 1 goto :git_fail
) else (
    git -C "%COMFY_DIR%" remote set-url kijai https://github.com/kijai/ComfyUI.git
    if errorlevel 1 goto :git_fail
)

echo.
echo Fetching Bernini preview backend...
git -C "%COMFY_DIR%" fetch kijai bernini --prune
if errorlevel 1 goto :git_fail

echo.
echo Switching backend branch...
git -C "%COMFY_DIR%" checkout -B deno-bernini-preview kijai/bernini
if errorlevel 1 goto :git_fail

call :find_python
if not defined PY_EXE (
    echo [ERROR] Python was not found.
    echo Expected python_embeded\python.exe in the portable root, or python.exe in PATH.
    goto :fail
)

echo.
echo Python:
echo   %PY_EXE%
echo.
echo Installing/updating ComfyUI Python dependencies.
echo Torch, torchvision, torchaudio, xformers, and triton lines are skipped
echo so this BAT does not intentionally change your CUDA/PyTorch setup.
echo.

set "REQ_SRC=%COMFY_DIR%\requirements.txt"
set "REQ_TMP=%TEMP%\deno_bernini_requirements_%RANDOM%%RANDOM%.txt"
if not exist "%REQ_SRC%" (
    echo [ERROR] requirements.txt was not found:
    echo   %REQ_SRC%
    goto :fail
)

"%PY_EXE%" -c "from pathlib import Path; import re, sys; src=Path(sys.argv[1]); dst=Path(sys.argv[2]); skip=re.compile(r'^\s*(torch|torchvision|torchaudio|xformers|triton)(\b|[<>=!~ ])', re.I); dst.write_text(''.join(line for line in src.read_text(encoding='utf-8').splitlines(True) if not skip.match(line)), encoding='utf-8')" "%REQ_SRC%" "%REQ_TMP%"
if errorlevel 1 goto :pip_fail

"%PY_EXE%" -m pip install -r "%REQ_TMP%"
if errorlevel 1 goto :pip_fail

del "%REQ_TMP%" >nul 2>nul

echo.
echo ============================================================
echo  DONE
echo ============================================================
echo.
echo ComfyUI backend is now on:
git -C "%COMFY_DIR%" branch --show-current
git -C "%COMFY_DIR%" rev-parse --short HEAD
echo.
echo Next:
echo   1. Start this copied ComfyUI normally.
echo   2. Update/install deno-custom-nodes.
echo   3. Open the Bernini workflow.
echo.
echo To restore official ComfyUI later, run these commands in the ComfyUI folder:
echo   git checkout master
echo   git pull origin master
echo.
goto :end

:find_comfy_dir
set "COMFY_DIR="
if exist "%SCRIPT_DIR%main.py" set "COMFY_DIR=%SCRIPT_DIR:~0,-1%"
if not defined COMFY_DIR if exist "%SCRIPT_DIR%ComfyUI\main.py" set "COMFY_DIR=%SCRIPT_DIR%ComfyUI"
if not defined COMFY_DIR if exist "%SCRIPT_DIR%..\ComfyUI\main.py" for %%I in ("%SCRIPT_DIR%..\ComfyUI") do set "COMFY_DIR=%%~fI"
exit /b 0

:find_python
set "PY_EXE="
if exist "%COMFY_DIR%\..\python_embeded\python.exe" set "PY_EXE=%COMFY_DIR%\..\python_embeded\python.exe"
if not defined PY_EXE if exist "%SCRIPT_DIR%python_embeded\python.exe" set "PY_EXE=%SCRIPT_DIR%python_embeded\python.exe"
if not defined PY_EXE (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined PY_EXE set "PY_EXE=%%P"
    )
)
exit /b 0

:git_fail
echo.
echo [ERROR] Git update failed.
goto :fail

:pip_fail
echo.
echo [ERROR] Python dependency update failed.
if exist "%REQ_TMP%" del "%REQ_TMP%" >nul 2>nul
goto :fail

:fail
echo.
echo The update did not finish.
echo.
pause
exit /b 1

:end
popd >nul 2>nul
echo.
pause
exit /b 0
