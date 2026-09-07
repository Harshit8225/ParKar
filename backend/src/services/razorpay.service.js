'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { receiptId } = require('../utils/ids');

/**
 * Razorpay gateway adapter.
 *
 * Razorpay works in the smallest currency unit, so every amount crossing this
 * boundary is converted to paise on the way out and back to rupees on the way
 * in - keeping float rupees out of the gateway payload entirely.
 *
 * When keys are absent the adapter runs in MOCK mode: orders are generated
 * locally and signatures are computed with a local secret, so the whole booking
 * and billing flow is testable without a Razorpay account. Mock mode refuses to
 * start in production.
 */

const MOCK_SECRET = 'mock_razorpay_secret_do_not_use_in_production';

const isConfigured = () => Boolean(env.razorpay.keyId && env.razorpay.keySecret);

const isMockMode = () => {
  if (isConfigured()) return false;
  if (env.isProduction) {
    throw ApiError.internal('Payment gateway is not configured');
  }
  return true;
};

let client = null;
const getClient = () => {
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
};

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Number((Number(paise) / 100).toFixed(2));

const activeSecret = () => (isConfigured() ? env.razorpay.keySecret : MOCK_SECRET);

/** Create a gateway order for `amount` rupees. */
const createOrder = async ({ amount, currency = env.platform.currency, notes = {} }) => {
  if (!(amount > 0)) throw ApiError.badRequest('Payment amount must be greater than zero');

  const receipt = receiptId();
  const amountInPaise = toPaise(amount);

  if (isMockMode()) {
    logger.warn('Razorpay running in MOCK mode - no real payment will be captured');
    return {
      id: `order_mock_${crypto.randomBytes(9).toString('hex')}`,
      amount: amountInPaise,
      amountRupees: toRupees(amountInPaise),
      currency,
      receipt,
      status: 'created',
      notes,
      mock: true,
      keyId: 'rzp_test_mock',
    };
  }

  try {
    const order = await getClient().orders.create({
      amount: amountInPaise,
      currency,
      receipt,
      notes,
      payment_capture: 1,
    });
    return {
      id: order.id,
      amount: order.amount,
      amountRupees: toRupees(order.amount),
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      notes: order.notes,
      mock: false,
      keyId: env.razorpay.keyId,
    };
  } catch (err) {
    logger.error('Razorpay order creation failed:', err.message);
    throw new ApiError(502, 'Could not reach the payment gateway. Please try again.');
  }
};

/**
 * Verify the checkout callback signature: HMAC-SHA256 of "orderId|paymentId"
 * keyed with the API secret. Compared in constant time so a timing side channel
 * cannot be used to forge a signature.
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;

  const expected = crypto
    .createHmac('sha256', activeSecret())
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(String(signature), 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

/** Webhook bodies are signed with a separate secret over the raw request body. */
const verifyWebhookSignature = ({ rawBody, signature }) => {
  const secret = env.razorpay.webhookSecret || (isConfigured() ? null : MOCK_SECRET);
  if (!secret || !signature || !rawBody) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(String(signature), 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

/** Fetch a payment to confirm its real status and amount at the gateway. */
const fetchPayment = async (paymentId) => {
  if (isMockMode()) {
    return { id: paymentId, status: 'captured', method: 'mock', mock: true };
  }
  try {
    const payment = await getClient().payments.fetch(paymentId);
    return {
      id: payment.id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      amountRupees: toRupees(payment.amount),
      orderId: payment.order_id,
      email: payment.email,
      mock: false,
    };
  } catch (err) {
    logger.error('Razorpay payment fetch failed:', err.message);
    throw new ApiError(502, 'Could not verify the payment with the gateway');
  }
};

/**
 * Signature a mock client can present to complete the flow locally. Only ever
 * available outside production, and never for real keys.
 */
const mockSignatureFor = ({ orderId, paymentId }) => {
  if (isConfigured() || env.isProduction) return null;
  return crypto.createHmac('sha256', MOCK_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
};

const publicKeyId = () => (isConfigured() ? env.razorpay.keyId : 'rzp_test_mock');

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
  mockSignatureFor,
  publicKeyId,
  isConfigured,
  toPaise,
  toRupees,
};
