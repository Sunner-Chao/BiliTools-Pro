$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $RootDir "apps\backend"

Set-Location $BackendDir
.\.venv\Scripts\python.exe -m pip install -U pyinstaller "httpx[socks]>=0.25.0" qrcode pillow loguru pydantic pydantic-settings python-dotenv
.\.venv\Scripts\python.exe -m PyInstaller `
  --clean `
  --noconfirm `
  --name backend `
  --paths "$BackendDir" `
  --hidden-import socksio `
  --hidden-import qrcode.image.pil `
  --collect-all pydantic `
  --collect-all pydantic_settings `
  packaging\backend_launcher.py
