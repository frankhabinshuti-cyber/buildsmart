import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { AppError, unauthorized, badRequest } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { camel } from '../utils/camel.js';

const COST = env.isTest ? 4 : 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// A real bcrypt hash of a random string: compared when the email is unknown so timing is similar.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const publicUser = (u) => ({ id: u.id, fullName: u.full_name ?? u.fullName, email: u.email, role: u.role, phone: u.phone ?? null, location: u.location ?? null });

export async function register(req, res) {
  const { fullName, email, password, role, phone, location } = req.body;
  const [roleRow] = await query('SELECT id FROM roles WHERE code = ?', [role]);
  const hash = await bcrypt.hash(password, COST);
  const result = await query(
    'INSERT INTO users (role_id, full_name, email, password_hash, phone, location) VALUES (?,?,?,?,?,?)',
    [roleRow.id, fullName, email, hash, phone, location],
  );
  req.user = { id: result.insertId };
  await audit(req, 'user.register', 'user', result.insertId, `role=${role}`);
  const user = { id: result.insertId, full_name: fullName, email, role, phone, location };
  res.status(201).json({ data: { token: signToken(user), user: publicUser(user) } });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const rows = await query(
    `SELECT u.*, r.code AS role, (u.locked_until IS NOT NULL AND u.locked_until > UTC_TIMESTAMP()) AS is_locked
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`, [email]);
  const user = rows[0];
  const hashToCheck = user ? user.password_hash : DUMMY_HASH;

  // Compared inside MySQL (both sides UTC) so the server's own time zone can never break the lock.
  if (user?.is_locked) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  }
  const ok = await bcrypt.compare(password, hashToCheck);
  if (!user || !ok) {
    if (user) {
      const fails = user.failed_attempts + 1;
      if (fails >= MAX_FAILS) {
        await query('UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE id = ?', [LOCK_MINUTES, user.id]);
      } else {
        await query('UPDATE users SET failed_attempts = ? WHERE id = ?', [fails, user.id]);
      }
      req.user = { id: user.id };
      await audit(req, 'auth.login_failed', 'user', user.id);
    }
    throw unauthorized('Invalid email or password');
  }
  if (!user.is_active) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated. Contact the administrator.');

  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
  req.user = { id: user.id };
  await audit(req, 'auth.login', 'user', user.id);
  res.json({ data: { token: signToken(user), user: publicUser(user) } });
}

export async function logout(req, res) {
  // Tokens are stateless, so the browser simply discards its copy. We record the event for the audit trail.
  await audit(req, 'auth.logout', 'user', req.user.id);
  res.json({ data: { ok: true } });
}

export async function me(req, res) {
  const [u] = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.location, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [req.user.id]);
  res.json({ data: publicUser(u) });
}

export async function updateProfile(req, res) {
  const { fullName, phone, location } = req.body;
  await query('UPDATE users SET full_name = ?, phone = ?, location = ? WHERE id = ?', [fullName, phone, location, req.user.id]);
  await audit(req, 'user.update_profile', 'user', req.user.id);
  return me(req, res);
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const [u] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, u.password_hash))) throw badRequest('Current password is incorrect');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, COST), req.user.id]);
  await audit(req, 'auth.change_password', 'user', req.user.id);
  res.json({ data: { ok: true } });
}

export async function forgotPassword(req, res) {
  const [u] = await query('SELECT id FROM users WHERE email = ? AND is_active = 1', [req.body.email]);
  const response = { message: 'If that email is registered, a reset link has been sent.' };
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))', [u.id, hash]);
    req.user = { id: u.id };
    await audit(req, 'auth.forgot_password', 'user', u.id);
    // Email sending is a later phase. In development the token is returned so the flow can be tested.
    if (!env.isProd) {
      response.devResetToken = token;
      if (!env.isTest) console.log(`[dev] password reset token for ${req.body.email}: ${token}`);
    }
  }
  res.json({ data: response });
}

export async function resetPassword(req, res) {
  const hash = crypto.createHash('sha256').update(req.body.token).digest('hex');
  const [row] = await query(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [hash]);
  if (!row) throw badRequest('This reset link is invalid or has expired');
  await query('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(req.body.newPassword, COST), row.user_id]);
  await query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
  req.user = { id: row.user_id };
  await audit(req, 'auth.reset_password', 'user', row.user_id);
  res.json({ data: { ok: true } });
}

export async function lookupUsers(req, res) {
  const { role, q } = req.query;
  const where = ['u.is_active = 1']; const params = [];
  if (role) { where.push('r.code = ?'); params.push(String(role)); }
  if (q) { where.push('u.full_name LIKE ?'); params.push(`%${String(q).slice(0, 60)}%`); }
  const rows = await query(
    `SELECT u.id, u.full_name, r.code AS role, u.location FROM users u JOIN roles r ON r.id = u.role_id
      WHERE ${where.join(' AND ')} ORDER BY u.full_name LIMIT 50`, params);
  res.json({ data: camel(rows) });
}
