'use strict';

const { Booking, ParkingSession, ParkingLot, Transaction } = require('../../models');
const { PAYMENT_STATUS, SESSION_STATUS, BOOKING_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../utils/logger');
const { ok, created, paginated } = require('../../utils/response');
const razorpay = require('../../services/razorpay.service');
const bookingService = require('../booking/booking.service');
const { loadManagedLot } = require('../parking/parking.service');
const service = require('./payment.service');
const settlement = require('./payment.settlement');

/** Public gateway config the checkout script needs. Contains no secrets. */
const config = asyncHandler(async (_req, res) =>
  ok(res, {
    keyId: razorpay.publicKeyId(),
    currency: 'INR',
    mockMode: !razorpay.isConfigured(),
  }),
);

/** Verify a checkout callback and apply it to the booking or session. */
const verify = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  const { transaction, alreadyPaid } = await service.capturePayment({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    actorUserId: req.user._id,
  });

  const applied = await settlement.applyPaidTransaction(transaction);

  return ok(
    res,
    { transaction: service.toTransactionDto(transaction), ...applied },
    alreadyPaid ? 'Payment was already confirmed' : 'Payment verified',
  );
});

/** Client-reported failure or cancellation - releases the held slot. */
const fail = asyncHandler(async (req, res) => {
  const transaction = await service.recordFailure({
    orderId: req.body.razorpayOrderId,
    reason: req.body.reason,
    actorUserId: req.user._id,
  });

  const released = await settlement.applyFailedTransaction(transaction);

  return ok(
    res,
    { transaction: service.toTransactionDto(transaction), ...released },
    'Payment marked as failed and the held slot has been released',
  );
});

/**
 * (Re)create the payment order for a booking that is still awaiting payment.
 *
 * A booking holds its slot from the moment it is created, so a driver whose
 * first attempt failed must be able to retry against the same booking rather
 * than making a new one (which the overlapping-booking guard would refuse).
 */
const bookingOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const query = /^[0-9a-fA-F]{24}$/.test(bookingId) ? { _id: bookingId } : { bookingId };

  const booking = await Booking.findOne(query);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('This booking belongs to another account');
  }
  if (booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.ACTIVE) {
    throw ApiError.conflict('This booking has already been paid for');
  }
  if (booking.status !== BOOKING_STATUS.PENDING_PAYMENT && booking.status !== BOOKING_STATUS.PAYMENT_FAILED) {
    throw ApiError.badRequest(`This booking cannot be paid for (status: ${booking.status})`);
  }

  const lot = await ParkingLot.findById(booking.parkingLot);
  if (!lot) throw ApiError.notFound('Parking facility not found');

  // A previously failed booking gave its slot back, so re-acquire one before
  // taking money for it again.
  if (booking.status === BOOKING_STATUS.PAYMENT_FAILED) {
    await bookingService.reinstateHold(booking, lot);
  }

  const payment = await service.createBookingOrder({ user: req.user, booking, lot });
  return created(res, { payment, booking: bookingService.toBookingDto(booking, { lot }) }, 'Payment order created');
});

/** (Re)create the payment order for an unpaid overstay balance. */
const sessionOrder = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  const query = /^[0-9a-fA-F]{24}$/.test(sessionId) ? { _id: sessionId } : { sessionId };

  const session = await ParkingSession.findOne(query);
  if (!session) throw ApiError.notFound('Parking session not found');
  if (session.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('This parking session belongs to another account');
  }
  if (session.billing.settled || session.billing.amountDue <= 0) {
    throw ApiError.badRequest('There is nothing left to pay for this session');
  }

  const lot = await ParkingLot.findById(session.parkingLot);
  const payment = await service.createSessionOrder({
    user: req.user,
    session,
    lot,
    amount: session.billing.amountDue,
  });

  return created(res, { payment, amountDue: session.billing.amountDue }, 'Payment order created');
});

const myTransactions = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listUserTransactions(req.user._id, req.query);
  return paginated(res, items, { page, limit, total });
});

const lotTransactions = asyncHandler(async (req, res) => {
  const lot = await loadManagedLot(req.params.id, req.user);
  const { items, total, page, limit, summary } = await service.listLotTransactions(lot._id, req.query);
  return res.status(200).json({
    success: true,
    message: 'OK',
    data: items,
    summary,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * Razorpay webhook. The gateway is the authority here, so this endpoint is the
 * safety net for callbacks the browser never delivered (closed tab, lost
 * network). Mounted with a raw body parser so the signature can be verified
 * over the exact bytes Razorpay signed.
 */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));

  if (!razorpay.verifyWebhookSignature({ rawBody, signature })) {
    logger.warn('Rejected Razorpay webhook: invalid signature');
    // 400, not 500 - Razorpay retries 5xx, and a bad signature will never pass.
    throw ApiError.badRequest('Invalid webhook signature');
  }

  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  const event = payload.event;
  const entity = payload.payload?.payment?.entity;

  if (!entity) {
    return ok(res, { handled: false }, `Ignored event ${event}`);
  }

  const transaction = await Transaction.findOne({ 'razorpay.orderId': entity.order_id });
  if (!transaction) {
    logger.warn(`Webhook ${event} for unknown order ${entity.order_id}`);
    // Acknowledge anyway so Razorpay stops retrying an order we do not own.
    return ok(res, { handled: false }, 'Unknown order');
  }

  if (event === 'payment.captured' && transaction.status !== PAYMENT_STATUS.PAID) {
    transaction.status = PAYMENT_STATUS.PAID;
    transaction.razorpay.paymentId = entity.id;
    transaction.razorpay.method = entity.method;
    transaction.paidAt = new Date();
    transaction.meta = { ...(transaction.meta || {}), webhookEvent: event };
    await transaction.save();
    await settlement.applyPaidTransaction(transaction);
    logger.info(`Webhook captured payment for ${transaction.transactionId}`);
  } else if (event === 'payment.failed' && transaction.status === PAYMENT_STATUS.CREATED) {
    transaction.status = PAYMENT_STATUS.FAILED;
    transaction.failureReason = entity.error_description || 'Payment failed at the gateway';
    await transaction.save();
    await settlement.applyFailedTransaction(transaction);
    logger.info(`Webhook failed payment for ${transaction.transactionId}`);
  }

  return ok(res, { handled: true, event }, 'Webhook processed');
});

/** Sessions with an unpaid balance for the signed-in driver. */
const myDues = asyncHandler(async (req, res) => {
  const sessions = await ParkingSession.find({
    user: req.user._id,
    status: SESSION_STATUS.PENDING_PAYMENT,
    'billing.settled': false,
  })
    .populate('parkingLot', 'name location')
    .populate('booking', 'bookingId')
    .lean();

  return ok(res, {
    count: sessions.length,
    totalDue: sessions.reduce((sum, s) => sum + (s.billing.amountDue || 0), 0),
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      bookingId: s.booking?.bookingId,
      parkingLot: s.parkingLot?.name,
      vehicleNumber: s.vehicleNumber,
      exitTime: s.actualExitTime,
      overstayMinutes: s.billing.overstayMinutes,
      amountDue: s.billing.amountDue,
      currency: s.billing.currency,
    })),
  });
});

module.exports = {
  config,
  verify,
  fail,
  bookingOrder,
  sessionOrder,
  myTransactions,
  lotTransactions,
  webhook,
  myDues,
};
