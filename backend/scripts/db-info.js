require('dotenv').config({ path: '../.env' });
const pool = require('../config/db');

async function showDatabaseInfo() {
  try {
    console.log("📊 Fetching Database Constraints & Structure...\n");
    
    const query = `
      SELECT 
        conname AS constraint_name, 
        pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
      ORDER BY constraint_name;
    `;
    
    const result = await pool.query(query);
    
    console.log("--- Active Constraints ---");
    if (result.rows.length === 0) {
      console.log("No constraints found.");
    } else {
      result.rows.forEach(row => {
        console.log(`🔹 ${row.constraint_name}:`);
        console.log(`   ${row.constraint_definition}\n`);
      });
    }

  } catch (error) {
    console.error("❌ Error fetching DB info:", error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  showDatabaseInfo();
}

module.exports = showDatabaseInfo;
