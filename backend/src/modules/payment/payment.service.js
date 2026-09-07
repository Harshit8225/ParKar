'use strict';

const { Transaction, ParkingLot } = require('../../models');
const { PAYMENT_STATUS, PAYMENT_PURPOSE } = require('../../models/constants');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { shortCode } = require('../../utils/ids');
const razorpay = require('../../services/razorpay.service');

/**
 * Transaction ledger + gateway orchestration.
 *
 * This module deliberately knows nothing about bookings or sessions; applying a
 * captured payment to domain state is payment.settlement.js's job. That keeps
 * the require graph acyclic.
 */

const newTransactionId = () => `TXN-${Date.now().toString(36).toUpperCase()}-${shortCode(5)}`;

const round2 = (value) => Math.round(value * 100) / 100;

/** Commission split, using the lot override when present. */
const computeSettlement = (amount, lot) => {
  const commissionPercent =
    typeof lot?.commissionPercent === 'number' ? lot.commissionPercent : env.platform.commissionPercent;
  const platformCommission = round2((amount * commissionPercent) / 100);
  return {
    commissionPercent,
    platformCommission,
    ownerEarning: round2(amount - platformCommission),
  };
};

const toTransactionDto = (transaction) => {
  const doc = typeof transaction.toObject === 'function' ? transaction.toObject() : transaction;
  return {
    id: doc._id.toString(),
    transactionId: doc.transactionId,
    purpose: doc.purpose,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    failureReason: doc.failureReason,
    razorpayOrderId: doc.razorpay ? doc.razorpay.orderId : undefined,
    razorpayPaymentId: doc.razorpay ? doc.razorpay.paymentId : undefined,
    method: doc.razorpay ? doc.razorpay.method : undefined,
    settlement: doc.settlement,
    booking:
      doc.booking && doc.booking.bookingId
        ? { id: doc.booking._id.toString(), bookingId: doc.booking.bookingId }
        : doc.booking,
    parkingLot:
      doc.parkingLot && doc.parkingLot.name
        ? { id: doc.parkingLot._id.toString(), name: doc.parkingLot.name }
        : doc.parkingLot,
    user: doc.user && doc.user.name ? { id: doc.user._id.toString(), name: doc.user.name, email: doc.user.email } : doc.user,
    paidAt: doc.paidAt,
    createdAt: doc.createdAt,
  };
};

/** Everything the frontend checkout needs, and nothing secret. */
const toCheckoutPayload = (transaction, order, { name, description, prefill }) => ({
  transactionId: transaction.transactionId,
  keyId: order.keyId || razorpay.publicKeyId(),
  orderId: order.id,
  amount: order.amount, // paise - what Razorpay Checkout expects
  amountRupees: order.amountRupees,
  currency: order.currency,
  name,
  description,
  prefill,
  mock: Boolean(order.mock),
  // Only present outside production with no real keys, so the flow is testable.
  mockSignature: order.mock ? razorpay.mockSignatureFor({ orderId: order.id, paymentId: `pay_mock_${order.id.slice(-10)}` }) : undefined,
  mockPaymentId: order.mock ? `pay_mock_${order.id.slice(-10)}` : undefined,
});

/**
 * Settle a booking that costs nothing, without involving the gateway.
 *
 * Razorpay cannot raise a zero-rupee order, and there is nothing to authorise,
 * so a fully-discounted booking is recorded as paid here. The transaction still
 * exists with its full settlement breakdown, and the method records *why* no
 * money moved, so a coupon-settled booking is auditable rather than invisible.
 */
const settleWithoutGateway = async ({ user, booking, lot, reason = 'coupon' }) => {
  if (booking.pricing.amount > 0) {
    throw ApiError.badRequest('This booking has an amount to pay');
  }

  const existing = await Transaction.findOne({ booking: booking._id, purpose: PAYMENT_PURPOSE.BOOKING });
  if (existing) return existing;

  const transaction = await Transaction.create({
    transactionId: newTransactionId(),
    user: user._id,
    booking: booking._id,
    parkingLot: lot._id,
    purpose: PAYMENT_PURPOSE.BOOKING,
    amount: 0,
    currency: booking.pricing.currency,
    status: PAYMENT_STATUS.PAID,
    paidAt: new Date(),
    razorpay: { method: reason },
    settlement: computeSettlement(0, lot),
  });

  logger.info(
    `Booking ${booking.bookingId} settled without the gateway (${reason})` +
      `${booking.pricing.coupon ? `, code ${booking.pricing.coupon.code}` : ''}`,
  );

  return transaction;
};

/** Create (or reuse) the pre-booking payment order for a booking. */
const createBookingOrder = async ({ user, booking, lot }) => {
  // Reuse an outstanding order so a page refresh does not spawn duplicates.
  const existing = await Transaction.findOne({
    booking: booking._id,
    purpose: PAYMENT_PURPOSE.BOOKING,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  });

  if (existing && existing.razorpay.orderId) {
    return toCheckoutPayload(
      existing,
      {
        id: existing.razorpay.orderId,
        amount: razorpay.toPaise(existing.amount),
        amountRupees: existing.amount,
        currency: existing.currency,
        mock: !razorpay.isConfigured(),
        keyId: razorpay.publicKeyId(),
      },
      {
        name: lot.name,
        description: `Parking booking ${booking.bookingId}`,
        prefill: { name: user.name, email: user.email, contact: user.phone },
      },
    );
  }

  const order = await razorpay.createOrder({
    amount: booking.pricing.amount,
    currency: booking.pricing.currency,
    notes: { bookingId: booking.bookingId, lotId: lot._id.toString(), purpose: PAYMENT_PURPOSE.BOOKING },
  });

  const transaction = await Transaction.create({
    transactionId: newTransactionId(),
    user: user._id,
    booking: booking._id,
    parkingLot: lot._id,
    purpose: PAYMENT_PURPOSE.BOOKING,
    amount: booking.pricing.amount,
    currency: booking.pricing.currency,
    status: PAYMENT_STATUS.CREATED,
    razorpay: { orderId: order.id, receipt: order.receipt },
    settlement: computeSettlement(booking.pricing.amount, lot),
  });

  booking.payment.transaction = transaction._id;
  booking.payment.razorpayOrderId = order.id;
  await booking.save();

  return toCheckoutPayload(transaction, order, {
    name: lot.name,
    description: `Parking booking ${booking.bookingId}`,
    prefill: { name: user.name, email: user.email, contact: user.phone },
  });
};

/** Create the exit-time order for overstay (or any remaining balance). */
const createSessionOrder = async ({ user, session, lot, amount, purpose = PAYMENT_PURPOSE.OVERSTAY }) => {
  if (!(amount > 0)) throw ApiError.badRequest('There is nothing left to pay for this session');

  const existing = await Transaction.findOne({
    parkingSession: session._id,
    purpose,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  });
  if (existing && existing.razorpay.orderId && existing.amount === amount) {
    return toCheckoutPayload(
      existing,
      {
        id: existing.razorpay.orderId,
        amount: razorpay.toPaise(existing.amount),
        amountRupees: existing.amount,
        currency: existing.currency,
        mock: !razorpay.isConfigured(),
        keyId: razorpay.publicKeyId(),
      },
      {
        name: lot.name,
        description: `Overstay charge for session ${session.sessionId}`,
        prefill: { name: user.name, email: user.email, contact: user.phone },
      },
    );
  }

  const order = await razorpay.createOrder({
    amount,
    currency: session.billing.currency,
    notes: { sessionId: session.sessionId, lotId: lot._id.toString(), purpose },
  });

  const transaction = await Transaction.create({
    transactionId: newTransactionId(),
    user: user._id || session.user,
    booking: session.booking,
    parkingLot: lot._id,
    parkingSession: session._id,
    purpose,
    amount,
    currency: session.billing.currency,
    status: PAYMENT_STATUS.CREATED,
    razorpay: { orderId: order.id, receipt: order.receipt },
    settlement: computeSettlement(amount, lot),
  });

  return toCheckoutPayload(transaction, order, {
    name: lot.name,
    description: `Overstay charge for session ${session.sessionId}`,
    prefill: { name: user.name, email: user.email, contact: user.phone },
  });
};

/**
 * Verify a Razorpay callback and mark the transaction paid.
 *
 * Trust nothing from the client: the signature is checked against our secret,
 * and for real (non-mock) gateways the payment is re-fetched so a forged
 * amount or an uncaptured payment cannot slip through.
 *
 * Idempotent - replaying the same callback returns the already-paid transaction.
 */
const capturePayment = async ({ orderId, paymentId, signature, actorUserId }) => {
  const transaction = await Transaction.findOne({ 'razorpay.orderId': orderId });
  if (!transaction) throw ApiError.notFound('No payment found for this order');

  if (actorUserId && transaction.user.toString() !== actorUserId.toString()) {
    throw ApiError.forbidden('This payment belongs to another account');
  }

  if (transaction.status === PAYMENT_STATUS.PAID) {
    return { transaction, alreadyPaid: true };
  }

  const validSignature = razorpay.verifyPaymentSignature({ orderId, paymentId, signature });
  if (!validSignature) {
    transaction.status = PAYMENT_STATUS.FAILED;
    transaction.failureReason = 'Signature verification failed';
    transaction.razorpay.paymentId = paymentId;
    await transaction.save();
    logger.warn(`Rejected payment ${paymentId} for order ${orderId}: bad signature`);
    throw ApiError.badRequest('Payment verification failed. Your card has not been charged.');
  }

  if (razorpay.isConfigured()) {
    const remote = await razorpay.fetchPayment(paymentId);
    if (remote.orderId && remote.orderId !== orderId) {
      throw ApiError.badRequest('Payment does not belong to this order');
    }
    if (!['captured', 'authorized'].includes(remote.status)) {
      transaction.status = PAYMENT_STATUS.FAILED;
      transaction.failureReason = `Gateway reported status: ${remote.status}`;
      await transaction.save();
      throw ApiError.badRequest('The payment was not completed successfully');
    }
    if (remote.amountRupees !== undefined && Math.abs(remote.amountRupees - transaction.amount) > 0.01) {
      transaction.status = PAYMENT_STATUS.FAILED;
      transaction.failureReason = `Amount mismatch: expected ${transaction.amount}, gateway reported ${remote.amountRupees}`;
      await transaction.save();
      logger.error(`Amount mismatch on ${paymentId}: ${remote.amountRupees} vs ${transaction.amount}`);
      throw ApiError.badRequest('Payment amount did not match the order');
    }
    transaction.razorpay.method = remote.method;
  }

  transaction.status = PAYMENT_STATUS.PAID;
  transaction.razorpay.paymentId = paymentId;
  transaction.razorpay.signature = signature;
  transaction.paidAt = new Date();
  await transaction.save();

  return { transaction, alreadyPaid: false };
};

/** Record a client-reported failure so the ledger and the held slot agree. */
const recordFailure = async ({ orderId, reason, actorUserId }) => {
  const transaction = await Transaction.findOne({ 'razorpay.orderId': orderId });
  if (!transaction) throw ApiError.notFound('No payment found for this order');
  if (actorUserId && transaction.user.toString() !== actorUserId.toString()) {
    throw ApiError.forbidden('This payment belongs to another account');
  }
  if (transaction.status === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This payment has already been captured');
  }

  transaction.status = PAYMENT_STATUS.FAILED;
  transaction.failureReason = (reason || 'Payment failed or was cancelled by the user').slice(0, 300);
  await transaction.save();
  return transaction;
};

const listUserTransactions = async (userId, { page, limit, purpose, status }) => {
  const filter = { user: userId };
  if (purpose) filter.purpose = purpose;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('booking', 'bookingId vehicleNumber')
      .populate('parkingLot', 'name')
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  return { items: items.map(toTransactionDto), total, page, limit };
};

/** Transactions for one facility - the owner panel ledger. */
const listLotTransactions = async (lotId, { page, limit, status, from, to }) => {
  const filter = { parkingLot: lotId };
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total, totals] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .populate('booking', 'bookingId vehicleNumber')
      .lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: { ...filter, status: PAYMENT_STATUS.PAID } },
      {
        $group: {
          _id: null,
          gross: { $sum: '$amount' },
          commission: { $sum: '$settlement.platformCommission' },
          earnings: { $sum: '$settlement.ownerEarning' },
        },
      },
    ]),
  ]);

  return {
    items: items.map(toTransactionDto),
    total,
    page,
    limit,
    summary: totals[0]
      ? {
          gross: round2(totals[0].gross),
          platformCommission: round2(totals[0].commission),
          ownerEarning: round2(totals[0].earnings),
        }
      : { gross: 0, platformCommission: 0, ownerEarning: 0 },
  };
};

/** Load the lot a transaction belongs to, for commission calculations. */
const getLotForTransaction = async (transaction) => ParkingLot.findById(transaction.parkingLot);

module.exports = {
  createBookingOrder,
  settleWithoutGateway,
  createSessionOrder,
  capturePayment,
  recordFailure,
  listUserTransactions,
  listLotTransactions,
  computeSettlement,
  getLotForTransaction,
  toTransactionDto,
  newTransactionId,
};
