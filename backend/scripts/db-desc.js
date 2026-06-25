require('dotenv').config({ path: '../.env' });
const pool = require('../config/db');

async function fullDatabaseReview() {
  try {
    // 1. ALL TABLES
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log("====== ALL TABLES ======");
    console.log(tables.rows.map(r => r.table_name));

    // 2. ALL COLUMNS per table
    console.log("\n====== COLUMNS PER TABLE ======");
    for (const t of tables.rows) {
      const cols = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [t.table_name]);
      console.log(`\n--- ${t.table_name} ---`);
      cols.rows.forEach(c => {
        const nullable = c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
        const maxLen = c.character_maximum_length ? `(${c.character_maximum_length})` : '';
        console.log(`  ${c.column_name}: ${c.data_type}${maxLen} ${nullable}${def}`);
      });
    }

    // 3. ALL CONSTRAINTS
    console.log("\n====== ALL CONSTRAINTS ======");
    const constraints = await pool.query(`
      SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
      ORDER BY conrelid::regclass::text, conname
    `);
    constraints.rows.forEach(c => {
      console.log(`  [${c.table_name}] ${c.conname}: ${c.definition}`);
    });

    // 4. ALL INDEXES
    console.log("\n====== ALL INDEXES ======");
    const indexes = await pool.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    indexes.rows.forEach(i => {
      console.log(`  [${i.tablename}] ${i.indexname}: ${i.indexdef}`);
    });

    // 5. ALL FUNCTIONS (names + signatures)
    console.log("\n====== ALL FUNCTIONS ======");
    const funcs = await pool.query(`
      SELECT p.proname, 
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS return_type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname
    `);
    funcs.rows.forEach(f => {
      console.log(`  ${f.proname}(${f.args}) => ${f.return_type}`);
    });

    // 6. ALL TRIGGERS
    console.log("\n====== ALL TRIGGERS ======");
    const triggers = await pool.query(`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);
    if (triggers.rows.length === 0) {
      console.log("  (none)");
    } else {
      triggers.rows.forEach(t => {
        console.log(`  [${t.event_object_table}] ${t.trigger_name} ON ${t.event_manipulation}: ${t.action_statement}`);
      });
    }

    // 7. ROW COUNTS
    console.log("\n====== ROW COUNTS ======");
    for (const t of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) AS cnt FROM ${t.table_name}`);
      console.log(`  ${t.table_name}: ${count.rows[0].cnt} rows`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

fullDatabaseReview();
