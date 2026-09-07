'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Discount codes, configured from the environment.
 *
 * These exist so the booking flow can be exercised end to end without going
 * through Razorpay Checkout every time: a 100% code brings the payable amount
 * to zero, and a zero-amount booking is settled server-side and confirmed
 * immediately - no gateway call, no card details.
 *
 * That is a payment bypass, so it is fenced in:
 *   - codes come from TEST_COUPONS, never from the database or the client;
 *   - a discount is only ever computed here, from the server's own quote;
 *   - in production the whole feature is off unless ALLOW_TEST_COUPONS=true,
 *     which exists for a staging deployment and should not be set in a real one.
 *
 * Format: TEST_COUPONS="FREEPARK:100,HALFOFF:50"
 */

/** Parsed once at boot: the code list cannot change under a running process. */
const parseCoupons = (raw) => {
  const table = new Map();

  for (const entry of String(raw || '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [code, percentRaw] = trimmed.split(':');
    const normalized = String(code || '').trim().toUpperCase();
    const percent = Number(percentRaw);

    if (!normalized || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      logger.warn(`Ignoring malformed TEST_COUPONS entry: "${trimmed}" (expected CODE:percent)`);
      continue;
    }
    table.set(normalized, percent);
  }

  return table;
};

const COUPONS = parseCoupons(env.coupons.testCodes);

/** Coupons are a payment bypass, so production must opt in explicitly. */
const isEnabled = () => COUPONS.size > 0 && (!env.isProduction || env.coupons.allowInProduction);

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

/**
 * Resolve a code to its discount, or throw a message the driver can act on.
 * Returns null when no code was supplied, which is the common case.
 */
const resolve = (code) => {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  if (!isEnabled()) throw ApiError.badRequest('Discount codes are not available');

  const discountPercent = COUPONS.get(normalized);
  if (discountPercent === undefined) throw ApiError.badRequest('That discount code is not valid');

  return { code: normalized, discountPercent };
};

/**
 * Apply a resolved coupon to a priced amount.
 *
 * Rounded to paise so the discounted total is a real payable figure rather than
 * a repeating fraction, and clamped so it can never go negative.
 */
const applyTo = (amount, coupon) => {
  const original = Number(amount) || 0;
  if (!coupon) {
    return { amount: original, originalAmount: original, discountAmount: 0, coupon: null };
  }

  const discountAmount = Math.round(original * (coupon.discountPercent / 100) * 100) / 100;
  const payable = Math.max(0, Math.round((original - discountAmount) * 100) / 100);

  return {
    amount: payable,
    originalAmount: original,
    discountAmount: Math.round((original - payable) * 100) / 100,
    coupon: { code: coupon.code, discountPercent: coupon.discountPercent },
  };
};

/** Convenience for callers that have a raw code and an amount. */
const price = (amount, code) => applyTo(amount, resolve(code));

module.exports = { isEnabled, resolve, applyTo, price, availableCodes: () => [...COUPONS.keys()] };

