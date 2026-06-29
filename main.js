const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
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

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const createWindow = async () => {
    // 1. Setup Data Paths
    const userDataPath = app.getPath('userData');
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
        sandbox: true
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

    // Open DevTools only in development
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }
  };

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', async (event) => {
    if (serverShutdown) {
      log.info('Shutting down server gracefully...');
      try {
        await serverShutdown();
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
