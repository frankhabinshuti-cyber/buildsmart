/**
 * Money helpers. Floating point is never used for money (0.1 + 0.2 !== 0.3).
 * Amounts are handled as BigInt "cents" and converted to/from exact strings like "1680000.00".
 */

/** "12.5" -> 1250n. Accepts strings or numbers with at most 2 decimals. */
export function toCents(value) {
  const text = String(value ?? '0').trim();
  const neg = text.startsWith('-');
  const [whole, frac = ''] = text.replace('-', '').split('.');
  const cents = BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  return neg ? -cents : cents;
}

/** 1250n -> "12.50" */
export function fromCents(cents) {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const s = abs.toString().padStart(3, '0');
  return `${neg ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** quantity (up to 3 decimals) x unit price (2 decimals) -> exact total string, rounded half up to the cent. */
export function lineTotal(quantity, unitPrice) {
  const text = String(quantity).trim();
  const [w, f = ''] = text.split('.');
  const milli = BigInt(w || '0') * 1000n + BigInt((f + '000').slice(0, 3));
  const product = milli * toCents(unitPrice); // thousandths of a cent
  return fromCents((product + 500n) / 1000n);
}

export const sumMoney = (list) => fromCents(list.reduce((sum, v) => sum + toCents(v), 0n));

/** Valid, non-negative money text with at most 2 decimals. */
export const isMoney = (v) => /^\d{1,12}(\.\d{1,2})?$/.test(String(v));
/** Valid, non-negative quantity text with at most 3 decimals. */
export const isQty = (v) => /^\d{1,11}(\.\d{1,3})?$/.test(String(v));
