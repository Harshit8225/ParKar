'use strict';

const crypto = require('crypto');
const { getRedis, isRedisAvailable } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Redis distributed lock (SET NX PX + token-checked release).
 *
 * This is what stops two drivers from taking the same last slot: capacity is
 * read and decremented inside the lock, so the check and the write cannot
 * interleave across processes.
 *
 * When Redis is down we degrade to a process-local lock. That still serialises
 * requests inside one Node instance, which is correct for single-instance
 * development; a multi-instance deployment needs Redis to be up for the
 * guarantee to hold, so the fallback is logged loudly.
 */

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end`;

const localLocks = new Map(); // key -> Promise chain tail

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireRedisLock = async (key, ttlMs, { retries, retryDelayMs }) => {
  const redis = getRedis();
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      return async () => {
        try {
          await redis.eval(RELEASE_SCRIPT, 1, key, token);
        } catch (err) {
          logger.warn('lock release failed', key, err.message);
        }
      };
    }
    if (attempt < retries) await sleep(retryDelayMs);
  }
  return null;
};

const acquireLocalLock = async (key) => {
  const previous = localLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  localLocks.set(
    key,
    previous.then(() => current),
  );
  await previous;
  return () => {
    release();
    // Only clear when nobody queued behind us.
    if (localLocks.get(key) === current) localLocks.delete(key);
  };
};

/**
 * Run `task` while holding `key`. Throws 409 when the lock cannot be taken so
 * the caller can tell the user to retry rather than double-booking a slot.
 */
const withLock = async (key, task, { ttlMs = 5000, retries = 20, retryDelayMs = 100 } = {}) => {
  const namespaced = `lock:${key}`;

  if (isRedisAvailable()) {
    const release = await acquireRedisLock(namespaced, ttlMs, { retries, retryDelayMs });
    if (!release) {
      throw ApiError.conflict('This parking is busy right now. Please retry in a moment.');
    }
    try {
      return await task();
    } finally {
      await release();
    }
  }

  logger.warn(`Redis unavailable - using in-process lock for ${namespaced}`);
  const release = await acquireLocalLock(namespaced);
  try {
    return await task();
  } finally {
    release();
  }
};

const lotCapacityLock = (lotId) => `lot:capacity:${lotId}`;
const sessionLock = (plate, lotId) => `session:${lotId}:${plate}`;

module.exports = { withLock, lotCapacityLock, sessionLock };
