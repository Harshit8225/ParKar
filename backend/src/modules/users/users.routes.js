'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../models/constants');
const { ParkingOwner } = require('../../models');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const bookingService = require('../booking/booking.service');
const paymentService = require('../payment/payment.service');
const sessionService = require('../session/session.service');

const router = Router();

/**
 * One combined call for the driver dashboard, so the first paint needs a single
 * round trip instead of four.
 */
router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const [bookings, sessions, transactions] = await Promise.all([
      bookingService.listUserBookings(req.user._id, { page: 1, limit: 5 }),
      sessionService.listUserSessions(req.user._id, { page: 1, limit: 5 }),
      paymentService.listUserTransactions(req.user._id, { page: 1, limit: 5 }),
    ]);

    const activeSession = sessions.items.find((session) => session.status === 'active') || null;
    const upcoming = bookings.items.filter((booking) => booking.status === 'confirmed');
    const totalSpend = transactions.items
      .filter((txn) => txn.status === 'paid')
      .reduce((sum, txn) => sum + txn.amount, 0);

    return ok(res, {
      user: req.user.toPublic(),
      stats: {
        totalBookings: bookings.total,
        totalSessions: sessions.total,
        upcomingBookings: upcoming.length,
        recentSpend: Math.round(totalSpend * 100) / 100,
      },
      activeSession,
      upcomingBookings: upcoming,
      recentBookings: bookings.items,
      recentSessions: sessions.items,
      recentTransactions: transactions.items,
    });
  }),
);

const ownerProfileSchema = z
  .object({
    businessName: z.string().trim().min(2).max(160).optional(),
    contactEmail: z.string().trim().toLowerCase().email().optional(),
    contactPhone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
    gstNumber: z.string().trim().max(20).optional(),
    address: z.string().trim().max(300).optional(),
    payoutDetails: z
      .object({
        accountHolder: z.string().trim().max(120).optional(),
        accountNumberLast4: z.string().trim().regex(/^[0-9]{4}$/, 'Enter the last 4 digits only').optional(),
        ifsc: z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid IFSC code').optional(),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

router.get(
  '/owner-profile',
  authenticate,
  authorize(ROLES.OWNER),
  asyncHandler(async (req, res) => {
    const profile = await ParkingOwner.findOne({ user: req.user._id }).lean();
    if (!profile) throw ApiError.notFound('Owner profile not found');
    return ok(res, profile);
  }),
);

router.patch(
  '/owner-profile',
  authenticate,
  authorize(ROLES.OWNER),
  validate({ body: ownerProfileSchema }),
  asyncHandler(async (req, res) => {
    const profile = await ParkingOwner.findOne({ user: req.user._id });
    if (!profile) throw ApiError.notFound('Owner profile not found');

    const { payoutDetails, ...rest } = req.body;
    Object.assign(profile, rest);
    if (payoutDetails) Object.assign(profile.payoutDetails, payoutDetails);
    await profile.save();

    return ok(res, profile.toObject(), 'Business profile updated');
  }),
);

module.exports = router;
