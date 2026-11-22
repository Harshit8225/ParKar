'use strict';

const mongoose = require('mongoose');
const { LOT_STATUS, VEHICLE_TYPE_LIST, SPOT_ZONE } = require('./constants');

const perVehicle = (defaultValue = 0) =>
  VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: { type: Number, default: defaultValue, min: 0 } }), {});

/** One vehicle's claim on space: a fixed bay, or a run of flexible-area markers. */
const spotHoldSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    vehicleType: { type: String, enum: VEHICLE_TYPE_LIST, required: true },
    zone: { type: String, enum: Object.values(SPOT_ZONE), required: true },
    bay: { type: Number, min: 1 },          // fixed zone
    row: { type: String },                  // flexible zone
    start: { type: Number, min: 0 },        // flexible zone, 0-based marker index
    size: { type: Number, required: true, min: 1 },
    label: { type: String, required: true },
    heldAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const parkingLotSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingOwner' },

    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },

    contact: {
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },

    location: {
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true, index: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
      // GeoJSON [longitude, latitude] - order matters for 2dsphere queries.
      geo: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: {
          type: [Number],
          required: true,
          validate: {
            validator: (value) =>
              Array.isArray(value) &&
              value.length === 2 &&
              value[0] >= -180 && value[0] <= 180 &&
              value[1] >= -90 && value[1] <= 90,
            message: 'geo.coordinates must be [longitude, latitude] within valid ranges',
          },
        },
      },
    },

    capacity: perVehicle(0),   // dedicated fixed bays per vehicle type
    occupied: perVehicle(0),   // vehicles physically inside (fixed + flexible)
    reserved: perVehicle(0),   // bookings holding space that have not entered yet

    hourlyRate: perVehicle(0),

    /**
     * Shared space any vehicle type can use, laid out as rows of bike-sized
     * markers (bike 1, car 2, bus 4). See modules/allocation/spot.layout.js.
     */
    layout: {
      flexibleRows: [
        {
          _id: false,
          label: { type: String, required: true, trim: true, uppercase: true, maxlength: 3 },
          units: { type: Number, required: true, min: 1, max: 200 },
        },
      ],
      /** How long simultaneous requests are collected before the optimiser runs. */
      batchWindowMs: { type: Number, default: 3000, min: 0, max: 10000 },
      /** Batching starts once this many or fewer spaces remain for the requested type. */
      contentionThreshold: { type: Number, default: 2, min: 0, max: 100 },
    },

    /** Every vehicle currently holding space here. Written only under the lot lock. */
    spotHolds: { type: [spotHoldSchema], default: [] },

    /**
     * Bookable count per type, derived from capacity, layout and spotHolds.
     * Stored (not virtual) so search can filter and sort on it in MongoDB.
     */
    availability: perVehicle(0),

    /** Multipliers applied on top of hourlyRate. See modules/pricing. */
    pricing: {
      dynamicPricingEnabled: { type: Boolean, default: true },
      overstayMultiplier: { type: Number, default: 1.5, min: 1 },
      graceMinutes: { type: Number, default: 10, min: 0 },
      minChargeHours: { type: Number, default: 1, min: 1 },
    },

    operatingHours: {
      is24x7: { type: Boolean, default: false },
      openTime: { type: String, default: '06:00' },  // "HH:mm", facility local time
      closeTime: { type: String, default: '23:00' },
    },

    amenities: {
      evCharging: { type: Boolean, default: false, index: true },
      covered: { type: Boolean, default: false },
      security: { type: Boolean, default: false },
      cctv: { type: Boolean, default: false },
    },

    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },

    status: { type: String, enum: Object.values(LOT_STATUS), default: LOT_STATUS.PENDING, index: true },
    statusReason: { type: String, trim: true },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    commissionPercent: { type: Number, min: 0, max: 100 }, // overrides the platform default

    images: [{ type: String, trim: true }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

parkingLotSchema.index({ 'location.geo': '2dsphere' });
parkingLotSchema.index({ status: 1, 'location.city': 1 });
parkingLotSchema.index({ owner: 1, status: 1 });
parkingLotSchema.index({ name: 'text', 'location.address': 'text', 'location.city': 'text' });

parkingLotSchema.index({ status: 1, 'availability.car': -1 });

// Any save (create, owner edit) re-derives availability from the space model.
// The allocation service writes spotHolds with updateOne and sets availability
// itself in the same write.
parkingLotSchema.pre('save', function deriveAvailability(next) {
  const { computeAvailability } = require('../modules/allocation/spot.layout');
  this.availability = computeAvailability(this);
  next();
});

/**
 * How many of each type a new booking could take right now: free fixed bays of
 * that type plus what fits in the shared flexible area. The flexible part is
 * shared, so these numbers overlap across types.
 */
parkingLotSchema.virtual('available').get(function available() {
  const plainAvailability = this.availability && typeof this.availability.toObject === 'function'
    ? this.availability.toObject()
    : this.availability || {};
  return VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: plainAvailability[type] || 0 }), {});
});

/** Share of the lot's space held, measured in bike units across fixed and flexible zones. */
parkingLotSchema.virtual('occupancyRate').get(function occupancyRate() {
  const { computeOccupancyRate } = require('../modules/allocation/spot.layout');
  return computeOccupancyRate(this);
});

parkingLotSchema.methods.availableFor = function availableFor(vehicleType) {
  return this.available[vehicleType] ?? 0;
};

parkingLotSchema.methods.isOpenAt = function isOpenAt(date) {
  const { parseClock, minutesOfDay } = require('../utils/time');
  if (this.operatingHours.is24x7) return true;
  const open = parseClock(this.operatingHours.openTime);
  const close = parseClock(this.operatingHours.closeTime);
  if (open === null || close === null) return true;
  const now = minutesOfDay(date);
  // Windows crossing midnight (e.g. 22:00 -> 06:00) wrap around.
  return close > open ? now >= open && now <= close : now >= open || now <= close;
};

module.exports = mongoose.model('ParkingLot', parkingLotSchema, 'parkingLots');
