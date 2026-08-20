@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title DENO Bernini Preview Backend Update - Retired

echo.
echo ============================================================
echo  DENO Bernini Preview Backend Update - RETIRED
echo ============================================================
echo.
echo Current ComfyUI Stable already includes native Bernini
echo context-latent support and the ^(Bernini^) Conditioning node.
echo This legacy helper no longer changes branches or installs files.
echo.
echo Update ComfyUI Stable normally, restart it, then connect the
echo DENO Bernini Prompt Guide positive and negative outputs to the
echo native ^(Bernini^) Conditioning node.
echo.
echo Nothing was changed.
echo.
pause
exit /b 0
