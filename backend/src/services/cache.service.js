'use strict';

const { getRedis, isRedisAvailable } = require('../config/redis');
const logger = require('../utils/logger');

const KEYS = {
  lotAvailability: (lotId) => `parking:availability:${lotId}`,
  lotDetail: (lotId) => `parking:lot:${lotId}`,
  lotSearch: (hash) => `parking:search:${hash}`,
  ownerAnalytics: (ownerId, range) => `analytics:owner:${ownerId}:${range}`,
  platformAnalytics: (range) => `analytics:platform:${range}`,
};

const TTL = {
  availability: 30,
  lotDetail: 300,
  search: 60,
  analytics: 120,
};

const get = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    const raw = await getRedis().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.debug('cache get failed', key, err.message);
    return null;
  }
};

const set = async (key, value, ttlSeconds = 60) => {
  if (!isRedisAvailable()) return false;
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (err) {
    logger.debug('cache set failed', key, err.message);
    return false;
  }
};

const del = async (...keys) => {
  if (!isRedisAvailable() || !keys.length) return 0;
  try {
    return await getRedis().del(...keys);
  } catch (err) {
    logger.debug('cache del failed', err.message);
    return 0;
  }
};

/** Delete by pattern using SCAN so a large keyspace is never blocked. */
const delByPattern = async (pattern) => {
  if (!isRedisAvailable()) return 0;
  const redis = getRedis();
  let cursor = '0';
  let removed = 0;
  try {
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) removed += await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.debug('cache scan failed', pattern, err.message);
  }
  return removed;
};

/** Read-through helper: return the cached value or compute, store and return it. */
const remember = async (key, ttlSeconds, producer) => {
  const cached = await get(key);
  if (cached !== null) return cached;
  const value = await producer();
  if (value !== undefined && value !== null) await set(key, value, ttlSeconds);
  return value;
};

/** Drop every cache entry that a change to one lot could have made stale. */
const invalidateLot = async (lotId) => {
  await del(KEYS.lotAvailability(lotId), KEYS.lotDetail(lotId));
  await delByPattern('parking:search:*');
};

module.exports = { KEYS, TTL, get, set, del, delByPattern, remember, invalidateLot };
