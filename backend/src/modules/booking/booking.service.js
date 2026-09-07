'use strict';

const { Booking, ParkingLot, ParkingSession } = require('../../models');
const { BOOKING_STATUS, LOT_STATUS, ROLES, SESSION_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const { withLock, lotCapacityLock } = require('../../services/lock.service');
const { bookingId: newBookingId } = require('../../utils/ids');
const { isSameDay, minutesBetween } = require('../../utils/time');
const { normalizePlate } = require('../../utils/plate');
const pricingService = require('../pricing/pricing.service');
const paymentService = require('../payment/payment.service');

/**
 * How early a driver may book relative to their stated entry time. Reservations
 * are same-day only (per spec), so this only guards against booking a slot for
 * a time that has already passed.
 */
const ENTRY_BACKDATE_TOLERANCE_MINUTES = 15;

/** Unpaid holds are released after this long so an abandoned checkout does not
 *  sit on a slot forever. This is NOT booking expiry: a CONFIRMED booking never
 *  expires. Only pending_payment holds are reclaimed. */
const UNPAID_HOLD_TTL_MINUTES = 15;

const toBookingDto = (booking, { lot, session } = {}) => {
  const doc = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const lotDoc = lot || (doc.parkingLot && doc.parkingLot.name ? doc.parkingLot : null);

  return {
    id: doc._id.toString(),
    bookingId: doc.bookingId,
    status: doc.status,
    vehicleNumber: doc.vehicleNumber,
    vehicleType: doc.vehicleType,
    expectedEntryTime: doc.expectedEntryTime,
    expectedExitTime: doc.expectedExitTime,
    durationHours: doc.durationHours,
    pricing: doc.pricing,
    amount: doc.pricing ? doc.pricing.amount : 0,
    payment: {
      razorpayOrderId: doc.payment ? doc.payment.razorpayOrderId : undefined,
      razorpayPaymentId: doc.payment ? doc.payment.razorpayPaymentId : undefined,
      paidAt: doc.payment ? doc.payment.paidAt : undefined,
    },
    parkingLot: lotDoc
      ? {
          id: lotDoc._id.toString(),
          name: lotDoc.name,
          address: lotDoc.location ? lotDoc.location.address : undefined,
          city: lotDoc.location ? lotDoc.location.city : undefined,
          phone: lotDoc.contact ? lotDoc.contact.phone : undefined,
          latitude: lotDoc.location && lotDoc.location.geo ? lotDoc.location.geo.coordinates[1] : undefined,
          longitude: lotDoc.location && lotDoc.location.geo ? lotDoc.location.geo.coordinates[0] : undefined,
        }
      : doc.parkingLot,
    user: doc.user && doc.user.name ? { id: doc.user._id.toString(), name: doc.user.name, email: doc.user.email } : doc.user,
    session: session || doc.session,
    fraudFlags: doc.fraudFlags || [],
    createdAt: doc.createdAt,
  };
};

/** Reject a booking window that violates spec or facility rules, before locking. */
const assertBookableWindow = (lot, entryTime, exitTime) => {
  const now = new Date();

  if (exitTime <= entryTime) throw ApiError.badRequest('Exit time must be after entry time');

  if (minutesBetween(entryTime, now) > ENTRY_BACKDATE_TOLERANCE_MINUTES && entryTime < now) {
    throw ApiError.badRequest('Entry time cannot be in the past');
  }

  // Reservations are for the current day only.
  if (!isSameDay(entryTime, now)) {
    throw ApiError.badRequest('Reservations can only be made for the current day');
  }
  if (!isSameDay(exitTime, now)) {
    throw ApiError.badRequest('The parking window must end on the same day');
  }

  if (!lot.isOpenAt(entryTime)) {
    throw ApiError.badRequest(
      `This facility is closed at your chosen entry time (open ${lot.operatingHours.openTime} - ${lot.operatingHours.closeTime})`,
    );
  }
  if (!lot.isOpenAt(exitTime)) {
    throw ApiError.badRequest(
      `This facility is closed at your chosen exit time (open ${lot.operatingHours.openTime} - ${lot.operatingHours.closeTime})`,
    );
  }
};

/** Release holds from checkouts that were never completed. Runs before a
 *  capacity check so an abandoned cart cannot block a paying driver. */
const releaseStaleHolds = async (lotId) => {
  const cutoff = new Date(Date.now() - UNPAID_HOLD_TTL_MINUTES * 60 * 1000);
  const stale = await Booking.find({
    parkingLot: lotId,
    status: BOOKING_STATUS.PENDING_PAYMENT,
    createdAt: { $lt: cutoff },
  }).select('_id vehicleType');

  if (!stale.length) return 0;

  const decrements = {};
  for (const booking of stale) {
    const field = `reserved.${booking.vehicleType}`;
    decrements[field] = (decrements[field] || 0) - 1;
  }

  await Booking.updateMany(
    { _id: { $in: stale.map((b) => b._id) } },
    { $set: { status: BOOKING_STATUS.PAYMENT_FAILED }, $push: { fraudFlags: { $each: [] } } },
  );
  await ParkingLot.updateOne({ _id: lotId }, { $inc: decrements });

  return stale.length;
};

/**
 * Create a reservation and its payment order.
 *
 * The availability check and the capacity hold happen inside a Redis
 * distributed lock keyed on the lot, so two drivers racing for the last slot
 * cannot both succeed. The slot is held as `reserved` from this moment; the
 * booking only becomes CONFIRMED once payment is verified.
 */
const createBooking = async (user, input) => {
  const lot = await ParkingLot.findById(input.parkingLotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
  if (lot.status !== LOT_STATUS.APPROVED) throw ApiError.badRequest('This parking facility is not accepting bookings');

  assertBookableWindow(lot, input.expectedEntryTime, input.expectedExitTime);

  const normalized = normalizePlate(input.vehicleNumber);

  // One vehicle cannot hold two overlapping reservations, anywhere on the
  // platform. Unpaid holds count too - otherwise two pending checkouts for the
  // same plate could both be paid and produce overlapping confirmed bookings.
  const conflicting = await Booking.findOne({
    vehicleNumberNormalized: normalized,
    status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE] },
    expectedEntryTime: { $lt: input.expectedExitTime },
    expectedExitTime: { $gt: input.expectedEntryTime },
  });
  if (conflicting) {
    throw ApiError.conflict(
      conflicting.status === BOOKING_STATUS.PENDING_PAYMENT
        ? `Vehicle ${input.vehicleNumber} already has an unpaid booking (${conflicting.bookingId}) for this time window. Complete or abandon that payment first.`
        : `Vehicle ${input.vehicleNumber} already has a booking (${conflicting.bookingId}) overlapping this time window`,
    );
  }

  const booking = await withLock(
    lotCapacityLock(lot._id.toString()),
    async () => {
      await releaseStaleHolds(lot._id);

      // Re-read inside the lock: another request may have taken the last slot.
      const freshLot = await ParkingLot.findById(lot._id);
      const availableSlots = freshLot.availableFor(input.vehicleType);
      if (availableSlots <= 0) {
        throw ApiError.conflict(
          `No ${input.vehicleType.replace('_', ' ')} slots are available at ${freshLot.name} right now`,
        );
      }

      const priced = await pricingService.quote({
        lot: freshLot,
        vehicleType: input.vehicleType,
        entryTime: input.expectedEntryTime,
        exitTime: input.expectedExitTime,
      });

      const createdBooking = await Booking.create({
        bookingId: newBookingId(),
        user: user._id,
        parkingLot: freshLot._id,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        expectedEntryTime: input.expectedEntryTime,
        expectedExitTime: input.expectedExitTime,
        durationHours: priced.durationHours,
        pricing: {
          baseRatePerHour: priced.baseRatePerHour,
          effectiveRatePerHour: priced.effectiveRatePerHour,
          multipliers: priced.multipliers,
          amount: priced.amount,
          currency: priced.currency,
          breakdown: priced.breakdown,
        },
        status: BOOKING_STATUS.PENDING_PAYMENT,
      });

      // Hold the slot immediately so the driver is not charged for a slot that
      // vanishes while they are on the payment page.
      await ParkingLot.updateOne({ _id: freshLot._id }, { $inc: { [`reserved.${input.vehicleType}`]: 1 } });

      return createdBooking;
    },
    { ttlMs: 8000 },
  );

  await cache.invalidateLot(lot._id.toString());

  // Payment order is created outside the lock - it is a network call and must
  // not hold up other drivers checking availability.
  const order = await paymentService.createBookingOrder({ user, booking, lot });

  return { booking: toBookingDto(booking, { lot }), payment: order };
};

/** Mark a booking paid and its held slot confirmed. Idempotent. */
const confirmBookingPaid = async (booking, { transaction }) => {
  if (booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.ACTIVE) {
    return booking;
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.payment.transaction = transaction._id;
  booking.payment.razorpayOrderId = transaction.razorpay.orderId;
  booking.payment.razorpayPaymentId = transaction.razorpay.paymentId;
  booking.payment.paidAt = transaction.paidAt || new Date();
  await booking.save();

  await cache.invalidateLot(booking.parkingLot.toString());
  return booking;
};

/** Release the held slot when checkout fails. Idempotent. */
const markBookingPaymentFailed = async (booking, reason) => {
  if (booking.status !== BOOKING_STATUS.PENDING_PAYMENT) return booking;

  booking.status = BOOKING_STATUS.PAYMENT_FAILED;
  booking.fraudFlags = booking.fraudFlags || [];
  await booking.save();

  await ParkingLot.updateOne(
    { _id: booking.parkingLot },
    { $inc: { [`reserved.${booking.vehicleType}`]: -1 } },
  );
  await cache.invalidateLot(booking.parkingLot.toString());

  return booking;
};

/**
 * Take the slot back for a booking whose payment failed and is being retried.
 *
 * Runs under the capacity lock and re-checks availability, because the slot the
 * failed booking released may well have been taken by someone else since.
 */
const reinstateHold = async (booking, lot) => {
  if (booking.status !== BOOKING_STATUS.PAYMENT_FAILED) return booking;

  assertBookableWindow(lot, booking.expectedEntryTime, booking.expectedExitTime);

  await withLock(
    lotCapacityLock(lot._id.toString()),
    async () => {
      const freshLot = await ParkingLot.findById(lot._id);
      if (freshLot.availableFor(booking.vehicleType) <= 0) {
        throw ApiError.conflict(
          `No ${booking.vehicleType.replace('_', ' ')} slots are available at ${freshLot.name} any more`,
        );
      }
      await ParkingLot.updateOne({ _id: freshLot._id }, { $inc: { [`reserved.${booking.vehicleType}`]: 1 } });
    },
    { ttlMs: 8000 },
  );

  booking.status = BOOKING_STATUS.PENDING_PAYMENT;
  await booking.save();
  await cache.invalidateLot(lot._id.toString());

  return booking;
};

const listUserBookings = async (userId, { status, page, limit }) => {
  const filter = { user: userId };
  if (status) filter.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('parkingLot', 'name location contact')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return { items: bookings.map((b) => toBookingDto(b)), total, page, limit };
};

const getBookingForUser = async (bookingId, actor) => {
  const query = /^[0-9a-fA-F]{24}$/.test(bookingId) ? { _id: bookingId } : { bookingId };

  const booking = await Booking.findOne(query).populate('parkingLot', 'name location contact owner');
  if (!booking) throw ApiError.notFound('Booking not found');

  const isOwnUser = booking.user.toString() === actor._id.toString();
  const isLotOwner = actor.role === ROLES.OWNER && booking.parkingLot.owner?.toString() === actor._id.toString();
  if (!isOwnUser && !isLotOwner && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You cannot view this booking');
  }

  const session = await ParkingSession.findOne({ booking: booking._id }).lean();
  return toBookingDto(booking, { lot: booking.parkingLot, session });
};

/** Reservations for one facility - the owner panel list. */
const listLotBookings = async (lotId, actor, { status, from, to, vehicleNumber, page, limit }) => {
  const { loadManagedLot } = require('../parking/parking.service');
  const lot = await loadManagedLot(lotId, actor);

  const filter = { parkingLot: lot._id };
  if (status) filter.status = status;
  if (vehicleNumber) filter.vehicleNumberNormalized = normalizePlate(vehicleNumber);
  if (from || to) {
    filter.expectedEntryTime = {};
    if (from) filter.expectedEntryTime.$gte = from;
    if (to) filter.expectedEntryTime.$lte = to;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ expectedEntryTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email phone')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return { items: bookings.map((b) => toBookingDto(b, { lot })), total, page, limit };
};

/**
 * The booking a vehicle should be admitted on: confirmed, for this lot, with
 * `now` inside the allowed entry window.
 */
const findAdmissibleBooking = async ({ lotId, normalizedPlate, at = new Date(), earlyGraceMinutes = 30, lateGraceMinutes = 60 }) => {
  const windowStart = new Date(at.getTime() - lateGraceMinutes * 60 * 1000);
  const windowEnd = new Date(at.getTime() + earlyGraceMinutes * 60 * 1000);

  return Booking.findOne({
    parkingLot: lotId,
    vehicleNumberNormalized: normalizedPlate,
    status: BOOKING_STATUS.CONFIRMED,
    expectedEntryTime: { $lte: windowEnd },
    expectedExitTime: { $gte: windowStart },
  }).sort({ expectedEntryTime: 1 });
};

/**
 * Every booking admissible at this lot right now, whatever its plate.
 *
 * The exact-plate lookup above cannot find a booking whose stored plate differs
 * from what the camera read, so the gate needs these candidates to tell a
 * near-miss (OCR error, or someone arriving in the wrong car) apart from a
 * vehicle with no booking at all. Bounded, because it is scanned in memory.
 */
const findCandidateBookings = async ({ lotId, at = new Date(), earlyGraceMinutes = 30, lateGraceMinutes = 60, limit = 200 }) => {
  const windowStart = new Date(at.getTime() - lateGraceMinutes * 60 * 1000);
  const windowEnd = new Date(at.getTime() + earlyGraceMinutes * 60 * 1000);

  return Booking.find({
    parkingLot: lotId,
    status: BOOKING_STATUS.CONFIRMED,
    expectedEntryTime: { $lte: windowEnd },
    expectedExitTime: { $gte: windowStart },
  })
    .sort({ expectedEntryTime: 1 })
    .limit(limit);
};

/** Any confirmed booking for this plate at this lot, regardless of time. Used
 *  to tell "you are too early/late" apart from "you have no booking here". */
const findAnyOpenBooking = async ({ lotId, normalizedPlate }) =>
  Booking.findOne({
    parkingLot: lotId,
    vehicleNumberNormalized: normalizedPlate,
    status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE] },
  }).sort({ expectedEntryTime: 1 });

const findActiveSessionByPlate = async ({ lotId, normalizedPlate }) =>
  ParkingSession.findOne({
    parkingLot: lotId,
    vehicleNumberNormalized: normalizedPlate,
    status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING_PAYMENT] },
  }).sort({ actualEntryTime: -1 });

module.exports = {
  createBooking,
  confirmBookingPaid,
  markBookingPaymentFailed,
  reinstateHold,
  listUserBookings,
  getBookingForUser,
  listLotBookings,
  findAdmissibleBooking,
  findCandidateBookings,
  findAnyOpenBooking,
  findActiveSessionByPlate,
  releaseStaleHolds,
  assertBookableWindow,
  toBookingDto,
  UNPAID_HOLD_TTL_MINUTES,
};
