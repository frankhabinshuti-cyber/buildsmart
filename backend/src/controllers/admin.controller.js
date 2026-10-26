import { query } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';

export async function listUsers(req, res) {
  const { q, role } = req.query;
  const { page, limit, offset } = parsePage(req.query);
  const where = ['1=1']; const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (role) { where.push('r.code = ?'); params.push(role); }
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${w}`, params);
  // password_hash is deliberately never selected.
  const rows = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.location, u.is_active, u.last_login_at, u.created_at, r.code AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

export async function updateUser(req, res) {
  const id = Number(req.params.id);
  if (id === req.user.id) throw forbidden('You cannot change your own role or status');
  const [u] = await query('SELECT id FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('User not found');
  const { isActive, role } = req.body;
  if (isActive === undefined && !role) throw badRequest('Nothing to update');
  if (isActive !== undefined) await query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  if (role) await query('UPDATE users SET role_id = (SELECT id FROM roles WHERE code = ?) WHERE id = ?', [role, id]);
  await audit(req, 'admin.update_user', 'user', id, JSON.stringify({ isActive, role }));
  res.json({ data: { ok: true } });
}

export async function auditLogs(req, res) {
  const { page, limit, offset } = parsePage(req.query);
  const where = ['1=1']; const params = [];
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`${String(req.query.action).slice(0, 40)}%`); }
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${w}`, params);
  const rows = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.ip, a.details, a.created_at, u.full_name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

export async function stats(req, res) {
  const byRole = await query('SELECT r.label AS name, r.code, COUNT(u.id) AS count FROM roles r LEFT JOIN users u ON u.role_id = r.id GROUP BY r.id ORDER BY r.id');
  const [t] = await query(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM projects WHERE archived_at IS NULL) AS projects,
            (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM services WHERE is_active = 1) AS services,
            (SELECT COUNT(*) FROM quotation_requests WHERE status = 'open') AS openRequests`);
  res.json({ data: { totals: t, byRole: camel(byRole) } });
}
