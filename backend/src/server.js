import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error('Cannot connect to the database:', e.code || e.message);
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME in backend/.env and that MySQL is running.');
  process.exit(1);
}
app.listen(env.port, () => console.log(`BuildSmart API running on http://localhost:${env.port}/api/v1`));
