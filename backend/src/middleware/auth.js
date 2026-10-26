import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export const ROLES = {
  ADMIN: 'super_admin',
  COMPANY: 'company',
  PM: 'project_manager',
  MANAGER: 'project_manager', // same role, two names used across the code
  CLIENT: 'client',
  ENGINEER: 'engineer_architect',
  WORKER: 'worker',
  SUPPLIER: 'supplier',
};

/**
 * We use JSON Web Tokens (JWT) sent in the "Authorization: Bearer <token>" header.
 * The token only proves who you are; your role is always re-read from the database, so a
 * deactivated or demoted user loses access immediately.
 */
export function signToken(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

async function loadUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret);
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'Your session has expired. Please log in again.' : 'Invalid session. Please log in again.');
  }
  const [user] = await query(
    `SELECT u.id, u.full_name, u.email, u.is_active, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [payload.sub]);
  if (!user || !user.is_active) throw unauthorized('This account is not active.');
  return user;
}

export async function authenticate(req, _res, next) {
  try {
    const user = await loadUser(req);
    if (!user) throw unauthorized();
    req.user = user;
    next();
  } catch (err) { next(err); }
}

/** Like authenticate, but anonymous visitors are allowed through (req.user stays undefined). */
export async function optionalAuth(req, _res, next) {
  try {
    req.user = (await loadUser(req)) || undefined;
    next();
  } catch (err) { next(err); }
}

/** Only the listed roles may continue. The super administrator always may. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (req.user.role === ROLES.ADMIN || roles.includes(req.user.role)) return next();
  next(forbidden());
};
