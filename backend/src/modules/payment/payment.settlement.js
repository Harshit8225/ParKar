'use strict';

const { Booking, ParkingSession } = require('../../models');
const { PAYMENT_PURPOSE } = require('../../models/constants');
const logger = require('../../utils/logger');
const bookingService = require('../booking/booking.service');
const sessionService = require('../session/session.service');

/**
 * Applies a captured payment to domain state.
 *
 * Kept separate from payment.service so that module stays free of booking and
 * session dependencies (and the require graph stays acyclic). Every branch is
 * idempotent, because a webhook and a client callback routinely both arrive for
 * the same payment.
 */
const applyPaidTransaction = async (transaction) => {
  if (transaction.purpose === PAYMENT_PURPOSE.BOOKING) {
    const booking = await Booking.findById(transaction.booking);
    if (!booking) {
      logger.error(`Paid transaction ${transaction.transactionId} references a missing booking`);
      return { kind: 'booking', applied: false };
    }
    await bookingService.confirmBookingPaid(booking, { transaction });
    return { kind: 'booking', applied: true, booking: bookingService.toBookingDto(booking) };
  }

  if (transaction.purpose === PAYMENT_PURPOSE.OVERSTAY || transaction.purpose === PAYMENT_PURPOSE.FINAL) {
    const session = await ParkingSession.findById(transaction.parkingSession);
    if (!session) {
      logger.error(`Paid transaction ${transaction.transactionId} references a missing session`);
      return { kind: 'session', applied: false };
    }
    await sessionService.settleSession({ session, transaction });
    return { kind: 'session', applied: true, session: sessionService.toSessionDto(session) };
  }

  logger.warn(`Unhandled payment purpose: ${transaction.purpose}`);
  return { kind: transaction.purpose, applied: false };
};

/** Release whatever the failed payment was holding. */
const applyFailedTransaction = async (transaction) => {
  if (transaction.purpose !== PAYMENT_PURPOSE.BOOKING) {
    // An unpaid overstay stays owed; nothing is being held, so nothing to undo.
    return { kind: transaction.purpose, released: false };
  }

  const booking = await Booking.findById(transaction.booking);
  if (!booking) return { kind: 'booking', released: false };

  await bookingService.markBookingPaymentFailed(booking, transaction.failureReason);
  return { kind: 'booking', released: true, booking: bookingService.toBookingDto(booking) };
};

module.exports = { applyPaidTransaction, applyFailedTransaction };
