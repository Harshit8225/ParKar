'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Signed direct-to-Cloudinary uploads.
 *
 * The browser uploads the file itself and only the signature comes from here.
 * That keeps the API secret server-side, keeps image bytes off this server, and
 * needs no SDK or multipart handling - just a SHA-1 over the signed params,
 * which is exactly what Cloudinary's REST contract asks for.
 *
 * The signature covers the folder, so an upload cannot be redirected somewhere
 * else in the account, and it expires with its timestamp.
 */

const UPLOAD_EXPIRY_SECONDS = 600;

const isConfigured = () =>
  Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

/**
 * Cloudinary signs the alphabetically ordered params, excluding the file, the
 * api_key, the resource type and the signature itself.
 */
const sign = (params) => {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHash('sha1').update(payload + env.cloudinary.apiSecret).digest('hex');
};

/** Everything the browser needs to POST one avatar straight to Cloudinary. */
const avatarUploadSignature = (userId) => {
  if (!isConfigured()) {
    throw new ApiError(503, 'Image uploads are not configured on this server');
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const signedParams = {
    folder: env.cloudinary.avatarFolder,
    // Cloudinary prepends `folder` to `public_id`, so this is the bare name.
    // One deterministic id per user means a new picture overwrites the old one
    // rather than accumulating orphans in the account.
    public_id: `user-${userId}`,
    overwrite: 'true',
    timestamp,
  };

  return {
    cloudName: env.cloudinary.cloudName,
    apiKey: env.cloudinary.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`,
    params: signedParams,
    signature: sign(signedParams),
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
  };
};

module.exports = { isConfigured, avatarUploadSignature };
