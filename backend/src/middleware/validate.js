'use strict';

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

/**
 * Validates and REPLACES the request part with the parsed value, so handlers
 * only ever see coerced, stripped data - unknown keys never reach a model.
 */
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const part of ['body', 'query', 'params']) {
      if (!schemas[part]) continue;
      const parsed = schemas[part].parse(req[part]);
      if (part === 'query') {
        // Express 4 exposes req.query via a getter; mutate in place instead.
        Object.keys(req.query).forEach((key) => delete req.query[key]);
        Object.assign(req.query, parsed);
      } else {
        req[part] = parsed;
      }
    }
    return next();
  } catch (err) {
    if (err instanceof ZodError) {
      return next(ApiError.unprocessable('Validation failed', formatIssues(err)));
    }
    return next(err);
  }
};

module.exports = { validate, formatIssues };
