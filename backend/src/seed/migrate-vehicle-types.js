'use strict';

/**
 * One-time migration: two_wheeler / four_wheeler  ->  bike / car (+ bus).
 *
 *   npm run migrate:vehicle-types
 *
 * 1. Renames the per-vehicle fields on every parking lot (capacity, occupied,
 *    reserved, hourlyRate) and adds `bus` with 0.
 * 2. Renames vehicleType on bookings and sessions, and vehicleTypeGuess on
 *    recognition events.
 * 3. Gives every booking that currently holds space a concrete spot, and
 *    rebuilds each lot's spot holds, counters and availability from them.
 *
 * Safe to run more than once: each step only touches documents still in the
 * old shape, and step 3 keeps spots that are already valid.
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { connectRedis, disconnectRedis } = require('../config/redis');
const logger = require('../utils/logger');
const { rebuildLotSpots } = require('../modules/allocation/allocation.service');

const RENAME = { two_wheeler: 'bike', four_wheeler: 'car' };
const PER_VEHICLE_FIELDS = ['capacity', 'occupied', 'reserved', 'hourlyRate'];

const perVehicleExpr = (field) => ({
  bike: { $ifNull: [`$${field}.bike`, { $ifNull: [`$${field}.two_wheeler`, 0] }] },
  car: { $ifNull: [`$${field}.car`, { $ifNull: [`$${field}.four_wheeler`, 0] }] },
  bus: { $ifNull: [`$${field}.bus`, 0] },
});

const migrateLots = async (db) => {
  const set = {};
  for (const field of PER_VEHICLE_FIELDS) set[field] = perVehicleExpr(field);

  const result = await db.collection('parkingLots').updateMany(
    {
      $or: [
        ...PER_VEHICLE_FIELDS.map((field) => ({ [`${field}.two_wheeler`]: { $exists: true } })),
        ...PER_VEHICLE_FIELDS.map((field) => ({ [`${field}.four_wheeler`]: { $exists: true } })),
      ],
    },
    [{ $set: set }],
  );
  logger.info(`parkingLots: ${result.modifiedCount} renamed`);
};

const migrateField = async (db, collection, field) => {
  for (const [from, to] of Object.entries(RENAME)) {
    const result = await db.collection(collection).updateMany({ [field]: from }, { $set: { [field]: to } });
    logger.info(`${collection}.${field}: ${result.modifiedCount} ${from} -> ${to}`);
  }
};

const run = async () => {
  await connectDatabase();
  await connectRedis();
  const { db } = mongoose.connection;

  logger.info('Renaming vehicle types...');
  await migrateLots(db);
  await migrateField(db, 'bookings', 'vehicleType');
  await migrateField(db, 'parkingSessions', 'vehicleType');
  await migrateField(db, 'vehicleRecognitionEvents', 'vehicleTypeGuess');

  logger.info('Assigning spots and rebuilding availability...');
  const lots = await db.collection('parkingLots').find({}, { projection: { _id: 1, name: 1 } }).toArray();
  let unplacedTotal = 0;
  for (const lot of lots) {
    const report = await rebuildLotSpots(lot._id);
    unplacedTotal += report.unplaced;
    logger.info(`  ${lot.name}: ${report.held} holding, ${report.placed} newly placed, ${report.unplaced} without space`);
  }

  if (unplacedTotal) {
    logger.warn(`${unplacedTotal} booking(s) could not be given a spot - their lot is over capacity. Review them in the owner panel.`);
  }
  logger.info('Migration complete.');
};

run()
  .then(async () => {
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Migration failed:', err);
    await disconnectRedis().catch(() => {});
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
