/** Validate req.body / req.query with a Zod schema; replaces them with the cleaned values. */
const body = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};

const queryParams = (schema) => (req, _res, next) => {
  req.validatedQuery = schema.parse(req.query ?? {});
  next();
};

module.exports = { body, queryParams };
