'use strict';

const { PricingRule } = require('../../models');
const { VEHICLE_TYPES } = require('../../models/constants');
const { DEFAULT_PRICING_RULE, ZONE_PRESETS } = require('./pricing.defaults');
const { parseClock, minutesOfDay, dayOfWeek, billableHours } = require('../../utils/time');
const ApiError = require('../../utils/ApiError');

const round2 = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Load the lot's rule, falling back to the platform default. */
const getRuleForLot = async (lotId) => {
  const rule = await PricingRule.findOne({ parkingLot: lotId }).lean();
  if (!rule || rule.isActive === false) return { ...DEFAULT_PRICING_RULE, _source: 'default' };
  return { ...DEFAULT_PRICING_RULE, ...rule, _source: 'lot' };
};

/** Occupancy tier lookup. Tiers are sorted so the first matching bound wins. */
const occupancyMultiplier = (rule, occupancyRate) => {
  const tiers = [...(rule.occupancyTiers || [])].sort((a, b) => a.upTo - b.upTo);
  const ratio = clamp(Number(occupancyRate) || 0, 0, 1);
  const tier = tiers.find((t) => ratio <= t.upTo);
  if (tier) return tier.multiplier;
  return tiers.length ? tiers[tiers.length - 1].multiplier : 1;
};

/** True when `minutes` sits inside a window, handling windows that cross midnight. */
const inWindow = (minutes, start, end) =>
  end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;

/**
 * Peak-hour multiplier for a booked window. A booking that touches any part of
 * a peak window pays that premium; overlapping windows take the highest.
 */
const peakHourMultiplier = (rule, entryTime, exitTime) => {
  const windows = rule.peakHours || [];
  if (!windows.length) return { multiplier: 1, labels: [] };

  const day = dayOfWeek(entryTime);
  const entryMinutes = minutesOfDay(entryTime);
  const exitMinutes = minutesOfDay(exitTime);

  let best = 1;
  const labels = [];

  for (const window of windows) {
    if (window.days && window.days.length && !window.days.includes(day)) continue;
    const start = parseClock(window.startTime);
    const end = parseClock(window.endTime);
    if (start === null || end === null) continue;

    // Overlap test against the booked window: either end inside, or fully spanning.
    const overlaps =
      inWindow(entryMinutes, start, end) ||
      inWindow(exitMinutes, start, end) ||
      (entryMinutes <= start && exitMinutes >= end);

    if (!overlaps) continue;

    const label = window.label || `${window.startTime}-${window.endTime}`;
    if (window.multiplier > best) {
      best = window.multiplier;
      labels.unshift(label);
    } else {
      labels.push(label);
    }
  }

  return { multiplier: best, labels };
};

const locationMultiplier = (rule) => {
  const factor = rule.locationFactor || {};
  if (typeof factor.multiplier === 'number') return factor.multiplier;
  return ZONE_PRESETS[factor.zoneLabel] !== undefined ? ZONE_PRESETS[factor.zoneLabel] : 1;
};

const dayOfWeekMultiplier = (rule, entryTime) => {
  const multipliers = rule.dayOfWeekMultipliers || DEFAULT_PRICING_RULE.dayOfWeekMultipliers;
  const value = multipliers[dayOfWeek(entryTime)];
  return typeof value === 'number' ? value : 1;
};

const baseRateFor = (lot, vehicleType) => {
  const rate = lot.hourlyRate ? lot.hourlyRate[vehicleType] : undefined;
  if (typeof rate !== 'number' || rate <= 0) {
    throw ApiError.badRequest(`This facility has no rate configured for ${vehicleType.replace('_', ' ')}`);
  }
  return rate;
};

/**
 * Price a booking window.
 *
 *   effectiveRate = baseRate * clamp(occupancy * peak * location * dayOfWeek)
 *   amount        = effectiveRate * billableHours
 *
 * Returns the full factor breakdown so it can be snapshotted onto the booking
 * and shown to the driver before they pay.
 */
const quote = async ({ lot, vehicleType, entryTime, exitTime, rule: providedRule }) => {
  if (!Object.values(VEHICLE_TYPES).includes(vehicleType)) {
    throw ApiError.badRequest('Unsupported vehicle type');
  }

  const rule = providedRule || (await getRuleForLot(lot._id));
  const baseRate = baseRateFor(lot, vehicleType);
  const minHours = (lot.pricing && lot.pricing.minChargeHours) || 1;
  const hours = Math.max(minHours, billableHours(entryTime, exitTime));

  const dynamicEnabled = !lot.pricing || lot.pricing.dynamicPricingEnabled !== false;
  const occupancyRate = typeof lot.occupancyRate === 'number' ? lot.occupancyRate : 0;

  const occupancy = dynamicEnabled ? occupancyMultiplier(rule, occupancyRate) : 1;
  const peak = dynamicEnabled ? peakHourMultiplier(rule, entryTime, exitTime) : { multiplier: 1, labels: [] };
  const location = dynamicEnabled ? locationMultiplier(rule) : 1;
  const dow = dynamicEnabled ? dayOfWeekMultiplier(rule, entryTime) : 1;

  const limits = rule.limits || DEFAULT_PRICING_RULE.limits;
  const rawCombined = occupancy * peak.multiplier * location * dow;
  const combined = round2(clamp(rawCombined, limits.minMultiplier, limits.maxMultiplier));

  const effectiveRate = round2(baseRate * combined);
  const amount = round2(effectiveRate * hours);
  const baseTotal = round2(baseRate * hours);

  return {
    currency: 'INR',
    vehicleType,
    baseRatePerHour: round2(baseRate),
    effectiveRatePerHour: effectiveRate,
    durationHours: hours,
    amount,
    dynamicPricingEnabled: dynamicEnabled,
    multipliers: {
      occupancy: round2(occupancy),
      peakHour: round2(peak.multiplier),
      location: round2(location),
      dayOfWeek: round2(dow),
      combined,
      cappedFrom: round2(rawCombined) !== combined ? round2(rawCombined) : undefined,
    },
    factors: {
      occupancyRate: round2(occupancyRate),
      peakWindows: peak.labels,
      zone: (rule.locationFactor && rule.locationFactor.zoneLabel) || 'standard',
      dayOfWeek: dayOfWeek(entryTime),
    },
    breakdown: [
      { label: `Base rate (${hours}h x ${round2(baseRate)}/h)`, amount: baseTotal },
      { label: `Dynamic pricing (x${combined})`, amount: round2(amount - baseTotal) },
    ],
    ruleSource: rule._source || 'lot',
  };
};

/**
 * Price overstay minutes at exit. The lot's grace period is forgiven, the rest
 * is billed per started hour at the overstay multiplier applied to the rate the
 * driver actually paid - so a booking-time premium is not compounded twice.
 */
const quoteOverstay = ({ lot, booking, overstayMinutes }) => {
  const grace = (lot.pricing && lot.pricing.graceMinutes) || 0;
  const chargeable = Math.max(0, overstayMinutes - grace);

  if (chargeable <= 0) {
    return {
      overstayMinutes,
      graceMinutes: grace,
      chargeableMinutes: 0,
      chargeableHours: 0,
      ratePerHour: 0,
      amount: 0,
      breakdown: [],
    };
  }

  const multiplier = (lot.pricing && lot.pricing.overstayMultiplier) || 1.5;
  const ratePerHour = round2(booking.pricing.effectiveRatePerHour * multiplier);
  const hours = Math.ceil(chargeable / 60);
  const amount = round2(ratePerHour * hours);

  return {
    overstayMinutes,
    graceMinutes: grace,
    chargeableMinutes: chargeable,
    chargeableHours: hours,
    ratePerHour,
    overstayMultiplier: multiplier,
    amount,
    breakdown: [{ label: `Overstay ${hours}h x ${ratePerHour}/h (x${multiplier} penalty)`, amount }],
  };
};

module.exports = {
  getRuleForLot,
  quote,
  quoteOverstay,
  occupancyMultiplier,
  peakHourMultiplier,
  locationMultiplier,
  dayOfWeekMultiplier,
  round2,
};
