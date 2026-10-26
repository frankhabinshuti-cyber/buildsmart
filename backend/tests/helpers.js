import './setup.js';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { pool, query } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

export { pool, query };
export const PASSWORD = 'Demo@12345'; // demo password for every seeded user except the admin
export const ADMIN_PASSWORD = 'Admin@12345';

/** Rebuild the TEST database from scratch (never the real one: NODE_ENV=test selects buildsmart_test). */
export async function resetDb() {
  await migrate({ fresh: true, log() {} });
  await seed({ log() {} });
}

export function call(method, url, token, body) {
  let r = request(app)[method](`/api/v1${url}`);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body);
}

export async function login(email, password) {
  const pw = password ?? (email.startsWith('admin@') ? ADMIN_PASSWORD : PASSWORD);
  const res = await call('post', '/auth/login', null, { email, password: pw });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

export const ROLE_NAMES = ['admin', 'company', 'manager', 'client', 'client2', 'engineer', 'worker', 'supplier'];
export async function loginAll() {
  const t = {};
  for (const r of ROLE_NAMES) t[r] = await login(`${r}@buildsmart.rw`);
  return t;
}

export const dayOffset = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
export const signExpired = (userId) => jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: -10 });
export const idOf = async (email) => (await query('SELECT id FROM users WHERE email = ?', [email]))[0].id;
export const closeDb = () => pool.end();
