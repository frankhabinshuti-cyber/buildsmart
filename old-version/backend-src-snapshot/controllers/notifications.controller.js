import { query } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { parsePage, pageMeta } from '../utils/pagination.js';

export async function list(req, res) {
  const { page, limit, offset } = parsePage(req.query);
  const [{ total, unread }] = await query('SELECT COUNT(*) AS total, COALESCE(SUM(is_read = 0),0) AS unread FROM notifications WHERE user_id = ?', [req.user.id]);
  const rows = await query('SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [req.user.id, limit, offset]);
  res.json({ data: camel(rows), meta: { ...pageMeta(page, limit, total), unread: Number(unread) } });
}
export async function unreadCount(req, res) {
  const [{ unread }] = await query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ data: { unread } });
}
export async function markRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ data: { ok: true } });
}
export async function markAllRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ data: { ok: true } });
}
