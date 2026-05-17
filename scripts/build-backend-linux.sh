#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"

cd "$BACKEND_DIR"
./.venv/bin/python -m pip install -U pyinstaller 'httpx[socks]>=0.25.0' qrcode pillow loguru pydantic pydantic-settings python-dotenv
./.venv/bin/python -m PyInstaller \
  --clean \
  --noconfirm \
  --name backend \
  --paths "$BACKEND_DIR" \
  --hidden-import socksio \
  --hidden-import qrcode.image.pil \
  --collect-all pydantic \
  --collect-all pydantic_settings \
  packaging/backend_launcher.py
