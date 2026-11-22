'use strict';

const { ParkingSession, ParkingLot, Booking, User } = require('../../models');
const { SESSION_STATUS, BOOKING_STATUS, ROLES } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const { withLock, lotCapacityLock } = require('../../services/lock.service');
const { sessionId: newSessionId } = require('../../utils/ids');
const { minutesBetween } = require('../../utils/time');
const billingService = require('../billing/billing.service');
const paymentService = require('../payment/payment.service');
const { loadManagedLot } = require('../parking/parking.service');
const allocation = require('../allocation/allocation.service');

const toSessionDto = (session, { lot, booking } = {}) => {
  const doc = typeof session.toObject === 'function' ? session.toObject() : session;
  const lotDoc = lot || (doc.parkingLot && doc.parkingLot.name ? doc.parkingLot : null);
  const bookingDoc = booking || (doc.booking && doc.booking.bookingId ? doc.booking : null);

  const liveOverstayMinutes =
    doc.status === SESSION_STATUS.ACTIVE ? minutesBetween(doc.expectedExitTime, new Date()) : doc.billing.overstayMinutes;

  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId,
    status: doc.status,
    vehicleNumber: doc.vehicleNumber,
    vehicleType: doc.vehicleType,
    actualEntryTime: doc.actualEntryTime,
    actualExitTime: doc.actualExitTime,
    expectedExitTime: doc.expectedExitTime,
    parkedMinutes:
      doc.status === SESSION_STATUS.ACTIVE
        ? minutesBetween(doc.actualEntryTime, new Date())
        : doc.billing.parkedMinutes,
    liveOverstayMinutes,
    isOverstaying: doc.status === SESSION_STATUS.ACTIVE && liveOverstayMinutes > 0,
    billing: doc.billing,
    booking: bookingDoc
      ? { id: bookingDoc._id.toString(), bookingId: bookingDoc.bookingId, amount: bookingDoc.pricing?.amount }
      : doc.booking,
    spot: bookingDoc && bookingDoc.spot && bookingDoc.spot.label
      ? { label: bookingDoc.spot.label, zone: bookingDoc.spot.zone, instructions: bookingDoc.spot.instructions }
      : undefined,
    parkingLot: lotDoc ? { id: lotDoc._id.toString(), name: lotDoc.name } : doc.parkingLot,
    user: doc.user && doc.user.name ? { id: doc.user._id.toString(), name: doc.user.name, email: doc.user.email } : doc.user,
    createdAt: doc.createdAt,
  };
};

/**
 * Open a parking session after a verified entry.
 *
 * Runs inside the lot capacity lock so the reserved -> occupied hand-off is
 * atomic: the reservation is consumed and a physical slot taken in one step,
 * which keeps availability correct even with simultaneous gate events.
 *
 * Idempotent: a camera that fires twice returns the existing session rather
 * than double-counting the vehicle.
 */
const openSession = async ({ booking, lot, entryTime = new Date(), recognitionEventId }) => {
  const existing = await ParkingSession.findOne({
    booking: booking._id,
    status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING_PAYMENT] },
  });
  if (existing) return { session: existing, created: false };

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    throw ApiError.conflict(`Booking ${booking.bookingId} is not in a state that allows entry (${booking.status})`);
  }

  const session = await withLock(
    lotCapacityLock(lot._id.toString()),
    async () => {
      // Re-check under the lock in case a duplicate event raced us.
      const raced = await ParkingSession.findOne({ booking: booking._id, status: SESSION_STATUS.ACTIVE });
      if (raced) return raced;

      const created = await ParkingSession.create({
        sessionId: newSessionId(),
        booking: booking._id,
        user: booking.user,
        parkingLot: lot._id,
        vehicleNumber: booking.vehicleNumber,
        vehicleNumberNormalized: booking.vehicleNumberNormalized,
        vehicleType: booking.vehicleType,
        expectedExitTime: booking.expectedExitTime,
        actualEntryTime: entryTime,
        status: SESSION_STATUS.ACTIVE,
        entryEvent: recognitionEventId,
        billing: { prepaidAmount: booking.pricing.amount, currency: booking.pricing.currency },
      });

      // The held reservation becomes a physically occupied slot.
      await ParkingLot.updateOne(
        { _id: lot._id },
        {
          $inc: {
            [`reserved.${booking.vehicleType}`]: -1,
            [`occupied.${booking.vehicleType}`]: 1,
          },
        },
      );

      return created;
    },
    { ttlMs: 8000 },
  );

  booking.status = BOOKING_STATUS.ACTIVE;
  booking.session = session._id;
  await booking.save();

  await cache.invalidateLot(lot._id.toString());
  return { session, created: true };
};

/**
 * Close a session at exit: compute the duration and overstay, generate the
 * final bill, free the slot, and create a payment order when money is owed.
 *
 * The slot is released regardless of whether the overstay is paid - a vehicle
 * that has physically left must not keep occupying capacity. An unpaid balance
 * leaves the session in PENDING_PAYMENT with amountDue set.
 */
const closeSession = async ({ session, lot, exitTime = new Date(), recognitionEventId }) => {
  if (session.status === SESSION_STATUS.CLOSED) {
    const booking = await Booking.findById(session.booking);
    return { session, booking, bill: session.billing, alreadyClosed: true, payment: null };
  }

  const booking = await Booking.findById(session.booking);
  if (!booking) throw ApiError.notFound('The booking for this session no longer exists');

  const bill = billingService.computeFinalBill({ lot, booking, session, actualExitTime: exitTime });

  const wasActive = session.status === SESSION_STATUS.ACTIVE;

  session.actualExitTime = exitTime;
  session.billing = {
    ...session.billing.toObject?.() ?? session.billing,
    parkedMinutes: bill.parkedMinutes,
    overstayMinutes: bill.overstayMinutes,
    chargeableOverstayMinutes: bill.chargeableOverstayMinutes,
    overstayHours: bill.overstayHours,
    prepaidAmount: bill.prepaidAmount,
    overstayAmount: bill.overstayAmount,
    totalAmount: bill.totalAmount,
    amountDue: bill.amountDue,
    currency: bill.currency,
    breakdown: bill.breakdown,
    settled: bill.amountDue <= 0,
    settledAt: bill.amountDue <= 0 ? exitTime : undefined,
  };
  session.status = bill.amountDue > 0 ? SESSION_STATUS.PENDING_PAYMENT : SESSION_STATUS.CLOSED;
  session.exitEvent = recognitionEventId;
  await session.save();

  // Free the physical spot exactly once, even if the exit camera double-fires.
  if (wasActive) {
    await allocation.releaseSpots(lot._id, [booking._id], { [`occupied.${session.vehicleType}`]: -1 });
    if (booking.spot && booking.spot.label && !booking.spot.releasedAt) booking.spot.releasedAt = exitTime;
  }

  if (bill.amountDue <= 0) booking.status = BOOKING_STATUS.COMPLETED;
  if (booking.isModified()) await booking.save();

  await cache.invalidateLot(lot._id.toString());

  let payment = null;
  if (bill.amountDue > 0) {
    const user = await User.findById(session.user);
    payment = await paymentService.createSessionOrder({
      user: user || { _id: session.user },
      session,
      lot,
      amount: bill.amountDue,
    });
  }

  return { session, booking, bill, payment, alreadyClosed: false };
};

/** Mark an overstay balance paid and finish the session. Idempotent. */
const settleSession = async ({ session, transaction }) => {
  if (session.billing.settled) return session;

  session.billing.amountDue = 0;
  session.billing.settled = true;
  session.billing.settledAt = transaction.paidAt || new Date();
  session.status = SESSION_STATUS.CLOSED;
  await session.save();

  await Booking.updateOne({ _id: session.booking }, { $set: { status: BOOKING_STATUS.COMPLETED } });
  return session;
};

const listLotSessions = async (lotId, actor, { status, page, limit, vehicleNumber }) => {
  const lot = await loadManagedLot(lotId, actor);

  const filter = { parkingLot: lot._id };
  if (status) filter.status = status;
  if (vehicleNumber) {
    const { normalizePlate } = require('../../utils/plate');
    filter.vehicleNumberNormalized = normalizePlate(vehicleNumber);
  }

  const [sessions, total] = await Promise.all([
    ParkingSession.find(filter)
      .sort({ actualEntryTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email phone')
      .populate('booking', 'bookingId pricing spot')
      .lean(),
    ParkingSession.countDocuments(filter),
  ]);

  return { items: sessions.map((s) => toSessionDto(s, { lot })), total, page, limit };
};

const listUserSessions = async (userId, { page, limit, status }) => {
  const filter = { user: userId };
  if (status) filter.status = status;

  const [sessions, total] = await Promise.all([
    ParkingSession.find(filter)
      .sort({ actualEntryTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('parkingLot', 'name location')
      .populate('booking', 'bookingId pricing spot')
      .lean(),
    ParkingSession.countDocuments(filter),
  ]);

  return { items: sessions.map((s) => toSessionDto(s)), total, page, limit };
};

const getSession = async (idOrCode, actor) => {
  const query = /^[0-9a-fA-F]{24}$/.test(idOrCode) ? { _id: idOrCode } : { sessionId: idOrCode };

  const session = await ParkingSession.findOne(query)
    .populate('parkingLot', 'name location owner')
    .populate('booking', 'bookingId pricing durationHours spot');
  if (!session) throw ApiError.notFound('Parking session not found');

  const isOwnUser = session.user.toString() === actor._id.toString();
  const isLotOwner = actor.role === ROLES.OWNER && session.parkingLot.owner?.toString() === actor._id.toString();
  if (!isOwnUser && !isLotOwner && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You cannot view this parking session');
  }

  const dto = toSessionDto(session, { lot: session.parkingLot, booking: session.booking });
  if (session.actualExitTime) {
    dto.receipt = billingService.buildReceipt({ lot: session.parkingLot, booking: session.booking, session });
  }
  return dto;
};

/** Live overstay preview for an active session, without closing it. */
const previewBill = async (idOrCode, actor) => {
  const query = /^[0-9a-fA-F]{24}$/.test(idOrCode) ? { _id: idOrCode } : { sessionId: idOrCode };
  const session = await ParkingSession.findOne(query).populate('parkingLot');
  if (!session) throw ApiError.notFound('Parking session not found');

  const isOwnUser = session.user.toString() === actor._id.toString();
  const isLotOwner = actor.role === ROLES.OWNER && session.parkingLot.owner?.toString() === actor._id.toString();
  if (!isOwnUser && !isLotOwner && actor.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You cannot view this parking session');
  }

  const booking = await Booking.findById(session.booking);
  const bill = billingService.computeFinalBill({
    lot: session.parkingLot,
    booking,
    session,
    actualExitTime: new Date(),
  });

  return { sessionId: session.sessionId, asOf: new Date().toISOString(), ...bill };
};

module.exports = {
  openSession,
  closeSession,
  settleSession,
  listLotSessions,
  listUserSessions,
  getSession,
  previewBill,
  toSessionDto,
};
