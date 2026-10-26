import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/errors.js';
import { parse, id, money, optionalDate, text, paging } from '../utils/helpers.js';
import { ROLES, projectScope, getProject, getManagedProject, canManage, projectUserIds } from '../utils/access.js';
import { audit, notify } from '../utils/audit.js';

const router = Router();
router.use(authenticate);

const FINANCE_ROLES = [ROLES.ADMIN, ROLES.COMPANY, ROLES.PM, ROLES.CLIENT];
const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

const projectSchema = z.object({
  title: text(150).min(3, 'Title must be at least 3 characters'),
  description: text(5000).optional().or(z.literal('')),
  location: text(150).optional().or(z.literal('')),
  category_id: id.optional().nullable(),
  client_id: id.optional().nullable(),
  company_id: id.optional().nullable(),
  manager_id: id.optional().nullable(),
  start_date: optionalDate,
  end_date: optionalDate,
  estimated_budget: money.default(0),
  approved_budget: money.optional(),
  status: z.enum(STATUSES).optional(),
}).refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { path: ['end_date'], message: 'End date must be after the start date' });

async function assertRole(userId, roleCode, field) {
  if (userId == null) return;
  const [u] = await query('SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND r.code=? AND u.is_active=1', [userId, roleCode]);
  if (!u) throw new HttpError(400, 'Invalid selection.', { [field]: `Selected user is not a valid ${roleCode.replace('_', ' ')}` });
}

const SELECT_PROJECT = `
  SELECT p.*, cat.name AS category, cl.full_name AS client_name, mg.full_name AS manager_name, co.name AS company_name,
    (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.project_id=p.id AND e.status='approved') AS spent
  FROM projects p
  LEFT JOIN service_categories cat ON cat.id=p.category_id
  LEFT JOIN users cl ON cl.id=p.client_id
  LEFT JOIN users mg ON mg.id=p.manager_id
  LEFT JOIN companies co ON co.id=p.company_id`;

/** Hide money fields from roles that must not see finances (workers, engineers, suppliers). */
function shape(user, p) {
  if (FINANCE_ROLES.includes(user.role)) return p;
  const { estimated_budget, approved_budget, spent, ...rest } = p; // eslint-disable-line no-unused-vars
  return rest;
}

router.get('/projects', asyncHandler(async (req, res) => {
  const { page, limit, offset } = paging(req.query, 9);
  const scope = projectScope(req.user);
  const where = [scope.sql]; const params = [...scope.params];
  if (req.query.archived !== '1') where.push('p.archived_at IS NULL'); else where.push('p.archived_at IS NOT NULL');
  if (req.query.status && STATUSES.includes(req.query.status)) { where.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.search) { where.push('(p.title LIKE ? OR p.location LIKE ?)'); const s = `%${String(req.query.search).slice(0, 60)}%`; params.push(s, s); }
  const sortMap = { newest: 'p.created_at DESC', deadline: 'p.end_date IS NULL, p.end_date ASC', progress: 'p.progress DESC', title: 'p.title ASC' };
  const order = sortMap[req.query.sort] || sortMap.newest;
  const [{ total }] = await query(`SELECT COUNT(*) total FROM projects p WHERE ${where.join(' AND ')}`, params);
  const rows = await query(`${SELECT_PROJECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows.map((r) => shape(req.user, r)), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.post('/projects', requireRole(ROLES.ADMIN, ROLES.COMPANY, ROLES.PM, ROLES.CLIENT), asyncHandler(async (req, res) => {
  const d = parse(projectSchema, req.body);
  const u = req.user;
  // Ownership and role-sensitive fields are decided by the SERVER, never trusted from the browser.
  let { client_id = null, company_id = null, manager_id = null } = d;
  let approved = d.approved_budget ?? 0;
  if (u.role === ROLES.CLIENT) { client_id = u.id; manager_id = null; approved = 0; }
  if (u.role === ROLES.COMPANY) { company_id = u.company_id; }
  if (u.role === ROLES.PM) { manager_id = u.id; }
  await assertRole(client_id, 'client', 'client_id'); await assertRole(manager_id, 'project_manager', 'manager_id');
  if (company_id) { const [c] = await query('SELECT id FROM companies WHERE id=?', [company_id]); if (!c) throw new HttpError(400, 'Invalid company.', { company_id: 'Company not found' }); }
  const status = u.role === ROLES.CLIENT ? 'planning' : d.status || 'planning';
  const r = await query(
    `INSERT INTO projects (title, description, location, category_id, client_id, company_id, manager_id, created_by, start_date, end_date, estimated_budget, approved_budget, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.title, d.description || null, d.location || null, d.category_id ?? null, client_id, company_id, manager_id, u.id, d.start_date, d.end_date, d.estimated_budget, approved, status]);
  await audit(req, 'project.create', 'project', r.insertId, d.title);
  const [p] = await query(`${SELECT_PROJECT} WHERE p.id = ?`, [r.insertId]);
  if (manager_id && manager_id !== u.id) await notify(manager_id, 'project', 'You were assigned a project', d.title, `/projects/${r.insertId}`);
  res.status(201).json({ data: p });
}));

router.get('/projects/:id', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  await getProject(req.user, pid);
  const [p] = await query(`${SELECT_PROJECT} WHERE p.id = ?`, [pid]);
  const milestones = await query('SELECT * FROM project_milestones WHERE project_id=? ORDER BY due_date IS NULL, due_date', [pid]);
  const members = await query('SELECT u.id, u.full_name, u.email, r.code role FROM project_members m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=u.role_id WHERE m.project_id=?', [pid]);
  const history = await query('SELECT h.id, h.progress, h.note, h.created_at, u.full_name FROM project_progress_updates h JOIN users u ON u.id=h.user_id WHERE h.project_id=? ORDER BY h.created_at DESC, h.id DESC LIMIT 20', [pid]);
  const [tc] = await query(`SELECT COUNT(*) total, SUM(status='done') done, SUM(status<>'done' AND due_date < CURDATE()) overdue FROM tasks WHERE project_id=?`, [pid]);
  const out = shape(req.user, p);
  if (FINANCE_ROLES.includes(req.user.role)) {
    const [pend] = await query(`SELECT COALESCE(SUM(amount),0) pending FROM expenses WHERE project_id=? AND status='pending'`, [pid]);
    out.budget = budgetSummary(p, pend.pending);
  }
  res.json({ data: { ...out, milestones, members, history, task_counts: { total: tc.total, done: Number(tc.done || 0), overdue: Number(tc.overdue || 0) }, can_manage: canManage(req.user, p) } });
}));

export function budgetSummary(p, pending = 0) {
  const base = p.approved_budget > 0 ? p.approved_budget : p.estimated_budget;
  const spent = Number(p.spent);
  return {
    estimated: p.estimated_budget, approved: p.approved_budget, spent, pending: Number(pending),
    remaining: Math.round((base - spent) * 100) / 100,
    percent_used: base > 0 ? Math.round((spent / base) * 1000) / 10 : 0,
    over_budget: base > 0 && spent > base,
  };
}

router.put('/projects/:id', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  const project = await getManagedProject(req.user, pid);
  const d = parse(projectSchema, req.body);
  let { manager_id = project.manager_id, client_id = project.client_id } = d;
  // Only admin/company may reassign the manager or client; PMs cannot hand projects around.
  if (![ROLES.ADMIN, ROLES.COMPANY].includes(req.user.role)) { manager_id = project.manager_id; client_id = project.client_id; }
  await assertRole(manager_id, 'project_manager', 'manager_id'); await assertRole(client_id, 'client', 'client_id');
  await query(
    `UPDATE projects SET title=?, description=?, location=?, category_id=?, client_id=?, manager_id=?, start_date=?, end_date=?, estimated_budget=?, approved_budget=?, status=? WHERE id=?`,
    [d.title, d.description || null, d.location || null, d.category_id ?? null, client_id, manager_id, d.start_date, d.end_date, d.estimated_budget,
      d.approved_budget ?? project.approved_budget, d.status || project.status, pid]);
  await audit(req, 'project.update', 'project', pid);
  if (manager_id && manager_id !== project.manager_id) await notify(manager_id, 'project', 'You were assigned a project', d.title, `/projects/${pid}`);
  const [p] = await query(`${SELECT_PROJECT} WHERE p.id = ?`, [pid]);
  res.json({ data: p });
}));

router.post('/projects/:id/archive', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  await getManagedProject(req.user, pid);
  const restore = req.body?.restore === true;
  await query(`UPDATE projects SET archived_at = ${restore ? 'NULL' : 'NOW()'} WHERE id=?`, [pid]);
  await audit(req, restore ? 'project.restore' : 'project.archive', 'project', pid);
  res.json({ message: restore ? 'Project restored.' : 'Project archived.' });
}));

// ---- Team ----
router.post('/projects/:id/members', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  const project = await getManagedProject(req.user, pid);
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const [u] = await query('SELECT u.id, u.full_name, r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=? AND u.is_active=1', [email]);
  if (!u) throw new HttpError(404, 'No active user with that email.', { email: 'User not found' });
  if (![ROLES.ENGINEER, ROLES.WORKER, ROLES.SUPPLIER, ROLES.PM].includes(u.role)) throw new HttpError(400, 'Only engineers, workers, suppliers or project managers can join a team.', { email: 'Not a team role' });
  await query('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?,?)', [pid, u.id]);
  await notify(u.id, 'project', 'You were added to a project', project.title, `/projects/${pid}`);
  await audit(req, 'project.member_add', 'project', pid, email);
  res.status(201).json({ data: u });
}));

router.delete('/projects/:id/members/:userId', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  await getManagedProject(req.user, pid);
  await query('DELETE FROM project_members WHERE project_id=? AND user_id=?', [pid, parse(id, req.params.userId)]);
  res.json({ message: 'Member removed.' });
}));

// ---- Milestones ----
router.post('/projects/:id/milestones', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  await getManagedProject(req.user, pid);
  const d = parse(z.object({ title: text(150).min(2), due_date: optionalDate }), req.body);
  const r = await query('INSERT INTO project_milestones (project_id, title, due_date) VALUES (?,?,?)', [pid, d.title, d.due_date]);
  res.status(201).json({ data: { id: r.insertId, project_id: pid, title: d.title, due_date: d.due_date, is_done: 0 } });
}));
router.patch('/milestones/:mid', asyncHandler(async (req, res) => {
  const [m] = await query('SELECT * FROM project_milestones WHERE id=?', [parse(id, req.params.mid)]);
  if (!m) throw new HttpError(404, 'Milestone not found.');
  await getManagedProject(req.user, m.project_id);
  await query('UPDATE project_milestones SET is_done = ? WHERE id=?', [req.body?.is_done ? 1 : 0, m.id]);
  res.json({ message: 'Milestone updated.' });
}));
router.delete('/milestones/:mid', asyncHandler(async (req, res) => {
  const [m] = await query('SELECT * FROM project_milestones WHERE id=?', [parse(id, req.params.mid)]);
  if (!m) throw new HttpError(404, 'Milestone not found.');
  await getManagedProject(req.user, m.project_id);
  await query('DELETE FROM project_milestones WHERE id=?', [m.id]);
  res.json({ message: 'Milestone deleted.' });
}));

// ---- Progress ----
router.post('/projects/:id/progress', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id);
  const project = await getProject(req.user, pid);
  const isTechMember = req.user.role === ROLES.ENGINEER;
  if (!canManage(req.user, project) && !isTechMember) throw new HttpError(403, 'You do not have permission to update progress.');
  const d = parse(z.object({ progress: z.coerce.number().int().min(0, 'Min 0').max(100, 'Max 100'), note: text(500).optional().or(z.literal('')) }), req.body);
  await withTransaction(async (conn) => {
    const status = d.progress >= 100 ? 'completed' : project.status === 'planning' && d.progress > 0 ? 'active' : project.status;
    await conn.query('UPDATE projects SET progress=?, status=? WHERE id=?', [d.progress, status, pid]);
    await conn.query('INSERT INTO project_progress_updates (project_id, user_id, progress, note) VALUES (?,?,?,?)', [pid, req.user.id, d.progress, d.note || null]);
  });
  for (const uid of await projectUserIds(project)) if (uid !== req.user.id) await notify(uid, 'progress', `${project.title}: now ${d.progress}% complete`, d.note || null, `/projects/${pid}`);
  res.status(201).json({ message: 'Progress updated.', progress: d.progress });
}));

// ---- Project messages (comments) ----
router.get('/projects/:id/messages', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id); await getProject(req.user, pid);
  const rows = await query('SELECT m.id, m.body, m.created_at, u.full_name, r.code role FROM messages m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=u.role_id WHERE m.project_id=? ORDER BY m.id DESC LIMIT 100', [pid]);
  res.json({ data: rows.reverse() });
}));
router.post('/projects/:id/messages', asyncHandler(async (req, res) => {
  const pid = parse(id, req.params.id); const project = await getProject(req.user, pid);
  const d = parse(z.object({ body: z.string().trim().min(1, 'Write a message').max(2000) }), req.body);
  const r = await query('INSERT INTO messages (project_id, user_id, body) VALUES (?,?,?)', [pid, req.user.id, d.body]);
  for (const uid of await projectUserIds(project)) if (uid !== req.user.id) await notify(uid, 'message', `New message on ${project.title}`, d.body.slice(0, 120), `/projects/${pid}`);
  res.status(201).json({ data: { id: r.insertId, body: d.body, full_name: req.user.full_name, role: req.user.role, created_at: new Date().toISOString() } });
}));

export default router;
