require('dotenv').config({ path: '../.env' });
const pool = require('../config/db');

async function cleanDatabase() {
  try {
    console.log("⚠️ Starting database cleanup...");
    
    // TRUNCATE all major tables and cascade the deletions to linked rows.
    // RESTART IDENTITY resets any auto-incrementing primary keys (SERIAL) back to 1.
    const query = `
      TRUNCATE TABLE 
        installments, 
        order_items, 
        orders, 
        products, 
        categories, 
        suppliers, 
        customers 
      RESTART IDENTITY CASCADE;
    `;
    
    await pool.query(query);
    console.log("✅ Database successfully cleaned and reset!");
  } catch (error) {
    console.error("❌ Error cleaning database:", error.message);
  } finally {
    await pool.end();
    console.log("🔌 Database connection closed.");
  }
}

// Execute if run directly
if (require.main === module) {
  cleanDatabase();
}

module.exports = cleanDatabase;
