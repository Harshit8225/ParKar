'use strict';

const { Router } = require('express');
const mongoose = require('mongoose');
const { isRedisAvailable } = require('./config/redis');
const env = require('./config/env');
const gemini = require('./services/gemini.service');
const razorpay = require('./services/razorpay.service');

/**
 * Module router table. Every entry is a logical module of the monolith - they
 * share one process and one database, but nothing reaches across a module
 * boundary except through its service layer.
 */
const modules = [
  { path: '/auth', router: require('./modules/auth/auth.routes') },
  { path: '/users', router: require('./modules/users/users.routes') },
  { path: '/parking', router: require('./modules/parking/parking.routes') },
  { path: '/geo', router: require('./modules/geo/geo.routes') },
  { path: '/pricing', router: require('./modules/pricing/pricing.routes') },
  { path: '/bookings', router: require('./modules/booking/booking.routes') },
  { path: '/sessions', router: require('./modules/session/session.routes') },
  { path: '/payments', router: require('./modules/payment/payment.routes') },
  { path: '/recognition', router: require('./modules/recognition/recognition.routes') },
  { path: '/analytics', router: require('./modules/analytics/analytics.routes') },
  { path: '/admin', router: require('./modules/admin/admin.routes') },
];

const router = Router();

/** Liveness + dependency status. Deliberately unauthenticated and cheap. */
router.get('/health', (_req, res) => {
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const mongoUp = mongoose.connection.readyState === 1;

  res.status(mongoUp ? 200 : 503).json({
    success: mongoUp,
    status: mongoUp ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: {
      mongodb: mongoStates[mongoose.connection.readyState] || 'unknown',
      // Redis is optional: caching and locking degrade, the API keeps serving.
      redis: isRedisAvailable() ? 'connected' : 'unavailable',
      gemini: gemini.isConfigured() ? 'configured' : 'not_configured',
      razorpay: razorpay.isConfigured() ? 'configured' : 'mock_mode',
    },
  });
});

/** Self-describing index, handy while developing against the API. */
router.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'ParKar Management System API',
    version: '1.0.0',
    architecture: 'modular monolith',
    modules: modules.map((module) => `${env.apiPrefix}${module.path}`),
  });
});

modules.forEach(({ path, router: moduleRouter }) => router.use(path, moduleRouter));

module.exports = router;
