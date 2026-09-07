'use strict';

const { ParkingLot, PricingRule } = require('../../models');
const { LOT_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const cache = require('../../services/cache.service');
const { loadManagedLot } = require('../parking/parking.service');
const { DEFAULT_PRICING_RULE, ZONE_PRESETS } = require('./pricing.defaults');
const service = require('./pricing.service');

/** Price a prospective booking. Drivers call this before paying. */
const quote = asyncHandler(async (req, res) => {
  const { parkingLotId, vehicleType, expectedEntryTime, expectedExitTime } = req.body;

  const lot = await ParkingLot.findById(parkingLotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
  if (lot.status !== LOT_STATUS.APPROVED) throw ApiError.badRequest('This parking facility is not accepting bookings');

  const priced = await service.quote({ lot, vehicleType, entryTime: expectedEntryTime, exitTime: expectedExitTime });

  return ok(res, {
    ...priced,
    parkingLotId: lot._id.toString(),
    parkingLotName: lot.name,
    availableSlots: lot.availableFor(vehicleType),
    expectedEntryTime,
    expectedExitTime,
  });
});

const getRule = asyncHandler(async (req, res) => {
  const lot = await loadManagedLot(req.params.id, req.user);
  const rule = await PricingRule.findOne({ parkingLot: lot._id }).lean();
  return ok(res, {
    parkingLotId: lot._id.toString(),
    rule: rule || { ...DEFAULT_PRICING_RULE, _source: 'default' },
    zonePresets: ZONE_PRESETS,
    lotPricing: lot.pricing,
  });
});

const updateRule = asyncHandler(async (req, res) => {
  const lot = await loadManagedLot(req.params.id, req.user);

  const rule = await PricingRule.findOneAndUpdate(
    { parkingLot: lot._id },
    { $set: { ...req.body, owner: lot.owner, parkingLot: lot._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  // Quoted prices are cached with the lot, so drop them.
  await cache.invalidateLot(lot._id.toString());
  return ok(res, { rule }, 'Dynamic pricing rules updated');
});

/**
 * Hour-by-hour price curve for a whole day. Lets an owner see the effect of a
 * rule change before committing to it.
 */
const simulate = asyncHandler(async (req, res) => {
  const lot = await loadManagedLot(req.params.id, req.user);
  const { vehicleType, occupancyRate, date } = req.body;

  const rule = await service.getRuleForLot(lot._id);
  const baseDate = date ? new Date(date) : new Date();

  // Clone so the override does not touch the persisted document.
  const lotForSim = lot.toObject({ virtuals: true });
  if (occupancyRate !== undefined) lotForSim.occupancyRate = occupancyRate;

  const curve = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const entryTime = new Date(baseDate);
    entryTime.setHours(hour, 0, 0, 0);
    const exitTime = new Date(entryTime.getTime() + 60 * 60 * 1000);

    const priced = await service.quote({ lot: lotForSim, vehicleType, entryTime, exitTime, rule });
    curve.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      ratePerHour: priced.effectiveRatePerHour,
      multiplier: priced.multipliers.combined,
      factors: priced.multipliers,
      peakWindows: priced.factors.peakWindows,
      isOpen: lot.isOpenAt(entryTime),
    });
  }

  return ok(res, {
    parkingLotId: lot._id.toString(),
    vehicleType,
    baseRatePerHour: lot.hourlyRate[vehicleType],
    occupancyRate: occupancyRate !== undefined ? occupancyRate : lot.occupancyRate,
    date: baseDate.toISOString(),
    curve,
  });
});

module.exports = { quote, getRule, updateRule, simulate };
