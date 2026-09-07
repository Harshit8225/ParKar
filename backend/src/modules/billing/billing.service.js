'use strict';

const { minutesBetween } = require('../../utils/time');
const pricingService = require('../pricing/pricing.service');

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Final bill for a parking session.
 *
 * Overstay is measured exactly as the spec states:
 *
 *   overstay = actualExitTime - expectedExitTime
 *
 * The driver has already paid for the booked window, so only the overstay is
 * newly billable. The lot's grace period is forgiven and the remainder is
 * charged per started hour at the overstay multiplier (see
 * pricing.service.quoteOverstay). Leaving early is never refunded - the spec
 * has no refund flow - but it is recorded in the breakdown for transparency.
 */
const computeFinalBill = ({ lot, booking, session, actualExitTime }) => {
  const entryTime = session.actualEntryTime;
  const expectedExitTime = session.expectedExitTime || booking.expectedExitTime;

  const parkedMinutes = minutesBetween(entryTime, actualExitTime);
  const overstayMinutes = minutesBetween(expectedExitTime, actualExitTime);
  const earlyExitMinutes = minutesBetween(actualExitTime, expectedExitTime);

  const prepaidAmount = round2(booking.pricing.amount);
  const overstay = pricingService.quoteOverstay({ lot, booking, overstayMinutes });

  const breakdown = [
    { label: `Pre-paid booking (${booking.durationHours}h)`, amount: prepaidAmount },
    ...overstay.breakdown,
  ];

  if (overstayMinutes > 0 && overstay.chargeableMinutes === 0) {
    breakdown.push({ label: `Within ${overstay.graceMinutes} min grace period - no charge`, amount: 0 });
  }
  if (earlyExitMinutes > 0) {
    breakdown.push({ label: `Left ${earlyExitMinutes} min early (no refund)`, amount: 0 });
  }

  const overstayAmount = round2(overstay.amount);
  const totalAmount = round2(prepaidAmount + overstayAmount);

  return {
    parkedMinutes,
    overstayMinutes,
    chargeableOverstayMinutes: overstay.chargeableMinutes,
    overstayHours: overstay.chargeableHours,
    graceMinutes: overstay.graceMinutes,
    overstayRatePerHour: overstay.ratePerHour,
    prepaidAmount,
    overstayAmount,
    totalAmount,
    // Only the overstay is still owed; the booking amount was captured up front.
    amountDue: overstayAmount,
    currency: booking.pricing.currency || 'INR',
    breakdown,
    hasOverstayed: overstay.chargeableMinutes > 0,
  };
};

/** Human-readable duration, e.g. "2h 15m". */
const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

/** Receipt payload handed back at the exit gate and shown in booking history. */
const buildReceipt = ({ lot, booking, session }) => ({
  sessionId: session.sessionId,
  bookingId: booking.bookingId,
  parkingLot: { id: lot._id.toString(), name: lot.name, address: lot.location.address },
  vehicleNumber: session.vehicleNumber,
  vehicleType: session.vehicleType,
  entryTime: session.actualEntryTime,
  exitTime: session.actualExitTime,
  expectedExitTime: session.expectedExitTime,
  parkedDuration: formatDuration(session.billing.parkedMinutes),
  overstayDuration: session.billing.overstayMinutes ? formatDuration(session.billing.overstayMinutes) : null,
  charges: {
    prepaid: session.billing.prepaidAmount,
    overstay: session.billing.overstayAmount,
    total: session.billing.totalAmount,
    amountDue: session.billing.amountDue,
    currency: session.billing.currency,
  },
  breakdown: session.billing.breakdown,
  settled: session.billing.settled,
  settledAt: session.billing.settledAt,
});

module.exports = { computeFinalBill, buildReceipt, formatDuration };
