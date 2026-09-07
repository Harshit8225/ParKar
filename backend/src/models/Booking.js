'use strict';

const mongoose = require('mongoose');
const { BOOKING_STATUS, VEHICLE_TYPE_LIST } = require('./constants');
const { normalizePlate } = require('../utils/plate');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parkingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },

    vehicleNumber: { type: String, required: true, trim: true, uppercase: true },
    /** Letters+digits only - every plate comparison runs against this field. */
    vehicleNumberNormalized: { type: String, required: true, index: true },
    vehicleType: { type: String, enum: VEHICLE_TYPE_LIST, required: true },

    expectedEntryTime: { type: Date, required: true, index: true },
    expectedExitTime: { type: Date, required: true },
    durationHours: { type: Number, required: true, min: 1 },

    /** Price snapshot taken at booking time; never recomputed afterwards. */
    pricing: {
      baseRatePerHour: { type: Number, required: true, min: 0 },
      effectiveRatePerHour: { type: Number, required: true, min: 0 },
      multipliers: {
        occupancy: { type: Number, default: 1 },
        peakHour: { type: Number, default: 1 },
        location: { type: Number, default: 1 },
        dayOfWeek: { type: Number, default: 1 },
        combined: { type: Number, default: 1 },
      },
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR' },
      breakdown: [{ label: String, amount: Number }],
    },

    status: { type: String, enum: Object.values(BOOKING_STATUS), default: BOOKING_STATUS.PENDING_PAYMENT, index: true },

    payment: {
      transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
      razorpayOrderId: { type: String, index: true, sparse: true },
      razorpayPaymentId: { type: String },
      paidAt: { type: Date },
    },

    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSession' },

    /** Raised when the plate read at the gate did not match this booking. */
    fraudFlags: [
      {
        type: { type: String },
        detail: { type: String },
        recognizedPlate: { type: String },
        similarity: { type: Number },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Entry verification looks up an active booking by lot + plate + time window.
bookingSchema.index({ parkingLot: 1, vehicleNumberNormalized: 1, status: 1, expectedEntryTime: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ parkingLot: 1, createdAt: -1 });

bookingSchema.pre('validate', function normalize(next) {
  if (this.vehicleNumber) this.vehicleNumberNormalized = normalizePlate(this.vehicleNumber);
  next();
});

bookingSchema.methods.holdsCapacity = function holdsCapacity() {
  return this.status === BOOKING_STATUS.CONFIRMED;
};

module.exports = mongoose.model('Booking', bookingSchema, 'bookings');
