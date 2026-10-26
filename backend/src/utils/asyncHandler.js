// Express 4 does not catch errors thrown in async handlers; this wrapper forwards them.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
