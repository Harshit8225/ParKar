'use strict';

const { z } = require('zod');
const { ZONE_PRESETS } = require('./pricing.defaults');
const v = require('../../utils/validators');

const quoteSchema = z
  .object({
    parkingLotId: v.objectId,
    vehicleType: v.vehicleType,
    expectedEntryTime: v.isoDate,
    expectedExitTime: v.isoDate,
  })
  .refine((value) => value.expectedExitTime > value.expectedEntryTime, {
    path: ['expectedExitTime'],
    message: 'Exit time must be after entry time',
  });

const occupancyTierSchema = z.object({
  upTo: z.coerce.number().min(0).max(1),
  multiplier: v.multiplier,
});

const peakHourSchema = z.object({
  label: z.string().trim().max(60).optional(),
  startTime: v.clockTime,
  endTime: v.clockTime,
  multiplier: v.multiplier,
  days: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
});

const updateRuleSchema = z
  .object({
    isActive: z.coerce.boolean().optional(),
    occupancyTiers: z
      .array(occupancyTierSchema)
      .min(1)
      .max(8)
      // Tiers are looked up by ascending bound, so the top tier must reach 1.0.
      .refine((tiers) => Math.max(...tiers.map((t) => t.upTo)) >= 1, {
        message: 'The highest occupancy tier must cover full occupancy (upTo: 1)',
      })
      .optional(),
    peakHours: z.array(peakHourSchema).max(12).optional(),
    locationFactor: z
      .object({
        zoneLabel: z.enum(Object.keys(ZONE_PRESETS)).optional(),
        multiplier: v.multiplier.optional(),
      })
      .optional(),
    dayOfWeekMultipliers: z.array(v.multiplier).length(7, 'Provide exactly 7 values, Sunday first').optional(),
    limits: z
      .object({
        minMultiplier: z.coerce.number().min(0.1).max(5).optional(),
        maxMultiplier: z.coerce.number().min(0.1).max(5).optional(),
      })
      .refine(
        (value) =>
          value.minMultiplier === undefined ||
          value.maxMultiplier === undefined ||
          value.minMultiplier <= value.maxMultiplier,
        { message: 'minMultiplier cannot exceed maxMultiplier' },
      )
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

/** Preview a rule change across a day without saving it. */
const simulateSchema = z.object({
  vehicleType: v.vehicleType,
  occupancyRate: z.coerce.number().min(0).max(1).optional(),
  date: v.isoDate.optional(),
});

module.exports = { quoteSchema, updateRuleSchema, simulateSchema };
