import { query } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { ROLES } from '../middleware/auth.js';
import { visibleProjects } from '../services/access.service.js';

const numbers = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));

export async function summary(req, res) {
  const u = req.user;
  const vis = visibleProjects(u);
  const base = `FROM projects p WHERE ${vis.sql} AND p.archived_at IS NULL`;
  const [counts] = await query(
    `SELECT COALESCE(SUM(p.status = 'active'),0) AS active, COALESCE(SUM(p.status = 'completed'),0) AS completed,
            COALESCE(SUM(p.status = 'planning'),0) AS planning, COUNT(*) AS total ${base}`, vis.params);
  const taskScope = u.role === ROLES.WORKER ? ' AND t.assignee_id = ?' : '';
  const taskParams = u.role === ROLES.WORKER ? [...vis.params, u.id] : vis.params;
  const [tasks] = await query(
    `SELECT COALESCE(SUM(t.status <> 'done'),0) AS pending,
            COALESCE(SUM(t.status <> 'done' AND t.due_date < UTC_DATE()),0) AS overdue
       FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${vis.sql} AND p.archived_at IS NULL${taskScope}`, taskParams);
  const budgets = await query(
    `SELECT p.id, p.title, IF(p.approved_budget > 0, p.approved_budget, p.estimated_budget) AS budget,
            (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.project_id = p.id AND e.status = 'approved') AS spent
       ${base} ORDER BY p.id DESC LIMIT 6`, vis.params);
  const deadlines = await query(
    `SELECT t.id, t.title, t.due_date, t.priority, t.status, p.title AS project_title, p.id AS project_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE ${vis.sql} AND p.archived_at IS NULL AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= DATE_ADD(UTC_DATE(), INTERVAL 14 DAY)${taskScope}
      ORDER BY t.due_date LIMIT 8`, taskParams);
  const activity = await query(
    `(SELECT 'progress' AS kind, CONCAT(u.full_name, ' reported ', pu.completion_pct, '% on ', p.title) AS text, pu.created_at AS at
        FROM project_progress_updates pu JOIN projects p ON p.id = pu.project_id JOIN users u ON u.id = pu.user_id WHERE ${vis.sql})
     UNION ALL
     (SELECT 'task', CONCAT(u.full_name, ': "', t.title, '" ', COALESCE(CONCAT('moved to ', REPLACE(e.to_status,'_',' ')), 'updated')), e.created_at
        FROM task_events e JOIN tasks t ON t.id = e.task_id JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = e.user_id WHERE ${vis.sql})
     ORDER BY at DESC LIMIT 8`, [...vis.params, ...vis.params]);
  const [notif] = await query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [u.id]);
  const extra = {};
  if (u.role === ROLES.CLIENT) {
    const [r] = await query("SELECT COUNT(*) AS n FROM quotation_requests WHERE client_id = ? AND status = 'open'", [u.id]);
    extra.openRequests = Number(r.n);
  }
  if ([ROLES.COMPANY, ROLES.ENGINEER, ROLES.WORKER, ROLES.SUPPLIER].includes(u.role)) {
    const [r] = await query("SELECT COUNT(*) AS n FROM quotations WHERE provider_id = ? AND status = 'submitted'", [u.id]);
    extra.activeQuotations = Number(r.n);
  }
  if ([ROLES.ADMIN, ROLES.COMPANY, ROLES.MANAGER, ROLES.SUPPLIER].includes(u.role)) {
    const [r] = await query('SELECT COUNT(*) AS n FROM materials WHERE reorder_level > 0 AND stock_qty <= reorder_level');
    extra.lowStock = Number(r.n);
  }
  res.json({ data: {
    projects: numbers(counts), tasks: numbers(tasks), budgets: camel(budgets), deadlines: camel(deadlines),
    activity: camel(activity), unreadNotifications: Number(notif.unread), extra,
  } });
}
