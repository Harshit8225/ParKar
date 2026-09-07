'use strict';

const mongoose = require('mongoose');
const { PAYMENT_STATUS, PAYMENT_PURPOSE } = require('./constants');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true, index: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
    parkingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', index: true },
    parkingSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSession', index: true },

    purpose: { type: String, enum: Object.values(PAYMENT_PURPOSE), required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.CREATED, index: true },
    failureReason: { type: String, trim: true },

    gateway: { type: String, default: 'razorpay' },
    razorpay: {
      orderId: { type: String, index: true, sparse: true },
      paymentId: { type: String, index: true, sparse: true },
      signature: { type: String },
      receipt: { type: String },
      method: { type: String },
    },

    /** Split recorded at capture time so later commission changes cannot rewrite history. */
    settlement: {
      commissionPercent: { type: Number, default: 0 },
      platformCommission: { type: Number, default: 0 },
      ownerEarning: { type: Number, default: 0 },
    },

    paidAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ parkingLot: 1, status: 1, createdAt: -1 });
transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema, 'transactions');
