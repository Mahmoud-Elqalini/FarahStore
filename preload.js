const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    backupDatabase: () => ipcRenderer.invoke('backup-database'),
    restoreDatabase: () => ipcRenderer.invoke('restore-database'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
    onAutoBackupStatus: (callback) => {
        ipcRenderer.on('auto-backup-status', callback);
        return () => ipcRenderer.removeListener('auto-backup-status', callback);
    }
});
