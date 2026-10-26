import { query } from '../db/pool.js';
import { toCents, fromCents } from '../utils/money.js';

/** Budget figures are calculated here on the server from approved expense records. */
export async function budgetSummary(projectId, project) {
  const rows = await query(
    `SELECT category, status, COALESCE(SUM(amount),0) AS total FROM expenses WHERE project_id = ? GROUP BY category, status`, [projectId]);
  let approved = 0n; let pending = 0n;
  const byCategory = {};
  for (const r of rows) {
    const c = toCents(r.total);
    if (r.status === 'approved') { approved += c; byCategory[r.category] = fromCents(toCents(byCategory[r.category] ?? '0') + c); }
    if (r.status === 'pending') pending += c;
  }
  const approvedBudget = toCents(project.approved_budget);
  const budget = approvedBudget > 0n ? approvedBudget : toCents(project.estimated_budget);
  return {
    estimated: project.estimated_budget,
    approved: project.approved_budget,
    budget: fromCents(budget),
    spent: fromCents(approved),
    pending: fromCents(pending),
    remaining: fromCents(budget > approved ? budget - approved : 0n),
    overBudget: approved > budget && budget > 0n,
    byCategory,
  };
}
