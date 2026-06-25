param(
  [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
python (Join-Path $repo "tools\codex_gate.py") --mode $Mode
