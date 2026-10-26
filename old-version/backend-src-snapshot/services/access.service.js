import { query } from '../db/pool.js';
import { ROLES } from '../middleware/auth.js';
import { notFound, forbidden } from '../utils/errors.js';

/** SQL fragment + params limiting a projects query (alias p) to what this user may see. */
export function visibleProjects(user, alias = 'p') {
  if (user.role === ROLES.ADMIN) return { sql: '1=1', params: [] };
  const a = alias;
  return {
    sql: `(${a}.client_id = ? OR ${a}.manager_id = ? OR ${a}.created_by = ?
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${a}.id AND pm.user_id = ?)
      OR EXISTS (SELECT 1 FROM companies co WHERE co.id = ${a}.company_id AND co.owner_user_id = ?))`,
    params: [user.id, user.id, user.id, user.id, user.id],
  };
}

/**
 * Loads a project and works out what this user may do with it.
 * Throws 404 when the user cannot even see it (so IDs of other people's projects are not revealed).
 */
export async function projectAccess(user, projectId, conn) {
  const rows = await query(
    `SELECT p.*, co.owner_user_id AS company_owner_id,
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?) AS is_member
       FROM projects p LEFT JOIN companies co ON co.id = p.company_id WHERE p.id = ?`,
    [user.id, projectId],
    conn,
  );
  const p = rows[0];
  if (!p) throw notFound('Project not found');
  const isAdmin = user.role === ROLES.ADMIN;
  const canManage = isAdmin || p.manager_id === user.id || p.created_by === user.id || p.company_owner_id === user.id;
  const canView = canManage || p.client_id === user.id || !!p.is_member;
  if (!canView) throw notFound('Project not found');
  return { project: p, canManage, canView, isAdmin };
}

export async function requireManage(user, projectId, conn) {
  const acc = await projectAccess(user, projectId, conn);
  if (!acc.canManage) throw forbidden('Only the project manager or owner can do this');
  return acc;
}
