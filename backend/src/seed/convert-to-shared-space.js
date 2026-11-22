'use strict';

/**
 * Convert every lot's type-reserved bays into one shared flexible area.
 *
 *   npm run migrate:shared-space
 *
 * A lot with 40 bike bays and 130 car bays holds 40·1 + 130·2 = 300 units of
 * space. That becomes flexible rows of 40 markers (A..H) that bikes, cars and
 * buses all share, so the revenue optimiser can trade space between types.
 * Bookings currently holding space are then re-assigned a spot in the new rows
 * (a booking at car bay C-01 might now be at A1–A2).
 *
 * Also removes the old two_wheeler / four_wheeler fields left behind by
 * migrate-vehicle-types. Safe to re-run: lots with no reserved bays are skipped.
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { connectRedis, disconnectRedis } = require('../config/redis');
const logger = require('../utils/logger');
const { withLock, lotCapacityLock } = require('../services/lock.service');
const { rebuildLotSpots } = require('../modules/allocation/allocation.service');
const { fixedToFlexibleRows, computeAvailability, spotInstructions } = require('../modules/allocation/spot.layout');
const { VEHICLE_TYPE_LIST } = require('../models/constants');

const OLD_FIELDS = ['capacity', 'occupied', 'reserved', 'hourlyRate', 'availability'].flatMap((field) => [
  `${field}.two_wheeler`,
  `${field}.four_wheeler`,
]);

const run = async () => {
  await connectDatabase();
  await connectRedis();
  const lots = mongoose.connection.db.collection('parkingLots');

  const cleaned = await lots.updateMany({}, { $unset: Object.fromEntries(OLD_FIELDS.map((f) => [f, ''])) });
  logger.info(`Removed old vehicle-type fields from ${cleaned.modifiedCount} lot(s)`);

  const all = await lots.find({}).toArray();
  for (const lot of all) {
    const capacity = lot.capacity || {};
    const reserved = VEHICLE_TYPE_LIST.reduce((sum, type) => sum + (capacity[type] || 0), 0);
    if (!reserved) {
      logger.info(`  ${lot.name}: already shared, skipped`);
      continue;
    }

    const rows = fixedToFlexibleRows(capacity, lot.layout?.flexibleRows || []);
    const zero = Object.fromEntries(VEHICLE_TYPE_LIST.map((type) => [`capacity.${type}`, 0]));

    // Under the lot lock so no booking is allocated against the old layout mid-change.
    await withLock(
      lotCapacityLock(String(lot._id)),
      async () => {
        const next = { ...lot, capacity: { bike: 0, car: 0, bus: 0 }, layout: { ...(lot.layout || {}), flexibleRows: rows } };
        await lots.updateOne(
          { _id: lot._id },
          {
            $set: {
              ...zero,
              'layout.flexibleRows': rows,
              availability: computeAvailability(next, []),
            },
          },
        );
      },
      { ttlMs: 15000 },
    );

    const report = await rebuildLotSpots(lot._id);
    const units = rows.reduce((sum, row) => sum + row.units, 0);
    logger.info(
      `  ${lot.name}: ${rows.length} row(s), ${units} units (= ${Math.floor(units / 2)} car spaces); ` +
        `${report.held} booking(s) holding space, ${report.unplaced} without space`,
    );
  }

  // Refresh the driver-facing text on spots in the shared area.
  const bookings = mongoose.connection.db.collection('bookings');
  const flexible = await bookings.find({ 'spot.zone': 'flexible' }).project({ spot: 1 }).toArray();
  for (const booking of flexible) {
    await bookings.updateOne({ _id: booking._id }, { $set: { 'spot.instructions': spotInstructions(booking.spot) } });
  }
  logger.info(`Refreshed spot instructions on ${flexible.length} booking(s)`);

  logger.info('Conversion complete.');
};

run()
  .then(async () => {
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Conversion failed:', err);
    await disconnectRedis().catch(() => {});
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
