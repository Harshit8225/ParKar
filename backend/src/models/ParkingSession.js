'use strict';

const mongoose = require('mongoose');
const { SESSION_STATUS, VEHICLE_TYPE_LIST } = require('./constants');

const parkingSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parkingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },

    vehicleNumber: { type: String, required: true, uppercase: true, trim: true },
    vehicleNumberNormalized: { type: String, required: true, index: true },
    vehicleType: { type: String, enum: VEHICLE_TYPE_LIST, required: true },

    expectedExitTime: { type: Date, required: true },
    actualEntryTime: { type: Date, required: true },
    actualExitTime: { type: Date },

    status: { type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.ACTIVE, index: true },

    /** Filled at exit by the billing module. */
    billing: {
      parkedMinutes: { type: Number, default: 0 },
      overstayMinutes: { type: Number, default: 0 },
      chargeableOverstayMinutes: { type: Number, default: 0 },
      overstayHours: { type: Number, default: 0 },
      prepaidAmount: { type: Number, default: 0 },
      overstayAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      amountDue: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      breakdown: [{ label: String, amount: Number }],
      settled: { type: Boolean, default: false },
      settledAt: { type: Date },
    },

    entryEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleRecognitionEvent' },
    exitEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleRecognitionEvent' },
  },
  { timestamps: true },
);

// Exit lookup: the active session for a plate at a lot.
parkingSessionSchema.index({ parkingLot: 1, vehicleNumberNormalized: 1, status: 1 });
parkingSessionSchema.index({ parkingLot: 1, actualEntryTime: -1 });
parkingSessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ParkingSession', parkingSessionSchema, 'parkingSessions');
