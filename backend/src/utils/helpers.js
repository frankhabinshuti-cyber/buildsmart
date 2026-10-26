import { z } from 'zod';
import { HttpError } from './errors.js';

/** Validate req data against a zod schema. Throws a 400 with readable field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || 'body'] = issue.message;
    throw new HttpError(400, 'Please correct the highlighted fields.', fields);
  }
  return result.data;
}

export const id = z.coerce.number().int().positive();
export const money = z.coerce.number({ invalid_type_error: 'Must be a number' }).min(0, 'Cannot be negative').max(100000000000, 'Too large').transform((n) => Math.round(n * 100) / 100);
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
export const optionalDate = z.union([dateStr, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v || null);
export const text = (max) => z.string().trim().max(max);

/** Pagination helper: ?page=1&limit=10 */
export function paging(q, defaultLimit = 10) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
