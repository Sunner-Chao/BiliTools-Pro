import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as net from 'net';
import { config } from '../config';

const IPC_HOST = config.backend.host;
const IPC_PORT = config.backend.port;

interface IpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface IpcResponse {
  id: number;
  result?: unknown;
  error?: string;
}

let socket: net.Socket | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

function connect(): void {
  socket = new net.Socket();
  socket.connect(IPC_PORT, IPC_HOST, () => {
    console.log('[IPC] Connected to backend');
  });
  socket.on('error', (err) => console.error('[IPC] Connection error:', err));
  socket.on('close', () => console.log('[IPC] Disconnected, reconnecting...'));

  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: IpcResponse = JSON.parse(line);
        const pending = pendingRequests.get(response.id);
        if (pending) {
          pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (e) {
        console.error('[IPC] Parse error:', e);
      }
    }
  });

  setTimeout(() => {
    if (socket?.destroyed) connect();
  }, 3000);
}

function sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!socket || socket.destroyed) {
      reject(new Error('Not connected to backend'));
      return;
    }

    const id = ++requestId;
    const request: IpcRequest = { id, method, params };
    pendingRequests.set(id, { resolve, reject });
    socket.write(JSON.stringify(request) + '\n');

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

export function setupIpcHandlers(): void {
  connect();

  // Window controls
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
    return { success: true };
  });

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
    return { success: true };
  });

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.close();
    return { success: true };
  });

  // System info
  ipcMain.handle('system:getPlatform', () => process.platform);
  ipcMain.handle('system:getVersion', () => '1.0.0');
  ipcMain.handle('system:selectVideoFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || undefined;
    const result = await dialog.showOpenDialog(win, {
      title: '选择推流视频文件',
      properties: ['openFile'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'flv', 'mkv', 'mov', 'avi', 'webm', 'ts'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return { canceled: result.canceled, filePath: result.filePaths[0] || '' };
  });

  // Auth handlers
  ipcMain.handle('auth:loginByQR', () => sendRequest('auth:loginByQR'));
  ipcMain.handle('auth:checkQRStatus', (_, qrKey: string) => sendRequest('auth:checkQRStatus', { qrKey }));
  ipcMain.handle('auth:loginByCookie', (_, cookie: string) => sendRequest('auth:loginByCookie', { cookie }));
  ipcMain.handle('auth:getStatus', () => sendRequest('auth:getStatus'));
  ipcMain.handle('auth:logout', () => sendRequest('auth:logout'));

  // Task handlers
  ipcMain.handle('tasks:create', (_, config) => sendRequest('tasks:create', { config }));
  ipcMain.handle('tasks:start', (_, taskId: string) => sendRequest('tasks:start', { taskId }));
  ipcMain.handle('tasks:stop', (_, taskId: string) => sendRequest('tasks:stop', { taskId }));
  ipcMain.handle('tasks:delete', (_, taskId: string) => sendRequest('tasks:delete', { taskId }));
  ipcMain.handle('tasks:list', () => sendRequest('tasks:list'));
  ipcMain.handle('tasks:get', (_, taskId: string) => sendRequest('tasks:get', { taskId }));
  ipcMain.handle('tasks:games', () => sendRequest('tasks:games'));
  ipcMain.handle('tasks:gameTasks', (_, game: string) => sendRequest('tasks:gameTasks', { game }));
  ipcMain.handle('tasks:refreshGameConfig', (_, game: string, url?: string) => sendRequest('tasks:refreshGameConfig', { game, url }));
  ipcMain.handle('tasks:resources', () => sendRequest('tasks:resources'));
  ipcMain.handle('tasks:overview', (_, game: string, sourceUrl?: string) => sendRequest('tasks:overview', { game, sourceUrl }));

  // Streaming handlers
  ipcMain.handle('streaming:start', (_, config) => sendRequest('streaming:start', { config }));
  ipcMain.handle('streaming:stop', () => sendRequest('streaming:stop'));
  ipcMain.handle('streaming:getStatus', () => sendRequest('streaming:getStatus'));

  // Daily task handlers
  ipcMain.handle('daily:status', () => sendRequest('daily:status'));
  ipcMain.handle('daily:audienceQR', (_, slot: number) => sendRequest('daily:audienceQR', { slot }));
  ipcMain.handle('daily:checkAudienceQRStatus', (_, qrKey: string) => sendRequest('daily:checkAudienceQRStatus', { qrKey }));
  ipcMain.handle('daily:saveAudienceCookie', (_, slot: number, cookie: string) => sendRequest('daily:saveAudienceCookie', { slot, cookie }));
  ipcMain.handle('daily:validateAudience', (_, slot: number) => sendRequest('daily:validateAudience', { slot }));
  ipcMain.handle('daily:enterLiveRoom', (_, slot: number, roomId: string, durationMinutes?: number) => sendRequest('daily:enterLiveRoom', { slot, roomId, durationMinutes }));
  ipcMain.handle('daily:sendDanmaku', (_, slot: number, roomId: string, message?: string) => sendRequest('daily:sendDanmaku', { slot, roomId, message }));
  ipcMain.handle('daily:sendGift', (_, slot: number, roomId: string) => sendRequest('daily:sendGift', { slot, roomId }));

  // Analytics and settings
  ipcMain.handle('analytics:summary', () => sendRequest('analytics:summary'));
  ipcMain.handle('settings:get', () => sendRequest('settings:get'));
  ipcMain.handle('settings:save', (_, values) => sendRequest('settings:save', { values }));
}
