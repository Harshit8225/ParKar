'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { ROLES } = require('./constants');

const userSchema = new mongoose.Schema(
  {
    // `name` stays the canonical display name every other module reads. The
    // split parts are what the profile form edits, and `name` is recomputed
    // from them on save so the two can never drift.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    firstName: { type: String, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    // Stored uppercase without separators, the way Indian DLs are quoted.
    drivingLicenseNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    avatarUrl: { type: String, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER, index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
    // Bumped on password change / forced logout so old refresh tokens stop working.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** Split a legacy single `name` into parts, for accounts created before this. */
const splitName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

// Keep `name` in step with the parts, in whichever direction was edited.
userSchema.pre('save', function syncNames(next) {
  if (this.isModified('firstName') || this.isModified('lastName')) {
    // Accounts predating these fields have only `name` stored, so editing one
    // part must fall back to the old full name for the other - otherwise
    // patching just the first name would silently erase the surname.
    const derived = splitName(this.name);
    this.firstName = this.firstName || derived.firstName;
    this.lastName = this.lastName || derived.lastName;

    const combined = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
    if (combined) this.name = combined;
  } else if ((this.isModified('name') || this.isNew) && !this.firstName && !this.lastName) {
    const { firstName, lastName } = splitName(this.name);
    this.firstName = firstName;
    this.lastName = lastName;
  }
  next();
});

userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, env.bcryptSaltRounds);
};

userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/** Fields a driver is expected to fill in before their profile counts as done. */
const REQUIRED_PROFILE_FIELDS = ['firstName', 'lastName', 'phone', 'drivingLicenseNumber', 'avatarUrl'];

userSchema.methods.toPublic = function toPublic() {
  // Older accounts predate the split fields, so derive them for display.
  const derived = splitName(this.name);
  const firstName = this.firstName || derived.firstName;
  const lastName = this.lastName || derived.lastName;

  const missingProfileFields = REQUIRED_PROFILE_FIELDS.filter((field) => {
    if (field === 'firstName') return !firstName;
    if (field === 'lastName') return !lastName;
    return !this[field];
  });

  return {
    id: this._id.toString(),
    name: this.name,
    firstName,
    lastName,
    email: this.email,
    phone: this.phone,
    drivingLicenseNumber: this.drivingLicenseNumber,
    avatarUrl: this.avatarUrl,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
    // Drives the "finish your profile" banner, so the client never has to
    // duplicate the definition of "complete".
    missingProfileFields,
    profileComplete: missingProfileFields.length === 0,
  };
};

module.exports = mongoose.model('User', userSchema);
