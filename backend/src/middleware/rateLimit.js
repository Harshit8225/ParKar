'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
const env = require('../config/env');
const { getRedis, isRedisAvailable } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Redis-backed rate limiting so the quota is shared across instances. When
 * Redis is down express-rate-limit's in-memory store takes over (per-instance,
 * but better than no limit at all).
 */
const buildStore = (prefix) => {
  if (!isRedisAvailable()) return undefined;
  try {
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args) => getRedis().call(...args),
    });
  } catch (err) {
    logger.warn('Falling back to in-memory rate limiting:', err.message);
    return undefined;
  }
};

const makeLimiter = ({ prefix, windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message },
    keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
    store: buildStore(prefix),
    // The limiters are built on first request on purpose (see `lazy` below) so
    // the Redis store is created after Redis has connected. Silence the check
    // that flags construction inside a handler.
    validate: { creationStack: false },
  });

// Built lazily so Redis has finished connecting before the store is created.
const lazy = (factory) => {
  let limiter;
  return (req, res, next) => {
    if (!limiter) limiter = factory();
    return limiter(req, res, next);
  };
};

const globalLimiter = lazy(() =>
  makeLimiter({
    prefix: 'global',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    message: 'Too many requests. Please slow down.',
  }),
);

// Credential endpoints get a much tighter budget to blunt brute-force attempts.
const authLimiter = lazy(() =>
  makeLimiter({
    prefix: 'auth',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.authMax,
    message: 'Too many authentication attempts. Try again later.',
  }),
);

// Each Gemini call costs money, so recognition is limited hard per device.
const recognitionLimiter = lazy(() =>
  makeLimiter({
    prefix: 'recognition',
    windowMs: 60 * 1000,
    max: 30,
    message: 'Recognition rate limit reached for this device.',
  }),
);

const paymentLimiter = lazy(() =>
  makeLimiter({
    prefix: 'payment',
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many payment attempts. Please wait a moment.',
  }),
);

module.exports = { globalLimiter, authLimiter, recognitionLimiter, paymentLimiter };
