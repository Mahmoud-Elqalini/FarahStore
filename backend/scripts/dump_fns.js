const pool = require('./config/db');
async function run() {
  const res = await pool.query("SELECT prosrc FROM pg_proc WHERE proname = 'create_order';");
  console.log('--- create_order ---');
  console.log(res.rows[0]?.prosrc);
  
  const res2 = await pool.query("SELECT prosrc FROM pg_proc WHERE proname = 'generate_installments';");
  console.log('--- generate_installments ---');
  console.log(res2.rows[0]?.prosrc);
  
  process.exit(0);
}
run();
