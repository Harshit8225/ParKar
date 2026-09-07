'use strict';

/**
 * Development seed. Creates one admin, two owners with approved facilities in
 * Bengaluru, two drivers, and a completed booking + session so the analytics
 * dashboards have something to show on first load.
 *
 * Destructive: it clears the collections it owns. Refuses to run in production.
 */

const env = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { connectRedis, disconnectRedis } = require('../config/redis');
const {
  User,
  ParkingOwner,
  ParkingLot,
  PricingRule,
  Booking,
  ParkingSession,
  Transaction,
  VehicleRecognitionEvent,
} = require('../models');
const {
  ROLES,
  LOT_STATUS,
  BOOKING_STATUS,
  SESSION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  RECOGNITION_EVENT,
  RECOGNITION_RESULT,
} = require('../models/constants');
const { DEFAULT_PRICING_RULE } = require('../modules/pricing/pricing.defaults');
const pricingService = require('../modules/pricing/pricing.service');
const billingService = require('../modules/billing/billing.service');
const logger = require('../utils/logger');
const { bookingId, sessionId, receiptId, shortCode } = require('../utils/ids');
const { normalizePlate } = require('../utils/plate');

const PASSWORD = 'Parking@123';

const OWNERS = [
  {
    name: 'Ravi Menon',
    email: 'owner1@parking.dev',
    phone: '+91 98450 11111',
    businessName: 'MG Road Parking Services',
    lots: [
      {
        name: 'MG Road Multilevel Parking',
        description: 'Covered multilevel facility next to MG Road metro station.',
        address: '12 MG Road, Near Metro Station, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        latitude: 12.9757,
        longitude: 77.6068,
        capacity: { two_wheeler: 60, four_wheeler: 120 },
        hourlyRate: { two_wheeler: 20, four_wheeler: 50 },
        amenities: { evCharging: true, covered: true, security: true, cctv: true },
        operatingHours: { is24x7: true, openTime: '00:00', closeTime: '23:59' },
        zone: 'cbd',
        rating: { average: 4.5, count: 218 },
      },
      {
        name: 'Indiranagar 100ft Road Parking',
        description: 'Open-air parking on 100ft Road with attendant support.',
        address: '441, 100 Feet Road, Indiranagar, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
        latitude: 12.9719,
        longitude: 77.6412,
        capacity: { two_wheeler: 40, four_wheeler: 55 },
        hourlyRate: { two_wheeler: 15, four_wheeler: 40 },
        amenities: { evCharging: false, covered: false, security: true, cctv: true },
        operatingHours: { is24x7: false, openTime: '06:00', closeTime: '23:00' },
        zone: 'commercial',
        rating: { average: 4.1, count: 96 },
      },
    ],
  },
  {
    name: 'Priya Nair',
    email: 'owner2@parking.dev',
    phone: '+91 98450 22222',
    businessName: 'Airport Express Parking',
    lots: [
      {
        name: 'Kempegowda Airport Long Stay',
        description: 'Long-stay parking with shuttle service to the terminal.',
        address: 'Airport Road, Devanahalli, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560300',
        latitude: 13.1986,
        longitude: 77.7066,
        capacity: { two_wheeler: 80, four_wheeler: 300 },
        hourlyRate: { two_wheeler: 25, four_wheeler: 70 },
        amenities: { evCharging: true, covered: true, security: true, cctv: true },
        operatingHours: { is24x7: true, openTime: '00:00', closeTime: '23:59' },
        zone: 'airport',
        rating: { average: 4.7, count: 512 },
      },
      {
        name: 'Koramangala Forum Mall Parking',
        description: 'Basement parking below the mall, entry from 80ft Road.',
        address: '21, Hosur Road, Koramangala, Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560095',
        latitude: 12.9345,
        longitude: 77.6114,
        capacity: { two_wheeler: 100, four_wheeler: 180 },
        hourlyRate: { two_wheeler: 20, four_wheeler: 60 },
        amenities: { evCharging: true, covered: true, security: true, cctv: false },
        operatingHours: { is24x7: false, openTime: '09:00', closeTime: '23:30' },
        zone: 'mall',
        rating: { average: 4.3, count: 341 },
        // Left pending so the admin panel has something to approve.
        status: LOT_STATUS.PENDING,
      },
    ],
  },
  {
    name: 'Anil Tripathi',
    email: 'owner3@parking.dev',
    phone: '+91 94150 33333',
    businessName: 'Gorakhpur Smart Parking',
    address: 'Gorakhpur, Uttar Pradesh',
    gstStateCode: '09',
    lots: [
      {
        name: 'Gorakhpur Junction Station Parking',
        description: 'Multilevel parking at the main entrance of Gorakhpur Junction, open all night.',
        address: 'Station Road, Gorakhpur Junction, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273001',
        latitude: 26.7586,
        longitude: 83.3732,
        capacity: { two_wheeler: 120, four_wheeler: 90 },
        hourlyRate: { two_wheeler: 10, four_wheeler: 30 },
        amenities: { evCharging: false, covered: true, security: true, cctv: true },
        operatingHours: { is24x7: true, openTime: '00:00', closeTime: '23:59' },
        zone: 'railway',
        rating: { average: 4.2, count: 164 },
      },
      {
        name: 'Golghar Market Parking',
        description: 'Open-air parking in the middle of the Golghar shopping district.',
        address: 'Golghar, Cinema Road, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273001',
        latitude: 26.757,
        longitude: 83.369,
        capacity: { two_wheeler: 90, four_wheeler: 45 },
        hourlyRate: { two_wheeler: 10, four_wheeler: 25 },
        amenities: { evCharging: false, covered: false, security: true, cctv: true },
        operatingHours: { is24x7: false, openTime: '07:00', closeTime: '22:30' },
        zone: 'commercial',
        rating: { average: 3.9, count: 88 },
      },
      {
        name: 'Gorakhnath Temple Parking',
        description: 'Visitor parking beside the Gorakhnath Temple complex, busiest on festival days.',
        address: 'Gorakhnath Temple Road, Gorakhnath, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273015',
        latitude: 26.7936,
        longitude: 83.3688,
        capacity: { two_wheeler: 150, four_wheeler: 70 },
        hourlyRate: { two_wheeler: 8, four_wheeler: 20 },
        amenities: { evCharging: false, covered: false, security: true, cctv: false },
        operatingHours: { is24x7: false, openTime: '04:00', closeTime: '22:00' },
        zone: 'standard',
        rating: { average: 4.4, count: 276 },
      },
      {
        name: 'City Mall Bank Road Parking',
        description: 'Basement parking under City Mall, with lift access to all floors.',
        address: 'Bank Road, Civil Lines, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273001',
        latitude: 26.7625,
        longitude: 83.3675,
        capacity: { two_wheeler: 80, four_wheeler: 110 },
        hourlyRate: { two_wheeler: 12, four_wheeler: 35 },
        amenities: { evCharging: true, covered: true, security: true, cctv: true },
        operatingHours: { is24x7: false, openTime: '09:00', closeTime: '23:00' },
        zone: 'mall',
        rating: { average: 4.3, count: 197 },
      },
      {
        name: 'Ramgarh Tal Lakefront Parking',
        description: 'Lakeside parking for the Ramgarh Tal promenade and boating jetty.',
        address: 'Ramgarh Tal Road, Taramandal, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273016',
        latitude: 26.733,
        longitude: 83.402,
        capacity: { two_wheeler: 110, four_wheeler: 85 },
        hourlyRate: { two_wheeler: 10, four_wheeler: 25 },
        amenities: { evCharging: true, covered: false, security: true, cctv: true },
        operatingHours: { is24x7: false, openTime: '06:00', closeTime: '23:00' },
        zone: 'standard',
        rating: { average: 4.6, count: 312 },
      },
      {
        name: 'Gorakhnath Airport Parking',
        description: 'Short and long stay parking at Mahayogi Gorakhnath Airport.',
        address: 'Airport Road, Kunraghat, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273008',
        latitude: 26.7397,
        longitude: 83.4497,
        capacity: { two_wheeler: 40, four_wheeler: 130 },
        hourlyRate: { two_wheeler: 15, four_wheeler: 45 },
        amenities: { evCharging: true, covered: true, security: true, cctv: true },
        operatingHours: { is24x7: true, openTime: '00:00', closeTime: '23:59' },
        zone: 'airport',
        rating: { average: 4.5, count: 143 },
      },
      {
        name: 'BRD Medical College Parking',
        description: 'Visitor and staff parking opposite the BRD Medical College gate.',
        address: 'Medical College Road, Rustampur, Gorakhpur',
        city: 'Gorakhpur',
        state: 'Uttar Pradesh',
        pincode: '273013',
        latitude: 26.748,
        longitude: 83.352,
        capacity: { two_wheeler: 130, four_wheeler: 60 },
        hourlyRate: { two_wheeler: 8, four_wheeler: 20 },
        amenities: { evCharging: false, covered: false, security: true, cctv: true },
        operatingHours: { is24x7: true, openTime: '00:00', closeTime: '23:59' },
        zone: 'hospital',
        rating: { average: 4.0, count: 121 },
      },
    ],
  },
];

const DRIVERS = [
  { name: 'Arjun Sharma', email: 'driver1@parking.dev', phone: '+91 99000 11111' },
  { name: 'Meera Iyer', email: 'driver2@parking.dev', phone: '+91 99000 22222' },
];

const createUser = async ({ name, email, phone, role }) => {
  const user = new User({ name, email, phone, role });
  await user.setPassword(PASSWORD);
  await user.save();
  return user;
};

const clearAll = async () => {
  await Promise.all([
    User.deleteMany({}),
    ParkingOwner.deleteMany({}),
    ParkingLot.deleteMany({}),
    PricingRule.deleteMany({}),
    Booking.deleteMany({}),
    ParkingSession.deleteMany({}),
    Transaction.deleteMany({}),
    VehicleRecognitionEvent.deleteMany({}),
  ]);
};

/** A completed booking + session, so revenue and duration charts are not empty. */
const seedHistory = async ({ driver, lot, hoursAgo, durationHours, overstayMinutes, vehicleNumber, vehicleType }) => {
  const entryTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const expectedExit = new Date(entryTime.getTime() + durationHours * 60 * 60 * 1000);
  const actualExit = new Date(expectedExit.getTime() + overstayMinutes * 60 * 1000);

  const priced = await pricingService.quote({
    lot,
    vehicleType,
    entryTime,
    exitTime: expectedExit,
  });

  const booking = await Booking.create({
    bookingId: bookingId(),
    user: driver._id,
    parkingLot: lot._id,
    vehicleNumber,
    vehicleType,
    expectedEntryTime: entryTime,
    expectedExitTime: expectedExit,
    durationHours: priced.durationHours,
    pricing: {
      baseRatePerHour: priced.baseRatePerHour,
      effectiveRatePerHour: priced.effectiveRatePerHour,
      multipliers: priced.multipliers,
      amount: priced.amount,
      currency: priced.currency,
      breakdown: priced.breakdown,
    },
    status: BOOKING_STATUS.COMPLETED,
    payment: { paidAt: entryTime },
  });

  const session = await ParkingSession.create({
    sessionId: sessionId(),
    booking: booking._id,
    user: driver._id,
    parkingLot: lot._id,
    vehicleNumber,
    vehicleNumberNormalized: normalizePlate(vehicleNumber),
    vehicleType,
    expectedExitTime: expectedExit,
    actualEntryTime: entryTime,
    actualExitTime: actualExit,
    status: SESSION_STATUS.CLOSED,
    billing: { prepaidAmount: priced.amount, currency: priced.currency },
  });

  const bill = billingService.computeFinalBill({ lot, booking, session, actualExitTime: actualExit });
  session.billing = {
    parkedMinutes: bill.parkedMinutes,
    overstayMinutes: bill.overstayMinutes,
    chargeableOverstayMinutes: bill.chargeableOverstayMinutes,
    overstayHours: bill.overstayHours,
    prepaidAmount: bill.prepaidAmount,
    overstayAmount: bill.overstayAmount,
    totalAmount: bill.totalAmount,
    amountDue: 0,
    currency: bill.currency,
    breakdown: bill.breakdown,
    settled: true,
    settledAt: actualExit,
  };
  await session.save();

  const commissionPercent = env.platform.commissionPercent;
  const makeTransaction = (amount, purpose, at) =>
    Transaction.create({
      transactionId: `TXN-${Date.now().toString(36).toUpperCase()}-${shortCode(5)}`,
      user: driver._id,
      booking: booking._id,
      parkingLot: lot._id,
      parkingSession: purpose === PAYMENT_PURPOSE.BOOKING ? undefined : session._id,
      purpose,
      amount,
      currency: priced.currency,
      status: PAYMENT_STATUS.PAID,
      razorpay: { orderId: `order_seed_${shortCode(12)}`, paymentId: `pay_seed_${shortCode(12)}`, receipt: receiptId() },
      settlement: {
        commissionPercent,
        platformCommission: Math.round(((amount * commissionPercent) / 100) * 100) / 100,
        ownerEarning: Math.round((amount - (amount * commissionPercent) / 100) * 100) / 100,
      },
      paidAt: at,
      createdAt: at,
    });

  await makeTransaction(priced.amount, PAYMENT_PURPOSE.BOOKING, entryTime);
  if (bill.overstayAmount > 0) {
    await makeTransaction(bill.overstayAmount, PAYMENT_PURPOSE.OVERSTAY, actualExit);
  }

  await VehicleRecognitionEvent.create([
    {
      parkingLot: lot._id,
      eventType: RECOGNITION_EVENT.ENTRY,
      recognizedPlate: vehicleNumber,
      recognizedPlateNormalized: normalizePlate(vehicleNumber),
      confidence: 0.96,
      provider: 'gemini',
      model: env.gemini.model,
      booking: booking._id,
      parkingSession: session._id,
      result: RECOGNITION_RESULT.VERIFIED,
      allowed: true,
      message: 'Entry allowed',
      createdAt: entryTime,
    },
    {
      parkingLot: lot._id,
      eventType: RECOGNITION_EVENT.EXIT,
      recognizedPlate: vehicleNumber,
      recognizedPlateNormalized: normalizePlate(vehicleNumber),
      confidence: 0.94,
      provider: 'gemini',
      model: env.gemini.model,
      booking: booking._id,
      parkingSession: session._id,
      result: RECOGNITION_RESULT.VERIFIED,
      allowed: true,
      message: 'Exit recorded',
      createdAt: actualExit,
    },
  ]);

  return { booking, session };
};

/** An active session, so the owner panel shows a vehicle currently parked. */
const seedActiveSession = async ({ driver, lot, vehicleNumber, vehicleType }) => {
  const entryTime = new Date(Date.now() - 90 * 60 * 1000);
  const expectedExit = new Date(entryTime.getTime() + 3 * 60 * 60 * 1000);

  const priced = await pricingService.quote({ lot, vehicleType, entryTime, exitTime: expectedExit });

  const booking = await Booking.create({
    bookingId: bookingId(),
    user: driver._id,
    parkingLot: lot._id,
    vehicleNumber,
    vehicleType,
    expectedEntryTime: entryTime,
    expectedExitTime: expectedExit,
    durationHours: priced.durationHours,
    pricing: {
      baseRatePerHour: priced.baseRatePerHour,
      effectiveRatePerHour: priced.effectiveRatePerHour,
      multipliers: priced.multipliers,
      amount: priced.amount,
      currency: priced.currency,
      breakdown: priced.breakdown,
    },
    status: BOOKING_STATUS.ACTIVE,
    payment: { paidAt: entryTime },
  });

  const session = await ParkingSession.create({
    sessionId: sessionId(),
    booking: booking._id,
    user: driver._id,
    parkingLot: lot._id,
    vehicleNumber,
    vehicleNumberNormalized: normalizePlate(vehicleNumber),
    vehicleType,
    expectedExitTime: expectedExit,
    actualEntryTime: entryTime,
    status: SESSION_STATUS.ACTIVE,
    billing: { prepaidAmount: priced.amount, currency: priced.currency },
  });

  booking.session = session._id;
  await booking.save();

  // Keep the lot counters consistent with the session we just fabricated.
  await ParkingLot.updateOne({ _id: lot._id }, { $inc: { [`occupied.${vehicleType}`]: 1 } });

  const commissionPercent = env.platform.commissionPercent;
  await Transaction.create({
    transactionId: `TXN-${Date.now().toString(36).toUpperCase()}-${shortCode(5)}`,
    user: driver._id,
    booking: booking._id,
    parkingLot: lot._id,
    purpose: PAYMENT_PURPOSE.BOOKING,
    amount: priced.amount,
    currency: priced.currency,
    status: PAYMENT_STATUS.PAID,
    razorpay: { orderId: `order_seed_${shortCode(12)}`, paymentId: `pay_seed_${shortCode(12)}`, receipt: receiptId() },
    settlement: {
      commissionPercent,
      platformCommission: Math.round(((priced.amount * commissionPercent) / 100) * 100) / 100,
      ownerEarning: Math.round((priced.amount - (priced.amount * commissionPercent) / 100) * 100) / 100,
    },
    paidAt: entryTime,
  });

  return { booking, session };
};

const run = async () => {
  if (env.isProduction) {
    throw new Error('Refusing to seed a production database');
  }

  await connectDatabase();
  await connectRedis();

  logger.info('Clearing existing data...');
  await clearAll();

  logger.info('Creating platform administrator...');
  const admin = await createUser({
    name: 'Platform Admin',
    email: 'admin@parking.dev',
    phone: '+91 98000 00000',
    role: ROLES.ADMIN,
  });

  logger.info('Creating owners and facilities...');
  const createdLots = [];

  for (const ownerSpec of OWNERS) {
    const ownerUser = await createUser({ ...ownerSpec, role: ROLES.OWNER });
    const profile = await ParkingOwner.create({
      user: ownerUser._id,
      businessName: ownerSpec.businessName,
      contactEmail: ownerSpec.email,
      contactPhone: ownerSpec.phone,
      gstNumber: `${ownerSpec.gstStateCode || '29'}${shortCode(11)}`,
      address: ownerSpec.address || 'Bengaluru, Karnataka',
      isVerified: true,
      verifiedAt: new Date(),
      lotCount: ownerSpec.lots.length,
      payoutDetails: { accountHolder: ownerSpec.businessName, accountNumberLast4: '4321', ifsc: 'HDFC0001234' },
    });

    for (const lotSpec of ownerSpec.lots) {
      const status = lotSpec.status || LOT_STATUS.APPROVED;
      const lot = await ParkingLot.create({
        owner: ownerUser._id,
        ownerProfile: profile._id,
        name: lotSpec.name,
        description: lotSpec.description,
        contact: { email: ownerSpec.email, phone: ownerSpec.phone },
        location: {
          address: lotSpec.address,
          city: lotSpec.city,
          state: lotSpec.state,
          pincode: lotSpec.pincode,
          geo: { type: 'Point', coordinates: [lotSpec.longitude, lotSpec.latitude] },
        },
        capacity: lotSpec.capacity,
        hourlyRate: lotSpec.hourlyRate,
        amenities: lotSpec.amenities,
        operatingHours: lotSpec.operatingHours,
        rating: lotSpec.rating,
        status,
        approvedAt: status === LOT_STATUS.APPROVED ? new Date() : undefined,
        approvedBy: status === LOT_STATUS.APPROVED ? admin._id : undefined,
      });

      await PricingRule.create({
        parkingLot: lot._id,
        owner: ownerUser._id,
        ...DEFAULT_PRICING_RULE,
        locationFactor: { zoneLabel: lotSpec.zone, multiplier: undefined },
      });

      createdLots.push(lot);
      logger.info(`  - ${lot.name} (${status})`);
    }
  }

  logger.info('Creating drivers...');
  const drivers = [];
  for (const driverSpec of DRIVERS) {
    drivers.push(await createUser({ ...driverSpec, role: ROLES.USER }));
  }

  logger.info('Creating booking history...');
  const mgRoad = createdLots[0];
  const indiranagar = createdLots[1];
  const airport = createdLots[2];

  await seedHistory({
    driver: drivers[0],
    lot: mgRoad,
    hoursAgo: 30,
    durationHours: 3,
    overstayMinutes: 0,
    vehicleNumber: 'KA01AB1234',
    vehicleType: 'four_wheeler',
  });
  await seedHistory({
    driver: drivers[0],
    lot: indiranagar,
    hoursAgo: 52,
    durationHours: 2,
    overstayMinutes: 75, // overstayed, so overstay billing is exercised
    vehicleNumber: 'KA01AB1234',
    vehicleType: 'four_wheeler',
  });
  await seedHistory({
    driver: drivers[1],
    lot: airport,
    hoursAgo: 20,
    durationHours: 6,
    overstayMinutes: 5, // inside the grace period, so no charge
    vehicleNumber: 'KA05MN7788',
    vehicleType: 'two_wheeler',
  });

  logger.info('Creating one active parking session...');
  await seedActiveSession({
    driver: drivers[1],
    lot: mgRoad,
    vehicleNumber: 'KA03XY9911',
    vehicleType: 'four_wheeler',
  });

  logger.info('');
  logger.info('Seed complete. Sign in with:');
  logger.info(`  admin   admin@parking.dev    / ${PASSWORD}`);
  logger.info(`  owner   owner1@parking.dev   / ${PASSWORD}`);
  logger.info(`  owner   owner2@parking.dev   / ${PASSWORD}`);
  logger.info(`  driver  driver1@parking.dev  / ${PASSWORD}`);
  logger.info(`  driver  driver2@parking.dev  / ${PASSWORD}`);
  logger.info('');
  logger.info('Test vehicle numbers for the gate simulator:');
  logger.info('  KA03XY9911 - currently parked at MG Road (use it at the exit gate)');
};

run()
  .then(async () => {
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Seed failed:', err.stack || err.message);
    await disconnectRedis().catch(() => {});
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
