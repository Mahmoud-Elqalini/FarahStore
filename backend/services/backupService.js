const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Main logic for Backup and Restore

const REQUIRED_TABLES = [
    'app_metadata',
    'categories',
    'customers',
    'suppliers',
    'products',
    'orders',
    'order_details',
    'installments'
];

const verifyDatabaseIntegrity = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return { valid: false, error: "Backup file not found." };
    }

    let tempDb;
    try {
        tempDb = new Database(filePath, { fileMustExist: true });
        
        // 1. Check integrity
        const integrityCheck = tempDb.pragma('integrity_check', { simple: true });
        if (integrityCheck !== 'ok') {
            return { valid: false, error: 'Database integrity check failed.' };
        }

        // 2. Check for essential tables
        const tablesQuery = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tables = new Set(tablesQuery.map(t => t.name));

        for (const table of REQUIRED_TABLES) {
            if (!tables.has(table)) {
                return { valid: false, error: `جدول مفقود في قاعدة البيانات: ${table}` };
            }
        }

        // 3. Check schema version
        try {
            const versionStmt = tempDb.prepare(`SELECT value FROM app_metadata WHERE key = 'schema_version'`);
            const versionRow = versionStmt.get();
            if (!versionRow) {
                return { valid: false, error: 'Missing schema version in backup file.' };
            }
            if (parseInt(versionRow.value, 10) !== db.CURRENT_SCHEMA_VERSION) {
                return { valid: false, error: `Schema version mismatch. Expected ${db.CURRENT_SCHEMA_VERSION}, got ${versionRow.value}.` };
            }
        } catch (err) {
             return { valid: false, error: 'Could not verify schema version. Is this a FarahStore database?' };
        }

        return { valid: true };
    } catch (err) {
        return { valid: false, error: `Invalid SQLite file: ${err.message}` };
    } finally {
        if (tempDb) {
            try { tempDb.close(); } catch (e) {}
        }
    }
};

const backupDatabase = async (destinationPath) => {
    try {
        await db.backup(destinationPath);
        return { success: true, path: destinationPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const cleanOldRestoreBackups = (dbDir) => {
    try {
        if (!fs.existsSync(dbDir)) return;
        
        const files = fs.readdirSync(dbDir)
            .filter(file => file.startsWith('database_before_restore_') && file.endsWith('.db'))
            .map(file => {
                const filePath = path.join(dbDir, file);
                return { file, filePath };
            })
            .sort((a, b) => b.file.localeCompare(a.file)); // Newest first

        const max = 5; // Keep only the 5 most recent pre-restore backups
        if (files.length > max) {
            const filesToDelete = files.slice(max);
            for (const f of filesToDelete) {
                try {
                    fs.unlinkSync(f.filePath);
                } catch (e) {
                    console.error(`Failed to delete old pre-restore backup ${f.file}:`, e);
                }
            }
        }
    } catch (err) {
        console.error("Failed to clean old pre-restore backups:", err);
    }
};

const restoreDatabase = async (sourcePath) => {
    let dbClosed = false;
    try {
        // 1. Verify source database
        const verification = verifyDatabaseIntegrity(sourcePath);
        if (!verification.valid) {
            return { success: false, error: verification.error };
        }

        const currentDbPath = db.dbPath;
        const currentDbDir = path.dirname(currentDbPath);
        
        // 2. Auto-backup the current database before replacing it
        // We use db.backup() for the safest possible snapshot even if it's currently being written to
        // If currentDbPath is :memory: (in tests), skip auto backup file creation
        if (currentDbPath !== ':memory:') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const autoBackupPath = path.join(currentDbDir, `database_before_restore_${timestamp}.db`);
            // If creating the safety backup fails, abort restore completely.
            await db.backup(autoBackupPath);
            
            // Clean up older pre-restore backups
            cleanOldRestoreBackups(currentDbDir);
        }

        // 3. Close current connection safely
        db.close();
        dbClosed = true;

        if (currentDbPath !== ':memory:') {
            // 4. Clean up WAL and SHM files safely (Best Effort)
            try {
                fs.unlinkSync(`${currentDbPath}-wal`);
            } catch (e) { /* ignored */ }
            try {
                fs.unlinkSync(`${currentDbPath}-shm`);
            } catch (e) { /* ignored */ }

            // 5. Replace current database file safely using a temporary file
            const tempRestorePath = `${currentDbPath}.tmp_restore`;
            try {
                fs.copyFileSync(sourcePath, tempRestorePath);
                
                try {
                    fs.renameSync(tempRestorePath, currentDbPath);
                } catch {
                    // On Windows, renameSync can fail if the destination exists or is locked.
                    // Fallback: Delete the old file first, then rename.
                    fs.rmSync(currentDbPath, { force: true });
                    fs.renameSync(tempRestorePath, currentDbPath);
                }
            } finally {
                // Clean up the temporary file if it still exists (e.g. if error occurred before rename)
                try {
                    if (fs.existsSync(tempRestorePath)) {
                        fs.unlinkSync(tempRestorePath);
                    }
                } catch (e) { /* ignored */ }
            }
        } else {
             // Skip file replacement for in-memory databases (tests only).
        }

        return { success: true };
    } catch (err) {
        if (dbClosed) {
            const log = require('electron-log');
            log.error("Database restore failed AFTER DB close. A restart is required.", err);
        }
        return { success: false, fatal: dbClosed, error: err.message };
    }
};

const createAutoBackup = async (backupsDir) => {
    try {
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const autoBackupPath = path.join(backupsDir, `auto_${timestamp}.db`);
        
        await db.backup(autoBackupPath);
        
        return { success: true, path: autoBackupPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const cleanOldAutoBackups = (backupsDir, maxRetention) => {
    try {
        if (!fs.existsSync(backupsDir)) return { success: true, deleted: 0 };
        
        const files = fs.readdirSync(backupsDir)
            .filter(file => file.startsWith('auto_') && file.endsWith('.db'))
            .map(file => {
                const filePath = path.join(backupsDir, file);
                return { file, filePath };
            })
            .sort((a, b) => b.file.localeCompare(a.file)); // Newest first based on ISO date string in filename

        const max = Number(maxRetention) || 20;
        let deletedCount = 0;
        
        if (files.length > max) {
            const filesToDelete = files.slice(max);
            for (const f of filesToDelete) {
                try {
                    fs.unlinkSync(f.filePath);
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete old backup ${f.file}:`, e);
                }
            }
        }
        return { success: true, deleted: deletedCount };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

module.exports = {
    backupDatabase,
    restoreDatabase,
    verifyDatabaseIntegrity,
    createAutoBackup,
    cleanOldAutoBackups
};
