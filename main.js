const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Configure electron-log (Max 5MB)
log.transports.file.maxSize = 5 * 1024 * 1024;
Object.assign(console, log.functions); 

// Ensure Single Instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow;
  let serverShutdown = null;
  let serverStopped = false;
  let userDataPath;

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const runStartupAutoBackup = async (settingsService, backupService, db, userDataPath) => {
    const settings = settingsService.getSettings();
    if (!settings.auto_backup_enabled) return;
    if (settings.auto_backup_frequency !== 'daily' && settings.auto_backup_frequency !== 'weekly') return;

    // Check if db changed
    let isDirty = false;
    try {
        const res = db.prepare("SELECT total_changes() as c").get();
        isDirty = res && res.c > db.lastBackupChanges;
    } catch (e) {
         isDirty = true; // safe fallback
    }

    if (!isDirty) return; // No point in backing up if nothing changed

    let shouldBackup = false;
    const now = new Date();
    const lastDate = settings.last_auto_backup?.date ? new Date(settings.last_auto_backup.date) : null;
    
    if (!lastDate) {
        shouldBackup = true;
    } else {
        const diffMs = now.getTime() - lastDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (settings.auto_backup_frequency === 'daily' && diffDays >= 1) shouldBackup = true;
        if (settings.auto_backup_frequency === 'weekly' && diffDays >= 7) shouldBackup = true;
    }

    if (shouldBackup) {
        const backupsDir = path.join(userDataPath, 'Backups');
        const result = await backupService.createAutoBackup(backupsDir);
        
        if (result.success) {
            // Update dirty tracking
            try {
                const res = db.prepare("SELECT total_changes() as c").get();
                if (res) db.lastBackupChanges = res.c;
            } catch(e) {}
            // Cleanup
            backupService.cleanOldAutoBackups(backupsDir, settings.auto_backup_retention);
        }

        const newLastBackup = {
            date: now.toISOString(),
            status: result.success ? 'success' : 'failed',
            error: result.error || null
        };
        
        try {
            settingsService.saveSettings({ last_auto_backup: newLastBackup });
        } catch (e) {
            log.error('Failed to save settings during startup backup:', e);
        }
        
        // Notify UI silently if available
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auto-backup-status', newLastBackup);
        }
    }
  };

  const createWindow = async () => {
    // 1. Setup Data Paths
    process.env.APP_DATABASE_PATH = path.join(userDataPath, 'database.db');
    
    // 2. Start Embedded Server
    let port;
    try {
      const { startServer } = require('./backend/server');
      const serverResult = await startServer();
      port = serverResult.port;
      serverShutdown = serverResult.shutdownServer;
      log.info('Server started successfully on port ' + port);
    } catch (err) {
      log.error('Failed to start server:', err);
      dialog.showErrorBox('Unable to start FarahStore', 'The internal server failed to start. See logs for details.');
      app.quit();
      return;
    }

    // 3. Create Browser Window
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Disable default menu
    Menu.setApplicationMenu(null);

    // Handle external links safely
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Load local server dynamically
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);

    // Services
    const backupService = require('./backend/services/backupService');
    const settingsService = require('./backend/services/settingsService');
    const db = require('./backend/config/db');

    // Run startup backup (non-blocking)
    runStartupAutoBackup(settingsService, backupService, db, userDataPath).catch(err => {
        log.error('Failed to run startup auto backup:', err);
    });

    // Open DevTools only in development
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    return mainWindow;
  };

  app.whenReady().then(async () => {
    userDataPath = app.getPath('userData');
    
    // Initialize settings once
    const settingsService = require('./backend/services/settingsService');
    settingsService.init(userDataPath);

    await createWindow();

    // IPC Handlers
    const backupService = require('./backend/services/backupService');
    
    ipcMain.handle('get-settings', () => {
      return settingsService.getSettings();
    });

    ipcMain.handle('update-settings', (event, settings) => {
      return settingsService.saveSettings(settings);
    });

    ipcMain.handle('open-backup-folder', () => {
      const backupsDir = path.join(app.getPath('userData'), 'Backups');
      if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
      }
      shell.openPath(backupsDir);
      return true;
    });

    ipcMain.handle('backup-database', async (event) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultPath = path.join(app.getPath('desktop'), `FarahStore_Backup_${timestamp}.db`);
      
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Database Backup',
        defaultPath: defaultPath,
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
      });

      if (canceled) {
        return { success: false, cancelled: true };
      }

      return await backupService.backupDatabase(filePath);
    });

    ipcMain.handle('restore-database', async (event) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Database Backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const result = await backupService.restoreDatabase(filePaths[0]);
      
      if (result.success || result.fatal) {
        if (result.fatal) {
          dialog.showErrorBox("خطأ فادح في الاستعادة", result.error + "\n\nسيتم إعادة تشغيل التطبيق لحماية البيانات.");
        }
        // App needs to be relaunched to reconnect db properly or recover from fatal state
        app.relaunch();
        app.quit();
      }
      
      return result;
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  let autoBackupInProgress = false;

  app.on('before-quit', (event) => {
    const settingsService = require('./backend/services/settingsService');
    const backupService = require('./backend/services/backupService');
    const db = require('./backend/config/db');
    const settings = settingsService.getSettings();

    // Check if we need to backup on close
    if (settings.auto_backup_enabled && settings.auto_backup_frequency === 'close' && !autoBackupInProgress) {
        let isDirty = false;
        try {
            const res = db.prepare("SELECT total_changes() as c").get();
            isDirty = res && res.c > db.lastBackupChanges;
        } catch (e) {
             isDirty = true; 
        }

        if (isDirty) {
            event.preventDefault(); // Pause quit
            autoBackupInProgress = true;
            log.info('Running auto backup on close...');
            
            const backupsDir = path.join(app.getPath('userData'), 'Backups');
            backupService.createAutoBackup(backupsDir).then(result => {
                if (result.success) {
                    try {
                        const res = db.prepare("SELECT total_changes() as c").get();
                        if (res) db.lastBackupChanges = res.c;
                    } catch(e) {}
                    
                    backupService.cleanOldAutoBackups(backupsDir, settings.auto_backup_retention);
                    
                    try {
                        settingsService.saveSettings({
                            last_auto_backup: {
                                date: new Date().toISOString(),
                                status: 'success',
                                error: null
                            }
                        });
                    } catch (e) {
                        log.error('Failed to save settings during close backup:', e);
                    }
                } else {
                    try {
                        settingsService.saveSettings({
                            last_auto_backup: {
                                date: new Date().toISOString(),
                                status: 'failed',
                                error: result.error || 'Unknown error'
                            }
                        });
                    } catch (e) {
                        log.error('Failed to save settings during close backup error:', e);
                    }
                }
                app.quit(); // Resume quit
            }).catch(e => {
                log.error('Auto backup on close failed', e);
                app.quit();
            });
            return; // Exit here since we are waiting for the promise
        }
    }

    if (serverShutdown && !serverStopped) {
      log.info('Shutting down server gracefully...');
      // We can't await inside sync before-quit event gracefully without event.preventDefault() 
      // but if we don't have async work pending, we can just call it
      try {
        serverStopped = true;
        serverShutdown();
        log.info('Server shut down.');
      } catch (err) {
        log.error('Error shutting down server:', err);
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
