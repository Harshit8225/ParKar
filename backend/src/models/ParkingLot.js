'use strict';

const mongoose = require('mongoose');
const { LOT_STATUS } = require('./constants');

const perVehicle = (defaultValue = 0) => ({
  two_wheeler: { type: Number, default: defaultValue, min: 0 },
  four_wheeler: { type: Number, default: defaultValue, min: 0 },
});

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

    capacity: perVehicle(0),
    occupied: perVehicle(0),   // vehicles physically inside
    reserved: perVehicle(0),   // paid bookings that have not entered yet

    hourlyRate: perVehicle(0),

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

/** Slots a new booking may take: capacity minus vehicles inside minus paid reservations. */
parkingLotSchema.virtual('available').get(function available() {
  return {
    two_wheeler: Math.max(0, this.capacity.two_wheeler - this.occupied.two_wheeler - this.reserved.two_wheeler),
    four_wheeler: Math.max(0, this.capacity.four_wheeler - this.occupied.four_wheeler - this.reserved.four_wheeler),
  };
});

parkingLotSchema.virtual('occupancyRate').get(function occupancyRate() {
  const total = this.capacity.two_wheeler + this.capacity.four_wheeler;
  if (!total) return 0;
  const used =
    this.occupied.two_wheeler + this.occupied.four_wheeler + this.reserved.two_wheeler + this.reserved.four_wheeler;
  return Math.min(1, Number((used / total).toFixed(4)));
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
