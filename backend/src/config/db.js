'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

let connectPromise = null;

const connectDatabase = async () => {
  if (connectPromise) return connectPromise;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err.message));

  connectPromise = mongoose
    .connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
      autoIndex: !env.isProduction,
    })
    .then(() => mongoose.connection);

  return connectPromise;
};

const disconnectDatabase = async () => {
  connectPromise = null;
  await mongoose.connection.close();
};

module.exports = { connectDatabase, disconnectDatabase, mongoose };
