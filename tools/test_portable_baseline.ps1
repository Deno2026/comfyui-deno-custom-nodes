param(
  [string]$PortableRoot = "E:\DENO-Share\comfyui-portable-testbeds\comfyui-v0.21.0-nvidia\ComfyUI_windows_portable",
  [string]$SourceRepo = "",
  [int]$Port = 8191,
  [switch]$SkipSync,
  [switch]$InstallRtxVfx,
  [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Assert-ChildPath([string]$Parent, [string]$Child) {
  $parentFull = (Resolve-FullPath $Parent).TrimEnd('\') + '\'
  $childFull = Resolve-FullPath $Child
  if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use path outside expected parent. Parent=$parentFull Child=$childFull"
  }
}

if ([string]::IsNullOrWhiteSpace($SourceRepo)) {
  $SourceRepo = Resolve-FullPath (Join-Path $PSScriptRoot "..")
} else {
  $SourceRepo = Resolve-FullPath $SourceRepo
}

$PortableRoot = Resolve-FullPath $PortableRoot
$ComfyRoot = Join-Path $PortableRoot "ComfyUI"
$PythonExe = Join-Path $PortableRoot "python_embeded\python.exe"
$MainPy = Join-Path $ComfyRoot "main.py"
$CustomNodesRoot = Join-Path $ComfyRoot "custom_nodes"
$NodeDest = Join-Path $CustomNodesRoot "deno-custom-nodes"
$LogRoot = Join-Path (Split-Path $PortableRoot -Parent) "_logs"

if (-not (Test-Path $PythonExe)) { throw "Portable Python not found: $PythonExe" }
if (-not (Test-Path $MainPy)) { throw "ComfyUI main.py not found: $MainPy" }
if (-not (Test-Path (Join-Path $SourceRepo "__init__.py"))) { throw "Source repo does not look like a ComfyUI node package: $SourceRepo" }

New-Item -ItemType Directory -Force -Path $CustomNodesRoot, $LogRoot | Out-Null
Assert-ChildPath $CustomNodesRoot $NodeDest

if (-not $SkipSync) {
  New-Item -ItemType Directory -Force -Path $NodeDest | Out-Null
  $robocopyArgs = @(
    $SourceRepo,
    $NodeDest,
    "/MIR",
    "/XD", ".git", ".pytest_cache", "__pycache__",
    "/XF", "*.pyc", "*.pyo",
    "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
  )
  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE"
  }
}

if ($InstallRtxVfx) {
  $installer = Join-Path $NodeDest "tools\install_rtx_vfx.bat"
  if (-not (Test-Path $installer)) { throw "RTX VFX installer not found after sync: $installer" }
  $env:COMFYUI_PYTHON = $PythonExe
  $env:DENO_RTX_VFX_YES = "1"
  cmd.exe /c "`"$installer`" <NUL"
  if ($LASTEXITCODE -ne 0) {
    throw "RTX VFX installer failed with exit code $LASTEXITCODE"
  }
}

$url = "http://127.0.0.1:$Port"
$startedProcess = $null
$stdout = Join-Path $LogRoot ("portable-baseline-{0}-stdout.log" -f $Port)
$stderr = Join-Path $LogRoot ("portable-baseline-{0}-stderr.log" -f $Port)

try {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $Port is already in use. Stop that process or choose another port."
  }

  $args = @(
    "-s",
    $MainPy,
    "--windows-standalone-build",
    "--listen",
    "127.0.0.1",
    "--port",
    [string]$Port,
    "--enable-manager"
  )
  $startedProcess = Start-Process -FilePath $PythonExe -ArgumentList $args -WorkingDirectory $PortableRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($startedProcess.HasExited) {
      throw "ComfyUI exited during startup. See logs: $stdout / $stderr"
    }
    try {
      Invoke-RestMethod -Uri "$url/system_stats" -TimeoutSec 5 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Seconds 3
    }
  }
  if (-not $ready) { throw "ComfyUI did not become ready within $StartupTimeoutSeconds seconds." }

  $requiredNodes = @(
    "DenoResolutionSetup",
    "DenoMultiImageLoader",
    "DenoAdvancedImageSourceLoader",
    "DenoRTXVFXEasyUpscale",
    "DenoRTXVFXVideoFinisher",
    "DenoImageCompare"
  )
  foreach ($node in $requiredNodes) {
    Invoke-RestMethod -Uri "$url/object_info/$node" -TimeoutSec 10 | Out-Null
  }

  $helpJs = Invoke-WebRequest -Uri "$url/extensions/deno-custom-nodes/deno_node_help.js" -UseBasicParsing -TimeoutSec 10
  if ($helpJs.Content -notmatch "Deno.NodeHelp") {
    throw "DENO node help JS was served, but expected marker was not found."
  }

  [pscustomobject]@{
    ok = $true
    portable_root = $PortableRoot
    source_repo = $SourceRepo
    port = $Port
    node_dest = $NodeDest
    checked_nodes = $requiredNodes -join ","
    stdout = $stdout
    stderr = $stderr
  } | ConvertTo-Json -Depth 3
} finally {
  if ($startedProcess -and -not $startedProcess.HasExited) {
    Stop-Process -Id $startedProcess.Id -Force
  }
}
