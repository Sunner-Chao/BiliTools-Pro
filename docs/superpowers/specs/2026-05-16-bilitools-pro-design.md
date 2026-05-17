# BiliTools-Pro 设计文档

**日期:** 2026-05-16
**版本:** 1.0
**状态:** 已批准

---

## 1. 项目概述

### 1.1 背景

BiliTools 是一个 B站手游活动自动化工具，支持原神/崩铁/绝区零/鳴謿等游戏的资源抢购、直播推流、点点网自动化等功能。现有项目使用 Python + tkinter 构建，存在代码臃肿、架构混乱、难以维护等问题。

### 1.2 目标

BiliTools-Pro 是对现有项目的全面现代化重构，目标是：

- **现代化架构**: 前后端分离，模块化设计
- **跨平台支持**: Windows / macOS / Linux
- **更好的用户体验**: 现代 UI，流畅交互
- **更高的代码质量**: 类型安全，测试覆盖，文档完善
- **功能增强**: 多任务并行，数据分析，系统集成

### 1.3 技术选型

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Electron + React 18 | 跨平台桌面应用 |
| 类型系统 | TypeScript 5.x | 类型安全 |
| 状态管理 | Redux Toolkit | 复杂状态管理 |
| UI组件库 | Ant Design 5.x | 企业级组件 |
| 样式方案 | CSS Modules + Tailwind CSS | 模块化样式 |
| 构建工具 | Vite + electron-builder | 快速构建 |
| 后端语言 | Python 3.11+ | 现代 Python |
| 包管理 | uv + pyproject.toml | 高性能包管理 |
| 浏览器自动化 | Playwright | 替代 Selenium |
| 异步框架 | asyncio + aiohttp | 高并发支持 |
| IPC通信 | Electron IPC | 进程间通信 |
| 日志 | loguru | 现代日志库 |
| 测试 | pytest + vitest | 前后端测试 |
| 代码规范 | ruff + eslint + prettier | 代码格式化 |

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 窗口管理器    │  │ 系统托盘     │  │ 快捷键管理   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│                    ┌──────▼───────┐                         │
│                    │   IPC 桥接   │                         │
│                    └──────┬───────┘                         │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     React 渲染进程                           │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │                 Redux Store                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │authSlice│  │taskSlice│  │streamSl │             │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘             │   │
│  └───────┼────────────┼────────────┼───────────────────┘   │
│          │            │            │                        │
│  ┌───────▼────────────▼────────────▼───────────────────┐   │
│  │              React Components                        │   │
│  │  ┌──────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │Login │  │Dashboard │  │Streaming │              │   │
│  │  └──────┘  └──────────┘  └──────────┘              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     Python 后端                             │
│  ┌────────────────────────▼────────────────────────────┐   │
│  │              IPC Server (uvicorn)                    │   │
│  └──────┬─────────────┬─────────────┬─────────────────┘   │
│         │             │             │                       │
│  ┌──────▼──────┐ ┌────▼────┐ ┌─────▼─────┐                │
│  │  B站服务    │ │点点服务 │ │ 推流服务   │                │
│  └──────┬──────┘ └────┬────┘ └─────┬─────┘                │
│         │             │             │                       │
│  ┌──────▼─────────────▼─────────────▼─────────────────┐   │
│  │              异步任务调度器                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
BiliTools-Pro/
├── apps/
│   ├── desktop/                  # Electron + React 前端
│   │   ├── src/
│   │   │   ├── main/             # Electron 主进程
│   │   │   │   ├── index.ts      # 主入口
│   │   │   │   ├── ipc-handlers.ts
│   │   │   │   ├── window-manager.ts
│   │   │   │   ├── tray.ts
│   │   │   │   └── updater.ts
│   │   │   │
│   │   │   ├── renderer/         # React 渲染进程
│   │   │   │   ├── App.tsx
│   │   │   │   ├── main.tsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── layout/
│   │   │   │   │   ├── login/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── tasks/
│   │   │   │   │   ├── streaming/
│   │   │   │   │   └── settings/
│   │   │   │   ├── store/
│   │   │   │   │   ├── slices/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── hooks/
│   │   │   │   ├── services/
│   │   │   │   └── utils/
│   │   │   │
│   │   │   └── preload/          # 预加载脚本
│   │   │       └── index.ts
│   │   │
│   │   ├── electron-builder.yml
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── backend/                  # Python 后端服务
│       ├── src/
│       │   ├── core/
│       │   │   ├── __init__.py
│       │   │   ├── config.py
│       │   │   ├── logging.py
│       │   │   ├── scheduler.py
│       │   │   └── security.py
│       │   │
│       │   ├── api/
│       │   │   ├── __init__.py
│       │   │   ├── ipc_server.py
│       │   │   ├── routes/
│       │   │   │   ├── auth.py
│       │   │   │   ├── tasks.py
│       │   │   │   ├── streaming.py
│       │   │   │   └── diandian.py
│       │   │   └── middleware/
│       │   │
│       │   ├── services/
│       │   │   ├── __init__.py
│       │   │   ├── bilibili.py
│       │   │   ├── diandian.py
│       │   │   ├── streaming.py
│       │   │   ├── captcha.py
│       │   │   └── updater.py
│       │   │
│       │   ├── models/
│       │   │   ├── __init__.py
│       │   │   ├── user.py
│       │   │   ├── task.py
│       │   │   └── config.py
│       │   │
│       │   └── utils/
│       │       ├── __init__.py
│       │       ├── ntp.py
│       │       ├── crypto.py
│       │       └── platform.py
│       │
│       ├── tests/
│       ├── pyproject.toml
│       └── uv.lock
│
├── packages/
│   ├── shared/                   # 前后端共享类型定义
│   │   ├── types/
│   │   └── package.json
│   │
│   └── utils/                    # 通用工具函数
│       ├── src/
│       └── package.json
│
├── docs/                         # 文档
├── scripts/                      # 构建脚本
├── pnpm-workspace.yaml           # Monorepo 配置
├── .github/                      # GitHub Actions
└── README.md
```

---

## 3. 核心模块设计

### 3.1 认证模块 (Auth)

**功能：**
- QR码登录
- Cookie 登录/导入
- 登录状态管理
- 多账号支持

**接口定义：**
```typescript
// 前端 API
interface AuthAPI {
  loginByQR(): Promise<LoginResult>;
  loginByCookie(cookie: string): Promise<LoginResult>;
  logout(): Promise<void>;
  getStatus(): Promise<AuthStatus>;
  getAccounts(): Promise<Account[]>;
}

// 数据模型
interface LoginResult {
  success: boolean;
  user?: UserInfo;
  error?: string;
}

interface UserInfo {
  mid: number;
  name: string;
  avatar: string;
  level: number;
}
```

### 3.2 任务管理模块 (Tasks)

**功能：**
- 任务创建/编辑/删除
- 多任务并行执行
- 任务状态监控
- 定时任务调度
- 任务历史记录

**接口定义：**
```typescript
interface TaskAPI {
  create(config: TaskConfig): Promise<Task>;
  update(taskId: string, config: Partial<TaskConfig>): Promise<Task>;
  delete(taskId: string): Promise<void>;
  start(taskId: string): Promise<void>;
  stop(taskId: string): Promise<void>;
  list(): Promise<Task[]>;
  getHistory(taskId: string): Promise<TaskHistory[]>;
}

interface TaskConfig {
  type: 'grab_code' | 'daily_task' | 'live_milestone';
  game: 'genshin' | 'starrail' | 'zzz' | 'wutheringwaves';
  targetTime?: Date;
  interval?: number;
  maxRetries?: number;
  autoStop?: boolean;
}

interface Task {
  id: string;
  config: TaskConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  result?: TaskResult;
}
```

### 3.3 直播推流模块 (Streaming)

**功能：**
- FFmpeg 推流
- OBS 兼容推流
- 多种质量模式
- GPU 加速支持
- 定时推流/关播

**接口定义：**
```typescript
interface StreamingAPI {
  start(config: StreamConfig): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<StreamStatus>;
  getVideoInfo(path: string): Promise<VideoInfo>;
}

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
```

### 3.4 点点网自动化模块 (Diandian)

**功能：**
- 自动点赞
- 自动收藏
- 自动分享
- 自动订阅
- 自动观看

**接口定义：**
```typescript
interface DiandianAPI {
  startAutoLike(config: AutoLikeConfig): Promise<void>;
  startAutoStar(config: AutoStarConfig): Promise<void>;
  startAutoShare(config: AutoShareConfig): Promise<void>;
  startAutoSubs(config: AutoSubsConfig): Promise<void>;
  startAutoWatch(config: AutoWatchConfig): Promise<void>;
  stopAll(): Promise<void>;
  getStatus(): Promise<DiandianStatus>;
}
```

### 3.5 数据分析模块 (Analytics)

**功能：**
- 任务执行统计
- 直播数据分析
- 历史记录查询
- 图表可视化

**接口定义：**
```typescript
interface AnalyticsAPI {
  getTaskStats(period: 'day' | 'week' | 'month'): Promise<TaskStats>;
  getStreamStats(period: 'day' | 'week' | 'month'): Promise<StreamStats>;
  getHistory(filter: HistoryFilter): Promise<HistoryRecord[]>;
}

interface TaskStats {
  totalTasks: number;
  successRate: number;
  averageDuration: number;
  tasksByType: Record<string, number>;
  tasksByGame: Record<string, number>;
}

interface StreamStats {
  totalStreams: number;
  totalDuration: number;
  averageViewers: number;
  peakViewers: number;
}
```

---

## 4. IPC 通信设计

### 4.1 通信协议

Electron 主进程与 Python 后端通过 IPC 通信，采用 JSON-RPC 2.0 协议：

```typescript
// 请求格式
interface IPCRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown;
}

// 响应格式
interface IPCResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
```

### 4.2 IPC 通道定义

```typescript
// 主要 IPC 通道
const IPC_CHANNELS = {
  // 认证
  'auth:login': 'auth.login',
  'auth:logout': 'auth.logout',
  'auth:status': 'auth.getStatus',

  // 任务
  'tasks:create': 'tasks.create',
  'tasks:start': 'tasks.start',
  'tasks:stop': 'tasks.stop',
  'tasks:list': 'tasks.list',

  // 推流
  'streaming:start': 'streaming.start',
  'streaming:stop': 'streaming.stop',
  'streaming:status': 'streaming.getStatus',

  // 点点网
  'diandian:startAutoLike': 'diandian.startAutoLike',
  'diandian:stopAll': 'diandian.stopAll',

  // 分析
  'analytics:getTaskStats': 'analytics.getTaskStats',
  'analytics:getStreamStats': 'analytics.getStreamStats',
} as const;
```

### 4.3 Preload 脚本

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  auth: {
    login: (method: 'qr' | 'cookie', data?: string) =>
      ipcRenderer.invoke('auth:login', method, data),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:status'),
  },
  tasks: {
    create: (config: TaskConfig) => ipcRenderer.invoke('tasks:create', config),
    start: (taskId: string) => ipcRenderer.invoke('tasks:start', taskId),
    stop: (taskId: string) => ipcRenderer.invoke('tasks:stop', taskId),
    list: () => ipcRenderer.invoke('tasks:list'),
  },
  streaming: {
    start: (config: StreamConfig) => ipcRenderer.invoke('streaming:start', config),
    stop: () => ipcRenderer.invoke('streaming:stop'),
    getStatus: () => ipcRenderer.invoke('streaming:status'),
  },
  // ... 更多 API
};

contextBridge.exposeInMainWorld('api', api);
```

---

## 5. 状态管理设计

### 5.1 Redux Store 结构

```typescript
// store/index.ts
interface RootState {
  auth: AuthState;
  tasks: TasksState;
  streaming: StreamingState;
  diandian: DiandianState;
  analytics: AnalyticsState;
  settings: SettingsState;
  ui: UIState;
}

// store/slices/auth.ts
interface AuthState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
}

// store/slices/tasks.ts
interface TasksState {
  tasks: Task[];
  activeTasks: string[];
  loading: boolean;
  error: string | null;
}

// store/slices/streaming.ts
interface StreamingState {
  isStreaming: boolean;
  config: StreamConfig | null;
  status: StreamStatus | null;
  error: string | null;
}
```

### 5.2 异步操作

使用 Redux Toolkit 的 `createAsyncThunk` 处理异步操作：

```typescript
// store/slices/tasks.ts
export const createTask = createAsyncThunk(
  'tasks/create',
  async (config: TaskConfig) => {
    const task = await window.api.tasks.create(config);
    return task;
  }
);

export const tasksSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    // 同步 reducers
  },
  extraReducers: (builder) => {
    builder
      .addCase(createTask.pending, (state) => {
        state.loading = true;
      })
      .addCase(createTask.fulfilled, (state, action) => {
        state.tasks.push(action.payload);
        state.loading = false;
      })
      .addCase(createTask.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to create task';
        state.loading = false;
      });
  },
});
```

---

## 6. UI 设计规范

### 6.1 设计原则

- **一致性**: 遵循 Ant Design 设计规范
- **简洁性**: 界面简洁，操作直观
- **响应性**: 支持窗口缩放，适配不同屏幕
- **可访问性**: 支持键盘导航，符合 WCAG 标准

### 6.2 主题配置

```typescript
// theme/config.ts
export const theme = {
  token: {
    colorPrimary: '#00A1D6', // B站蓝
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 6,
    },
    Card: {
      borderRadius: 12,
    },
  },
};
```

### 6.3 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  Logo    BiliTools-Pro                    [最小化] [最大化] [关闭] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐                                                  │
│  │         │  ┌────────────────────────────────────────────┐ │
│  │  侧边栏  │  │                                            │ │
│  │         │  │              主内容区                        │ │
│  │  - 首页  │  │                                            │ │
│  │  - 任务  │  │                                            │ │
│  │  - 推流  │  │                                            │ │
│  │  - 点点  │  │                                            │ │
│  │  - 数据  │  │                                            │ │
│  │  - 设置  │  │                                            │ │
│  │         │  │                                            │ │
│  └─────────┘  └────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  状态栏: 已登录 | 任务: 3/5 | 推流: 运行中                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 数据持久化

### 7.1 配置文件

```json
// config/default.json
{
  "app": {
    "language": "zh-CN",
    "theme": "light",
    "autoStart": false,
    "minimizeToTray": true
  },
  "auth": {
    "rememberLogin": true,
    "cookiePath": "~/.bilitools/cookies.json"
  },
  "tasks": {
    "maxConcurrent": 5,
    "defaultInterval": 0.8,
    "autoRetry": true,
    "maxRetries": 3
  },
  "streaming": {
    "defaultQuality": "medium",
    "gpuMode": "auto",
    "ffmpegPath": "~/.bilitools/ffmpeg"
  }
}
```

### 7.2 数据存储

- **配置文件**: JSON 格式，存储在用户目录
- **Cookie**: 加密存储，使用系统密钥链
- **任务历史**: SQLite 数据库
- **日志文件**: 按日期滚动，存储在用户目录

---

## 8. 安全设计

### 8.1 凭证管理

- Cookie 使用系统密钥链加密存储
- 敏感信息不出现在日志中
- 支持凭证过期自动刷新

### 8.2 IPC 安全

- Preload 脚本最小化暴露 API
- 所有 IPC 调用进行参数验证
- 禁用 nodeIntegration，启用 contextIsolation

### 8.3 网络安全

- HTTPS 优先
- 请求签名验证
- 防重放攻击

---

## 9. 错误处理

### 9.1 错误分类

```typescript
enum ErrorCode {
  // 认证错误
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_NETWORK = 'AUTH_NETWORK',

  // 任务错误
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',
  TASK_TIMEOUT = 'TASK_TIMEOUT',

  // 推流错误
  STREAM_START_FAILED = 'STREAM_START_FAILED',
  STREAM_CONNECTION_LOST = 'STREAM_CONNECTION_LOST',
  STREAM_GPU_ERROR = 'STREAM_GPU_ERROR',

  // 系统错误
  SYSTEM_PERMISSION = 'SYSTEM_PERMISSION',
  SYSTEM_FILE_NOT_FOUND = 'SYSTEM_FILE_NOT_FOUND',
  SYSTEM_NETWORK = 'SYSTEM_NETWORK',
}
```

### 9.2 错误处理策略

- **可恢复错误**: 自动重试，指数退避
- **不可恢复错误**: 提示用户，记录日志
- **网络错误**: 自动重连，状态同步
- **权限错误**: 引导用户授权

---

## 10. 测试策略

### 10.1 前端测试

- **单元测试**: Vitest + React Testing Library
- **组件测试**: Storybook
- **E2E 测试**: Playwright

### 10.2 后端测试

- **单元测试**: pytest
- **集成测试**: pytest + pytest-asyncio
- **API 测试**: httpx

### 10.3 测试覆盖率目标

- 单元测试: 80%+
- 集成测试: 60%+
- E2E 测试: 核心流程覆盖

---

## 11. 构建与部署

### 11.1 开发环境

```bash
# 安装依赖
pnpm install
cd apps/backend && uv install

# 启动开发服务器
pnpm dev
```

### 11.2 生产构建

```bash
# 构建前端
pnpm build

# 打包 Electron 应用
pnpm package

# 构建后端
cd apps/backend && uv run pyinstaller
```

### 11.3 自动更新

- 使用 electron-updater 实现前端自动更新
- Python 后端打包为可执行文件，随前端一起更新
- 支持增量更新

---

## 12. 迁移计划

### Phase 1: 基础架构搭建 (1-2 周)

- [ ] 初始化 Monorepo 结构
- [ ] 搭建 Electron + React 基础框架
- [ ] 搭建 Python 后端基础
- [ ] 实现 IPC 通信层
- [ ] 配置开发环境

### Phase 2: 核心功能迁移 (2-3 周)

- [ ] 迁移登录模块（QR码 + Cookie）
- [ ] 迁移任务管理（抢码、每日任务）
- [ ] 迁移直播推流功能
- [ ] 迁移点点网自动化

### Phase 3: 功能增强 (2-3 周)

- [ ] 实现多任务并行
- [ ] 实现数据分析面板
- [ ] 实现系统集成（托盘、快捷键、通知）
- [ ] 实现自动更新

### Phase 4: 打磨优化 (1-2 周)

- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 用户体验优化
- [ ] 跨平台测试
- [ ] 文档完善

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| B站 API 变更 | 功能失效 | 监控 API 变化，快速适配 |
| 跨平台兼容性 | 部分功能不可用 | 早期测试，平台特定代码隔离 |
| 性能问题 | 用户体验差 | 性能监控，异步优化 |
| 安全漏洞 | 凭证泄露 | 安全审计，加密存储 |

---

## 14. 附录

### A. 参考资料

- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Redux Toolkit 文档](https://redux-toolkit.js.org)
- [Ant Design 文档](https://ant.design)
- [Playwright 文档](https://playwright.dev)
- [uv 文档](https://github.com/astral-sh/uv)

### B. 术语表

| 术语 | 说明 |
|------|------|
| IPC | Inter-Process Communication，进程间通信 |
| RTMP | Real-Time Messaging Protocol，实时消息协议 |
| QR码 | Quick Response Code，快速响应码 |
| GPU加速 | 使用显卡进行视频编码加速 |

---

**文档维护者:** BiliTools-Pro Team
**最后更新:** 2026-05-16
