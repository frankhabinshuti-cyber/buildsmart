import { query, withTransaction } from '../db/pool.js';
import { camel } from '../utils/camel.js';
import { audit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';
import { notFound, forbidden, conflict } from '../utils/errors.js';
import { ROLES } from '../middleware/auth.js';
import { insertQuotation } from '../services/quotation.service.js';

const EFFECTIVE = `CASE WHEN q.status = 'submitted' AND q.valid_until < UTC_DATE() THEN 'expired' ELSE q.status END`;

export async function listRequests(req, res) {
  const isClient = req.user.role === ROLES.CLIENT;
  const isAdmin = req.user.role === ROLES.ADMIN;
  const where = isClient ? 'r.client_id = ?' : isAdmin ? '1=1' : "r.status = 'open'";
  const params = isClient ? [req.user.id] : [];
  const rows = await query(
    `SELECT r.id, r.title, r.description, r.location, r.budget_hint, r.status, r.created_at, sc.name AS category, c.full_name AS client_name,
            (SELECT COUNT(*) FROM quotations q WHERE q.request_id = r.id AND q.status <> 'superseded') AS quotation_count,
            (SELECT q.id FROM quotations q WHERE q.request_id = r.id AND q.provider_id = ? AND q.status <> 'superseded' ORDER BY q.version DESC LIMIT 1) AS my_quotation_id
       FROM quotation_requests r JOIN users c ON c.id = r.client_id LEFT JOIN service_categories sc ON sc.id = r.category_id
      WHERE ${where} ORDER BY r.id DESC LIMIT 100`, [req.user.id, ...params]);
  res.json({ data: camel(rows) });
}

export async function createRequest(req, res) {
  const b = req.body;
  const r = await query('INSERT INTO quotation_requests (client_id, category_id, title, description, location, budget_hint) VALUES (?,?,?,?,?,?)',
    [req.user.id, b.categoryId ?? null, b.title, b.description, b.location, b.budgetHint ?? null]);
  await audit(req, 'quotation_request.create', 'quotation_request', r.insertId, b.title);
  res.status(201).json({ data: { id: r.insertId } });
}

async function itemsFor(ids) {
  if (!ids.length) return {};
  const rows = await query('SELECT quotation_id, item_type AS kind, description, quantity, unit_price, line_total FROM quotation_items WHERE quotation_id IN (?) ORDER BY id', [ids]);
  const map = {};
  for (const r of rows) (map[r.quotation_id] ||= []).push(camel(r));
  return map;
}

export async function getRequest(req, res) {
  const id = Number(req.params.id);
  const [r] = await query(
    `SELECT r.*, sc.name AS category, c.full_name AS client_name FROM quotation_requests r
       JOIN users c ON c.id = r.client_id LEFT JOIN service_categories sc ON sc.id = r.category_id WHERE r.id = ?`, [id]);
  if (!r) throw notFound('Request not found');
  const isOwner = r.client_id === req.user.id;
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isOwner && !isAdmin && (req.user.role === ROLES.CLIENT || r.status !== 'open')) {
    // Providers may view open requests and anything they quoted on.
    const [mine] = await query('SELECT id FROM quotations WHERE request_id = ? AND provider_id = ? LIMIT 1', [id, req.user.id]);
    if (!mine) throw notFound('Request not found');
  }
  const see = isOwner || isAdmin ? '' : 'AND q.provider_id = ?';
  const quotes = await query(
    `SELECT q.id, q.provider_id, q.version, ${EFFECTIVE} AS status, q.valid_until, q.total, q.notes, q.created_at,
            u.full_name AS provider_name, co.name AS company_name
       FROM quotations q JOIN users u ON u.id = q.provider_id LEFT JOIN companies co ON co.owner_id = q.provider_id
      WHERE q.request_id = ? ${see} ORDER BY q.provider_id, q.version DESC`, see ? [id, req.user.id] : [id]);
  const items = await itemsFor(quotes.map((q) => q.id));
  const data = camel(quotes).map((q) => ({ ...q, items: items[q.id] || [] }));
  // The client mainly cares about the current version from each provider; older versions stay available for history.
  res.json({ data: { ...camel(r), isOwner, quotations: data } });
}

export async function submitQuotation(req, res) {
  const requestId = Number(req.params.id);
  const { validUntil, notes, items } = req.body;
  const out = await withTransaction(async (conn) => {
    const [r] = await query('SELECT * FROM quotation_requests WHERE id = ? FOR UPDATE', [requestId], conn);
    if (!r) throw notFound('Request not found');
    if (r.status !== 'open') throw conflict('This request is no longer open');
    const [last] = await query('SELECT id, version, status FROM quotations WHERE request_id = ? AND provider_id = ? ORDER BY version DESC LIMIT 1', [requestId, req.user.id], conn);
    let version = 1;
    if (last) {
      if (last.status === 'accepted') throw conflict('Your quotation was already accepted');
      // Submitting again creates a new version; the old one is kept as history.
      await query("UPDATE quotations SET status = 'superseded' WHERE id = ? AND status = 'submitted'", [last.id], conn);
      version = last.version + 1;
    }
    const q = await insertQuotation(conn, { requestId, providerId: req.user.id, version, validUntil, notes, items });
    return { ...q, version, request: r };
  });
  await notify(out.request.client_id, 'quotation', 'New quotation received', `${out.request.title} - total ${out.total}`, `/app/quotations/${requestId}`);
  await audit(req, 'quotation.submit', 'quotation', out.id, `v${out.version} total=${out.total}`);
  res.status(201).json({ data: { id: out.id, version: out.version, total: out.total } });
}

async function loadForDecision(req) {
  const id = Number(req.params.id);
  const [q] = await query(
    `SELECT q.*, r.client_id, r.title AS request_title FROM quotations q JOIN quotation_requests r ON r.id = q.request_id WHERE q.id = ?`, [id]);
  if (!q) throw notFound('Quotation not found');
  if (q.client_id !== req.user.id && req.user.role !== ROLES.ADMIN) throw forbidden('Only the client who asked for this quotation can decide');
  return q;
}

export async function accept(req, res) {
  const q = await loadForDecision(req);
  const winners = await withTransaction(async (conn) => {
    await query('SELECT id FROM quotation_requests WHERE id = ? FOR UPDATE', [q.request_id], conn);
    const [cur] = await query('SELECT status, valid_until FROM quotations WHERE id = ?', [q.id], conn);
    if (cur.status !== 'submitted') throw conflict(`This quotation is ${cur.status}`);
    if (cur.valid_until < new Date().toISOString().slice(0, 10)) throw conflict('This quotation has expired');
    const [open] = await query("SELECT status FROM quotation_requests WHERE id = ?", [q.request_id], conn);
    if (open.status !== 'open') throw conflict('This request has already been awarded');
    await query("UPDATE quotations SET status = 'accepted', decided_at = UTC_TIMESTAMP() WHERE id = ?", [q.id], conn);
    const others = await query("SELECT DISTINCT provider_id FROM quotations WHERE request_id = ? AND id <> ? AND status = 'submitted'", [q.request_id, q.id], conn);
    await query("UPDATE quotations SET status = 'rejected', decided_at = UTC_TIMESTAMP() WHERE request_id = ? AND id <> ? AND status = 'submitted'", [q.request_id, q.id], conn);
    await query("UPDATE quotation_requests SET status = 'awarded' WHERE id = ?", [q.request_id], conn);
    return others;
  });
  await notify(q.provider_id, 'quotation', 'Your quotation was accepted', q.request_title, `/app/quotations/${q.request_id}`);
  for (const o of winners) await notify(o.provider_id, 'quotation', 'Quotation not selected', q.request_title, `/app/quotations/${q.request_id}`);
  await audit(req, 'quotation.accept', 'quotation', q.id, `total=${q.total}`);
  res.json({ data: { ok: true } });
}

export async function reject(req, res) {
  const q = await loadForDecision(req);
  const r = await query("UPDATE quotations SET status = 'rejected', decided_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'submitted'", [q.id]);
  if (!r.affectedRows) throw conflict(`This quotation is ${q.status}`);
  await notify(q.provider_id, 'quotation', 'Your quotation was declined', q.request_title, `/app/quotations/${q.request_id}`);
  await audit(req, 'quotation.reject', 'quotation', q.id);
  res.json({ data: { ok: true } });
}
