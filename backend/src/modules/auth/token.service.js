'use strict';

const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

const ISSUER = 'smart-parking';

const signAccessToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role, ver: user.tokenVersion || 0, type: 'access' },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn, issuer: ISSUER },
  );

const signRefreshToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), ver: user.tokenVersion || 0, type: 'refresh' },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn, issuer: ISSUER },
  );

const verify = (token, secret, expectedType) => {
  let payload;
  try {
    payload = jwt.verify(token, secret, { issuer: ISSUER });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Token expired');
    throw ApiError.unauthorized('Invalid token');
  }
  if (payload.type !== expectedType) throw ApiError.unauthorized('Invalid token type');
  return payload;
};

const verifyAccessToken = (token) => verify(token, env.jwt.accessSecret, 'access');
const verifyRefreshToken = (token) => verify(token, env.jwt.refreshSecret, 'refresh');

const issueTokenPair = (user) => ({
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user),
  expiresIn: env.jwt.accessExpiresIn,
});

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, issueTokenPair };
