const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "farahstore.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

console.log("✅ SQLite Database connected successfully at:", dbPath);

module.exports = db;
