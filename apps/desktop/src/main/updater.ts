import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { getLogger } from './logging';

const logger = getLogger('updater');

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = logger;

  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('Update available:', info);
    mainWindow.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    logger.info('Update not available:', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    logger.info(`Download progress: ${progress.percent}%`);
    mainWindow.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update downloaded:', info);
    mainWindow.webContents.send('update:downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    logger.error('Update error:', error);
  });

  autoUpdater.on('quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    logger.error('Failed to check for updates:', err);
  });
}