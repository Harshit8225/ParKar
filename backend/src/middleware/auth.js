'use strict';

const env = require('../config/env');
const { User } = require('../models');
const { ROLES } = require('../models/constants');
const { verifyAccessToken } = require('../modules/auth/token.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const extractBearer = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

/** Requires a valid access token and loads the live user onto req.user. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');
  // A password change or forced logout bumps tokenVersion, retiring old tokens.
  if ((user.tokenVersion || 0) !== (payload.ver || 0)) throw ApiError.unauthorized('Session expired, please log in again');

  req.user = user;
  req.auth = payload;
  next();
});

/** Attaches req.user when a token is present, but never rejects. */
const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user && user.isActive) {
      req.user = user;
      req.auth = payload;
    }
  } catch {
    // Anonymous request - discovery endpoints still work.
  }
  return next();
});

/** Role gate. Use after authenticate. */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));
  if (roles.length && !roles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to perform this action'));
  }
  return next();
};

const requireUser = [authenticate, authorize(ROLES.USER)];
const requireOwner = [authenticate, authorize(ROLES.OWNER)];
const requireAdmin = [authenticate, authorize(ROLES.ADMIN)];
const requireOwnerOrAdmin = [authenticate, authorize(ROLES.OWNER, ROLES.ADMIN)];

/**
 * Gate cameras are unattended devices, not people: they present a shared
 * device key instead of a user token.
 */
const authenticateCamera = (req, _res, next) => {
  const provided = req.headers['x-camera-key'] || req.headers['x-api-key'];
  if (!env.cameraApiKey) return next(ApiError.internal('Camera API key is not configured on the server'));
  if (!provided || provided !== env.cameraApiKey) return next(ApiError.unauthorized('Invalid camera device key'));
  req.cameraDevice = { id: req.headers['x-camera-id'] || 'unknown' };
  return next();
};

/**
 * Entry/exit can be driven either by a gate device or by an authenticated
 * owner/admin operating the panel by hand.
 */
const authenticateCameraOrStaff = (req, res, next) => {
  const provided = req.headers['x-camera-key'] || req.headers['x-api-key'];
  if (provided) return authenticateCamera(req, res, next);
  return authenticate(req, res, (err) => {
    if (err) return next(err);
    return authorize(ROLES.OWNER, ROLES.ADMIN)(req, res, next);
  });
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  requireUser,
  requireOwner,
  requireAdmin,
  requireOwnerOrAdmin,
  authenticateCamera,
  authenticateCameraOrStaff,
};
