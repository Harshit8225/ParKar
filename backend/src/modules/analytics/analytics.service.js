'use strict';

const { ParkingLot, Booking, ParkingSession, Transaction, User, VehicleRecognitionEvent } = require('../../models');
const {
  BOOKING_STATUS,
  SESSION_STATUS,
  PAYMENT_STATUS,
  LOT_STATUS,
  ROLES,
  VEHICLE_TYPE_LIST,
} = require('../../models/constants');
const spotLayout = require('../allocation/spot.layout');
const cache = require('../../services/cache.service');
const { dayjs } = require('../../utils/time');

const round2 = (value) => Math.round((value || 0) * 100) / 100;

/** Named ranges the dashboards offer, resolved to a concrete window. */
const resolveRange = (range = '7d') => {
  const now = dayjs();
  const windows = {
    today: now.startOf('day'),
    '7d': now.subtract(7, 'day'),
    '30d': now.subtract(30, 'day'),
    '90d': now.subtract(90, 'day'),
    all: dayjs(0),
  };
  const from = windows[range] || windows['7d'];
  return { from: from.toDate(), to: now.toDate(), range };
};

/** Occupancy and slot counts, read straight off the lot documents. */
const occupancySnapshot = (lots) => {
  const zero = () => VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: 0 }), {});
  const totals = { capacity: zero(), maxCapacity: zero(), occupied: zero(), reserved: zero(), available: zero() };
  let totalSpaces = 0;     // fixed bays + flexible area in car-equivalent spaces
  let totalUnits = 0;      // bike units, the common measure across types
  let usedUnits = 0;

  for (const lot of lots) {
    const max = spotLayout.computeMaxCapacity(lot);
    const availability = lot.availability || {};
    for (const type of VEHICLE_TYPE_LIST) {
      totals.capacity[type] += lot.capacity?.[type] || 0;
      totals.maxCapacity[type] += max[type];
      totals.occupied[type] += lot.occupied?.[type] || 0;
      totals.reserved[type] += lot.reserved?.[type] || 0;
      totals.available[type] += availability[type] || 0;
      totalSpaces += lot.capacity?.[type] || 0;
    }
    totalSpaces += spotLayout.flexibleAreaSummary(lot).carEquivalent;
    const units = spotLayout.totalUnits(lot);
    totalUnits += units;
    usedUnits += spotLayout.computeOccupancyRate(lot) * units;
  }

  const sum = (perType) => VEHICLE_TYPE_LIST.reduce((acc, type) => acc + perType[type], 0);
  const totalOccupied = sum(totals.occupied);
  const totalReserved = sum(totals.reserved);

  return {
    ...totals,
    totalCapacity: totalSpaces,
    totalOccupied,
    totalReserved,
    totalAvailable: Math.max(0, totalSpaces - totalOccupied - totalReserved),
    // Measured in space units, so a parked bus counts for more than a bike.
    occupancyRate: totalUnits ? round2((usedUnits / totalUnits) * 100) : 0,
    vehiclesParked: totalOccupied,
  };
};

const revenueFor = async (match) => {
  const [row] = await Transaction.aggregate([
    { $match: { ...match, status: PAYMENT_STATUS.PAID } },
    {
      $group: {
        _id: null,
        gross: { $sum: '$amount' },
        commission: { $sum: '$settlement.platformCommission' },
        ownerEarning: { $sum: '$settlement.ownerEarning' },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    gross: round2(row?.gross),
    platformCommission: round2(row?.commission),
    ownerEarning: round2(row?.ownerEarning),
    transactionCount: row?.count || 0,
  };
};

/** Daily revenue and booking counts, for the dashboard chart. */
const dailySeries = async (match, from, to) => {
  const rows = await Transaction.aggregate([
    { $match: { ...match, status: PAYMENT_STATUS.PAID, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill gaps so the chart has a point per day rather than a broken line.
  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series = [];
  let cursor = dayjs(from).startOf('day');
  const end = dayjs(to).startOf('day');
  let guard = 0;

  while ((cursor.isBefore(end) || cursor.isSame(end)) && guard < 400) {
    const key = cursor.format('YYYY-MM-DD');
    const row = byDate.get(key);
    series.push({ date: key, revenue: round2(row?.revenue), transactions: row?.transactions || 0 });
    cursor = cursor.add(1, 'day');
    guard += 1;
  }

  return series;
};

/** Average completed-session duration in minutes. */
const averageDuration = async (match) => {
  const [row] = await ParkingSession.aggregate([
    { $match: { ...match, status: SESSION_STATUS.CLOSED, 'billing.parkedMinutes': { $gt: 0 } } },
    {
      $group: {
        _id: null,
        avgMinutes: { $avg: '$billing.parkedMinutes' },
        avgOverstay: { $avg: '$billing.overstayMinutes' },
        overstayCount: { $sum: { $cond: [{ $gt: ['$billing.chargeableOverstayMinutes', 0] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);

  return {
    averageParkedMinutes: Math.round(row?.avgMinutes || 0),
    averageOverstayMinutes: Math.round(row?.avgOverstay || 0),
    overstayRate: row?.total ? round2((row.overstayCount / row.total) * 100) : 0,
    completedSessions: row?.total || 0,
  };
};

const peakHourDistribution = async (match, from, to) => {
  const rows = await ParkingSession.aggregate([
    { $match: { ...match, actualEntryTime: { $gte: from, $lte: to } } },
    { $group: { _id: { $hour: '$actualEntryTime' }, entries: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const byHour = new Map(rows.map((row) => [row._id, row.entries]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    entries: byHour.get(hour) || 0,
  }));
};

/**
 * Owner dashboard. `lotId` scopes it to one facility; omitted, it aggregates
 * every facility the owner runs.
 */
const ownerAnalytics = async (ownerId, { range = '7d', lotId } = {}) => {
  const { from, to } = resolveRange(range);
  const cacheKey = cache.KEYS.ownerAnalytics(`${ownerId}:${lotId || 'all'}`, range);

  return cache.remember(cacheKey, cache.TTL.analytics, async () => {
    const lotFilter = { owner: ownerId };
    if (lotId) lotFilter._id = lotId;

    const lots = await ParkingLot.find(lotFilter);
    const lotIds = lots.map((lot) => lot._id);
    const scope = { parkingLot: { $in: lotIds } };
    const windowScope = { ...scope, createdAt: { $gte: from, $lte: to } };

    const [
      occupancy,
      revenue,
      revenueWindow,
      series,
      duration,
      peakHours,
      bookingCounts,
      activeSessions,
      flaggedEvents,
    ] = await Promise.all([
      Promise.resolve(occupancySnapshot(lots)),
      revenueFor(scope),
      revenueFor(windowScope),
      dailySeries(scope, from, to),
      averageDuration(scope),
      peakHourDistribution(scope, from, to),
      Booking.aggregate([
        { $match: windowScope },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ParkingSession.countDocuments({ ...scope, status: SESSION_STATUS.ACTIVE }),
      VehicleRecognitionEvent.countDocuments({ ...scope, flaggedAsFraud: true, createdAt: { $gte: from, $lte: to } }),
    ]);

    const bookingsByStatus = bookingCounts.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
    const totalBookings = Object.values(bookingsByStatus).reduce((sum, count) => sum + count, 0);

    return {
      range,
      from,
      to,
      lotCount: lots.length,
      lots: lots.map((lot) => ({
        id: lot._id.toString(),
        name: lot.name,
        status: lot.status,
        occupancyRate: round2(lot.occupancyRate * 100),
        available: lot.available,
        capacity: lot.capacity,
      })),
      occupancy,
      activeSessions,
      revenue: { allTime: revenue, window: revenueWindow },
      dailySeries: series,
      duration,
      peakHours,
      bookings: { total: totalBookings, byStatus: bookingsByStatus },
      security: { flaggedRecognitionEvents: flaggedEvents },
    };
  });
};

/** Platform-wide dashboard for the admin panel. */
const platformAnalytics = async ({ range = '30d' } = {}) => {
  const { from, to } = resolveRange(range);

  return cache.remember(cache.KEYS.platformAnalytics(range), cache.TTL.analytics, async () => {
    const window = { createdAt: { $gte: from, $lte: to } };

    const [
      lots,
      revenue,
      revenueWindow,
      series,
      duration,
      peakHours,
      userCounts,
      lotCounts,
      bookingCounts,
      activeSessions,
      pendingApprovals,
      flaggedEvents,
      topLots,
    ] = await Promise.all([
      ParkingLot.find({ status: LOT_STATUS.APPROVED }),
      revenueFor({}),
      revenueFor(window),
      dailySeries({}, from, to),
      averageDuration({}),
      peakHourDistribution({}, from, to),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      ParkingLot.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: window }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      ParkingSession.countDocuments({ status: SESSION_STATUS.ACTIVE }),
      ParkingLot.countDocuments({ status: LOT_STATUS.PENDING }),
      VehicleRecognitionEvent.countDocuments({ flaggedAsFraud: true, ...window }),
      Transaction.aggregate([
        { $match: { status: PAYMENT_STATUS.PAID, ...window } },
        { $group: { _id: '$parkingLot', revenue: { $sum: '$amount' }, transactions: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'parkingLots', localField: '_id', foreignField: '_id', as: 'lot' } },
        { $unwind: '$lot' },
        {
          $project: {
            _id: 0,
            lotId: '$_id',
            name: '$lot.name',
            city: '$lot.location.city',
            revenue: { $round: ['$revenue', 2] },
            transactions: 1,
          },
        },
      ]),
    ]);

    const asMap = (rows) => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
    const usersByRole = asMap(userCounts);
    const bookingsByStatus = asMap(bookingCounts);

    return {
      range,
      from,
      to,
      users: {
        drivers: usersByRole[ROLES.USER] || 0,
        owners: usersByRole[ROLES.OWNER] || 0,
        admins: usersByRole[ROLES.ADMIN] || 0,
        total: Object.values(usersByRole).reduce((sum, count) => sum + count, 0),
      },
      facilities: { ...asMap(lotCounts), total: Object.values(asMap(lotCounts)).reduce((s, c) => s + c, 0) },
      pendingApprovals,
      occupancy: occupancySnapshot(lots),
      activeSessions,
      revenue: { allTime: revenue, window: revenueWindow },
      dailySeries: series,
      duration,
      peakHours,
      bookings: {
        total: Object.values(bookingsByStatus).reduce((sum, count) => sum + count, 0),
        byStatus: bookingsByStatus,
        confirmed: bookingsByStatus[BOOKING_STATUS.CONFIRMED] || 0,
      },
      topLots,
      security: { flaggedRecognitionEvents: flaggedEvents },
    };
  });
};

/** Single-facility analytics card set, per the owner-panel spec. */
const lotAnalytics = async (lot, { range = '7d' } = {}) => {
  const { from, to } = resolveRange(range);
  const scope = { parkingLot: lot._id };
  const windowScope = { ...scope, createdAt: { $gte: from, $lte: to } };

  const [revenue, revenueWindow, duration, series, peakHours, reservations, activeSessions, totalVehicles] =
    await Promise.all([
      revenueFor(scope),
      revenueFor(windowScope),
      averageDuration(scope),
      dailySeries(scope, from, to),
      peakHourDistribution(scope, from, to),
      Booking.countDocuments(windowScope),
      ParkingSession.countDocuments({ ...scope, status: SESSION_STATUS.ACTIVE }),
      ParkingSession.countDocuments({ ...scope, actualEntryTime: { $gte: from, $lte: to } }),
    ]);

  return {
    range,
    from,
    to,
    lot: { id: lot._id.toString(), name: lot.name, status: lot.status },
    currentOccupancy: {
      ...occupancySnapshot([lot]),
      occupancyRatePercent: round2(lot.occupancyRate * 100),
    },
    vehiclesParkedNow: VEHICLE_TYPE_LIST.reduce((acc, type) => acc + (lot.occupied?.[type] || 0), 0),
    availableSlots: lot.available,
    totalVehiclesInWindow: totalVehicles,
    activeSessions,
    reservations,
    revenue: { allTime: revenue, window: revenueWindow },
    averageParkingDuration: duration,
    dailySeries: series,
    peakHours,
  };
};

module.exports = { ownerAnalytics, platformAnalytics, lotAnalytics, resolveRange, occupancySnapshot };
