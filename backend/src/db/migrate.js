/**
 * Migration runner.
 *   npm run db:migrate   -> applies any .sql file in src/db/migrations that has not run yet
 *   npm run db:reset     -> DROPS every table, re-applies all migrations, then seeds demo data (development only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate({ fresh = false, log = console.log } = {}) {
  if (fresh && config.isProd) throw new Error('Refusing to reset the database in production.');
  // A separate connection that may run several statements per call (migration files contain many).
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
  try {
    if (fresh) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      const [tables] = await conn.query('SHOW TABLES');
      for (const row of tables) await conn.query(`DROP TABLE IF EXISTS \`${Object.values(row)[0]}\``);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map((r) => r.name));
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (applied.has(file)) continue;
      await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      log(`Applied ${file}`);
    }
  } finally {
    await conn.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate({ fresh: process.argv.includes('--fresh') })
    .then(() => console.log('Database is up to date.'))
    .catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
}
