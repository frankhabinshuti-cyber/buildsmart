/** validate(schema) checks req.body; validate(schema, 'query') checks req.query. Failures become 422 with per-field messages. */
import { AppError } from '../utils/errors.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!details[key]) details[key] = issue.message;
    }
    return next(new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', details));
  }
  req[source] = result.data; // only cleaned, known fields continue
  next();
};
