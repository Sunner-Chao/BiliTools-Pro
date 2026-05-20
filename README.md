# BiliTools-Pro

A modern, cross-platform Bilibili automation tool built with Electron + React + Python.

## Features

- **QR Code Login** - Scan with Bilibili app to authenticate
- **Cookie Login** - Import existing session cookies
- **Task Management** - Create, start, stop automation tasks
- **Live Streaming** - Stream to Bilibili live rooms
- **Modern UI** - Clean interface built with Ant Design

## Tech Stack

- **Frontend**: Electron + React 18 + TypeScript + Vite
- **Backend**: Python 3.11+ with asyncio
- **State Management**: Redux Toolkit
- **UI Components**: Ant Design 5.x
- **Monorepo**: pnpm workspaces

## Project Structure

```
BiliTools-Pro/
├── apps/
│   ├── desktop/          # Electron app
│   │   ├── src/
│   │   │   ├── main/    # Main process
│   │   │   ├── preload/ # Preload scripts
│   │   │   └── renderer/ # React frontend
│   │   │       ├── components/
│   │   │       └── store/
│   │   └── package.json
│   └── backend/          # Python backend
│       ├── src/
│       │   ├── api/     # IPC handlers
│       │   ├── core/    # Config, logging
│       │   └── services/ # Business logic
│       └── pyproject.toml
├── scripts/             # Build scripts
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Python 3.11+
- uv (Python package manager)

### Installation

```bash
# Install all dependencies
pnpm install

# Install backend dependencies
cd apps/backend
uv sync
```

### Development

```bash
# Run development mode (frontend + backend)
./scripts/dev.sh

# Or run separately:
# Terminal 1: Backend
cd apps/backend
uv run python -m src.main

# Terminal 2: Frontend
cd apps/desktop
pnpm run dev
```

### Building

```bash
# Build for production
./scripts/build.sh

# Output will be in apps/desktop/dist/
```

## Architecture

### IPC Communication

The frontend (Electron renderer) communicates with the Python backend via a TCP-based IPC server:

1. Renderer sends JSON messages through preload API
2. Preload forwards to main process via contextBridge
3. Main process forwards to Python backend via stdin/stdout
4. Backend processes and returns responses

### State Management

Redux Toolkit manages all application state:
- `auth` - Authentication state and user info
- `tasks` - Task list and execution state
- `streaming` - Live streaming status
- `ui` - Theme, sidebar, notifications

## License

MIT License