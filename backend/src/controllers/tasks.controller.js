import { query, withTransaction } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { notFound, forbidden, badRequest, conflict } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';
import { visibleProjects, projectAccess, requireManage } from '../services/access.service.js';

const SELECT = `SELECT t.id, t.project_id, t.title, t.description, t.priority, t.status, t.assignee_id, t.start_date, t.due_date,
    t.depends_on_task_id, t.created_at, p.title AS project_title, u.full_name AS assignee_name,
    (t.due_date IS NOT NULL AND t.due_date < UTC_DATE() AND t.status <> 'done') AS is_overdue
  FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id`;

export async function list(req, res) {
  const { projectId, status, mine } = req.query;
  const { page, limit, offset } = parsePage(req.query);
  const vis = visibleProjects(req.user);
  const where = [vis.sql, 'p.archived_at IS NULL']; const params = [...vis.params];
  // Workers only ever see tasks assigned to them.
  if (mine === 'true' || req.user.role === ROLES.WORKER) { where.push('t.assignee_id = ?'); params.push(req.user.id); }
  if (projectId) { where.push('t.project_id = ?'); params.push(projectId); }
  if (status) { where.push('t.status = ?'); params.push(status); }
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${whereSql}`, params);
  const rows = await query(
    `${SELECT} WHERE ${whereSql}
      ORDER BY (t.status = 'done'), t.due_date IS NULL, t.due_date, FIELD(t.priority,'urgent','high','medium','low'), t.id
      LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

export async function create(req, res) {
  const b = req.body;
  const { project } = await requireManage(req.user, b.projectId);
  if (b.assigneeId) {
    const [u] = await query('SELECT is_active FROM users WHERE id = ?', [b.assigneeId]);
    if (!u || !u.is_active) throw badRequest('Assignee not found');
  }
  if (b.dependsOnTaskId) {
    const [d] = await query('SELECT project_id FROM tasks WHERE id = ?', [b.dependsOnTaskId]);
    if (!d || d.project_id !== b.projectId) throw badRequest('Dependency must be a task in the same project');
  }
  const id = await withTransaction(async (conn) => {
    const r = await query(
      `INSERT INTO tasks (project_id, title, description, priority, assignee_id, start_date, due_date, depends_on_task_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [b.projectId, b.title, b.description, b.priority, b.assigneeId ?? null, b.startDate ?? null, b.dueDate ?? null, b.dependsOnTaskId ?? null, req.user.id], conn);
    await query('INSERT INTO task_events (task_id, user_id, from_status, to_status, note) VALUES (?,?,NULL,?,?)', [r.insertId, req.user.id, 'todo', 'Task created'], conn);
    if (b.assigneeId) await query('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?,?)', [b.projectId, b.assigneeId], conn);
    return r.insertId;
  });
  if (b.assigneeId && b.assigneeId !== req.user.id) {
    await notify(b.assigneeId, 'task', 'New task assigned', `${b.title} (${project.title})`, '/app/tasks');
  }
  await audit(req, 'task.create', 'task', id, b.title);
  res.status(201).json({ data: { id } });
}

export async function update(req, res) {
  const id = Number(req.params.id);
  const [task] = await query('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) throw notFound('Task not found');
  const { canManage, project } = await projectAccess(req.user, task.project_id);
  const b = req.body;
  const isAssignee = task.assignee_id === req.user.id;
  if (!canManage) {
    // Assignees may only change the status of their own task.
    const keys = Object.keys(b).filter((k) => b[k] !== undefined && k !== 'note');
    if (!isAssignee || keys.some((k) => k !== 'status')) throw forbidden('You can only update the status of tasks assigned to you');
  }
  if (b.assigneeId) {
    const [u] = await query('SELECT is_active FROM users WHERE id = ?', [b.assigneeId]);
    if (!u || !u.is_active) throw badRequest('Assignee not found');
  }
  if (b.status && b.status !== task.status && ['in_progress', 'done'].includes(b.status) && task.depends_on_task_id) {
    const [dep] = await query('SELECT title, status FROM tasks WHERE id = ?', [task.depends_on_task_id]);
    if (dep && dep.status !== 'done') throw conflict(`Finish "${dep.title}" first`);
  }
  const map = { title: 'title', description: 'description', priority: 'priority', status: 'status', assigneeId: 'assignee_id', startDate: 'start_date', dueDate: 'due_date' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
  if (!sets.length) throw badRequest('Nothing to update');
  await withTransaction(async (conn) => {
    await query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id], conn);
    if (b.status && b.status !== task.status) {
      await query('INSERT INTO task_events (task_id, user_id, from_status, to_status, note) VALUES (?,?,?,?,?)', [id, req.user.id, task.status, b.status, b.note ?? null], conn);
    }
    if (b.assigneeId && b.assigneeId !== task.assignee_id) {
      await query('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?,?)', [task.project_id, b.assigneeId], conn);
    }
  });
  if (b.assigneeId && b.assigneeId !== task.assignee_id && b.assigneeId !== req.user.id) {
    await notify(b.assigneeId, 'task', 'New task assigned', `${task.title} (${project.title})`, '/app/tasks');
  }
  if (b.status && b.status !== task.status && project.manager_id && project.manager_id !== req.user.id) {
    await notify(project.manager_id, 'task', `Task ${b.status.replace('_', ' ')}`, `${task.title} (${project.title})`, `/app/projects/${task.project_id}`);
  }
  await audit(req, 'task.update', 'task', id, b.status ? `status=${b.status}` : null);
  res.json({ data: { ok: true } });
}

export async function history(req, res) {
  const id = Number(req.params.id);
  const [task] = await query('SELECT project_id FROM tasks WHERE id = ?', [id]);
  if (!task) throw notFound('Task not found');
  await projectAccess(req.user, task.project_id);
  const rows = await query(
    `SELECT e.id, e.from_status, e.to_status, e.note, e.created_at, u.full_name AS user_name
       FROM task_events e JOIN users u ON u.id = e.user_id WHERE e.task_id = ? ORDER BY e.id DESC`, [id]);
  res.json({ data: camel(rows) });
}

export async function remove(req, res) {
  const id = Number(req.params.id);
  const [task] = await query('SELECT project_id FROM tasks WHERE id = ?', [id]);
  if (!task) throw notFound('Task not found');
  await requireManage(req.user, task.project_id);
  await query('DELETE FROM tasks WHERE id = ?', [id]);
  await audit(req, 'task.delete', 'task', id);
  res.json({ data: { ok: true } });
}
