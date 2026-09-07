'use strict';

const mongoose = require('mongoose');

/**
 * Dynamic pricing configuration for one parking lot. Only the four factors the
 * spec allows are represented: occupancy, peak hours, location and day of week.
 * A lot without a rule document falls back to modules/pricing/pricing.defaults.
 */
const pricingRuleSchema = new mongoose.Schema(
  {
    parkingLot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isActive: { type: Boolean, default: true },

    /** Occupancy tiers, matched on the lot's live occupancy ratio (0..1). */
    occupancyTiers: [
      {
        upTo: { type: Number, required: true, min: 0, max: 1 }, // inclusive upper bound
        multiplier: { type: Number, required: true, min: 0.1, max: 5 },
      },
    ],

    /** Peak windows in facility local time; overlapping windows take the highest. */
    peakHours: [
      {
        label: { type: String, trim: true },
        startTime: { type: String, required: true }, // "HH:mm"
        endTime: { type: String, required: true },
        multiplier: { type: Number, required: true, min: 0.1, max: 5 },
        days: [{ type: Number, min: 0, max: 6 }], // empty = every day
      },
    ],

    /** Zone premium for high-demand areas (airport, CBD, stadium...). */
    locationFactor: {
      zoneLabel: { type: String, trim: true, default: 'standard' },
      multiplier: { type: Number, default: 1, min: 0.1, max: 5 },
    },

    /** Index 0 = Sunday .. 6 = Saturday. */
    dayOfWeekMultipliers: {
      type: [Number],
      default: [1, 1, 1, 1, 1, 1, 1],
      validate: {
        validator: (value) => value.length === 7 && value.every((m) => m >= 0.1 && m <= 5),
        message: 'dayOfWeekMultipliers must hold 7 values between 0.1 and 5',
      },
    },

    /** Guard rails so the combined multiplier can never surprise a driver. */
    limits: {
      minMultiplier: { type: Number, default: 0.5, min: 0.1 },
      maxMultiplier: { type: Number, default: 2.5, max: 5 },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PricingRule', pricingRuleSchema, 'pricingRules');
