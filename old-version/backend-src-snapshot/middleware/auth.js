const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');
const { unauthorized, forbidden } = require('../utils/errors');

const COOKIE_NAME = 'bs_token';

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript in the browser cannot read it (blocks token theft via XSS)
    secure: env.isProd, // HTTPS only in production
    sameSite: 'lax', // not sent on cross-site POSTs (helps against CSRF)
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/**
 * Reads the token (cookie or "Authorization: Bearer" header), verifies it, then loads the
 * user from the database so a deactivated account is blocked immediately.
 */
async function authenticate(req, _res, next) {
  let token = null;
  let viaCookie = false;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) token = header.slice(7);
  else if (req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
    viaCookie = true;
  }
  if (!token) throw unauthorized();

  // CSRF defence for cookie logins: browsers cannot add this custom header on a cross-site form post.
  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'BuildSmart') {
    throw forbidden('Missing security header.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }
  const user = await db.one(
    `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [payload.sub]
  );
  if (!user || !user.is_active) throw unauthorized('This account is not active.');
  req.user = user;
  next();
}

/** Allow only the listed roles. super_admin is always allowed. */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (req.user.role === 'super_admin' || roles.includes(req.user.role)) return next();
    throw forbidden();
  };

module.exports = { authenticate, requireRole, signToken, cookieOptions, COOKIE_NAME };
