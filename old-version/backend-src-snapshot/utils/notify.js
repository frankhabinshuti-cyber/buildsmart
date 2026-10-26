import { query } from '../db/pool.js';

export async function notify(userId, type, title, body = null, link = null, conn) {
  if (!userId) return;
  await query(
    'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)',
    [userId, type, title, body, link],
    conn,
  );
}
