'use strict';

const { z } = require('zod');
const { PAYMENT_STATUS, PAYMENT_PURPOSE } = require('../../models/constants');
const v = require('../../utils/validators');

const gatewayId = z.string().trim().min(6).max(120);

const verifySchema = z.object({
  razorpayOrderId: gatewayId,
  razorpayPaymentId: gatewayId,
  razorpaySignature: z.string().trim().min(16).max(256),
});

const failureSchema = z.object({
  razorpayOrderId: gatewayId,
  reason: z.string().trim().max(300).optional(),
});

const bookingOrderSchema = z.object({
  bookingId: z.string().trim().min(6).max(40),
});

const sessionOrderSchema = z.object({
  sessionId: z.string().trim().min(6).max(40),
});

const historySchema = z
  .object({
    purpose: z.enum(Object.values(PAYMENT_PURPOSE)).optional(),
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
  })
  .merge(v.pagination);

const lotLedgerSchema = z
  .object({
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
    from: v.isoDate.optional(),
    to: v.isoDate.optional(),
  })
  .merge(v.pagination);

module.exports = {
  verifySchema,
  failureSchema,
  bookingOrderSchema,
  sessionOrderSchema,
  historySchema,
  lotLedgerSchema,
};
