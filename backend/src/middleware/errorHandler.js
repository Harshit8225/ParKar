'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

/** Translate driver/library errors into ApiError before responding. */
const normalizeError = (err) => {
  if (err instanceof ApiError) return err;

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message }));
    return ApiError.unprocessable('Validation failed', details);
  }
  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`A record with this ${field} already exists`);
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'Payload too large');
  }
  if (err.name === 'MulterError') {
    return ApiError.badRequest(`Upload failed: ${err.message}`);
  }
  if (err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Malformed JSON body');
  }

  return new ApiError(err.statusCode || 500, err.message || 'Internal server error');
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  const apiError = normalizeError(err);

  if (apiError.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.stack || err.message);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${apiError.statusCode} ${apiError.message}`);
  }

  const body = {
    success: false,
    message:
      apiError.statusCode >= 500 && env.isProduction ? 'Something went wrong. Please try again.' : apiError.message,
  };
  if (apiError.details) body.details = apiError.details;
  if (!env.isProduction && apiError.statusCode >= 500) body.stack = err.stack;

  res.status(apiError.statusCode).json(body);
};

module.exports = { errorHandler, notFoundHandler };
