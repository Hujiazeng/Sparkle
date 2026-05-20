import type { BrowserWindow } from 'electron';
import { app, ipcMain } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateStatusEvent {
  status: UpdateStatus;
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

let updaterWindow: BrowserWindow | null = null;
let ipcRegistered = false;
let eventsRegistered = false;
let initialCheckScheduled = false;

function sendStatus(event: UpdateStatusEvent): void {
  if (!updaterWindow || updaterWindow.isDestroyed()) return;
  updaterWindow.webContents.send('updater:status', event);
}

function registerUpdaterEvents(): void {
  if (eventsRegistered) return;
  eventsRegistered = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus({ status: 'available', info });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatus({ status: 'not-available', info });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({ status: 'downloading', progress });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({ status: 'downloaded', info });
  });

  autoUpdater.on('error', (error) => {
    sendStatus({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  });
}

function registerUpdaterIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('updater:check-for-updates', async () => {
    if (!app.isPackaged) {
      sendStatus({ status: 'not-available' });
      return { skipped: true, reason: 'not-packaged' };
    }
    return autoUpdater.checkForUpdates();
  });

  ipcMain.handle('updater:download-update', async () => {
    if (!app.isPackaged) {
      return { skipped: true, reason: 'not-packaged' };
    }
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('updater:quit-and-install', async () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

export function setUpdaterWindow(win: BrowserWindow | null): void {
  updaterWindow = win;
}

export function initAutoUpdater(win: BrowserWindow): void {
  setUpdaterWindow(win);
  registerUpdaterEvents();
  registerUpdaterIpc();

  if (!app.isPackaged) {
    console.log('[updater] Native auto-updater is disabled in development.');
    return;
  }

  if (initialCheckScheduled) return;
  initialCheckScheduled = true;

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        sendStatus({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      });
    }, 3000);
  });
}
