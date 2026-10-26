import { query, withTransaction } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';
import { notFound, forbidden } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';
import { recordMovement } from '../services/inventory.service.js';

async function mySupplier(user, createIfMissing = false) {
  const [s] = await query('SELECT id FROM suppliers WHERE user_id = ?', [user.id]);
  if (s || !createIfMissing) return s?.id ?? null;
  const [u] = await query('SELECT full_name, email, phone, location FROM users WHERE id = ?', [user.id]);
  const r = await query('INSERT INTO suppliers (user_id, name, contact_name, phone, email, location) VALUES (?,?,?,?,?,?)', [user.id, u.full_name, u.full_name, u.phone, u.email, u.location]);
  return r.insertId;
}

export async function listSuppliers(req, res) {
  const where = req.user.role === ROLES.SUPPLIER ? 'WHERE user_id = ?' : '';
  const rows = await query(`SELECT id, name, contact_name, phone, email, location FROM suppliers ${where} ORDER BY name`, where ? [req.user.id] : []);
  res.json({ data: camel(rows) });
}

export async function createSupplier(req, res) {
  const b = req.body;
  const r = await query('INSERT INTO suppliers (name, contact_name, phone, email, location) VALUES (?,?,?,?,?)', [b.name, b.contactName, b.phone, b.email, b.location]);
  await audit(req, 'supplier.create', 'supplier', r.insertId, b.name);
  res.status(201).json({ data: { id: r.insertId } });
}

export async function list(req, res) {
  const { q, lowStock } = req.query;
  const { page, limit, offset } = parsePage(req.query);
  const where = ['1=1']; const params = [];
  if (req.user.role === ROLES.SUPPLIER) { where.push('m.supplier_id IN (SELECT id FROM suppliers WHERE user_id = ?)'); params.push(req.user.id); }
  if (q) { where.push('(m.name LIKE ? OR m.category LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (lowStock === 'true') where.push('m.reorder_level > 0 AND m.stock_qty <= m.reorder_level');
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM materials m WHERE ${w}`, params);
  const rows = await query(
    `SELECT m.id, m.name, m.category, m.unit, m.description, m.unit_cost, m.stock_qty, m.reorder_level, m.supplier_id,
            s.name AS supplier_name, (m.reorder_level > 0 AND m.stock_qty <= m.reorder_level) AS is_low
       FROM materials m LEFT JOIN suppliers s ON s.id = m.supplier_id WHERE ${w} ORDER BY m.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

export async function create(req, res) {
  const b = req.body;
  const supplierId = req.user.role === ROLES.SUPPLIER ? await mySupplier(req.user, true) : b.supplierId ?? null;
  const id = await withTransaction(async (conn) => {
    const r = await query('INSERT INTO materials (name, category, unit, description, supplier_id, unit_cost, reorder_level, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [b.name, b.category, b.unit, b.description, supplierId, b.unitCost, b.reorderLevel, req.user.id], conn);
    return r.insertId;
  });
  if (Number(b.openingStock) > 0) {
    await recordMovement(req.user, id, { type: 'receipt', quantity: b.openingStock, unitCost: b.unitCost, note: 'Opening stock' });
  }
  await audit(req, 'material.create', 'material', id, b.name);
  res.status(201).json({ data: { id } });
}

export async function update(req, res) {
  const id = Number(req.params.id);
  const [m] = await query('SELECT supplier_id FROM materials WHERE id = ?', [id]);
  if (!m) throw notFound('Material not found');
  if (req.user.role === ROLES.SUPPLIER) {
    const sid = await mySupplier(req.user);
    if (!sid || sid !== m.supplier_id) throw forbidden('You can only edit your own catalog items');
  }
  const b = req.body;
  const map = { name: 'name', category: 'category', unit: 'unit', description: 'description', supplierId: 'supplier_id', unitCost: 'unit_cost', reorderLevel: 'reorder_level' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
  if (sets.length) await query(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  await audit(req, 'material.update', 'material', id);
  res.json({ data: { ok: true } });
}

export async function addMovement(req, res) {
  const id = Number(req.params.id);
  const r = await recordMovement(req.user, id, req.body);
  await audit(req, `inventory.${req.body.type}`, 'material', id, `qty=${req.body.quantity}`);
  res.status(201).json({ data: { id: r.id, balance: r.balance, lowStock: !!r.low } });
}

export async function listMovements(req, res) {
  const id = Number(req.params.id);
  const { page, limit, offset } = parsePage(req.query);
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM inventory_movements WHERE material_id = ?', [id]);
  const rows = await query(
    `SELECT im.id, im.type, im.quantity, im.unit_cost, im.balance_after, im.note, im.created_at, u.full_name AS user_name, p.title AS project_title
       FROM inventory_movements im JOIN users u ON u.id = im.user_id LEFT JOIN projects p ON p.id = im.project_id
      WHERE im.material_id = ? ORDER BY im.id DESC LIMIT ? OFFSET ?`, [id, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}
