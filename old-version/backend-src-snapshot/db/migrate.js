/**
 * Simple migration runner.
 *   node src/db/migrate.js           -> runs any .sql files not yet applied
 *   node src/db/migrate.js --fresh   -> DROPS every table first, then re-runs (development only!)
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const db = require('../config/db');

async function run() {
  if (env.isProd && process.argv.includes('--fresh')) throw new Error('Refusing --fresh in production.');

  if (process.argv.includes('--fresh')) {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = await db.query('SHOW TABLES');
    for (const row of tables) await db.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Dropped all tables.');
  }

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).map((r) => r.name));

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // split on ";" at end of line to run statements one by one
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) await db.query(stmt);
    await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`Applied ${file}`);
  }
  console.log('Migrations up to date.');
}

run()
  .then(() => db.pool.end())
  .catch((e) => {
    console.error('Migration failed:', e.message);
    process.exit(1);
  });
