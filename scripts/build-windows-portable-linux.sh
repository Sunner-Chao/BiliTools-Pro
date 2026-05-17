#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
BACKEND_DIR="$ROOT_DIR/apps/backend"
BUILD_DIR="$ROOT_DIR/build/windows-portable-backend"
PY_VERSION="3.11.9"
PY_EMBED="python-${PY_VERSION}-embed-amd64.zip"
PY_URL="https://www.python.org/ftp/python/${PY_VERSION}/${PY_EMBED}"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/python" "$BUILD_DIR/wheels"

if [ ! -f "$ROOT_DIR/build/${PY_EMBED}" ]; then
  mkdir -p "$ROOT_DIR/build"
  curl -L "$PY_URL" -o "$ROOT_DIR/build/${PY_EMBED}"
fi

unzip -q "$ROOT_DIR/build/${PY_EMBED}" -d "$BUILD_DIR/python"
mkdir -p "$BUILD_DIR/python/Lib/site-packages"

python3 -m pip download \
  --dest "$BUILD_DIR/wheels" \
  --only-binary=:all: \
  --platform win_amd64 \
  --implementation cp \
  --python-version 311 \
  --abi cp311 \
  "loguru>=0.7.2" \
  "pydantic>=2.5.0" \
  "pydantic-settings>=2.1.0" \
  "httpx[socks]>=0.25.0" \
  "python-dotenv>=1.0.0" \
  "pillow>=10.1.0" \
  "qrcode>=7.4.2"

for wheel in "$BUILD_DIR"/wheels/*.whl; do
  unzip -q "$wheel" -d "$BUILD_DIR/python/Lib/site-packages"
done

cat > "$BUILD_DIR/python/python311._pth" <<'EOF'
python311.zip
.
Lib\site-packages
..\src
import site
EOF

cp -R "$BACKEND_DIR/src" "$BUILD_DIR/src"
cp -R "$ROOT_DIR/config" "$BUILD_DIR/config"
cp -R "$ROOT_DIR/execute" "$BUILD_DIR/execute"
cp -R "$ROOT_DIR/captcha_images" "$BUILD_DIR/captcha_images"
cp -R "$ROOT_DIR/javascript" "$BUILD_DIR/javascript"
cp -R "$ROOT_DIR/model" "$BUILD_DIR/model"
cp -R "$ROOT_DIR/others" "$BUILD_DIR/others"
cp -R "$ROOT_DIR/videos" "$BUILD_DIR/videos"

rm -rf "$DESKTOP_DIR/build/backend-win"
mkdir -p "$DESKTOP_DIR/build"
cp -R "$BUILD_DIR" "$DESKTOP_DIR/build/backend-win"

cd "$DESKTOP_DIR"
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/vite build --mode electron
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --win zip --x64
