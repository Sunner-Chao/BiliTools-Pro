import { app, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { WindowManager } from './window-manager';
import { setupIpcHandlers } from './ipc-handler';

let windowManager: WindowManager | null = null;
let backendProcess: ChildProcess | null = null;

function startBackend(): void {
  const isDev = process.env.NODE_ENV !== 'production';
  const backendPath = isDev
    ? '../../apps/backend'
    : '../../../apps/backend';

  const pythonPath = isDev
    ? `${app.getAppPath()}/${backendPath}/.venv/bin/python`
    : `${app.getAppPath()}/${backendPath}/.venv/bin/python`;

  backendProcess = spawn(pythonPath, ['-m', 'src.main'], {
    cwd: `${app.getAppPath()}/${backendPath}`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data) => console.log('[Backend]', data.toString()));
  backendProcess.stderr?.on('data', (data) => console.error('[Backend Error]', data.toString()));
  backendProcess.on('error', (err) => console.error('Backend failed to start:', err));
}

app.whenReady().then(() => {
  if (process.env.BILITOOLS_SKIP_BACKEND !== '1') {
    startBackend();
  }
  setupIpcHandlers();
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
    backendProcess?.kill();
    app.quit();
  }
});
