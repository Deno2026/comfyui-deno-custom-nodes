param(
    [int[]]$Ports = @(8188, 8000, 8199)
)

$ErrorActionPreference = "Continue"

function Get-ProcessForPort {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $conn.OwningProcess) -ErrorAction SilentlyContinue
    if (-not $proc) {
        return [pscustomobject]@{ Port = $Port; Pid = $conn.OwningProcess; Name = ""; CommandLine = "" }
    }
    [pscustomobject]@{ Port = $Port; Pid = $proc.ProcessId; Name = $proc.Name; CommandLine = $proc.CommandLine }
}

function Read-TextUrl {
    param([string]$Url)
    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        return [string]$res.Content
    } catch {
        return $null
    }
}

function Get-PyprojectValue {
    param([string]$Path, [string]$Key)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $line = Get-Content -LiteralPath $Path -Encoding UTF8 -ErrorAction SilentlyContinue |
        Where-Object { $_ -match ("^\s*{0}\s*=" -f [regex]::Escape($Key)) } |
        Select-Object -First 1
    if ($line -match '=\s*"([^"]+)"') { return $Matches[1] }
    return $null
}

function Find-DenoPackage {
    param([string]$CustomNodesRoot)
    if (-not (Test-Path -LiteralPath $CustomNodesRoot)) { return @() }
    $dirs = Get-ChildItem -LiteralPath $CustomNodesRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '(?i)(^|[._-])disabled([._-]|$)' }
    $foundPackages = @()
    foreach ($dir in $dirs) {
        $pyproject = Join-Path $dir.FullName "pyproject.toml"
        $name = Get-PyprojectValue -Path $pyproject -Key "name"
        if ($name -eq "deno-custom-nodes" -or $dir.Name -match "deno.*custom.*nodes|comfyui-deno-custom-nodes") {
            $version = Get-PyprojectValue -Path $pyproject -Key "version"
            $js = Join-Path $dir.FullName "web\js\deno_ideogram_director.js"
            $rev = $null
            if (Test-Path -LiteralPath $js) {
                $revLine = Get-Content -LiteralPath $js -Encoding UTF8 -ErrorAction SilentlyContinue |
                    Select-String -Pattern 'IDD_REV\s*=' |
                    Select-Object -First 1
                if ($revLine -and $revLine.Line -match '"([^"]+)"') { $rev = $Matches[1] }
            }
            $foundPackages += [pscustomobject]@{
                Path = $dir.FullName
                Folder = $dir.Name
                Version = $version
                IdeogramRev = $rev
            }
        }
    }
    return $foundPackages
}

function Get-ServedIdeogramRev {
    param([int]$Port, [string[]]$FolderGuesses)
    foreach ($folder in $FolderGuesses | Where-Object { $_ }) {
        $url = "http://127.0.0.1:$Port/extensions/$folder/deno_ideogram_director.js"
        $txt = Read-TextUrl -Url $url
        if ($txt -and $txt -match 'IDD_REV\s*=\s*"([^"]+)"') {
            return [pscustomobject]@{ Url = $url; Rev = $Matches[1] }
        }
    }
    return $null
}

function Get-LaunchPort {
    param([string]$LaunchArgs)
    if ($LaunchArgs -and $LaunchArgs -match '(?:^|\s)--port\s+(\d+)') {
        return [int]$Matches[1]
    }
    return $null
}

$desktopInstallationsPath = Join-Path $env:APPDATA "Comfy Desktop\installations.json"
$desktopInstallations = @()
if (Test-Path -LiteralPath $desktopInstallationsPath) {
    try {
        $parsedDesktopInstallations = Get-Content -LiteralPath $desktopInstallationsPath -Encoding UTF8 | ConvertFrom-Json
        $desktopInstallations = @($parsedDesktopInstallations)
    } catch {
        $desktopInstallations = @()
    }
}

$desktopConfigPath = Join-Path $env:APPDATA "ComfyUI\config.json"
$desktopBase = $null
if (Test-Path -LiteralPath $desktopConfigPath) {
    try {
        $desktopConfig = Get-Content -LiteralPath $desktopConfigPath -Encoding UTF8 | ConvertFrom-Json
        $desktopBase = $desktopConfig.basePath
    } catch {}
}

$known = @(
    [pscustomobject]@{
        Runtime = "Easy-Install main"
        ExpectedPort = 8188
        BasePath = "E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install"
        CustomNodesRoot = "E:\ComfyUI\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\custom_nodes"
        Launch = "C:\Users\aions\Desktop\ComfyUI - Sage Attention.lnk"
    },
    [pscustomobject]@{
        Runtime = "Easy-Install test"
        ExpectedPort = 8199
        BasePath = "E:\ComfyUI\ComfyUI-Easy-Install - TEST\ComfyUI-Easy-Install"
        CustomNodesRoot = "E:\ComfyUI\ComfyUI-Easy-Install - TEST\ComfyUI-Easy-Install\ComfyUI\custom_nodes"
        Launch = "(test runtime, verify before use)"
    }
)

foreach ($install in $desktopInstallations) {
    if ($install.sourceId -eq "cloud" -or -not $install.installPath) { continue }

    $basePath = if ($install.adoptedBaseDir) { [string]$install.adoptedBaseDir } else { [string]$install.installPath }
    $customNodesRoot = if ($install.adoptedBaseDir) {
        Join-Path ([string]$install.adoptedBaseDir) "custom_nodes"
    } else {
        Join-Path ([string]$install.installPath) "ComfyUI\custom_nodes"
    }

    $known += [pscustomobject]@{
        Runtime = "ComfyUI Desktop: $($install.name)"
        ExpectedPort = (Get-LaunchPort -LaunchArgs ([string]$install.launchArgs))
        BasePath = $basePath
        CustomNodesRoot = $customNodesRoot
        Launch = "C:\Users\aions\Desktop\Comfy Desktop.lnk"
    }
}

if (($desktopInstallations.Count -eq 0) -and $desktopBase) {
    $known += [pscustomobject]@{
        Runtime = "ComfyUI Desktop"
        ExpectedPort = 8000
        BasePath = $desktopBase
        CustomNodesRoot = Join-Path $desktopBase "custom_nodes"
        Launch = "C:\Users\aions\Desktop\Comfy Desktop.lnk"
    }
}

$rows = @()
foreach ($runtime in $known) {
    $listener = if ($null -ne $runtime.ExpectedPort) { Get-ProcessForPort -Port $runtime.ExpectedPort } else { $null }
    $pkgs = Find-DenoPackage -CustomNodesRoot $runtime.CustomNodesRoot
    if (-not $pkgs -or $pkgs.Count -eq 0) {
        $pkgs = @([pscustomobject]@{ Path = ""; Folder = ""; Version = ""; IdeogramRev = "" })
    }
    foreach ($pkg in $pkgs) {
        $queueText = if ($listener) { Read-TextUrl -Url ("http://127.0.0.1:{0}/queue" -f $runtime.ExpectedPort) } else { $null }
        $objectInfo = if ($listener) { Read-TextUrl -Url ("http://127.0.0.1:{0}/object_info/DenoIdeogramDirector" -f $runtime.ExpectedPort) } else { $null }
        $served = if ($listener) {
            Get-ServedIdeogramRev -Port $runtime.ExpectedPort -FolderGuesses @($pkg.Folder, "deno-custom-nodes", "comfyui-deno-custom-nodes")
        } else { $null }
        $rows += [pscustomobject]@{
            Runtime = $runtime.Runtime
            Port = if ($null -ne $runtime.ExpectedPort) { $runtime.ExpectedPort } else { "auto/not running" }
            ListeningPid = if ($listener) { $listener.Pid } else { "" }
            Process = if ($listener) { $listener.Name } else { "" }
            BasePath = $runtime.BasePath
            DenoPath = $pkg.Path
            Version = $pkg.Version
            FileIdeogramRev = $pkg.IdeogramRev
            QueueReachable = [bool]$queueText
            ObjectInfoIdeogram = [bool]$objectInfo
            ServedIdeogramRev = if ($served) { $served.Rev } else { "" }
            ServedJsUrl = if ($served) { $served.Url } else { "" }
            Launch = $runtime.Launch
        }
    }
}

$rows | Format-List
