'use strict';

const { z } = require('zod');
const { ROLES } = require('../../models/constants');

const email = z.string().trim().toLowerCase().email('A valid email is required');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
  .optional();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email,
  password,
  phone,
  // Only user and owner may self-register; admins are provisioned by seeding.
  role: z.enum([ROLES.USER, ROLES.OWNER]).default(ROLES.USER),
  // Owner-only business profile, ignored for driver accounts.
  businessName: z.string().trim().min(2).max(160).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  updateProfileSchema,
};
