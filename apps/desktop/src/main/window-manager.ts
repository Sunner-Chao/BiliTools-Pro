import { BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;

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

    this.mainWindow.on('close', (event) => {
      if (process.platform !== 'darwin') {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    this.createTray();

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.mainWindow;
  }

  private createTray(): void {
    const iconPath = join(__dirname, '../../assets/icon.png');
    let icon = nativeImage.createEmpty();
    try {
      icon = nativeImage.createFromPath(iconPath);
    } catch {
      // Use default icon if asset not found
    }

    this.tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') : icon);

    const contextMenu = Menu.buildFromTemplate([
      { label: '显示窗口', click: () => this.mainWindow?.show() },
      { label: '隐藏窗口', click: () => this.mainWindow?.hide() },
      { type: 'separator' },
      { label: '退出', click: () => {
        this.mainWindow?.destroy();
        process.exit(0);
      }},
    ]);

    this.tray.setToolTip('BiliTools-Pro');
    this.tray.setContextMenu(contextMenu);
    this.tray.on('double-click', () => this.mainWindow?.show());
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}