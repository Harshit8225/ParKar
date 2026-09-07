'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const authService = require('./auth.service');
const cloudinary = require('../../services/cloudinary.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Account created');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Logged in');
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body);
  return ok(res, result, 'Token refreshed');
});

const me = asyncHandler(async (req, res) => {
  const result = await authService.me(req.user);
  return ok(res, result);
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  return ok(res, { user }, 'Profile updated');
});

const avatarSignature = asyncHandler(async (req, res) => {
  return ok(res, cloudinary.avatarUploadSignature(req.user._id.toString()));
});

const updateAvatar = asyncHandler(async (req, res) => {
  const user = await authService.updateAvatar(req.user, req.body.avatarUrl);
  return ok(res, { user }, 'Profile picture updated');
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user._id, req.body);
  return ok(res, result, 'Password changed');
});

module.exports = { register, login, refresh, me, updateProfile, avatarSignature, updateAvatar, changePassword };
