import { query } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { notFound, forbidden, conflict } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';
import { projectAccess } from '../services/access.service.js';
import { budgetSummary } from '../services/finance.service.js';

export async function list(req, res) {
  const id = Number(req.params.id);
  const { canManage, canView } = await projectAccess(req.user, id);
  const isClient = req.user.role === ROLES.CLIENT;
  if (!canManage && !isClient && !canView) throw forbidden();
  // Clients see approved expenses only. Other members see only what they submitted.
  let extra = ''; const params = [id];
  if (!canManage) {
    if (isClient) extra = " AND e.status = 'approved'";
    else { extra = ' AND e.submitted_by = ?'; params.push(req.user.id); }
  }
  const rows = await query(
    `SELECT e.id, e.category, e.description, e.amount, e.expense_date AS incurred_on, e.status, e.created_at, e.inventory_movement_id,
            u.full_name AS created_by_name, rv.full_name AS reviewed_by_name
       FROM expenses e JOIN users u ON u.id = e.submitted_by LEFT JOIN users rv ON rv.id = e.reviewed_by
      WHERE e.project_id = ?${extra} ORDER BY e.expense_date DESC, e.id DESC`, params);
  res.json({ data: camel(rows) });
}

export async function create(req, res) {
  const id = Number(req.params.id);
  const { canView, project } = await projectAccess(req.user, id);
  if (!canView || req.user.role === ROLES.CLIENT) throw forbidden('You cannot record expenses on this project');
  const b = req.body;
  // Status is never taken from the request: every new expense starts as "pending".
  const r = await query('INSERT INTO expenses (project_id, category, description, amount, expense_date, submitted_by) VALUES (?,?,?,?,?,?)',
    [id, b.category, b.description, b.amount, b.incurredOn, req.user.id]);
  if (project.manager_id && project.manager_id !== req.user.id) {
    await notify(project.manager_id, 'expense', 'Expense awaiting approval', `${b.description} - ${b.amount}`, `/app/projects/${id}`);
  }
  await audit(req, 'expense.create', 'expense', r.insertId, `${b.amount}`);
  res.status(201).json({ data: { id: r.insertId } });
}

export async function review(req, res) {
  const id = Number(req.params.id);
  const [e] = await query('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!e) throw notFound('Expense not found');
  const { canManage, isAdmin, project } = await projectAccess(req.user, e.project_id);
  if (!canManage) throw forbidden('Only the project manager or owner can review expenses');
  // Separation of duties: you cannot approve an expense you recorded yourself (admins excepted).
  if (e.submitted_by === req.user.id && !isAdmin) throw forbidden('You cannot review your own expense');
  const r = await query(
    "UPDATE expenses SET status = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'pending'",
    [req.body.decision, req.user.id, id]);
  if (!r.affectedRows) throw conflict('This expense was already reviewed');
  await notify(e.submitted_by, 'expense', `Expense ${req.body.decision}`, e.description, `/app/projects/${e.project_id}`);
  if (req.body.decision === 'approved') {
    const b = await budgetSummary(e.project_id, project);
    if (b.overBudget && project.manager_id) {
      await notify(project.manager_id, 'budget', `Over budget: ${project.title}`, `Spent ${b.spent} of ${b.budget}`, `/app/projects/${e.project_id}`);
    }
  }
  await audit(req, `expense.${req.body.decision}`, 'expense', id, `${e.amount}`);
  res.json({ data: { ok: true } });
}
