#!/bin/bash
# Run development mode

# Start backend
echo "Starting backend..."
cd apps/backend
uv run python -m src.main &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend dev server
echo "Starting frontend..."
cd ../desktop
pnpm run dev

# Cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null" EXIT