import { query } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { notFound, forbidden, conflict } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';

export async function categories(req, res) {
  res.json({ data: camel(await query('SELECT id, name FROM service_categories ORDER BY name')) });
}

const BASE = `SELECT s.id, s.title, s.description, s.location, s.price_from, s.is_active AS is_published, s.created_at, s.provider_id,
    u.full_name AS provider_name, r.code AS provider_role, co.name AS company_name, co.is_verified AS company_verified, sc.name AS category, sc.id AS category_id,
    (SELECT ROUND(AVG(rv.rating),1) FROM reviews rv WHERE rv.service_id = s.id) AS avg_rating,
    (SELECT COUNT(*) FROM reviews rv WHERE rv.service_id = s.id) AS review_count
  FROM services s JOIN users u ON u.id = s.provider_id JOIN roles r ON r.id = u.role_id
  LEFT JOIN companies co ON co.owner_id = s.provider_id JOIN service_categories sc ON sc.id = s.category_id`;

export async function listServices(req, res) {
  const { q, category, location } = req.query;
  const { page, limit, offset } = parsePage(req.query);
  const where = ['s.is_active = 1', 'u.is_active = 1']; const params = [];
  if (q) { where.push('(s.title LIKE ? OR s.description LIKE ? OR u.full_name LIKE ? OR co.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (category) { where.push('s.category_id = ?'); params.push(category); }
  if (location) { where.push('s.location LIKE ?'); params.push(`%${location}%`); }
  const w = where.join(' AND ');
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM services s JOIN users u ON u.id = s.provider_id LEFT JOIN companies co ON co.owner_id = s.provider_id WHERE ${w}`, params);
  const rows = await query(`${BASE} WHERE ${w} ORDER BY (co.is_verified IS NULL), co.is_verified DESC, s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

export async function getService(req, res) {
  const id = Number(req.params.id);
  const [s] = await query(`${BASE} WHERE s.id = ? AND s.is_active = 1`, [id]);
  if (!s) throw notFound('Service not found');
  const reviews = await query(
    `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.full_name AS reviewer_name FROM reviews rv JOIN users u ON u.id = rv.client_id
      WHERE rv.service_id = ? ORDER BY rv.id DESC LIMIT 30`, [id]);
  res.json({ data: { ...camel(s), reviews: camel(reviews) } });
}

export async function myServices(req, res) {
  res.json({ data: camel(await query(`${BASE} WHERE s.provider_id = ? ORDER BY s.id DESC`, [req.user.id])) });
}

export async function createService(req, res) {
  const b = req.body;
  const r = await query('INSERT INTO services (provider_id, company_id, category_id, title, description, location, price_from, is_active) VALUES (?,(SELECT id FROM companies WHERE owner_id = ?),?,?,?,?,?,?)',
    [req.user.id, req.user.id, b.categoryId, b.title, b.description, b.location, b.priceFrom ?? null, b.isPublished === false ? 0 : 1]);
  await audit(req, 'service.create', 'service', r.insertId, b.title);
  res.status(201).json({ data: { id: r.insertId } });
}

async function ownService(req) {
  const id = Number(req.params.id);
  const [s] = await query('SELECT provider_id FROM services WHERE id = ?', [id]);
  if (!s) throw notFound('Service not found');
  if (s.provider_id !== req.user.id && req.user.role !== ROLES.ADMIN) throw forbidden('This is not your service');
  return id;
}

export async function updateService(req, res) {
  const id = await ownService(req);
  const b = req.body;
  await query('UPDATE services SET category_id = ?, title = ?, description = ?, location = ?, price_from = ?, is_active = ? WHERE id = ?',
    [b.categoryId, b.title, b.description, b.location, b.priceFrom ?? null, b.isPublished === false ? 0 : 1, id]);
  await audit(req, 'service.update', 'service', id);
  res.json({ data: { ok: true } });
}

export async function deleteService(req, res) {
  const id = await ownService(req);
  await query('DELETE FROM services WHERE id = ?', [id]);
  await audit(req, 'service.delete', 'service', id);
  res.json({ data: { ok: true } });
}

export async function addReview(req, res) {
  const id = Number(req.params.id);
  const [s] = await query('SELECT provider_id, company_id, title FROM services WHERE id = ? AND is_active = 1', [id]);
  if (!s) throw notFound('Service not found');
  if (s.provider_id === req.user.id) throw forbidden('You cannot review your own service');
  try {
    await query('INSERT INTO reviews (service_id, company_id, client_id, rating, comment) VALUES (?,?,?,?,?)', [id, s.company_id, req.user.id, req.body.rating, req.body.comment]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw conflict('You have already reviewed this service');
    throw e;
  }
  await notify(s.provider_id, 'review', 'New review received', `${req.body.rating}/5 on ${s.title}`, '/app/services');
  await audit(req, 'review.create', 'service', id, `${req.body.rating}`);
  res.status(201).json({ data: { ok: true } });
}

export async function listCompanies(req, res) {
  const rows = await query(
    `SELECT co.id, co.name, co.description, co.location, co.is_verified,
            (SELECT COUNT(*) FROM services s WHERE s.provider_id = co.owner_id AND s.is_active = 1) AS service_count
       FROM companies co JOIN users u ON u.id = co.owner_id WHERE u.is_active = 1 ORDER BY co.is_verified DESC, co.name LIMIT 100`);
  res.json({ data: camel(rows) });
}

export async function myCompany(req, res) {
  const [c] = await query('SELECT id, name, description, location, phone, email, website, is_verified FROM companies WHERE owner_id = ?', [req.user.id]);
  res.json({ data: c ? camel(c) : null });
}

export async function saveCompany(req, res) {
  const b = req.body;
  await query(
    `INSERT INTO companies (owner_id, name, description, location, phone, email, website) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), location = VALUES(location),
       phone = VALUES(phone), email = VALUES(email), website = VALUES(website)`,
    [req.user.id, b.name, b.description, b.location, b.phone, b.email, b.website]);
  await audit(req, 'company.save', 'company', null, b.name);
  return myCompany(req, res);
}
