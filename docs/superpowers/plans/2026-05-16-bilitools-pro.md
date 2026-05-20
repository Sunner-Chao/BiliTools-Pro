# BiliTools-Pro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面重构 BiliTools 为现代化 Electron + React + Python 桌面应用

**Architecture:** 前后端分离，Electron主进程管理窗口，React渲染进程提供UI，Python后端通过IPC处理业务逻辑

**Tech Stack:** Electron 28+, React 18, TypeScript 5.x, Redux Toolkit, Ant Design 5, Vite, Python 3.11+, uv, Playwright, asyncio, loguru

---

## Phase 1: 基础架构搭建

### Task 1: 初始化 Monorepo 结构

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] **Step 1: 创建根目录 package.json**

```json
{
  "name": "bilitools-pro",
  "version": "1.0.0",
  "private": true,
  "description": "BiliTools Pro - 现代化B站活动自动化工具",
  "scripts": {
    "dev": "pnpm --filter desktop dev",
    "build": "pnpm --filter desktop build",
    "package": "pnpm --filter desktop package",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

- [ ] **Step 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: 创建 .gitignore**

```gitignore
node_modules/
dist/
build/
out/
*.egg-info/
__pycache__/
*.pyc
.vscode/
.idea/
.DS_Store
Thumbs.db
.env
.env.local
*.log
logs/
.venv/
venv/
.mypy_cache/
.ruff_cache/
.pytest_cache/
release/
.cache/
```

- [ ] **Step 4: 创建 .editorconfig**

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{js,jsx,ts,tsx}]
indent_style = space
indent_size = 2

[*.py]
indent_style = space
indent_size = 4

[*.{json,yml,yaml}]
indent_style = space
indent_size = 2
```

- [ ] **Step 5: 初始化 Git 并提交**

```bash
cd /home/sunner/demo_vscode/Bili-Tools/BiliTools-Pro
git init
git add .
git commit -m "chore: initialize monorepo structure"
```

---

### Task 2: 搭建 Electron + React 前端

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/window-manager.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/main.tsx`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/App.css`
- Create: `apps/desktop/src/renderer/store/index.ts`

- [ ] **Step 1: 创建 desktop/package.json**

```json
{
  "name": "desktop",
  "version": "1.0.0",
  "private": true,
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "package": "electron-builder",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@reduxjs/toolkit": "^2.0.0",
    "react-redux": "^9.0.0",
    "antd": "^5.12.0",
    "@ant-design/icons": "^5.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(args) { args.reload(); },
        vite: { build: { outDir: 'dist/preload' } },
      },
    ]),
    electronRenderer(),
  ],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: { outDir: 'dist/renderer' },
});
```

- [ ] **Step 5: 创建 electron-builder.yml**

```yaml
appId: com.bilitools.pro
productName: BiliTools-Pro
directories:
  buildResources: build
files:
  - dist/**/*
  - '!node_modules/**/*'
asar: true
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: build/icon.icns
linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: build/icon.png
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 6: 创建 Electron 主进程**

```typescript
// apps/desktop/src/main/index.ts
import { app, BrowserWindow } from 'electron';
import { WindowManager } from './window-manager';

let windowManager: WindowManager | null = null;

app.whenReady().then(() => {
  windowManager = new WindowManager();
  windowManager.createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager!.createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 7: 创建窗口管理器**

```typescript
// apps/desktop/src/main/window-manager.ts
import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow!.show();
    });

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}
```

- [ ] **Step 8: 创建 Preload 脚本**

```typescript
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  system: {
    getPlatform: () => ipcRenderer.invoke('system:platform'),
    getVersion: () => ipcRenderer.invoke('system:version'),
  },
  auth: {
    loginByQR: () => ipcRenderer.invoke('auth:loginByQR'),
    loginByCookie: (cookie: string) => ipcRenderer.invoke('auth:loginByCookie', cookie),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:getStatus'),
  },
  tasks: {
    create: (config: any) => ipcRenderer.invoke('tasks:create', config),
    start: (taskId: string) => ipcRenderer.invoke('tasks:start', taskId),
    stop: (taskId: string) => ipcRenderer.invoke('tasks:stop', taskId),
    list: () => ipcRenderer.invoke('tasks:list'),
  },
  streaming: {
    start: (config: any) => ipcRenderer.invoke('streaming:start', config),
    stop: () => ipcRenderer.invoke('streaming:stop'),
    getStatus: () => ipcRenderer.invoke('streaming:getStatus'),
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  },
};

contextBridge.exposeInMainWorld('api', api);

declare global {
  interface Window { api: typeof api; }
}
```

- [ ] **Step 9: 创建 HTML 入口**

```html
<!-- apps/desktop/src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BiliTools-Pro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: 创建 React 入口**

```typescript
// apps/desktop/src/renderer/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { store } from './store';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ConfigProvider locale={zhCN}>
          <App />
        </ConfigProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
```

- [ ] **Step 11: 创建 App 组件**

```tsx
// apps/desktop/src/renderer/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';

const { Content } = Layout;

function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
          <h1>BiliTools-Pro</h1>
          <p>欢迎使用 BiliTools-Pro</p>
        </div>
      </Content>
    </Layout>
  );
}

export default App;
```

- [ ] **Step 12: 创建 App.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#root { width: 100%; height: 100vh; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
```

- [ ] **Step 13: 创建 Store 基础**

```typescript
// apps/desktop/src/renderer/store/index.ts
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
  reducer: {},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 14: 安装依赖并测试**

```bash
cd /home/sunner/demo_vscode/Bili-Tools/BiliTools-Pro
pnpm install
cd apps/desktop && pnpm dev
```

Expected: Electron 窗口打开，显示 "BiliTools-Pro"

- [ ] **Step 15: 提交**

```bash
git add apps/desktop
git commit -m "feat: initialize Electron + React frontend"
```

---

### Task 3: 搭建 Python 后端基础

**Files:**
- Create: `apps/backend/pyproject.toml`
- Create: `apps/backend/src/__init__.py`
- Create: `apps/backend/src/core/__init__.py`
- Create: `apps/backend/src/core/config.py`
- Create: `apps/backend/src/core/logging.py`
- Create: `apps/backend/src/api/__init__.py`
- Create: `apps/backend/src/api/ipc_server.py`
- Create: `apps/backend/src/api/routes/__init__.py`
- Create: `apps/backend/tests/__init__.py`
- Create: `apps/backend/tests/test_config.py`

- [ ] **Step 1: 创建 pyproject.toml**

```toml
[project]
name = "bilitools-backend"
version = "1.0.0"
description = "BiliTools Pro Backend"
requires-python = ">=3.11"
dependencies = [
    "loguru>=0.7.0",
    "aiohttp>=3.9.0",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "playwright>=1.40.0",
    "ffmpeg-python>=0.2.0",
    "pillow>=10.0.0",
    "qrcode>=7.4",
    "aiosqlite>=0.19.0",
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "ruff>=0.1.0",
    "mypy>=1.7.0",
]

[tool.ruff]
target-version = "py311"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: 创建配置模块**

```python
# apps/backend/src/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field
import platform


class AppConfig(BaseSettings):
    app_name: str = "BiliTools-Pro"
    app_version: str = "1.0.0"
    data_dir: Path = Field(default_factory=lambda: _get_data_dir())
    config_file: Path = Field(default_factory=lambda: _get_data_dir() / "config.json")
    cookie_file: Path = Field(default_factory=lambda: _get_data_dir() / "cookies.json")
    log_dir: Path = Field(default_factory=lambda: _get_data_dir() / "logs")
    db_file: Path = Field(default_factory=lambda: _get_data_dir() / "data.db")
    bili_api_base: str = "https://api.bilibili.com"
    bili_live_base: str = "https://live.bilibili.com"
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    default_quality: str = "medium"
    gpu_mode: str = "auto"
    max_concurrent_tasks: int = 5
    default_interval: float = 0.8
    max_retries: int = 3
    ipc_host: str = "127.0.0.1"
    ipc_port: int = 18765

    model_config = {"env_prefix": "BILI_", "env_file": ".env"}


def _get_data_dir() -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path.home() / "AppData" / "Local" / "BiliTools-Pro"
    elif system == "Darwin":
        base = Path.home() / "Library" / "Application Support" / "BiliTools-Pro"
    else:
        base = Path.home() / ".local" / "share" / "bilitools-pro"
    base.mkdir(parents=True, exist_ok=True)
    return base


config = AppConfig()
```

- [ ] **Step 3: 创建日志模块**

```python
# apps/backend/src/core/logging.py
import sys
from loguru import logger
from .config import config


def setup_logging():
    logger.remove()
    logger.add(sys.stderr, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>", level="INFO")
    log_file = config.log_dir / "app_{time:YYYY-MM-DD}.log"
    logger.add(str(log_file), format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}", level="DEBUG", rotation="00:00", retention="30 days", compression="zip")
    error_log = config.log_dir / "error_{time:YYYY-MM-DD}.log"
    logger.add(str(error_log), format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}", level="ERROR", rotation="00:00", retention="90 days")
    logger.info(f"日志系统初始化完成，目录: {config.log_dir}")


__all__ = ["logger", "setup_logging"]
```

- [ ] **Step 4: 创建 IPC 服务器**

```python
# apps/backend/src/api/ipc_server.py
import asyncio
import json
from typing import Any, Callable, Awaitable
from loguru import logger


class IPCServer:
    def __init__(self, host: str = "127.0.0.1", port: int = 18765):
        self.host = host
        self.port = port
        self.handlers: dict[str, Callable[..., Awaitable[Any]]] = {}
        self.server = None

    def register_handler(self, method: str, handler: Callable[..., Awaitable[Any]]):
        self.handlers[method] = handler
        logger.debug(f"注册 IPC 处理器: {method}")

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        addr = writer.get_extra_info('peername')
        logger.info(f"新 IPC 连接: {addr}")
        try:
            while True:
                length_bytes = await reader.readexactly(4)
                length = int.from_bytes(length_bytes, 'big')
                data = await reader.readexactly(length)
                request = json.loads(data.decode('utf-8'))
                response = await self._handle_request(request)
                response_bytes = json.dumps(response).encode('utf-8')
                writer.write(len(response_bytes).to_bytes(4, 'big'))
                writer.write(response_bytes)
                await writer.drain()
        except asyncio.IncompleteReadError:
            logger.info(f"IPC 连接断开: {addr}")
        except Exception as e:
            logger.error(f"IPC 处理错误: {e}")
        finally:
            writer.close()
            await writer.wait_closed()

    async def _handle_request(self, request: dict) -> dict:
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params", {})
        try:
            if method not in self.handlers:
                raise ValueError(f"未知方法: {method}")
            result = await self.handlers[method](**params)
            return {"jsonrpc": "2.0", "id": request_id, "result": result}
        except Exception as e:
            logger.error(f"处理请求失败: {method} - {e}")
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": str(e)}}

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logger.info(f"IPC 服务器启动: {self.host}:{self.port}")
        async with self.server:
            await self.server.serve_forever()

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("IPC 服务器已停止")
```

- [ ] **Step 5: 创建配置测试**

```python
# apps/backend/tests/test_config.py
from src.core.config import AppConfig


def test_config_default_values():
    config = AppConfig()
    assert config.app_name == "BiliTools-Pro"
    assert config.max_concurrent_tasks == 5
    assert config.default_interval == 0.8
    assert config.ipc_port == 18765


def test_config_data_dir_creation():
    config = AppConfig()
    assert config.data_dir.exists()


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("BILI_APP_NAME", "TestApp")
    monkeypatch.setenv("BILI_MAX_CONCURRENT_TASKS", "10")
    config = AppConfig()
    assert config.app_name == "TestApp"
    assert config.max_concurrent_tasks == 10
```

- [ ] **Step 6: 运行测试**

```bash
cd /home/sunner/demo_vscode/Bili-Tools/BiliTools-Pro/apps/backend
uv sync
uv run pytest tests/ -v
```

Expected: 所有测试通过

- [ ] **Step 7: 提交**

```bash
git add apps/backend
git commit -m "feat: initialize Python backend with config, logging, and IPC server"
```

---

### Task 4: 实现 Redux Store 和状态管理

**Files:**
- Create: `apps/desktop/src/renderer/store/slices/authSlice.ts`
- Create: `apps/desktop/src/renderer/store/slices/tasksSlice.ts`
- Create: `apps/desktop/src/renderer/store/slices/streamingSlice.ts`
- Create: `apps/desktop/src/renderer/store/slices/uiSlice.ts`
- Create: `apps/desktop/src/renderer/store/hooks.ts`
- Modify: `apps/desktop/src/renderer/store/index.ts`

- [ ] **Step 1: 更新 Store 主文件**

```typescript
// apps/desktop/src/renderer/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import tasksReducer from './slices/tasksSlice';
import streamingReducer from './slices/streamingSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tasks: tasksReducer,
    streaming: streamingReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 2: 创建类型化 Hooks**

```typescript
// apps/desktop/src/renderer/store/hooks.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

- [ ] **Step 3: 创建 authSlice**

```typescript
// apps/desktop/src/renderer/store/slices/authSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface UserInfo {
  mid: number;
  name: string;
  avatar: string;
  level: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
};

export const fetchAuthStatus = createAsyncThunk('auth/fetchStatus', async () => {
  return await window.api.auth.getStatus();
});

export const loginByQR = createAsyncThunk('auth/loginByQR', async () => {
  const result = await window.api.auth.loginByQR();
  if (!result.success) throw new Error(result.error || '登录失败');
  return result.user;
});

export const loginByCookie = createAsyncThunk('auth/loginByCookie', async (cookie: string) => {
  const result = await window.api.auth.loginByCookie(cookie);
  if (!result.success) throw new Error(result.error || '登录失败');
  return result.user;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await window.api.auth.logout();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: { clearError: (state) => { state.error = null; } },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuthStatus.pending, (state) => { state.loading = true; })
      .addCase(fetchAuthStatus.fulfilled, (state, action) => {
        state.isAuthenticated = action.payload.isAuthenticated;
        state.user = action.payload.user;
        state.loading = false;
      })
      .addCase(fetchAuthStatus.rejected, (state) => { state.loading = false; })
      .addCase(loginByQR.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginByQR.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(loginByQR.rejected, (state, action) => {
        state.error = action.error.message || 'QR登录失败';
        state.loading = false;
      })
      .addCase(loginByCookie.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginByCookie.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
      })
      .addCase(loginByCookie.rejected, (state, action) => {
        state.error = action.error.message || 'Cookie登录失败';
        state.loading = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.user = null;
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
```

- [ ] **Step 4: 创建 tasksSlice**

```typescript
// apps/desktop/src/renderer/store/slices/tasksSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

type TaskType = 'grab_code' | 'daily_task' | 'live_milestone';
type GameType = 'genshin' | 'starrail' | 'zzz' | 'wutheringwaves';
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface TaskConfig {
  type: TaskType;
  game: GameType;
  targetTime?: Date;
  interval?: number;
  maxRetries?: number;
  autoStop?: boolean;
}

interface Task {
  id: string;
  config: TaskConfig;
  status: TaskStatus;
  progress: number;
  startTime?: Date;
  endTime?: Date;
}

interface TasksState {
  tasks: Task[];
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: TasksState = {
  tasks: [],
  selectedTaskId: null,
  loading: false,
  error: null,
};

export const fetchTasks = createAsyncThunk('tasks/fetchAll', async () => {
  return await window.api.tasks.list();
});

export const createTask = createAsyncThunk('tasks/create', async (config: TaskConfig) => {
  return await window.api.tasks.create(config);
});

export const startTask = createAsyncThunk('tasks/start', async (taskId: string) => {
  await window.api.tasks.start(taskId);
  return taskId;
});

export const stopTask = createAsyncThunk('tasks/stop', async (taskId: string) => {
  await window.api.tasks.stop(taskId);
  return taskId;
});

const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    selectTask: (state, action: PayloadAction<string | null>) => { state.selectedTaskId = action.payload; },
    updateTaskStatus: (state, action: PayloadAction<{ taskId: string; status: TaskStatus; progress?: number }>) => {
      const task = state.tasks.find(t => t.id === action.payload.taskId);
      if (task) {
        task.status = action.payload.status;
        if (action.payload.progress !== undefined) task.progress = action.payload.progress;
      }
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTasks.pending, (state) => { state.loading = true; })
      .addCase(fetchTasks.fulfilled, (state, action) => { state.tasks = action.payload; state.loading = false; })
      .addCase(fetchTasks.rejected, (state) => { state.loading = false; })
      .addCase(createTask.fulfilled, (state, action) => { state.tasks.push(action.payload); })
      .addCase(startTask.fulfilled, (state, action) => {
        const task = state.tasks.find(t => t.id === action.payload);
        if (task) task.status = 'running';
      })
      .addCase(stopTask.fulfilled, (state, action) => {
        const task = state.tasks.find(t => t.id === action.payload);
        if (task) task.status = 'completed';
      });
  },
});

export const { selectTask, updateTaskStatus, clearError } = tasksSlice.actions;
export default tasksSlice.reducer;
```

- [ ] **Step 5: 创建 streamingSlice**

```typescript
// apps/desktop/src/renderer/store/slices/streamingSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface StreamConfig {
  videoPath: string;
  rtmpUrl: string;
  streamKey: string;
  quality: 'low' | 'medium' | 'high';
  gpuMode: 'auto' | 'nvidia' | 'amd' | 'intel' | 'cpu';
  playMode: 'once' | 'loop';
  duration?: number;
}

interface StreamStatus {
  isStreaming: boolean;
  fps: number;
  bitrate: number;
  droppedFrames: number;
  uptime: number;
}

interface StreamingState {
  isStreaming: boolean;
  config: StreamConfig | null;
  status: StreamStatus | null;
  loading: boolean;
  error: string | null;
}

const initialState: StreamingState = {
  isStreaming: false,
  config: null,
  status: null,
  loading: false,
  error: null,
};

export const startStreaming = createAsyncThunk('streaming/start', async (config: StreamConfig) => {
  await window.api.streaming.start(config);
  return config;
});

export const stopStreaming = createAsyncThunk('streaming/stop', async () => {
  await window.api.streaming.stop();
});

export const fetchStreamStatus = createAsyncThunk('streaming/fetchStatus', async () => {
  return await window.api.streaming.getStatus();
});

const streamingSlice = createSlice({
  name: 'streaming',
  initialState,
  reducers: {
    updateStatus: (state, action: PayloadAction<StreamStatus>) => {
      state.status = action.payload;
      state.isStreaming = action.payload.isStreaming;
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startStreaming.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(startStreaming.fulfilled, (state, action) => {
        state.config = action.payload;
        state.isStreaming = true;
        state.loading = false;
      })
      .addCase(startStreaming.rejected, (state, action) => {
        state.error = action.error.message || '启动推流失败';
        state.loading = false;
      })
      .addCase(stopStreaming.fulfilled, (state) => {
        state.isStreaming = false;
        state.config = null;
        state.status = null;
      })
      .addCase(fetchStreamStatus.fulfilled, (state, action) => {
        state.status = action.payload;
        state.isStreaming = action.payload.isStreaming;
      });
  },
});

export const { updateStatus, clearError } = streamingSlice.actions;
export default streamingSlice.reducer;
```

- [ ] **Step 6: 创建 uiSlice**

```typescript
// apps/desktop/src/renderer/store/slices/uiSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

interface UIState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  activeMenu: string;
  notifications: Notification[];
}

const initialState: UIState = {
  theme: 'light',
  sidebarCollapsed: false,
  activeMenu: 'dashboard',
  notifications: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => { state.theme = action.payload; },
    toggleSidebar: (state) => { state.sidebarCollapsed = !state.sidebarCollapsed; },
    setActiveMenu: (state, action: PayloadAction<string>) => { state.activeMenu = action.payload; },
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp'>>) => {
      state.notifications.push({ ...action.payload, id: Date.now().toString(), timestamp: Date.now() });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => { state.notifications = []; },
  },
});

export const { setTheme, toggleSidebar, setActiveMenu, addNotification, removeNotification, clearNotifications } = uiSlice.actions;
export default uiSlice.reducer;
```

- [ ] **Step 7: 提交**

```bash
git add apps/desktop/src/renderer/store
git commit -m "feat: implement Redux store with auth, tasks, streaming, and UI slices"
```

---

### Task 5: 实现布局组件

**Files:**
- Create: `apps/desktop/src/renderer/components/layout/MainLayout.tsx`
- Create: `apps/desktop/src/renderer/components/layout/Sidebar.tsx`
- Create: `apps/desktop/src/renderer/components/layout/Header.tsx`
- Create: `apps/desktop/src/renderer/components/layout/StatusBar.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`

- [ ] **Step 1: 创建主布局**

```tsx
// apps/desktop/src/renderer/components/layout/MainLayout.tsx
import React from 'react';
import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';

const { Content } = Layout;

const MainLayout: React.FC = () => (
  <Layout style={{ minHeight: '100vh' }}>
    <Sidebar />
    <Layout>
      <Header />
      <Content style={{ margin: '16px', padding: '24px', background: '#fff', borderRadius: '8px', overflow: 'auto' }}>
        <Outlet />
      </Content>
      <StatusBar />
    </Layout>
  </Layout>
);

export default MainLayout;
```

- [ ] **Step 2: 创建侧边栏**

```tsx
// apps/desktop/src/renderer/components/layout/Sidebar.tsx
import React from 'react';
import { Layout, Menu } from 'antd';
import { DashboardOutlined, ThunderboltOutlined, VideoCameraOutlined, ShareAltOutlined, BarChartOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { toggleSidebar, setActiveMenu } from '../../store/slices/uiSlice';

const { Sider } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/tasks', icon: <ThunderboltOutlined />, label: '任务管理' },
  { key: '/streaming', icon: <VideoCameraOutlined />, label: '直播推流' },
  { key: '/diandian', icon: <ShareAltOutlined />, label: '点点自动化' },
  { key: '/analytics', icon: <BarChartOutlined />, label: '数据分析' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);

  return (
    <Sider collapsible collapsed={collapsed} onCollapse={() => dispatch(toggleSidebar())} style={{ overflow: 'auto', height: '100vh', position: 'sticky', left: 0, top: 0, bottom: 0 }}>
      <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: collapsed ? '16px' : '20px' }}>{collapsed ? 'BT' : 'BiliTools-Pro'}</h1>
      </div>
      <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={(info) => { dispatch(setActiveMenu(info.key)); navigate(info.key); }} />
    </Sider>
  );
};

export default Sidebar;
```

- [ ] **Step 3: 创建头部**

```tsx
// apps/desktop/src/renderer/components/layout/Header.tsx
import React from 'react';
import { Layout, Space, Avatar, Dropdown, Badge } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';

const { Header: AntHeader } = Layout;

const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const notifications = useAppSelector((state) => state.ui.notifications);

  const userMenuItems = [
    { key: 'settings', icon: <SettingOutlined />, label: '设置' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => dispatch(logout()) },
  ];

  return (
    <AntHeader style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxShadow: '0 1px 4px rgba(0, 21, 41, 0.08)' }}>
      <Space size="large">
        <Badge count={notifications.length} size="small"><BellOutlined style={{ fontSize: '18px', cursor: 'pointer' }} /></Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} src={user?.avatar} />
            <span>{user?.name || '未登录'}</span>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};

export default Header;
```

- [ ] **Step 4: 创建状态栏**

```tsx
// apps/desktop/src/renderer/components/layout/StatusBar.tsx
import React from 'react';
import { Layout, Space, Tag } from 'antd';
import { useAppSelector } from '../../store/hooks';

const { Footer } = Layout;

const StatusBar: React.FC = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const tasks = useAppSelector((state) => state.tasks.tasks);
  const isStreaming = useAppSelector((state) => state.streaming.isStreaming);
  const activeTasks = tasks.filter((t) => t.status === 'running').length;

  return (
    <Footer style={{ padding: '8px 24px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9', display: 'flex', justifyContent: 'space-between' }}>
      <Space>
        <Tag color={isAuthenticated ? 'green' : 'default'}>{isAuthenticated ? '已登录' : '未登录'}</Tag>
        <span style={{ color: '#666' }}>任务: {activeTasks}/{tasks.length}</span>
        {isStreaming && <Tag color="red">推流中</Tag>}
      </Space>
      <span style={{ color: '#999', fontSize: '12px' }}>BiliTools-Pro v1.0.0</span>
    </Footer>
  );
};

export default StatusBar;
```

- [ ] **Step 5: 更新 App.tsx**

```tsx
// apps/desktop/src/renderer/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { fetchAuthStatus } from './store/slices/authSlice';

const Dashboard = () => <div>首页</div>;
const Tasks = () => <div>任务管理</div>;
const Streaming = () => <div>直播推流</div>;
const Diandian = () => <div>点点自动化</div>;
const Analytics = () => <div>数据分析</div>;
const Settings = () => <div>设置</div>;

function App() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const loading = useAppSelector((state) => state.auth.loading);

  useEffect(() => { dispatch(fetchAuthStatus()); }, [dispatch]);

  if (loading) return <div>加载中...</div>;

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="streaming" element={<Streaming />} />
        <Route path="diandian" element={<Diandian />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 6: 提交**

```bash
git add apps/desktop/src/renderer/components apps/desktop/src/renderer/App.tsx
git commit -m "feat: implement layout components with sidebar, header, and status bar"
```

---

### Task 6: 实现登录模块

**Files:**
- Create: `apps/desktop/src/renderer/components/login/LoginPage.tsx`
- Create: `apps/desktop/src/renderer/components/login/QRLogin.tsx`
- Create: `apps/desktop/src/renderer/components/login/CookieLogin.tsx`
- Create: `apps/backend/src/services/__init__.py`
- Create: `apps/backend/src/services/bilibili.py`
- Create: `apps/backend/src/api/routes/auth.py`

- [ ] **Step 1: 创建 B站服务**

```python
# apps/backend/src/services/bilibili.py
import aiohttp
from typing import Optional
from loguru import logger


class BilibiliService:
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.cookies: dict = {}
        self.user_info: Optional[dict] = None

    async def init_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession(headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com',
            })

    async def close(self):
        if self.session:
            await self.session.close()
            self.session = None

    async def get_qr_code(self) -> dict:
        await self.init_session()
        url = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
        async with self.session.get(url) as resp:
            data = await resp.json()
        if data['code'] == 0:
            return {'url': data['data']['url'], 'qrcode_key': data['data']['qrcode_key']}
        raise Exception(f"获取二维码失败: {data['message']}")

    async def check_qr_login(self, qrcode_key: str) -> dict:
        await self.init_session()
        url = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
        async with self.session.get(url, params={'qrcode_key': qrcode_key}) as resp:
            data = await resp.json()
        if data['code'] == 0:
            login_data = data['data']
            if login_data['code'] == 0:
                self.cookies = {
                    'SESSDATA': login_data['cookie_info']['cookies'][0]['value'],
                    'bili_jct': login_data['cookie_info']['cookies'][1]['value'],
                    'DedeUserID': login_data['cookie_info']['cookies'][2]['value'],
                }
                await self._fetch_user_info()
                return {'status': 'success', 'user': self.user_info}
            elif login_data['code'] == 86101:
                return {'status': 'pending', 'message': '未扫码'}
            elif login_data['code'] == 86090:
                return {'status': 'scanned', 'message': '已扫码，待确认'}
            else:
                return {'status': 'expired', 'message': '二维码已过期'}
        raise Exception(f"检查登录状态失败: {data['message']}")

    async def login_with_cookie(self, cookie_str: str) -> dict:
        await self.init_session()
        for item in cookie_str.split(';'):
            item = item.strip()
            if '=' in item:
                key, value = item.split('=', 1)
                self.cookies[key.strip()] = value.strip()
        await self._fetch_user_info()
        if self.user_info:
            return {'status': 'success', 'user': self.user_info}
        raise Exception("Cookie 无效或已过期")

    async def _fetch_user_info(self):
        await self.init_session()
        url = "https://api.bilibili.com/x/web-interface/nav"
        async with self.session.get(url, cookies={'SESSDATA': self.cookies.get('SESSDATA', '')}) as resp:
            data = await resp.json()
        if data['code'] == 0:
            nav = data['data']
            self.user_info = {'mid': nav['mid'], 'name': nav['uname'], 'avatar': nav['face'], 'level': nav['level_info']['current_level']}
        else:
            self.user_info = None

    async def get_login_status(self) -> dict:
        if self.user_info:
            return {'isAuthenticated': True, 'user': self.user_info}
        return {'isAuthenticated': False, 'user': None}

    async def logout(self):
        self.cookies = {}
        self.user_info = None

bilibili_service = BilibiliService()
```

- [ ] **Step 2: 创建认证路由**

```python
# apps/backend/src/api/routes/auth.py
from typing import Any
from loguru import logger
from ...services.bilibili import bilibili_service


async def login_by_qr() -> dict[str, Any]:
    try:
        qr_data = await bilibili_service.get_qr_code()
        return {'success': True, 'qrUrl': qr_data['url'], 'qrKey': qr_data['qrcode_key']}
    except Exception as e:
        logger.error(f"QR登录失败: {e}")
        return {'success': False, 'error': str(e)}


async def check_qr_status(qr_key: str) -> dict[str, Any]:
    try:
        return await bilibili_service.check_qr_login(qr_key)
    except Exception as e:
        logger.error(f"检查QR状态失败: {e}")
        return {'status': 'error', 'error': str(e)}


async def login_by_cookie(cookie: str) -> dict[str, Any]:
    try:
        result = await bilibili_service.login_with_cookie(cookie)
        return {'success': True, 'user': result['user']}
    except Exception as e:
        logger.error(f"Cookie登录失败: {e}")
        return {'success': False, 'error': str(e)}


async def get_status() -> dict[str, Any]:
    return await bilibili_service.get_login_status()


async def do_logout() -> dict[str, Any]:
    await bilibili_service.logout()
    return {'success': True}


def register_auth_routes(ipc_server):
    ipc_server.register_handler('auth:loginByQR', login_by_qr)
    ipc_server.register_handler('auth:checkQRStatus', check_qr_status)
    ipc_server.register_handler('auth:loginByCookie', login_by_cookie)
    ipc_server.register_handler('auth:getStatus', get_status)
    ipc_server.register_handler('auth:logout', do_logout)
```

- [ ] **Step 3: 创建 QR 登录组件**

```tsx
// apps/desktop/src/renderer/components/login/QRLogin.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Spin, Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface QRLoginProps { onSuccess: (user: any) => void; }

const QRLogin: React.FC<QRLoginProps> = ({ onSuccess }) => {
  const [qrUrl, setQrUrl] = useState('');
  const [qrKey, setQrKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'pending' | 'scanned' | 'success' | 'expired' | 'error'>('pending');
  const [message, setMessage] = useState('');

  const fetchQRCode = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.auth.loginByQR();
      if (result.success) { setQrUrl(result.qrUrl); setQrKey(result.qrKey); setStatus('pending'); setMessage('请使用哔哩哔哩APP扫描二维码'); }
      else { setStatus('error'); setMessage(result.error || '获取二维码失败'); }
    } catch { setStatus('error'); setMessage('获取二维码失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQRCode(); }, [fetchQRCode]);

  useEffect(() => {
    if (!qrKey || status === 'success' || status === 'expired') return;
    const interval = setInterval(async () => {
      try {
        const result = await window.api.auth.checkQRStatus(qrKey);
        setStatus(result.status);
        setMessage(result.message || '');
        if (result.status === 'success') { clearInterval(interval); onSuccess(result.user); }
      } catch { setStatus('error'); setMessage('检查登录状态失败'); }
    }, 2000);
    return () => clearInterval(interval);
  }, [qrKey, status, onSuccess]);

  if (loading) return <Card style={{ textAlign: 'center', padding: 24 }}><Spin size="large" tip="获取二维码中..." /></Card>;
  if (status === 'error' || status === 'expired') return <Card style={{ textAlign: 'center', padding: 24 }}><Result status={status === 'error' ? 'error' : 'warning'} title={status === 'error' ? '获取二维码失败' : '二维码已过期'} subTitle={message} extra={<Button icon={<ReloadOutlined />} onClick={fetchQRCode}>重试</Button>} /></Card>;

  return (
    <Card style={{ textAlign: 'center', padding: 24 }}>
      <Title level={4}>扫码登录</Title>
      <div style={{ marginBottom: 16 }}><img src={qrUrl} alt="QR Code" style={{ width: 200, height: 200 }} /></div>
      <Text type="secondary">{message}</Text>
    </Card>
  );
};

export default QRLogin;
```

- [ ] **Step 4: 创建 Cookie 登录组件**

```tsx
// apps/desktop/src/renderer/components/login/CookieLogin.tsx
import React, { useState } from 'react';
import { Card, Typography, Input, Button, message, Space } from 'antd';
import { LoginOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface CookieLoginProps { onSuccess: (user: any) => void; }

const CookieLogin: React.FC<CookieLoginProps> = ({ onSuccess }) => {
  const [cookie, setCookie] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!cookie.trim()) { message.error('请输入Cookie'); return; }
    setLoading(true);
    try {
      const result = await window.api.auth.loginByCookie(cookie);
      if (result.success) { message.success('登录成功'); onSuccess(result.user); }
      else { message.error(result.error || '登录失败'); }
    } catch { message.error('登录失败'); }
    finally { setLoading(false); }
  };

  return (
    <Card style={{ padding: 24 }}>
      <Title level={4}>Cookie登录</Title>
      <Paragraph type="secondary">从浏览器中复制B站Cookie粘贴到下方</Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        <TextArea rows={4} placeholder="请输入Cookie..." value={cookie} onChange={(e) => setCookie(e.target.value)} />
        <Button type="primary" icon={<LoginOutlined />} loading={loading} onClick={handleLogin} block>登录</Button>
      </Space>
    </Card>
  );
};

export default CookieLogin;
```

- [ ] **Step 5: 创建登录页面**

```tsx
// apps/desktop/src/renderer/components/login/LoginPage.tsx
import React from 'react';
import { Card, Tabs, Layout, Typography } from 'antd';
import { QrcodeOutlined, KeyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import QRLogin from './QRLogin';
import CookieLogin from './CookieLogin';

const { Content } = Layout;
const { Title } = Typography;

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const handleLoginSuccess = () => navigate('/dashboard');

  const tabItems = [
    { key: 'qr', label: <span><QrcodeOutlined /> 扫码登录</span>, children: <QRLogin onSuccess={handleLoginSuccess} /> },
    { key: 'cookie', label: <span><KeyOutlined /> Cookie登录</span>, children: <CookieLogin onSuccess={handleLoginSuccess} /> },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2}>BiliTools-Pro</Title>
          <Title level={5} type="secondary" style={{ marginTop: -8 }}>请登录您的B站账号</Title>
        </div>
        <Card style={{ width: 400 }}><Tabs items={tabItems} centered /></Card>
      </Content>
    </Layout>
  );
};

export default LoginPage;
```

- [ ] **Step 6: 更新 App.tsx 添加登录路由**

```tsx
// apps/desktop/src/renderer/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './components/login/LoginPage';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { fetchAuthStatus } from './store/slices/authSlice';

const Dashboard = () => <div>首页</div>;
const Tasks = () => <div>任务管理</div>;
const Streaming = () => <div>直播推流</div>;
const Diandian = () => <div>点点自动化</div>;
const Analytics = () => <div>数据分析</div>;
const Settings = () => <div>设置</div>;

function App() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const loading = useAppSelector((state) => state.auth.loading);

  useEffect(() => { dispatch(fetchAuthStatus()); }, [dispatch]);

  if (loading) return <div>加载中...</div>;

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="streaming" element={<Streaming />} />
        <Route path="diandian" element={<Diandian />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
```

- [ ] **Step 7: 提交**

```bash
git add apps/desktop/src/renderer/components/login apps/desktop/src/renderer/App.tsx apps/backend/src/services/bilibili.py apps/backend/src/api/routes/auth.py
git commit -m "feat: implement login module with QR code and cookie authentication"
```

---

### Task 7: 添加后端单元测试

**Files:**
- Create: `apps/backend/tests/test_bilibili_service.py`

- [ ] **Step 1: 创建 B站服务测试**

```python
# apps/backend/tests/test_bilibili_service.py
import pytest
from unittest.mock import AsyncMock, patch
from src.services.bilibili import BilibiliService


@pytest.fixture
def bilibili_service():
    return BilibiliService()


@pytest.mark.asyncio
async def test_get_qr_code_success(bilibili_service):
    mock_response = {'code': 0, 'data': {'url': 'https://example.com/qr', 'qrcode_key': 'test_key'}}
    with patch('aiohttp.ClientSession.get') as mock_get:
        mock_get.return_value.__aenter__ = AsyncMock(return_value=AsyncMock(json=AsyncMock(return_value=mock_response)))
        result = await bilibili_service.get_qr_code()
        assert result['url'] == 'https://example.com/qr'
        assert result['qrcode_key'] == 'test_key'


@pytest.mark.asyncio
async def test_get_qr_code_failure(bilibili_service):
    mock_response = {'code': -1, 'message': '网络错误'}
    with patch('aiohttp.ClientSession.get') as mock_get:
        mock_get.return_value.__aenter__ = AsyncMock(return_value=AsyncMock(json=AsyncMock(return_value=mock_response)))
        with pytest.raises(Exception, match="获取二维码失败"):
            await bilibili_service.get_qr_code()


@pytest.mark.asyncio
async def test_login_with_cookie_success(bilibili_service):
    mock_nav_response = {'code': 0, 'data': {'mid': 12345, 'uname': 'testuser', 'face': 'https://example.com/avatar.jpg', 'level_info': {'current_level': 6}}}
    with patch('aiohttp.ClientSession.get') as mock_get:
        mock_get.return_value.__aenter__ = AsyncMock(return_value=AsyncMock(json=AsyncMock(return_value=mock_nav_response)))
        result = await bilibili_service.login_with_cookie('SESSDATA=test; bili_jct=test')
        assert result['status'] == 'success'
        assert result['user']['mid'] == 12345
```

- [ ] **Step 2: 运行测试**

```bash
cd /home/sunner/demo_vscode/Bili-Tools/BiliTools-Pro/apps/backend
uv run pytest tests/ -v
```

Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add apps/backend/tests
git commit -m "test: add unit tests for bilibili service"
```

---

### Task 8: 添加构建脚本和文档

**Files:**
- Create: `scripts/dev.sh`
- Create: `scripts/build.sh`
- Create: `README.md`

- [ ] **Step 1: 创建开发脚本**

```bash
#!/bin/bash
# scripts/dev.sh
set -e
echo "启动 BiliTools-Pro 开发环境..."

cd "$(dirname "$0")/.."

echo "启动 Python 后端..."
cd apps/backend
uv run python -m src.api.ipc_server &
BACKEND_PID=$!

echo "启动 Electron 前端..."
cd ../desktop
pnpm dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
```

- [ ] **Step 2: 创建构建脚本**

```bash
#!/bin/bash
# scripts/build.sh
set -e
echo "构建 BiliTools-Pro..."

cd "$(dirname "$0")/.."

echo "构建 Python 后端..."
cd apps/backend
uv run pyinstaller --onefile --name bilitools-backend src/api/ipc_server.py
cd ../..

echo "构建 Electron 前端..."
cd apps/desktop
pnpm build
pnpm package
cd ../..

echo "构建完成！"
```

- [ ] **Step 3: 创建 README.md**

```markdown
# BiliTools-Pro

现代化B站活动自动化工具，支持跨平台、多任务并行、数据分析。

## 功能

- 多种登录方式（QR码、Cookie）
- 多任务并行执行
- 直播推流（FFmpeg/OBS兼容）
- 点点网自动化
- 数据分析面板
- 跨平台（Windows/macOS/Linux）

## 技术栈

- **前端**: Electron + React 18 + TypeScript + Ant Design
- **后端**: Python 3.11+ + asyncio + Playwright
- **状态管理**: Redux Toolkit

## 快速开始

```bash
pnpm install
cd apps/backend && uv sync
./scripts/dev.sh
```

## 项目结构

```
BiliTools-Pro/
├── apps/
│   ├── desktop/      # Electron + React
│   └── backend/      # Python
├── packages/
│   └── shared/       # 共享类型
└── scripts/          # 构建脚本
```
```

- [ ] **Step 4: 设置权限并提交**

```bash
chmod +x scripts/*.sh
git add scripts README.md
git commit -m "chore: add build scripts and documentation"
```

---

## 执行选项

**计划已保存至 `docs/superpowers/plans/2026-05-16-bilitools-pro.md`**

两种执行方式：

**1. Subagent-Driven (推荐)** - 每个任务分发独立子代理，任务间审查，快速迭代

**2. Inline Execution** - 当前会话中执行，批量执行并设置检查点
