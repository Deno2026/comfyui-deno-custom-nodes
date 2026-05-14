param(
  [string]$ComfyRoot = "",
  [string]$PythonExe = "",
  [int]$Port = 8188
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Get-FileHashSafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  try {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
  } catch {
    return "ERROR: $($_.Exception.Message)"
  }
}

function Get-CommandText([string]$Command, [string[]]$Args = @()) {
  try {
    $output = & $Command @Args 2>&1
    return ($output | Out-String).Trim()
  } catch {
    return "ERROR: $($_.Exception.Message)"
  }
}

function Read-TextSafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  try {
    return Get-Content -LiteralPath $Path -Encoding UTF8 -Raw
  } catch {
    return ""
  }
}

function Find-ComfyRootFromScript {
  $candidate = Resolve-FullPath (Join-Path $PSScriptRoot "..\..\..")
  if (Test-Path -LiteralPath (Join-Path $candidate "main.py")) {
    return $candidate
  }
  return ""
}

if ([string]::IsNullOrWhiteSpace($ComfyRoot)) {
  $ComfyRoot = Find-ComfyRootFromScript
}
if (-not [string]::IsNullOrWhiteSpace($ComfyRoot)) {
  $ComfyRoot = Resolve-FullPath $ComfyRoot
}

if ([string]::IsNullOrWhiteSpace($PythonExe) -and -not [string]::IsNullOrWhiteSpace($ComfyRoot)) {
  $portablePython = Join-Path (Split-Path -Parent $ComfyRoot) "python_embeded\python.exe"
  if (Test-Path -LiteralPath $portablePython) {
    $PythonExe = $portablePython
  }
}
if (-not [string]::IsNullOrWhiteSpace($PythonExe)) {
  $PythonExe = Resolve-FullPath $PythonExe
}

$customNodesRoot = if ($ComfyRoot) { Join-Path $ComfyRoot "custom_nodes" } else { "" }
$denoRoot = if ($customNodesRoot) { Join-Path $customNodesRoot "deno-custom-nodes" } else { "" }
$rtxRoot = if ($customNodesRoot) { Join-Path $customNodesRoot "comfyui_nvidia_rtx_nodes" } else { "" }
$rtxDisabledRoot = if ($customNodesRoot) { Join-Path $customNodesRoot "comfyui_nvidia_rtx_nodes.disabled" } else { "" }
$rtxProbeRoot = if (Test-Path -LiteralPath $rtxRoot) { $rtxRoot } elseif (Test-Path -LiteralPath $rtxDisabledRoot) { $rtxDisabledRoot } else { $rtxRoot }
$rtxInit = Join-Path $rtxProbeRoot "__init__.py"
$rtxText = Read-TextSafe $rtxInit
$denoRuntimeMarker = if ($denoRoot) { Join-Path $denoRoot "tools\DENO_RTX_VFX_runtime_path.txt" } else { "" }
$ngdRoot = "C:\ProgramData\NVIDIA\NGX\models\nvbcast"

$pythonProbe = ""
if ($PythonExe -and (Test-Path -LiteralPath $PythonExe)) {
  $probePath = Join-Path $env:TEMP ("deno_rtx_vfx_probe_{0}.py" -f ([Guid]::NewGuid().ToString("N")))
  $probe = @"
import json, sys
result = {"python": sys.executable, "version": sys.version, "ok": False}
try:
    import nvvfx
    result["nvvfx_path"] = list(getattr(nvvfx, "__path__", []))
    result["nvvfx_file"] = getattr(nvvfx, "__file__", "")
    result["nvvfx_version"] = getattr(nvvfx, "__version__", "unknown")
    try:
        import nvvfx._lib_loader as loader
        result["nvvfx_libs"] = loader.get_libs_directory()
    except Exception as exc:
        result["nvvfx_libs_error"] = repr(exc)
    result["ok"] = True
except Exception as exc:
    result["error"] = repr(exc)
print(json.dumps(result, ensure_ascii=False, indent=2))
"@
  try {
    $probe | Out-File -LiteralPath $probePath -Encoding UTF8
    $output = & $PythonExe $probePath 2>&1
    $pythonProbe = ([pscustomobject]@{
      exit_code = $LASTEXITCODE
      output = ($output | Out-String).Trim()
    } | ConvertTo-Json -Depth 4)
  } catch {
    $pythonProbe = "ERROR: $($_.Exception.Message)"
  } finally {
    if (Test-Path -LiteralPath $probePath) {
      Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
    }
  }
}

$processModules = @()
try {
  $pythonProcesses = Get-Process -Name python,pythonw -ErrorAction SilentlyContinue
  foreach ($process in $pythonProcesses) {
    $moduleRows = @()
    try {
      foreach ($module in $process.Modules) {
        $fileName = [string]$module.FileName
        if (
          $fileName -match "nvvfx" -or
          $fileName -match "nvbcast" -or
          $fileName -match "NGX\\models" -or
          $fileName -match "NVVideoEffects|NVCVImage|nvVFXUpscale"
        ) {
          $moduleRows += $fileName
        }
      }
    } catch {
      $moduleRows += "ERROR reading modules: $($_.Exception.Message)"
    }
    if ($moduleRows.Count -gt 0) {
      $processModules += [pscustomobject]@{
        pid = $process.Id
        path = $process.Path
        modules = $moduleRows
      }
    }
  }
} catch {
  $processModules += [pscustomobject]@{
    pid = 0
    path = ""
    modules = @("ERROR: $($_.Exception.Message)")
  }
}

$objectInfo = ""
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/object_info/DenoRTXVFXEasyUpscale" -TimeoutSec 5
  $objectInfo = "OK HTTP $($response.StatusCode), length $($response.Content.Length)"
} catch {
  $objectInfo = "UNREACHABLE: $($_.Exception.Message)"
}

$servedJs = ""
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/extensions/deno-custom-nodes/deno_rtx_vfx_easy_upscale.js" -TimeoutSec 5
  $hasWidthFix = $response.Content -match "const MIN_EASY_WIDTH = 560;"
  $servedJs = "OK HTTP $($response.StatusCode), width_fix=$hasWidthFix, length $($response.Content.Length)"
} catch {
  $servedJs = "UNREACHABLE: $($_.Exception.Message)"
}

$report = [ordered]@{
  generated_at = (Get-Date).ToString("s")
  computer = $env:COMPUTERNAME
  user = $env:USERNAME
  comfy_root = $ComfyRoot
  python_exe = $PythonExe
  deno_root_exists = (Test-Path -LiteralPath $denoRoot)
  rtx_node_root = $rtxProbeRoot
  rtx_node_enabled = (Test-Path -LiteralPath $rtxRoot)
  rtx_node_disabled = (Test-Path -LiteralPath $rtxDisabledRoot)
  rtx_init_hash = Get-FileHashSafe $rtxInit
  rtx_init_has_nvbcast = ($rtxText -match "nvbcast")
  rtx_init_has_broadcast = ($rtxText -match "Broadcast")
  rtx_init_has_upscale_selector = ($rtxText -match "Upscale")
  rtx_init_has_add_dll_directory = ($rtxText -match "add_dll_directory")
  rtx_init_has_ctypes_windll = ($rtxText -match "ctypes\.WinDLL")
  rtx_init_has_video_super_res = ($rtxText -match "VideoSuperRes")
  deno_runtime_marker_path = $denoRuntimeMarker
  deno_runtime_marker_value = (Read-TextSafe $denoRuntimeMarker).Trim()
  nvbcast_root_exists = (Test-Path -LiteralPath $ngdRoot)
  nvbcast_root = $ngdRoot
  nvbcast_files = if (Test-Path -LiteralPath $ngdRoot) {
    @(Get-ChildItem -LiteralPath $ngdRoot -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "NVVideoEffects|NVCVImage|nvVFXUpscale|\.dll$" } |
      Select-Object -First 40 -ExpandProperty FullName)
  } else { @() }
  nvidia_smi = Get-CommandText "nvidia-smi" @("--query-gpu=name,driver_version", "--format=csv,noheader")
  python_probe = $pythonProbe
  live_comfy_object_info = $objectInfo
  live_served_deno_js = $servedJs
  loaded_python_process_modules = $processModules
}

$json = $report | ConvertTo-Json -Depth 8
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$safeComputer = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { "pc" }
$outPath = Join-Path $PSScriptRoot ("rtx_vfx_env_report_{0}_{1}.json" -f $safeComputer, $timestamp)
$json | Out-File -LiteralPath $outPath -Encoding UTF8

Write-Host "DENO RTX VFX environment report"
Write-Host "Saved: $outPath"
Write-Host ""
Write-Host "Key summary:"
Write-Host ("- RTX node enabled: {0}" -f $report.rtx_node_enabled)
Write-Host ("- RTX node hash: {0}" -f $report.rtx_init_hash)
Write-Host ("- RTX node has nvbcast string: {0}" -f $report.rtx_init_has_nvbcast)
Write-Host ("- RTX node has Upscale selector string: {0}" -f $report.rtx_init_has_upscale_selector)
Write-Host ("- nvbcast runtime folder exists: {0}" -f $report.nvbcast_root_exists)
Write-Host ("- DENO runtime marker: {0}" -f $report.deno_runtime_marker_value)
Write-Host ("- Live DENO object_info: {0}" -f $report.live_comfy_object_info)
Write-Host ("- Live served DENO JS: {0}" -f $report.live_served_deno_js)
Write-Host ""
Write-Host "Send me the two JSON report files from main PC and sub PC."
