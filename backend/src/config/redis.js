'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Redis is a performance and coordination layer, not a source of truth. When it
 * is unreachable the app keeps serving: caches miss, and locks fall back to a
 * single-process in-memory lock (documented in services/lock.service.js).
 */

let client = null;
let available = false;

const createClient = () => {
  const redis = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });

  redis.on('ready', () => {
    available = true;
    logger.info('Redis ready');
  });
  redis.on('end', () => {
    available = false;
    logger.warn('Redis connection closed');
  });
  redis.on('error', (err) => {
    available = false;
    logger.warn('Redis error:', err.message);
  });

  return redis;
};

const connectRedis = async () => {
  if (!client) client = createClient();
  try {
    if (client.status === 'wait' || client.status === 'end') await client.connect();
  } catch (err) {
    logger.warn('Redis unavailable, continuing without cache:', err.message);
  }
  return client;
};

const getRedis = () => client;
const isRedisAvailable = () => Boolean(client) && available;

const disconnectRedis = async () => {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
  available = false;
};

module.exports = { connectRedis, getRedis, isRedisAvailable, disconnectRedis };
