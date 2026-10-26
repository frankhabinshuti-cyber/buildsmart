import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

export const ROLES = {
  ADMIN: 'super_admin', COMPANY: 'company', PM: 'project_manager', CLIENT: 'client',
  ENGINEER: 'engineer_architect', WORKER: 'worker', SUPPLIER: 'supplier',
};

/** SQL fragment limiting `projects p` rows to those the user may see. Server-side data scoping. */
export function projectScope(user) {
  switch (user.role) {
    case ROLES.ADMIN: return { sql: '1=1', params: [] };
    case ROLES.CLIENT: return { sql: 'p.client_id = ?', params: [user.id] };
    case ROLES.COMPANY: return { sql: 'p.company_id = ?', params: [user.company_id ?? -1] };
    case ROLES.PM:
      return { sql: '(p.manager_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?))', params: [user.id, user.id] };
    default:
      return { sql: 'EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?)', params: [user.id] };
  }
}

/** Load a project only if the user is allowed to see it; otherwise 404 (do not reveal it exists). */
export async function getProject(user, projectId) {
  const scope = projectScope(user);
  const rows = await query(`SELECT p.* FROM projects p WHERE p.id = ? AND ${scope.sql}`, [projectId, ...scope.params]);
  if (!rows.length) throw new HttpError(404, 'Project not found.');
  return rows[0];
}

/** Who may change a project's data (budget, tasks, team, expenses approval). */
export function canManage(user, project) {
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.PM && project.manager_id === user.id) return true;
  if (user.role === ROLES.COMPANY && project.company_id && project.company_id === user.company_id) return true;
  return false;
}

export async function getManagedProject(user, projectId) {
  const project = await getProject(user, projectId);
  if (!canManage(user, project)) throw new HttpError(403, 'You do not have permission to change this project.');
  return project;
}

/** User ids that belong to a project (for notifications). */
export async function projectUserIds(project) {
  const rows = await query('SELECT user_id FROM project_members WHERE project_id = ?', [project.id]);
  const ids = new Set(rows.map((r) => r.user_id));
  [project.client_id, project.manager_id].forEach((x) => x && ids.add(x));
  if (project.company_id) {
    const [c] = await query('SELECT owner_id FROM companies WHERE id = ?', [project.company_id]);
    if (c) ids.add(c.owner_id);
  }
  return [...ids];
}
