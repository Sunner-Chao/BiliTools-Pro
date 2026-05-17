#!/bin/bash
# Build script for BiliTools-Pro

set -e

echo "Building BiliTools-Pro..."

# Install dependencies
echo "Installing frontend dependencies..."
cd apps/desktop
pnpm install

echo "Installing backend dependencies..."
cd ../backend
uv sync

# Build frontend
echo "Building frontend..."
cd ../desktop
pnpm run build

# Package with electron-builder
echo "Packaging application..."
pnpm run package

echo "Build complete! Check dist/ folder for output."