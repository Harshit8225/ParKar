'use strict';

const mongoose = require('mongoose');
const { Booking, ParkingLot, ParkingSession } = require('../../models');
const { BOOKING_STATUS, LOT_STATUS, ROLES, SESSION_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const allocation = require('../allocation/allocation.service');
const { buildNavigationMap } = require('../allocation/spot.layout');
const { bookingId: newBookingId } = require('../../utils/ids');
const { isSameDay, minutesBetween } = require('../../utils/time');
const { normalizePlate } = require('../../utils/plate');
const pricingService = require('../pricing/pricing.service');
const paymentService = require('../payment/payment.service');
const coupons = require('../../services/coupon.service');

/**
 * How early a driver may book relative to their stated entry time. Reservations
 * are same-day only (per spec), so this only guards against booking a slot for
 * a time that has already passed.
 */
const ENTRY_BACKDATE_TOLERANCE_MINUTES = 15;

/** Unpaid holds are released after this long so an abandoned checkout does not
 *  sit on a slot forever. This is NOT booking expiry: a CONFIRMED booking never
 *  expires. Only pending_payment holds are reclaimed (by the allocation module). */
const { UNPAID_HOLD_TTL_MINUTES } = allocation;

/** Driver-facing copy of the assigned spot, or undefined for legacy bookings. */
const toSpotDto = (spot) => {
  if (!spot || !spot.label) return undefined;
  return {
    zone: spot.zone,
    label: spot.label,
    row: spot.row,
    bay: spot.bay,
    start: spot.start,
    size: spot.size,
    vehicleType: spot.vehicleType,
    instructions: spot.instructions,
    released: Boolean(spot.releasedAt),
  };
};

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
    spot: toSpotDto(doc.spot),
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

/** Release holds from checkouts that were never completed. The allocation
 *  module also runs this before every decision, so an abandoned cart cannot
 *  block a paying driver. */
const releaseStaleHolds = (lotId) => allocation.releaseStaleHolds(lotId);

/**
 * Create a reservation and its payment order.
 *
 * Space is decided by the allocation module under the lot's distributed lock:
 * straight away while the lot has room, or, when it is nearly full, together
 * with every other request that arrives within the lot's batch window - the
 * revenue optimiser then picks which of them get space. An accepted request
 * comes back with its assigned spot, which is held (`reserved`) from this
 * moment; the booking only becomes CONFIRMED once payment is verified.
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

  // Priced before allocation because the price is what the optimiser weighs.
  // Re-resolved here rather than taken from the client: the browser's quote is
  // a preview, and the payable amount must come from the server.
  const priced = await pricingService.quote({
    lot,
    vehicleType: input.vehicleType,
    entryTime: input.expectedEntryTime,
    exitTime: input.expectedExitTime,
  });
  const discounted = coupons.price(priced.amount, input.couponCode);

  // The booking's id doubles as the allocation request id, so the spot hold
  // and the booking point at each other from the start.
  const bookingObjectId = new mongoose.Types.ObjectId();
  const allocated = await allocation.requestSpot({
    lot,
    request: {
      id: bookingObjectId.toString(),
      vehicleType: input.vehicleType,
      revenue: discounted.amount,
      arrivedAt: Date.now(),
    },
  });
  if (!allocated.accepted) {
    throw ApiError.conflict(allocated.message, { reason: allocated.reason });
  }

  let booking;
  try {
    booking = await Booking.create({
      _id: bookingObjectId,
      bookingId: newBookingId(),
      user: user._id,
      parkingLot: lot._id,
      vehicleNumber: input.vehicleNumber,
      vehicleType: input.vehicleType,
      expectedEntryTime: input.expectedEntryTime,
      expectedExitTime: input.expectedExitTime,
      durationHours: priced.durationHours,
      pricing: {
        baseRatePerHour: priced.baseRatePerHour,
        effectiveRatePerHour: priced.effectiveRatePerHour,
        multipliers: priced.multipliers,
        amount: discounted.amount,
        currency: priced.currency,
        breakdown: priced.breakdown,
        coupon: discounted.coupon
          ? {
              code: discounted.coupon.code,
              discountPercent: discounted.coupon.discountPercent,
              discountAmount: discounted.discountAmount,
              originalAmount: discounted.originalAmount,
            }
          : undefined,
      },
      spot: { ...allocated.spot, assignedAt: new Date() },
      status: BOOKING_STATUS.PENDING_PAYMENT,
    });
  } catch (err) {
    // The space is already held for this id; give it back.
    await allocation
      .releaseSpots(lot._id, [bookingObjectId], { [`reserved.${input.vehicleType}`]: -1 })
      .catch(() => {});
    throw err;
  }

  // A fully-discounted booking has nothing to charge, so it is settled here and
  // confirmed straight away rather than being sent to a gateway for zero rupees.
  if (booking.pricing.amount <= 0) {
    const transaction = await paymentService.settleWithoutGateway({ user, booking, lot });
    await confirmBookingPaid(booking, { transaction });

    return {
      booking: toBookingDto(booking, { lot }),
      payment: {
        settled: true,
        transactionId: transaction.transactionId,
        amountRupees: 0,
        currency: booking.pricing.currency,
        coupon: booking.pricing.coupon ? booking.pricing.coupon.code : undefined,
      },
    };
  }

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

  // Conditional, so a stale-hold sweep that already failed this booking and
  // gave its space back is not counted twice.
  const releasedAt = new Date();
  const result = await Booking.updateOne(
    { _id: booking._id, status: BOOKING_STATUS.PENDING_PAYMENT },
    { $set: { status: BOOKING_STATUS.PAYMENT_FAILED, 'spot.releasedAt': releasedAt } },
  );
  booking.status = BOOKING_STATUS.PAYMENT_FAILED;
  if (booking.spot && booking.spot.label) booking.spot.releasedAt = releasedAt;
  if (!result.modifiedCount) return booking;

  await allocation.releaseSpots(booking.parkingLot, [booking._id], { [`reserved.${booking.vehicleType}`]: -1 });

  return booking;
};

/**
 * Take space back for a booking whose payment failed and is being retried.
 *
 * Goes through the allocator again, because the spot the failed booking gave
 * back may well have been taken since; the booking may get a different spot.
 */
const reinstateHold = async (booking, lot) => {
  if (booking.status !== BOOKING_STATUS.PAYMENT_FAILED) return booking;

  assertBookableWindow(lot, booking.expectedEntryTime, booking.expectedExitTime);

  const allocated = await allocation.allocateNow(lot._id, {
    id: booking._id.toString(),
    vehicleType: booking.vehicleType,
    revenue: booking.pricing.amount,
    arrivedAt: Date.now(),
  });
  if (!allocated.accepted) {
    throw ApiError.conflict(allocated.message, { reason: allocated.reason });
  }

  booking.status = BOOKING_STATUS.PENDING_PAYMENT;
  booking.spot = { ...allocated.spot, assignedAt: new Date(), releasedAt: undefined };
  try {
    await booking.save();
  } catch (err) {
    await allocation
      .releaseSpots(lot._id, [booking._id], { [`reserved.${booking.vehicleType}`]: -1 })
      .catch(() => {});
    throw err;
  }

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

/** Load a booking the actor may see: its driver, the lot's owner, or an admin. */
const loadVisibleBooking = async (bookingId, actor) => {
  const query = /^[0-9a-fA-F]{24}$/.test(bookingId) ? { _id: bookingId } : { bookingId };

  const booking = await Booking.findOne(query).populate('parkingLot', 'name location contact owner');
  if (!booking) throw ApiError.notFound('Booking not found');

  const isOwnUser = booking.user.toString() === actor._id.toString();
  const isLotOwner = actor.role === ROLES.OWNER && booking.parkingLot.owner?.toString() === actor._id.toString();
  if (!isOwnUser && !isLotOwner && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You cannot view this booking');
  }
  return booking;
};

const getBookingForUser = async (bookingId, actor) => {
  const booking = await loadVisibleBooking(bookingId, actor);
  const session = await ParkingSession.findOne({ booking: booking._id }).lean();
  return toBookingDto(booking, { lot: booking.parkingLot, session });
};

/**
 * The lot's floor plan as the driver of this booking should see it: every
 * section and bay, their own spot highlighted, and directions from the gate.
 * Read live, so it reflects the spot the booking holds right now.
 */
const getBookingSpotMap = async (bookingId, actor) => {
  const booking = await loadVisibleBooking(bookingId, actor);
  const lot = await ParkingLot.findById(booking.parkingLot._id).select('name capacity layout spotHolds');
  if (!lot) throw ApiError.notFound('Parking facility not found');

  return {
    bookingId: booking.bookingId,
    lot: { id: lot._id.toString(), name: lot.name },
    spot: toSpotDto(booking.spot),
    ...buildNavigationMap(lot, booking._id),
  };
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

/**
 * The session this vehicle just left on, if it left moments ago.
 *
 * An exit camera fires twice on one departure as often as an entry camera does.
 * Without this, the second read finds no open session and looks like a vehicle
 * leaving that never arrived - which is a fraud signal, not a double scan.
 */
const findRecentlyClosedSessionByPlate = async ({ lotId, normalizedPlate, withinMinutes = 10 }) =>
  ParkingSession.findOne({
    parkingLot: lotId,
    vehicleNumberNormalized: normalizedPlate,
    status: SESSION_STATUS.CLOSED,
    actualExitTime: { $gte: new Date(Date.now() - withinMinutes * 60 * 1000) },
  }).sort({ actualExitTime: -1 });

module.exports = {
  createBooking,
  confirmBookingPaid,
  markBookingPaymentFailed,
  reinstateHold,
  listUserBookings,
  getBookingForUser,
  getBookingSpotMap,
  listLotBookings,
  findAdmissibleBooking,
  findCandidateBookings,
  findAnyOpenBooking,
  findActiveSessionByPlate,
  findRecentlyClosedSessionByPlate,
  releaseStaleHolds,
  assertBookableWindow,
  toBookingDto,
  toSpotDto,
  UNPAID_HOLD_TTL_MINUTES,
};
