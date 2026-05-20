import { app, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { WindowManager } from './window-manager';
import { setupIpcHandlers } from './ipc-handler';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { config } from '../config';

let windowManager: WindowManager | null = null;
let backendProcess: ChildProcess | null = null;

function isBackendListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createConnection(config.backend.port, config.backend.host);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
    probe.setTimeout(800, () => {
      probe.destroy();
      resolve(false);
    });
  });
}

async function startBackend(): Promise<void> {
  if (await isBackendListening()) {
    console.log('[Pro] Reusing existing backend on', `${config.backend.host}:${config.backend.port}`);
    return;
  }

  const isDev = !app.isPackaged;

  let backendRoot: string;
  let command: string;
  let args: string[];

  if (isDev) {
    backendRoot = path.resolve(app.getAppPath(), '../../apps/backend');
    const pythonBin = process.platform === 'win32'
      ? path.join('.venv', 'Scripts', 'python.exe')
      : path.join('.venv', 'bin', 'python');
    command = path.join(backendRoot, pythonBin);
    args = ['-m', 'src.main'];
  } else {
    backendRoot = path.resolve(process.resourcesPath, 'backend');
    const executableName = process.platform === 'win32' ? 'backend.exe' : 'backend';
    command = path.join(backendRoot, executableName);
    args = [];
    if (!fs.existsSync(command)) {
      const embeddedPython = process.platform === 'win32'
        ? path.join('python', 'python.exe')
        : path.join('python', 'bin', 'python');
      command = path.join(backendRoot, embeddedPython);
      args = ['-m', 'src.main'];
    }
    if (!fs.existsSync(command)) {
      const pythonBin = process.platform === 'win32'
        ? path.join('.venv', 'Scripts', 'python.exe')
        : path.join('.venv', 'bin', 'python');
      command = path.join(backendRoot, pythonBin);
      args = ['-m', 'src.main'];
    }
  }

  console.log('[Pro] Starting backend from:', backendRoot);
  console.log('[Pro] Backend command:', command, args.join(' '));

  backendProcess = spawn(command, args, {
    cwd: backendRoot,
    env: { ...process.env, BILITOOLS_PRO_ROOT: backendRoot },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data) => console.log('[Backend]', data.toString()));
  backendProcess.stderr?.on('data', (data) => console.error('[Backend Error]', data.toString()));
  backendProcess.on('error', (err) => console.error('Backend failed to start:', err));
}

app.whenReady().then(() => {
  if (process.env.BILITOOLS_SKIP_BACKEND !== '1') {
    startBackend().catch((err) => console.error('Backend failed to start:', err));
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
