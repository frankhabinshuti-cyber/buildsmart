import { query, withTransaction } from '../db/pool.js';
import { notFound, badRequest, conflict } from '../utils/errors.js';
import { lineTotal, toCents } from '../utils/money.js';
import { notify } from '../utils/notify.js';
import { requireManage } from './access.service.js';

const toMilli = (v) => {
  const neg = String(v).startsWith('-');
  const [w, f = ''] = String(v).replace('-', '').split('.');
  const n = BigInt(w) * 1000n + BigInt((f + '000').slice(0, 3));
  return neg ? -n : n;
};
const fromMilli = (n) => {
  const neg = n < 0n; const a = neg ? -n : n;
  const s = a.toString().padStart(4, '0');
  return `${neg ? '-' : ''}${s.slice(0, -3)}.${s.slice(-3)}`;
};

/**
 * Records a stock movement. The stock row is locked (SELECT ... FOR UPDATE) so two people
 * cannot spend the same stock at once, and everything is committed together or not at all.
 */
export async function recordMovement(user, materialId, { type, quantity, projectId, unitCost, note }) {
  let q = toMilli(quantity);
  if (q === 0n) throw badRequest('Quantity cannot be zero');
  if (type === 'receipt' && q < 0n) throw badRequest('Received quantity must be positive');
  if (type === 'allocation') {
    if (q < 0n) throw badRequest('Allocated quantity must be positive');
    if (!projectId) throw badRequest('Choose the project to allocate material to');
    q = -q; // allocation removes stock
  }

  const result = await withTransaction(async (conn) => {
    const [m] = await query('SELECT * FROM materials WHERE id = ? FOR UPDATE', [materialId], conn);
    if (!m) throw notFound('Material not found');
    let project = null;
    if (type === 'allocation') project = (await requireManage(user, Number(projectId), conn)).project;
    const newStock = toMilli(m.stock_qty) + q;
    if (newStock < 0n) throw conflict(`Not enough stock. Available: ${m.stock_qty} ${m.unit}`);

    const cost = unitCost ?? m.unit_cost;
    const mv = await query(
      'INSERT INTO inventory_movements (material_id, project_id, type, quantity, unit_cost, balance_after, note, user_id) VALUES (?,?,?,?,?,?,?,?)',
      [materialId, type === 'allocation' ? projectId : null, type, fromMilli(q), cost, fromMilli(newStock), note ?? null, user.id], conn);
    // A receipt at a new price updates the material's current unit cost.
    await query('UPDATE materials SET stock_qty = ?, unit_cost = ? WHERE id = ?',
      [fromMilli(newStock), type === 'receipt' && unitCost ? unitCost : m.unit_cost, materialId], conn);

    if (type === 'allocation') {
      // Material used on a project becomes an approved material expense, valued at the stock cost.
      const amount = lineTotal(fromMilli(-q), m.unit_cost);
      if (toCents(amount) > 0n) {
        const ex = await query(
          `INSERT INTO expenses (project_id, category, description, amount, incurred_on, status, created_by, reviewed_by, reviewed_at, inventory_movement_id)
           VALUES (?, 'material', ?, ?, UTC_DATE(), 'approved', ?, ?, UTC_TIMESTAMP(), ?)`,
          [projectId, `Material allocated: ${fromMilli(-q)} ${m.unit} ${m.name}`, amount, user.id, user.id, mv.insertId], conn);
        void ex;
      }
    }
    const low = m.reorder_level && newStock <= toMilli(m.reorder_level) && toMilli(m.reorder_level) > 0n;
    return { id: mv.insertId, balance: fromMilli(newStock), low, material: m, project };
  });

  if (result.low) {
    await notify(user.id, 'low_stock', `Low stock: ${result.material.name}`, `Only ${result.balance} ${result.material.unit} left`, '/app/materials');
    const admins = await query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'super_admin' AND u.id <> ?", [user.id]);
    for (const a of admins) await notify(a.id, 'low_stock', `Low stock: ${result.material.name}`, `Only ${result.balance} ${result.material.unit} left`, '/app/materials');
  }
  return result;
}
