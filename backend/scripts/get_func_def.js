require('dotenv').config({ path: '../.env' });
const pool = require('../config/db');

async function run() {
  try {
    const res = await pool.query(`
      SELECT pg_get_functiondef(oid) 
      FROM pg_proc 
      WHERE proname = 'create_order';
    `);
    console.log(res.rows[0].pg_get_functiondef);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
