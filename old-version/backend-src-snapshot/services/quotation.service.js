import { lineTotal, sumMoney } from '../utils/money.js';
import { query } from '../db/pool.js';

/** Totals are always computed on the server; any total sent by the browser is ignored. */
export function priceItems(items) {
  const priced = items.map((i) => ({ ...i, lineTotal: lineTotal(i.quantity, i.unitPrice) }));
  return { items: priced, total: sumMoney(priced.map((i) => i.lineTotal)) };
}

export async function insertQuotation(conn, { requestId, providerId, version, validUntil, notes, items }) {
  const { items: priced, total } = priceItems(items);
  const q = await query(
    'INSERT INTO quotations (request_id, provider_id, version, valid_until, notes, total) VALUES (?,?,?,?,?,?)',
    [requestId, providerId, version, validUntil, notes, total], conn);
  for (const i of priced) {
    await query('INSERT INTO quotation_items (quotation_id, kind, description, quantity, unit_price, line_total) VALUES (?,?,?,?,?,?)',
      [q.insertId, i.kind, i.description, i.quantity, i.unitPrice, i.lineTotal], conn);
  }
  return { id: q.insertId, total };
}
