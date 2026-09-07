'use strict';

const { User, ParkingOwner } = require('../../models');
const { ROLES } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const { issueTokenPair, verifyRefreshToken } = require('./token.service');

/**
 * Create an account. Owners additionally get a ParkingOwner business profile,
 * which the platform admin verifies before their lots can be approved.
 */
const register = async ({ name, email, password, phone, role, businessName, gstNumber, address }) => {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const user = new User({ name, email, phone, role });
  await user.setPassword(password);
  await user.save();

  let ownerProfile = null;
  if (role === ROLES.OWNER) {
    ownerProfile = await ParkingOwner.create({
      user: user._id,
      businessName: businessName || name,
      contactEmail: email,
      contactPhone: phone,
      gstNumber,
      address,
    });
  }

  return {
    user: user.toPublic(),
    ownerProfile: ownerProfile ? ownerProfile.toObject() : null,
    tokens: issueTokenPair(user),
  };
};

const login = async ({ email, password }) => {
  // Password is select:false on the model, so ask for it explicitly.
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password - do not leak which accounts exist.
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const valid = await user.verifyPassword(password);
  if (!valid) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save();

  const result = { user: user.toPublic(), tokens: issueTokenPair(user) };

  if (user.role === ROLES.OWNER) {
    const ownerProfile = await ParkingOwner.findOne({ user: user._id }).lean();
    result.ownerProfile = ownerProfile || null;
  }

  return result;
};

const refresh = async ({ refreshToken }) => {
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Session is no longer valid');
  if ((user.tokenVersion || 0) !== (payload.ver || 0)) throw ApiError.unauthorized('Session expired, please log in again');

  return { user: user.toPublic(), tokens: issueTokenPair(user) };
};

const me = async (user) => {
  const result = { user: user.toPublic() };
  if (user.role === ROLES.OWNER) {
    result.ownerProfile = await ParkingOwner.findOne({ user: user._id }).lean();
  }
  return result;
};

const updateProfile = async (user, updates) => {
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.phone !== undefined) user.phone = updates.phone;
  await user.save();
  return user.toPublic();
};

/** Changing the password bumps tokenVersion, invalidating every issued token. */
const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');

  const valid = await user.verifyPassword(currentPassword);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  await user.setPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // Hand back a fresh pair so the caller is not logged out by their own change.
  return { tokens: issueTokenPair(user) };
};

module.exports = { register, login, refresh, me, updateProfile, changePassword };
