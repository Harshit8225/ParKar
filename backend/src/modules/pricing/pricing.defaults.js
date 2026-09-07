'use strict';

/**
 * Fallback dynamic-pricing configuration used when a lot has no PricingRule.
 * Only the four permitted factors appear here: occupancy, peak hours,
 * location and day of week.
 */
const DEFAULT_PRICING_RULE = {
  isActive: true,
  occupancyTiers: [
    { upTo: 0.5, multiplier: 1.0 }, // plenty of space - list price
    { upTo: 0.75, multiplier: 1.15 },
    { upTo: 0.9, multiplier: 1.3 },
    { upTo: 1.0, multiplier: 1.5 }, // nearly full - ration by price
  ],
  peakHours: [
    { label: 'Morning rush', startTime: '08:00', endTime: '11:00', multiplier: 1.25, days: [1, 2, 3, 4, 5] },
    { label: 'Evening rush', startTime: '17:00', endTime: '21:00', multiplier: 1.3, days: [1, 2, 3, 4, 5] },
    { label: 'Weekend evening', startTime: '18:00', endTime: '23:00', multiplier: 1.2, days: [0, 6] },
  ],
  locationFactor: { zoneLabel: 'standard', multiplier: 1 },
  dayOfWeekMultipliers: [1.1, 1, 1, 1, 1, 1.05, 1.15], // Sun..Sat
  limits: { minMultiplier: 0.5, maxMultiplier: 2.5 },
};

/** Zone premiums an owner can pick from when configuring locationFactor. */
const ZONE_PRESETS = {
  standard: 1,
  residential: 0.95,
  commercial: 1.15,
  cbd: 1.3,
  airport: 1.4,
  railway: 1.25,
  mall: 1.2,
  stadium: 1.35,
  hospital: 1.1,
};

module.exports = { DEFAULT_PRICING_RULE, ZONE_PRESETS };
