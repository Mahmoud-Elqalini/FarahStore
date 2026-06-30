const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const log = require("electron-log");

const CURRENT_SCHEMA_VERSION = 1;

let dbPath;
if (process.env.NODE_ENV === 'test' && !process.env.TEST_DB_FILE) {
  dbPath = ':memory:';
} else if (process.env.TEST_DB_FILE) {
  dbPath = process.env.TEST_DB_FILE;
} else if (process.env.APP_DATABASE_PATH) {
  const dir = path.dirname(process.env.APP_DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  dbPath = process.env.APP_DATABASE_PATH;
} else {
  dbPath = path.join(__dirname, '..', 'database', 'farahstore.db');
}
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

log.info("✅ SQLite Database connected successfully at:", dbPath);
log.info("Initializing database schema...");

db.exec(`
-- =========================================================
-- APP METADATA
-- =========================================================
CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('schema_version', '${CURRENT_SCHEMA_VERSION}');

-- =========================================================
-- CATEGORIES
-- =========================================================
CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    next_sku_seq INTEGER NOT NULL DEFAULT 1
);

-- =========================================================
-- SUPPLIERS
-- =========================================================
CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- =========================================================
-- CUSTOMERS
-- =========================================================
CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    notes TEXT,
    registration_date TEXT DEFAULT (datetime('now', 'localtime')),
    is_active INTEGER NOT NULL DEFAULT 1
);

-- =========================================================
-- PRODUCTS
-- =========================================================
CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    description TEXT,
    purchase_price REAL NOT NULL CHECK (purchase_price >= 0),
    selling_price REAL NOT NULL CHECK (selling_price >= purchase_price),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    category_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
);

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    order_date TEXT DEFAULT (datetime('now', 'localtime')),
    payment_type TEXT CHECK (payment_type IN ('Cash','Installment')),
    total_amount REAL NOT NULL CHECK (total_amount > 0),
    order_status TEXT DEFAULT 'Active' CHECK (order_status IN ('Active','Completed','Cancelled')),
    installment_rate REAL DEFAULT 0,
    down_payment REAL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- =========================================================
-- ORDER DETAILS
-- =========================================================
CREATE TABLE IF NOT EXISTS order_details (
    order_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- =========================================================
-- INSTALLMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS installments (
    installment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Paid','Late')),
    payment_date TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orderdetails_order ON order_details(order_id);
CREATE INDEX IF NOT EXISTS idx_orderdetails_product ON order_details(product_id);
CREATE INDEX IF NOT EXISTS idx_installments_order ON installments(order_id);
`);

log.info("✅ Database schema initialized successfully");

try {
  db.exec("ALTER TABLE orders ADD COLUMN down_payment REAL DEFAULT 0;");
} catch (e) {
  // Column already exists
}

db.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
db.dbPath = dbPath;

// Track changes for Auto-Backup
try {
    const res = db.prepare("SELECT total_changes() as c").get();
    db.lastBackupChanges = res ? res.c : 0;
} catch (e) {
    db.lastBackupChanges = 0;
}

module.exports = db;
