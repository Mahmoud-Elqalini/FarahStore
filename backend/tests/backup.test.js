const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// We must set TEST_DB_FILE BEFORE requiring db.js so it uses a real file
const testDir = path.join(os.tmpdir(), `farahstore_test_${Date.now()}`);
const testDbPath = path.join(testDir, 'test.db');
const backupsDir = path.join(testDir, 'backups');

process.env.TEST_DB_FILE = testDbPath;

describe('Backup & Restore Integration', () => {
    let db;
    let backupService;

    beforeAll(() => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    });

    beforeEach(() => {
        // Close any globally cached db instance (e.g. from setup.js) to release file locks
        try {
            const oldDb = require('../config/db');
            if (oldDb && oldDb.open) oldDb.close();
        } catch (e) {}

        // Delete the test DB file to ensure a fresh schema for each test
        try { fs.unlinkSync(testDbPath); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}

        // Clear module cache to get a fresh DB connection
        jest.resetModules();
        
        db = require('../config/db');
        backupService = require('../services/backupService');

        // Clean database before each test
        db.exec(`
            DELETE FROM installments;
            DELETE FROM order_details;
            DELETE FROM orders;
            DELETE FROM products;
            DELETE FROM customers;
            DELETE FROM suppliers;
            DELETE FROM categories;
        `);
    });

    afterEach(() => {
        try { db.close(); } catch(e) {}
    });

    afterAll(() => {
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (e) {}
    });

    it('should complete a full backup and restore cycle', async () => {
        // 1. Insert dummy data
        const insertCategory = db.prepare("INSERT INTO categories (category_name) VALUES (?)");
        const res = insertCategory.run("Test Category");
        const categoryId = res.lastInsertRowid;

        // Verify data exists
        const countBeforeBackup = db.prepare("SELECT count(*) as count FROM categories").get().count;
        expect(countBeforeBackup).toBe(1);

        // 2. Perform Backup
        const backupPath = path.join(backupsDir, 'test_backup.db');
        const backupResult = await backupService.backupDatabase(backupPath);
        expect(backupResult.success).toBe(true);
        expect(fs.existsSync(backupPath)).toBe(true);

        // 3. Delete Data to simulate loss
        db.prepare("DELETE FROM categories").run();
        const countAfterDelete = db.prepare("SELECT count(*) as count FROM categories").get().count;
        expect(countAfterDelete).toBe(0);

        // 4. Perform Restore
        const restoreResult = await backupService.restoreDatabase(backupPath);
        expect(restoreResult.success).toBe(true);

        // NOTE: After a successful restore, the original db connection is closed.
        // We must re-open it or use a new connection to verify.
        const restoredDb = new Database(testDbPath);
        const countAfterRestore = restoredDb.prepare("SELECT count(*) as count FROM categories").get().count;
        expect(countAfterRestore).toBe(1);
        
        restoredDb.close();
    });

    it('should fail restore if backup file is corrupted', async () => {
        const corruptedPath = path.join(backupsDir, 'corrupted.db');
        fs.writeFileSync(corruptedPath, 'This is not a SQLite database file!!!', 'utf8');

        // Restore should fail without crashing
        const restoreResult = await backupService.restoreDatabase(corruptedPath);
        expect(restoreResult.success).toBe(false);
        expect(restoreResult.error).toMatch(/Invalid SQLite/i);
    });

    it('should fail restore if schema version is completely missing', async () => {
        const badSchemaPath = path.join(backupsDir, 'bad_schema.db');
        const tempDb = new Database(badSchemaPath);
        // Create an empty DB with all required tables but without schema_version row
        tempDb.exec(`
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE products (id INTEGER);
            CREATE TABLE customers (id INTEGER);
            CREATE TABLE suppliers (id INTEGER);
            CREATE TABLE categories (id INTEGER);
            CREATE TABLE orders (id INTEGER);
            CREATE TABLE order_details (id INTEGER);
            CREATE TABLE installments (id INTEGER);
        `);
        tempDb.close();

        const restoreResult = await backupService.restoreDatabase(badSchemaPath);
        expect(restoreResult.success).toBe(false);
        expect(restoreResult.error).toMatch(/Missing schema version/i);
    });

    it('should fail restore if missing required tables', async () => {
        const missingTablesPath = path.join(backupsDir, 'missing_tables.db');
        const tempDb = new Database(missingTablesPath);
        
        // Add app_metadata but omit other tables
        tempDb.exec(`
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO app_metadata (key, value) VALUES ('schema_version', '1');
        `);
        tempDb.close();

        const restoreResult = await backupService.restoreDatabase(missingTablesPath);
        expect(restoreResult.success).toBe(false);
        expect(restoreResult.error).toMatch(/جدول مفقود/);
    });

    it('should generate a pre-restore auto-backup before overwriting', async () => {
        const currentDbPath = db.dbPath;
        const currentDbDir = path.dirname(currentDbPath);
        
        const validBackupPath = path.join(backupsDir, 'valid_backup.db');
        const tempDb = new Database(validBackupPath);
        tempDb.exec(`
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT);
            INSERT INTO app_metadata (key, value) VALUES ('schema_version', '1');
            CREATE TABLE products (id INTEGER);
            CREATE TABLE customers (id INTEGER);
            CREATE TABLE suppliers (id INTEGER);
            CREATE TABLE categories (id INTEGER);
            CREATE TABLE orders (id INTEGER);
            CREATE TABLE order_details (id INTEGER);
            CREATE TABLE installments (id INTEGER);
        `);
        tempDb.close();

        const restoreResult = await backupService.restoreDatabase(validBackupPath);
        if (!restoreResult.success) console.error("Test 5 Restore Error:", restoreResult.error);
        expect(restoreResult.success).toBe(true);

        const newFiles = fs.readdirSync(currentDbDir);
        const safetyBackup = newFiles.find(f => f.startsWith('database_before_restore_'));
        expect(safetyBackup).toBeDefined();
    });

    it('should successfully clean old auto-backups based on retention limit', async () => {
        const testRetentionDir = path.join(testDir, 'retention_test');
        fs.mkdirSync(testRetentionDir, { recursive: true });

        for (let i = 1; i <= 5; i++) {
            const fakePath = path.join(testRetentionDir, `auto_2026-06-0${i}T12-00-00.db`);
            fs.writeFileSync(fakePath, 'dummy data');
        }

        const cleaned = await backupService.cleanOldAutoBackups(testRetentionDir, 2);
        
        expect(cleaned.success).toBe(true);
        expect(cleaned.deleted).toBe(3);

        // Should only have 2 files remaining
        const remaining = fs.readdirSync(testRetentionDir);
        expect(remaining.length).toBe(2);
        
        // The ones remaining should be the newest (04 and 05 based on our naming)
        expect(remaining).toContain('auto_2026-06-04T12-00-00.db');
        expect(remaining).toContain('auto_2026-06-05T12-00-00.db');
    });
});
