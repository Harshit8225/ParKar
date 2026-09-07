'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const { globalLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');
const logger = require('./utils/logger');
const routes = require('./routes');
const paymentController = require('./modules/payment/payment.controller');

const createApp = () => {
  const app = express();

  // Behind Nginx, so trust one hop of proxy headers for correct client IPs
  // (which the rate limiter keys on).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // the API serves JSON; the SPA sets its own CSP
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin and non-browser callers (curl, gate devices) send no Origin.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, `Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Camera-Key', 'X-Camera-Id', 'X-Razorpay-Signature'],
      maxAge: 86400,
    }),
  );

  app.use(compression());

  if (!env.isTest) {
    app.use(
      morgan(env.isProduction ? 'combined' : 'dev', {
        stream: { write: (message) => logger.info(message.trim()) },
        skip: (req) => req.path === `${env.apiPrefix}/health`,
      }),
    );
  }

  /**
   * The Razorpay webhook is mounted before the JSON parser: its signature
   * covers the exact raw bytes, so the body must not be reserialised first.
   */
  app.post(
    `${env.apiPrefix}/payments/webhook`,
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req, _res, next) => {
      req.rawBody = req.body.toString('utf8');
      next();
    },
    paymentController.webhook,
  );

  // Base64 gate captures can be large, hence the generous JSON limit.
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(env.apiPrefix, globalLimiter, routes);

  // Redirect bare / to the API index so a misconfigured proxy is obvious.
  app.get('/', (_req, res) => res.redirect(env.apiPrefix));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
