import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const conn = await mysql.createConnection({
  host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password,
});
const name = env.db.database.replace(/[^a-zA-Z0-9_]/g, '');
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
console.log(`Database "${name}" is ready.`);
await conn.end();
