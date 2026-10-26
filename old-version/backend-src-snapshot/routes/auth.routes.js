import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { config } from '../config/index.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/errors.js';
import { parse } from '../utils/helpers.js';
import { audit } from '../utils/audit.js';

const router = Router();
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Rate limit sensitive endpoints (skipped in automated tests).
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => config.isTest,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } } });

const password = z.string().min(8, 'At least 8 characters').max(72, 'At most 72 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');
const SELF_ROLES = ['client', 'company', 'project_manager', 'engineer_architect', 'worker', 'supplier'];

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(190),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  password,
  role: z.enum(SELF_ROLES, { errorMap: () => ({ message: 'Choose a valid account type' }) }),
  company_name: z.string().trim().max(150).optional(),
});

const publicUser = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, phone: u.phone, role: u.role, company_id: u.company_id ?? null });

router.post('/register', limiter, asyncHandler(async (req, res) => {
  const data = parse(registerSchema, req.body);
  const [exists] = await query('SELECT id FROM users WHERE email = ?', [data.email]);
  if (exists) throw new HttpError(409, 'An account with this email already exists.', { email: 'Already registered' });
  const hash = await bcrypt.hash(data.password, 10);
  const userId = await withTransaction(async (conn) => {
    const [[role]] = await conn.query('SELECT id FROM roles WHERE code = ?', [data.role]);
    const [r] = await conn.query('INSERT INTO users (role_id, full_name, email, phone, password_hash) VALUES (?,?,?,?,?)',
      [role.id, data.full_name, data.email, data.phone || null, hash]);
    if (data.role === 'company') await conn.query('INSERT INTO companies (owner_id, name, phone) VALUES (?,?,?)', [r.insertId, data.company_name || data.full_name, data.phone || null]);
    if (data.role === 'supplier') await conn.query('INSERT INTO suppliers (user_id, name, email, phone) VALUES (?,?,?,?)', [r.insertId, data.company_name || data.full_name, data.email, data.phone || null]);
    return r.insertId;
  });
  req.user = { id: userId };
  await audit(req, 'user.register', 'user', userId, data.role);
  const [user] = await query('SELECT u.id, u.full_name, u.email, u.phone, r.code role, c.id company_id FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN companies c ON c.owner_id=u.id WHERE u.id=?', [userId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', limiter, asyncHandler(async (req, res) => {
  const { email, password: pw } = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), req.body);
  const [u] = await query('SELECT u.*, r.code role, c.id company_id FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN companies c ON c.owner_id=u.id WHERE u.email = ?', [email]);
  if (!u) { await bcrypt.compare(pw, DUMMY_HASH); throw new HttpError(401, 'Invalid email or password.'); }
  if (u.locked_until && new Date(u.locked_until.replace(' ', 'T') + 'Z') > new Date()) {
    throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }
  const ok = await bcrypt.compare(pw, u.password_hash);
  if (!ok) {
    const attempts = u.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query('UPDATE users SET failed_attempts = 0, locked_until = UTC_TIMESTAMP() + INTERVAL ? MINUTE WHERE id = ?', [LOCK_MINUTES, u.id]);
      req.user = { id: u.id }; await audit(req, 'auth.locked', 'user', u.id);
    } else {
      await query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, u.id]);
    }
    throw new HttpError(401, 'Invalid email or password.');
  }
  if (!u.is_active) throw new HttpError(403, 'This account has been deactivated. Contact support.');
  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?', [u.id]);
  req.user = { id: u.id }; await audit(req, 'auth.login', 'user', u.id);
  res.json({ token: signToken(u), user: publicUser(u) });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.put('/me', authenticate, asyncHandler(async (req, res) => {
  const data = parse(z.object({ full_name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional().or(z.literal('')) }), req.body);
  await query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [data.full_name, data.phone || null, req.user.id]);
  res.json({ user: publicUser({ ...req.user, ...data, phone: data.phone || null }) });
}));

router.post('/change-password', authenticate, limiter, asyncHandler(async (req, res) => {
  const data = parse(z.object({ current_password: z.string().min(1), new_password: password }), req.body);
  const [u] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(data.current_password, u.password_hash))) throw new HttpError(400, 'Current password is incorrect.', { current_password: 'Incorrect' });
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(data.new_password, 10), req.user.id]);
  await audit(req, 'auth.password_changed', 'user', req.user.id);
  res.json({ message: 'Password updated.' });
}));

/** Password reset: we store only a hash of the token. In development the link is printed to the server console
 *  (a real deployment would email it). The response is identical whether or not the email exists. */
router.post('/forgot-password', limiter, asyncHandler(async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const [u] = await query('SELECT id FROM users WHERE email = ? AND is_active = 1', [email]);
  let devToken;
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, UTC_TIMESTAMP() + INTERVAL 30 MINUTE)', [u.id, hash]);
    if (!config.isProd) { devToken = token; if (!config.isTest) console.log(`[dev] Password reset link: ${config.clientOrigin}/reset-password?token=${token}`); }
  }
  res.json({ message: 'If that email is registered, a reset link has been sent.', ...(devToken ? { dev_token: devToken } : {}) });
}));

router.post('/reset-password', limiter, asyncHandler(async (req, res) => {
  const data = parse(z.object({ token: z.string().min(20), new_password: password }), req.body);
  const hash = crypto.createHash('sha256').update(data.token).digest('hex');
  const [r] = await query('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [hash]);
  if (!r) throw new HttpError(400, 'This reset link is invalid or has expired.');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(data.new_password, 10), r.user_id]);
    await conn.query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ?', [r.id]);
  });
  res.json({ message: 'Password reset. You can now log in.' });
}));

export default router;
