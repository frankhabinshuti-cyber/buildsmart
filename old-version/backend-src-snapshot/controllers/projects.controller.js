import { query, withTransaction } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { notFound, badRequest, forbidden } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';
import { visibleProjects, projectAccess, requireManage } from '../services/access.service.js';
import { budgetSummary } from '../services/finance.service.js';

const SORT = { created_at: 'p.created_at', title: 'p.title', planned_end: 'p.planned_end', completion_pct: 'p.completion_pct' };

export async function list(req, res) {
  const { q, status, sort, order, archived } = req.query;
  const { page, limit, offset } = parsePage(req.query);
  const vis = visibleProjects(req.user);
  const where = [vis.sql, archived === 'true' ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL'];
  const params = [...vis.params];
  if (q) { where.push('(p.title LIKE ? OR p.location LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (status) { where.push('p.status = ?'); params.push(status); }
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM projects p WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT p.id, p.title, p.location, p.status, p.completion_pct, p.planned_start, p.planned_end,
            p.estimated_budget, p.approved_budget, p.archived_at,
            cl.full_name AS client_name, mg.full_name AS manager_name, sc.name AS category,
            (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.project_id = p.id AND e.status = 'approved') AS spent
       FROM projects p
       LEFT JOIN users cl ON cl.id = p.client_id
       LEFT JOIN users mg ON mg.id = p.manager_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id
      WHERE ${whereSql}
      ORDER BY ${SORT[sort]} ${order === 'asc' ? 'ASC' : 'DESC'}, p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  res.json({ data: camel(rows), meta: pageMeta(page, limit, total) });
}

async function assertUserRole(id, roles, label) {
  if (!id) return;
  const [u] = await query('SELECT r.code AS role, u.is_active FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [id]);
  if (!u || !u.is_active || !roles.includes(u.role)) throw badRequest(`Selected ${label} is not valid`);
}

export async function create(req, res) {
  const b = req.body;
  await assertUserRole(b.clientId, ['client'], 'client');
  await assertUserRole(b.managerId, ['project_manager', 'company', 'super_admin'], 'manager');
  let companyId = null;
  if (req.user.role === ROLES.COMPANY) {
    const [co] = await query('SELECT id FROM companies WHERE owner_user_id = ?', [req.user.id]);
    companyId = co?.id ?? null;
  }
  const managerId = b.managerId ?? (req.user.role === ROLES.MANAGER ? req.user.id : null);
  const id = await withTransaction(async (conn) => {
    const r = await query(
      `INSERT INTO projects (title, description, location, category_id, client_id, manager_id, company_id, created_by,
                             planned_start, planned_end, estimated_budget, approved_budget, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.title, b.description, b.location, b.categoryId ?? null, b.clientId ?? null, managerId, companyId, req.user.id,
        b.plannedStart ?? null, b.plannedEnd ?? null, b.estimatedBudget, b.approvedBudget ?? '0', b.status ?? 'planning'],
      conn,
    );
    const members = [b.clientId, managerId].filter(Boolean);
    for (const uid of new Set(members)) {
      await query('INSERT IGNORE INTO project_members (project_id, user_id, added_by) VALUES (?,?,?)', [r.insertId, uid, req.user.id], conn);
    }
    return r.insertId;
  });
  if (managerId && managerId !== req.user.id) await notify(managerId, 'project', 'You were assigned a project', b.title, `/app/projects/${id}`);
  if (b.clientId) await notify(b.clientId, 'project', 'A project was created for you', b.title, `/app/projects/${id}`);
  await audit(req, 'project.create', 'project', id, b.title);
  res.status(201).json({ data: { id } });
}

export async function get(req, res) {
  const id = Number(req.params.id);
  const { project: p, canManage } = await projectAccess(req.user, id);
  const [info] = await query(
    `SELECT cl.full_name AS client_name, mg.full_name AS manager_name, sc.name AS category, co.name AS company_name
       FROM projects p LEFT JOIN users cl ON cl.id = p.client_id LEFT JOIN users mg ON mg.id = p.manager_id
       LEFT JOIN service_categories sc ON sc.id = p.category_id LEFT JOIN companies co ON co.id = p.company_id WHERE p.id = ?`, [id]);
  const milestones = await query('SELECT id, title, due_date, status FROM project_milestones WHERE project_id = ? ORDER BY due_date IS NULL, due_date, id', [id]);
  const members = await query(
    `SELECT u.id, u.full_name, r.code AS role FROM project_members pm JOIN users u ON u.id = pm.user_id
       JOIN roles r ON r.id = u.role_id WHERE pm.project_id = ? ORDER BY u.full_name`, [id]);
  const progress = await query(
    `SELECT pu.id, pu.completion_pct, pu.note, pu.created_at, u.full_name AS user_name FROM project_progress_updates pu
       JOIN users u ON u.id = pu.user_id WHERE pu.project_id = ? ORDER BY pu.id DESC LIMIT 20`, [id]);
  const budget = await budgetSummary(id, p);
  const { company_owner_id, is_member, ...project } = p; // eslint-disable-line no-unused-vars
  res.json({ data: camel({ ...project, ...info, canManage, milestones: camel(milestones), members: camel(members), progress: camel(progress), budget }) });
}

export async function update(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  const b = req.body;
  await assertUserRole(b.clientId, ['client'], 'client');
  await assertUserRole(b.managerId, ['project_manager', 'company', 'super_admin'], 'manager');
  const map = {
    title: 'title', description: 'description', location: 'location', categoryId: 'category_id', clientId: 'client_id',
    managerId: 'manager_id', plannedStart: 'planned_start', plannedEnd: 'planned_end', estimatedBudget: 'estimated_budget',
    approvedBudget: 'approved_budget', status: 'status',
  };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
  }
  if (!sets.length) throw badRequest('Nothing to update');
  await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  for (const uid of [b.clientId, b.managerId].filter(Boolean)) {
    await query('INSERT IGNORE INTO project_members (project_id, user_id, added_by) VALUES (?,?,?)', [id, uid, req.user.id]);
  }
  await audit(req, 'project.update', 'project', id, Object.keys(b).join(','));
  res.json({ data: { ok: true } });
}

export async function archive(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  await query('UPDATE projects SET archived_at = UTC_TIMESTAMP() WHERE id = ?', [id]);
  await audit(req, 'project.archive', 'project', id);
  res.json({ data: { ok: true } });
}

export async function restore(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  await query('UPDATE projects SET archived_at = NULL WHERE id = ?', [id]);
  await audit(req, 'project.restore', 'project', id);
  res.json({ data: { ok: true } });
}

export async function addMember(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  const [u] = await query('SELECT id, is_active FROM users WHERE id = ?', [req.body.userId]);
  if (!u || !u.is_active) throw badRequest('User not found');
  await query('INSERT IGNORE INTO project_members (project_id, user_id, added_by) VALUES (?,?,?)', [id, u.id, req.user.id]);
  const [p] = await query('SELECT title FROM projects WHERE id = ?', [id]);
  await notify(u.id, 'project', 'You were added to a project', p.title, `/app/projects/${id}`);
  await audit(req, 'project.add_member', 'project', id, `user=${u.id}`);
  res.status(201).json({ data: { ok: true } });
}

export async function removeMember(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  await query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [id, Number(req.params.userId)]);
  await audit(req, 'project.remove_member', 'project', id, `user=${req.params.userId}`);
  res.json({ data: { ok: true } });
}

export async function addMilestone(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  const r = await query('INSERT INTO project_milestones (project_id, title, due_date, status) VALUES (?,?,?,?)',
    [id, req.body.title, req.body.dueDate ?? null, req.body.status ?? 'pending']);
  res.status(201).json({ data: { id: r.insertId } });
}

export async function updateMilestone(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  const r = await query('UPDATE project_milestones SET title = ?, due_date = ?, status = COALESCE(?, status) WHERE id = ? AND project_id = ?',
    [req.body.title, req.body.dueDate ?? null, req.body.status ?? null, Number(req.params.milestoneId), id]);
  if (!r.affectedRows) throw notFound('Milestone not found');
  res.json({ data: { ok: true } });
}

export async function deleteMilestone(req, res) {
  const id = Number(req.params.id);
  await requireManage(req.user, id);
  await query('DELETE FROM project_milestones WHERE id = ? AND project_id = ?', [Number(req.params.milestoneId), id]);
  res.json({ data: { ok: true } });
}

export async function addProgress(req, res) {
  const id = Number(req.params.id);
  const { project, canManage } = await projectAccess(req.user, id);
  if (!canManage && req.user.role !== ROLES.ENGINEER) throw forbidden('Only managers and engineers can post progress');
  const { completionPct, note } = req.body;
  await withTransaction(async (conn) => {
    await query('INSERT INTO project_progress_updates (project_id, user_id, completion_pct, note) VALUES (?,?,?,?)', [id, req.user.id, completionPct, note], conn);
    let status = project.status;
    if (completionPct === 100) status = 'completed';
    else if (project.status === 'planning' && completionPct > 0) status = 'active';
    else if (project.status === 'completed' && completionPct < 100) status = 'active';
    await query('UPDATE projects SET completion_pct = ?, status = ? WHERE id = ?', [completionPct, status, id], conn);
  });
  for (const uid of new Set([project.client_id, project.manager_id].filter((x) => x && x !== req.user.id))) {
    await notify(uid, 'progress', `Progress update: ${project.title}`, `${completionPct}% complete`, `/app/projects/${id}`);
  }
  await audit(req, 'project.progress', 'project', id, `${completionPct}%`);
  res.status(201).json({ data: { ok: true } });
}

export async function listMessages(req, res) {
  const id = Number(req.params.id);
  await projectAccess(req.user, id);
  const rows = await query(
    `SELECT m.id, m.body, m.created_at, u.full_name AS user_name, r.code AS role FROM project_messages m
       JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = u.role_id WHERE m.project_id = ? ORDER BY m.id DESC LIMIT 50`, [id]);
  res.json({ data: camel(rows).reverse() });
}

export async function postMessage(req, res) {
  const id = Number(req.params.id);
  const { project } = await projectAccess(req.user, id);
  const r = await query('INSERT INTO project_messages (project_id, user_id, body) VALUES (?,?,?)', [id, req.user.id, req.body.body]);
  const members = await query('SELECT user_id FROM project_members WHERE project_id = ?', [id]);
  for (const m of members) {
    if (m.user_id !== req.user.id) await notify(m.user_id, 'message', `New message in ${project.title}`, req.body.body.slice(0, 120), `/app/projects/${id}`);
  }
  res.status(201).json({ data: { id: r.insertId } });
}
