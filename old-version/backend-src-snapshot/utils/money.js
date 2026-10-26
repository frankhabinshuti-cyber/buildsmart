/**
 * Money helpers. We never add decimals with floating point (0.1 + 0.2 !== 0.3).
 * Instead we convert to whole cents (integers), calculate, and convert back.
 */
const { badRequest } = require('./errors');

function toCents(value, label = 'Amount') {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw badRequest(`${label} must be a positive number with at most 2 decimals.`);
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

const fromCents = (cents) => (cents / 100).toFixed(2);

/** quantity can have up to 3 decimals; price in cents; returns rounded line total in cents */
function lineTotalCents(quantity, unitPriceCents) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw badRequest('Quantity must be greater than zero.');
  return Math.round(q * unitPriceCents);
}

/** Calculate subtotal, tax and total for a list of items on the SERVER (never trust client totals). */
function calculateTotals(items, taxRatePercent = 0) {
  const lines = items.map((it) => {
    const unitCents = toCents(it.unit_price, 'Unit price');
    const total = lineTotalCents(it.quantity, unitCents);
    return { ...it, unit_price: fromCents(unitCents), line_total: fromCents(total), _total: total };
  });
  const subtotal = lines.reduce((s, l) => s + l._total, 0);
  const tax = Math.round((subtotal * Number(taxRatePercent)) / 100);
  return {
    lines: lines.map(({ _total, ...rest }) => rest),
    subtotal: fromCents(subtotal),
    tax_amount: fromCents(tax),
    total: fromCents(subtotal + tax),
    totalCents: subtotal + tax,
  };
}

module.exports = { toCents, fromCents, lineTotalCents, calculateTotals };
