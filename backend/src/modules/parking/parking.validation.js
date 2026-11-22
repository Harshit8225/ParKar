'use strict';

const { z } = require('zod');
const { LOT_STATUS } = require('../../models/constants');
const v = require('../../utils/validators');

const perVehicleNumbers = z.object({
  bike: v.money.default(0),
  car: v.money.default(0),
  bus: v.money.default(0),
});

const perVehicleCounts = z.object({
  bike: z.coerce.number().int().min(0).max(5000).default(0),
  car: z.coerce.number().int().min(0).max(5000).default(0),
  bus: z.coerce.number().int().min(0).max(5000).default(0),
});

/**
 * Shared flexible area: rows of bike-sized markers (bike 1, car 2, bus 4).
 * Row lengths that are multiples of 4 let every marker be used by a bus.
 */
const layoutSchema = z.object({
  flexibleRows: z
    .array(
      z.object({
        label: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, 'Row label must be 1-3 letters or digits'),
        units: z.coerce.number().int().min(1).max(200),
      }),
    )
    .max(50)
    .default([])
    .refine((rows) => new Set(rows.map((r) => r.label)).size === rows.length, { message: 'Row labels must be unique' }),
  batchWindowMs: z.coerce.number().int().min(0).max(10000).optional(),
  contentionThreshold: z.coerce.number().int().min(0).max(100).optional(),
});

const flexibleUnits = (layout) => (layout?.flexibleRows || []).reduce((sum, row) => sum + row.units, 0);

const locationSchema = z.object({
  address: z.string().trim().min(5, 'Address is too short').max(300),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().trim().regex(/^[0-9]{4,10}$/, 'Enter a valid pincode').optional(),
  latitude: v.latitude,
  longitude: v.longitude,
});

const operatingHoursSchema = z
  .object({
    is24x7: z.coerce.boolean().default(false),
    openTime: v.clockTime.default('06:00'),
    closeTime: v.clockTime.default('23:00'),
  })
  .refine((value) => value.is24x7 || value.openTime !== value.closeTime, {
    message: 'Opening and closing time cannot be identical unless the facility is 24/7',
  });

const amenitiesSchema = z.object({
  evCharging: z.coerce.boolean().default(false),
  covered: z.coerce.boolean().default(false),
  security: z.coerce.boolean().default(false),
  cctv: z.coerce.boolean().default(false),
});

const pricingConfigSchema = z.object({
  dynamicPricingEnabled: z.coerce.boolean().default(true),
  overstayMultiplier: z.coerce.number().min(1).max(5).default(1.5),
  graceMinutes: z.coerce.number().int().min(0).max(120).default(10),
  minChargeHours: z.coerce.number().int().min(1).max(24).default(1),
});

const createLotSchema = z
  .object({
    name: z.string().trim().min(3, 'Name is too short').max(160),
    description: z.string().trim().max(1000).optional(),
    contact: z
      .object({
        email: z.string().trim().toLowerCase().email('Enter a valid contact email'),
        phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid contact phone'),
      })
      .optional(),
    location: locationSchema,
    capacity: perVehicleCounts,
    hourlyRate: perVehicleNumbers,
    layout: layoutSchema.optional(),
    operatingHours: operatingHoursSchema.optional(),
    amenities: amenitiesSchema.optional(),
    pricing: pricingConfigSchema.optional(),
    images: z.array(z.string().trim().url('Images must be valid URLs')).max(10).optional(),
  })
  // A lot with no space at all could never be booked, so reject it up front.
  .refine(
    (value) => value.capacity.bike + value.capacity.car + value.capacity.bus + flexibleUnits(value.layout) > 0,
    { path: ['capacity'], message: 'Configure fixed bays or a flexible area' },
  )
  // Fixed bays without a rate are unbookable; the pricing engine would reject them later.
  .refine((value) => value.capacity.bike === 0 || value.hourlyRate.bike > 0, {
    path: ['hourlyRate', 'bike'],
    message: 'Set a bike rate when bike bays are configured',
  })
  .refine((value) => value.capacity.car === 0 || value.hourlyRate.car > 0, {
    path: ['hourlyRate', 'car'],
    message: 'Set a car rate when car bays are configured',
  })
  .refine((value) => value.capacity.bus === 0 || value.hourlyRate.bus > 0, {
    path: ['hourlyRate', 'bus'],
    message: 'Set a bus rate when bus bays are configured',
  })
  // A flexible area is only usable by types that have a rate.
  .refine(
    (value) => flexibleUnits(value.layout) === 0 || value.hourlyRate.bike + value.hourlyRate.car + value.hourlyRate.bus > 0,
    { path: ['hourlyRate'], message: 'Set a rate for at least one vehicle type that may use the flexible area' },
  );

const updateLotSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    contact: z
      .object({
        email: z.string().trim().toLowerCase().email().optional(),
        phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/).optional(),
      })
      .optional(),
    location: locationSchema.partial().optional(),
    capacity: perVehicleCounts.partial().optional(),
    hourlyRate: perVehicleNumbers.partial().optional(),
    layout: layoutSchema.partial().optional(),
    operatingHours: z
      .object({
        is24x7: z.coerce.boolean().optional(),
        openTime: v.clockTime.optional(),
        closeTime: v.clockTime.optional(),
      })
      .optional(),
    amenities: amenitiesSchema.partial().optional(),
    pricing: pricingConfigSchema.partial().optional(),
    images: z.array(z.string().trim().url()).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

const searchSchema = z
  .object({
    latitude: v.latitude.optional(),
    longitude: v.longitude.optional(),
    radiusKm: z.coerce.number().min(0.1).max(50).default(5),
    city: z.string().trim().min(2).max(80).optional(),
    q: z.string().trim().min(2).max(120).optional(),
    vehicleType: v.vehicleType.optional(),
    evCharging: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    open24x7: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    availableOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    maxRate: v.money.optional(),
    sortBy: z.enum(['distance', 'rate', 'rating', 'availability']).default('distance'),
  })
  .merge(v.pagination)
  // Geo search needs both coordinates; otherwise fall back to city/text search.
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: 'Provide both latitude and longitude, or neither',
  })
  .refine((value) => value.latitude !== undefined || value.city || value.q, {
    message: 'Provide coordinates, a city, or a search term',
  });

const availabilityQuerySchema = z.object({
  vehicleType: v.vehicleType.optional(),
});

const ownerLotListSchema = z
  .object({
    status: z.enum(Object.values(LOT_STATUS)).optional(),
  })
  .merge(v.pagination);

module.exports = {
  createLotSchema,
  updateLotSchema,
  searchSchema,
  availabilityQuerySchema,
  ownerLotListSchema,
};
