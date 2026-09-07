'use strict';

const pricing = require('../src/modules/pricing/pricing.service');
const { DEFAULT_PRICING_RULE } = require('../src/modules/pricing/pricing.defaults');
const { dayjs } = require('../src/utils/time');

const TZ = 'Asia/Kolkata';

/** A lot object shaped like the Mongoose doc the service reads. */
const makeLot = (overrides = {}) => ({
  _id: 'lot1',
  hourlyRate: { two_wheeler: 20, four_wheeler: 50 },
  occupancyRate: 0.2,
  pricing: {
    dynamicPricingEnabled: true,
    overstayMultiplier: 1.5,
    graceMinutes: 10,
    minChargeHours: 1,
    ...(overrides.pricing || {}),
  },
  ...overrides,
});

/** A fixed instant in facility-local time, so tests do not drift with the clock. */
const localTime = (dayOffsetFromMonday, hour) =>
  dayjs.tz('2025-01-06 00:00', TZ).add(dayOffsetFromMonday, 'day').hour(hour).minute(0).second(0).toDate();

const FLAT_RULE = {
  ...DEFAULT_PRICING_RULE,
  occupancyTiers: [{ upTo: 1, multiplier: 1 }],
  peakHours: [],
  dayOfWeekMultipliers: [1, 1, 1, 1, 1, 1, 1],
  locationFactor: { zoneLabel: 'standard', multiplier: 1 },
};

describe('quote - base arithmetic', () => {
  it('charges rate x hours when every multiplier is neutral', async () => {
    const result = await pricing.quote({
      lot: makeLot(),
      vehicleType: 'four_wheeler',
      entryTime: localTime(1, 13), // Tuesday 13:00, off-peak
      exitTime: localTime(1, 16),
      rule: FLAT_RULE,
    });

    expect(result.durationHours).toBe(3);
    expect(result.multipliers.combined).toBe(1);
    expect(result.effectiveRatePerHour).toBe(50);
    expect(result.amount).toBe(150);
  });

  it('bills a started hour in full', async () => {
    const entry = localTime(1, 13);
    const result = await pricing.quote({
      lot: makeLot(),
      vehicleType: 'two_wheeler',
      entryTime: entry,
      exitTime: new Date(entry.getTime() + 90 * 60 * 1000), // 1h30m
      rule: FLAT_RULE,
    });

    expect(result.durationHours).toBe(2);
    expect(result.amount).toBe(40);
  });

  it('prices two-wheelers and four-wheelers separately', async () => {
    const args = { entryTime: localTime(1, 13), exitTime: localTime(1, 14), rule: FLAT_RULE, lot: makeLot() };
    const two = await pricing.quote({ ...args, vehicleType: 'two_wheeler' });
    const four = await pricing.quote({ ...args, vehicleType: 'four_wheeler' });

    expect(two.amount).toBe(20);
    expect(four.amount).toBe(50);
  });

  it('rejects a vehicle type the facility has no rate for', async () => {
    const lot = makeLot({ hourlyRate: { two_wheeler: 0, four_wheeler: 50 } });
    await expect(
      pricing.quote({
        lot,
        vehicleType: 'two_wheeler',
        entryTime: localTime(1, 13),
        exitTime: localTime(1, 14),
        rule: FLAT_RULE,
      }),
    ).rejects.toThrow(/no rate configured/i);
  });
});

describe('quote - the four dynamic factors', () => {
  it('raises the price as occupancy rises', async () => {
    const args = { vehicleType: 'four_wheeler', entryTime: localTime(1, 13), exitTime: localTime(1, 14) };

    const empty = await pricing.quote({ ...args, lot: makeLot({ occupancyRate: 0.1 }), rule: DEFAULT_PRICING_RULE });
    const nearlyFull = await pricing.quote({ ...args, lot: makeLot({ occupancyRate: 0.95 }), rule: DEFAULT_PRICING_RULE });

    expect(nearlyFull.multipliers.occupancy).toBeGreaterThan(empty.multipliers.occupancy);
    expect(nearlyFull.amount).toBeGreaterThan(empty.amount);
  });

  it('applies a peak-hour premium to a booking overlapping the window', async () => {
    const rule = {
      ...FLAT_RULE,
      peakHours: [{ label: 'Evening', startTime: '17:00', endTime: '21:00', multiplier: 1.5, days: [] }],
    };

    const offPeak = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(1, 13), exitTime: localTime(1, 14), rule,
    });
    const peak = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(1, 18), exitTime: localTime(1, 19), rule,
    });

    expect(offPeak.multipliers.peakHour).toBe(1);
    expect(peak.multipliers.peakHour).toBe(1.5);
    expect(peak.factors.peakWindows).toContain('Evening');
  });

  it('applies the peak premium when the booking only clips the window', async () => {
    const rule = {
      ...FLAT_RULE,
      peakHours: [{ label: 'Evening', startTime: '17:00', endTime: '21:00', multiplier: 1.5, days: [] }],
    };
    // 16:00 -> 18:00 starts off-peak but runs into the window.
    const result = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(1, 16), exitTime: localTime(1, 18), rule,
    });
    expect(result.multipliers.peakHour).toBe(1.5);
  });

  it('honours the day-of-week multiplier', async () => {
    const rule = { ...FLAT_RULE, dayOfWeekMultipliers: [2, 1, 1, 1, 1, 1, 1] }; // Sunday doubles
    const sunday = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(6, 13), exitTime: localTime(6, 14), rule,
    });
    const monday = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(0, 13), exitTime: localTime(0, 14), rule,
    });

    expect(sunday.multipliers.dayOfWeek).toBe(2);
    expect(monday.multipliers.dayOfWeek).toBe(1);
    expect(sunday.amount).toBe(monday.amount * 2);
  });

  it('applies the location zone premium', async () => {
    const rule = { ...FLAT_RULE, locationFactor: { zoneLabel: 'airport' } };
    const result = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(1, 13), exitTime: localTime(1, 14), rule,
    });

    expect(result.multipliers.location).toBe(1.4);
    expect(result.factors.zone).toBe('airport');
  });

  it('caps the combined multiplier at the configured ceiling', async () => {
    const rule = {
      ...FLAT_RULE,
      occupancyTiers: [{ upTo: 1, multiplier: 2 }],
      peakHours: [{ startTime: '00:00', endTime: '23:59', multiplier: 2, days: [] }],
      dayOfWeekMultipliers: [2, 2, 2, 2, 2, 2, 2],
      locationFactor: { multiplier: 2 },
      limits: { minMultiplier: 0.5, maxMultiplier: 2.5 },
    };

    const result = await pricing.quote({
      lot: makeLot(), vehicleType: 'four_wheeler', entryTime: localTime(1, 13), exitTime: localTime(1, 14), rule,
    });

    expect(result.multipliers.combined).toBe(2.5); // 16x raw, capped
    expect(result.multipliers.cappedFrom).toBe(16);
  });

  it('ignores every factor when dynamic pricing is switched off', async () => {
    const lot = makeLot({ occupancyRate: 0.99, pricing: { dynamicPricingEnabled: false } });
    const result = await pricing.quote({
      lot, vehicleType: 'four_wheeler', entryTime: localTime(6, 18), exitTime: localTime(6, 19), rule: DEFAULT_PRICING_RULE,
    });

    expect(result.multipliers.combined).toBe(1);
    expect(result.amount).toBe(50);
  });
});

describe('quoteOverstay', () => {
  const booking = { pricing: { effectiveRatePerHour: 50 } };

  it('charges nothing inside the grace period', () => {
    const result = pricing.quoteOverstay({ lot: makeLot(), booking, overstayMinutes: 8 });
    expect(result.amount).toBe(0);
    expect(result.chargeableMinutes).toBe(0);
  });

  it('bills a started overstay hour at the penalty rate', () => {
    // 40 min over, 10 min forgiven -> 30 chargeable -> 1 started hour at 50 * 1.5
    const result = pricing.quoteOverstay({ lot: makeLot(), booking, overstayMinutes: 40 });
    expect(result.chargeableMinutes).toBe(30);
    expect(result.chargeableHours).toBe(1);
    expect(result.ratePerHour).toBe(75);
    expect(result.amount).toBe(75);
  });

  it('scales with the number of started hours', () => {
    // 130 min over, 10 forgiven -> 120 chargeable -> 2 hours
    const result = pricing.quoteOverstay({ lot: makeLot(), booking, overstayMinutes: 130 });
    expect(result.chargeableHours).toBe(2);
    expect(result.amount).toBe(150);
  });

  it('honours a facility-specific penalty multiplier', () => {
    const lot = makeLot({ pricing: { overstayMultiplier: 3, graceMinutes: 0 } });
    const result = pricing.quoteOverstay({ lot, booking, overstayMinutes: 30 });
    expect(result.ratePerHour).toBe(150);
  });

  it('charges nothing when the vehicle left on time', () => {
    expect(pricing.quoteOverstay({ lot: makeLot(), booking, overstayMinutes: 0 }).amount).toBe(0);
  });
});
