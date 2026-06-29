const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const testDbPath = path.join(__dirname, 'temp_test_farahstore.db');
process.env.NODE_ENV = 'development'; 
process.env.APP_DATABASE_PATH = testDbPath;

const backupService = require('../services/backupService');

describe('Backup and Restore Service', () => {
    let backupDir;
    let db;

    beforeAll(() => {
        backupDir = path.join(__dirname, 'test_backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
    });

    beforeEach(() => {
        // Ensure clean DB for each test by deleting files and reloading module
        jest.resetModules();
        try { if (db) db.close(); } catch (e) {}
        try { fs.unlinkSync(testDbPath); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        
        db = require('../config/db');
    });

    afterAll(() => {
        try { if (db) db.close(); } catch (e) {}
        try { fs.unlinkSync(testDbPath); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        
        // Clean up any auto-backup files created during testing
        try {
            const files = fs.readdirSync(__dirname);
            files.forEach(file => {
                if (file.startsWith('database_before_restore_') && file.endsWith('.db')) {
                    fs.unlinkSync(path.join(__dirname, file));
                }
            });
        } catch (e) {}

        fs.rmSync(backupDir, { recursive: true, force: true });
    });

    it('should create a valid backup file', async () => {
        const destPath = path.join(backupDir, 'valid_backup.db');
        const backupServiceLocal = require('../services/backupService');
        const result = await backupServiceLocal.backupDatabase(destPath);
        
        expect(result.success).toBe(true);
        expect(fs.existsSync(destPath)).toBe(true);

        const verification = backupServiceLocal.verifyDatabaseIntegrity(destPath);
        expect(verification.valid).toBe(true);
    });

    it('should fail verification for non-sqlite files', () => {
        const backupServiceLocal = require('../services/backupService');
        const fakeFilePath = path.join(backupDir, 'fake.db');
        fs.writeFileSync(fakeFilePath, 'this is not a database file');

        const verification = backupServiceLocal.verifyDatabaseIntegrity(fakeFilePath);
        expect(verification.valid).toBe(false);
        expect(verification.error).toMatch(/Invalid SQLite file/);
    });

    it('should fail verification for missing required tables', () => {
        const backupServiceLocal = require('../services/backupService');
        const invalidDbPath = path.join(backupDir, 'invalid_schema.db');
        const invalidDb = new Database(invalidDbPath);
        invalidDb.exec('CREATE TABLE some_table (id INTEGER PRIMARY KEY);');
        invalidDb.close();

        const verification = backupServiceLocal.verifyDatabaseIntegrity(invalidDbPath);
        expect(verification.valid).toBe(false);
        expect(verification.error).toMatch(/This is not a FarahStore backup/);
    });

    it('should fail verification for schema version mismatch', () => {
        const backupServiceLocal = require('../services/backupService');
        const oldVersionPath = path.join(backupDir, 'old_version.db');
        const oldDb = new Database(oldVersionPath);
        oldDb.exec(`
            CREATE TABLE products (id INTEGER);
            CREATE TABLE customers (id INTEGER);
            CREATE TABLE suppliers (id INTEGER);
            CREATE TABLE categories (id INTEGER);
            CREATE TABLE app_metadata (key TEXT, value TEXT);
            INSERT INTO app_metadata (key, value) VALUES ('schema_version', '999');
        `);
        oldDb.close();

        const verification = backupServiceLocal.verifyDatabaseIntegrity(oldVersionPath);
        expect(verification.valid).toBe(false);
        expect(verification.error).toMatch(/Schema version mismatch/);
    });

});
