import { query } from '../db/pool.js';

/** Record a sensitive action. Never throws: auditing must not break the request. */
export async function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    await query('INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?)',
      [req?.user?.id ?? null, action, entity, entityId, details ? String(details).slice(0, 500) : null, req?.ip ?? null]);
  } catch (e) { console.error('audit failed', e.message); }
}

export async function notify(userId, type, title, body = null, link = null) {
  if (!userId) return;
  try {
    await query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', [userId, type, title, body, link]);
  } catch (e) { console.error('notify failed', e.message); }
}
