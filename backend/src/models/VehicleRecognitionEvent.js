'use strict';

const mongoose = require('mongoose');
const { RECOGNITION_EVENT, RECOGNITION_RESULT } = require('./constants');

/**
 * Audit trail for every gate camera capture. Written whether or not the gate
 * opened - this is the record the fraud report and admin monitoring read from.
 * Images are never persisted, only what the vision model returned.
 */
const vehicleRecognitionEventSchema = new mongoose.Schema(
  {
    parkingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
    eventType: { type: String, enum: Object.values(RECOGNITION_EVENT), required: true, index: true },

    recognizedPlate: { type: String, uppercase: true, trim: true },
    recognizedPlateNormalized: { type: String, index: true },
    confidence: { type: Number, min: 0, max: 1 },
    vehicleTypeGuess: { type: String, trim: true },
    provider: { type: String, default: 'gemini' },
    model: { type: String, trim: true },
    latencyMs: { type: Number },

    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    parkingSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSession' },

    result: { type: String, enum: Object.values(RECOGNITION_RESULT), required: true, index: true },
    allowed: { type: Boolean, required: true, index: true },
    message: { type: String, trim: true },

    matchDetail: {
      bookedPlate: { type: String },
      matchKind: { type: String },
      similarity: { type: Number },
    },

    flaggedAsFraud: { type: Boolean, default: false, index: true },
    cameraId: { type: String, trim: true },
    rawModelResponse: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

vehicleRecognitionEventSchema.index({ parkingLot: 1, createdAt: -1 });
vehicleRecognitionEventSchema.index({ flaggedAsFraud: 1, createdAt: -1 });

module.exports = mongoose.model(
  'VehicleRecognitionEvent',
  vehicleRecognitionEventSchema,
  'vehicleRecognitionEvents',
);
