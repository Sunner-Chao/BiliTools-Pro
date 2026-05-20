$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")

& (Join-Path $PSScriptRoot "build-backend-windows.ps1")

Set-Location (Join-Path $RootDir "apps\desktop")
$DistDir = Join-Path (Get-Location) "dist"
if (Test-Path $DistDir) {
  Remove-Item -LiteralPath $DistDir -Recurse -Force
}
npm run build:electron
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
.\node_modules\.bin\electron-builder.cmd --win --x64
