'use strict';

const {
  User,
  ParkingOwner,
  ParkingLot,
  Booking,
  ParkingSession,
  Transaction,
  VehicleRecognitionEvent,
} = require('../../models');
const { ROLES, LOT_STATUS, SESSION_STATUS, PAYMENT_STATUS } = require('../../models/constants');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const { toManagedLot } = require('../parking/parking.service');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildUserFilter = ({ role, isActive, q }) => {
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (q) {
    const safe = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: safe }, { email: safe }, { phone: safe }];
  }
  return filter;
};

/** Users of any role, with the counts an admin needs to judge an account. */
const listUsers = async ({ role, isActive, q, page, limit }) => {
  const filter = buildUserFilter({ role, isActive, q });

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  const items = await Promise.all(
    users.map(async (user) => {
      const base = user.toPublic();
      if (user.role === ROLES.OWNER) {
        const [profile, lotCount] = await Promise.all([
          ParkingOwner.findOne({ user: user._id }).lean(),
          ParkingLot.countDocuments({ owner: user._id }),
        ]);
        return { ...base, ownerProfile: profile, lotCount };
      }
      const [bookingCount, spend] = await Promise.all([
        Booking.countDocuments({ user: user._id }),
        Transaction.aggregate([
          { $match: { user: user._id, status: PAYMENT_STATUS.PAID } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);
      return { ...base, bookingCount, totalSpend: Math.round((spend[0]?.total || 0) * 100) / 100 };
    }),
  );

  return { items, total, page, limit };
};

const getUserDetail = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const detail = { user: user.toPublic() };

  if (user.role === ROLES.OWNER) {
    const [profile, lots] = await Promise.all([
      ParkingOwner.findOne({ user: user._id }).lean(),
      ParkingLot.find({ owner: user._id }),
    ]);
    detail.ownerProfile = profile;
    detail.lots = lots.map(toManagedLot);
  } else {
    const [bookings, sessions] = await Promise.all([
      Booking.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).populate('parkingLot', 'name').lean(),
      ParkingSession.countDocuments({ user: user._id }),
    ]);
    detail.recentBookings = bookings;
    detail.sessionCount = sessions;
  }

  return detail;
};

/**
 * Activate or deactivate an account. Deactivating bumps tokenVersion so every
 * issued token stops working immediately rather than at expiry.
 */
const setUserActive = async (userId, isActive, actor) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user._id.toString() === actor._id.toString()) {
    throw ApiError.badRequest('You cannot change the status of your own account');
  }
  if (user.role === ROLES.ADMIN) {
    throw ApiError.forbidden('Administrator accounts cannot be deactivated from the panel');
  }

  user.isActive = isActive;
  if (!isActive) user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // A deactivated owner's facilities must stop taking bookings.
  if (!isActive && user.role === ROLES.OWNER) {
    const lots = await ParkingLot.find({ owner: user._id, status: LOT_STATUS.APPROVED });
    await ParkingLot.updateMany(
      { owner: user._id, status: LOT_STATUS.APPROVED },
      { $set: { status: LOT_STATUS.DEACTIVATED, statusReason: 'Owner account deactivated' } },
    );
    await Promise.all(lots.map((lot) => cache.invalidateLot(lot._id.toString())));
  }

  return user.toPublic();
};

const listLots = async ({ status, city, q, ownerId, page, limit }) => {
  const filter = {};
  if (status) filter.status = status;
  if (ownerId) filter.owner = ownerId;
  if (city) filter['location.city'] = new RegExp(`^${escapeRegex(city)}$`, 'i');
  if (q) {
    const safe = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: safe }, { 'location.address': safe }];
  }

  const [lots, total] = await Promise.all([
    ParkingLot.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name email phone'),
    ParkingLot.countDocuments(filter),
  ]);

  return { items: lots.map(toManagedLot), total, page, limit };
};

/**
 * Approve or reject a facility. Approval is what makes a lot visible in driver
 * search, so it also marks the owner's business profile verified.
 */
const reviewLot = async (lotId, { decision, reason, commissionPercent }, actor) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');

  if (decision === 'approve') {
    lot.status = LOT_STATUS.APPROVED;
    lot.statusReason = reason;
    lot.approvedAt = new Date();
    lot.approvedBy = actor._id;
    if (commissionPercent !== undefined) lot.commissionPercent = commissionPercent;

    await ParkingOwner.updateOne(
      { user: lot.owner },
      { $set: { isVerified: true, verifiedAt: new Date() } },
    );
  } else if (decision === 'reject') {
    lot.status = LOT_STATUS.REJECTED;
    lot.statusReason = reason || 'Rejected by the platform administrator';
  } else if (decision === 'deactivate') {
    const activeSessions = await ParkingSession.countDocuments({
      parkingLot: lot._id,
      status: SESSION_STATUS.ACTIVE,
    });
    if (activeSessions > 0) {
      throw ApiError.conflict(
        `Cannot deactivate: ${activeSessions} vehicle(s) are still parked at this facility`,
      );
    }
    lot.status = LOT_STATUS.DEACTIVATED;
    lot.statusReason = reason || 'Deactivated by the platform administrator';
  } else if (decision === 'reactivate') {
    lot.status = LOT_STATUS.APPROVED;
    lot.statusReason = reason;
  }

  await lot.save();
  await cache.invalidateLot(lot._id.toString());
  return toManagedLot(lot);
};

/** Platform-wide commission, or a per-facility override. */
const setCommission = async ({ lotId, commissionPercent }) => {
  if (lotId) {
    const lot = await ParkingLot.findById(lotId);
    if (!lot) throw ApiError.notFound('Parking facility not found');
    lot.commissionPercent = commissionPercent;
    await lot.save();
    return { scope: 'lot', lotId: lot._id.toString(), commissionPercent };
  }

  // The platform default lives in configuration, so applying it globally means
  // clearing every per-lot override.
  const result = await ParkingLot.updateMany({}, { $unset: { commissionPercent: '' } });
  return {
    scope: 'platform',
    commissionPercent: env.platform.commissionPercent,
    overridesCleared: result.modifiedCount,
    note: 'Per-facility overrides cleared. Change PLATFORM_COMMISSION_PERCENT to move the platform default.',
  };
};

const listTransactions = async ({ status, purpose, lotId, userId, from, to, page, limit }) => {
  const filter = {};
  if (status) filter.status = status;
  if (purpose) filter.purpose = purpose;
  if (lotId) filter.parkingLot = lotId;
  if (userId) filter.user = userId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total, summary] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .populate('parkingLot', 'name')
      .populate('booking', 'bookingId vehicleNumber')
      .lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: { ...filter, status: PAYMENT_STATUS.PAID } },
      {
        $group: {
          _id: null,
          gross: { $sum: '$amount' },
          commission: { $sum: '$settlement.platformCommission' },
          payouts: { $sum: '$settlement.ownerEarning' },
        },
      },
    ]),
  ]);

  const round2 = (value) => Math.round((value || 0) * 100) / 100;

  return {
    items,
    total,
    page,
    limit,
    summary: {
      gross: round2(summary[0]?.gross),
      platformCommission: round2(summary[0]?.commission),
      ownerPayouts: round2(summary[0]?.payouts),
    },
  };
};

/** Live platform activity: who is parked where, right now. */
const monitorActivity = async ({ page, limit }) => {
  const [sessions, total, flagged] = await Promise.all([
    ParkingSession.find({ status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING_PAYMENT] } })
      .sort({ actualEntryTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('parkingLot', 'name location.city')
      .populate('user', 'name email')
      .populate('booking', 'bookingId expectedExitTime')
      .lean(),
    ParkingSession.countDocuments({ status: { $in: [SESSION_STATUS.ACTIVE, SESSION_STATUS.PENDING_PAYMENT] } }),
    VehicleRecognitionEvent.find({ flaggedAsFraud: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-rawModelResponse')
      .populate('parkingLot', 'name')
      .populate('booking', 'bookingId vehicleNumber')
      .lean(),
  ]);

  const now = Date.now();
  const items = sessions.map((session) => ({
    sessionId: session.sessionId,
    status: session.status,
    vehicleNumber: session.vehicleNumber,
    vehicleType: session.vehicleType,
    parkingLot: session.parkingLot?.name,
    city: session.parkingLot?.location?.city,
    user: session.user ? { name: session.user.name, email: session.user.email } : null,
    bookingId: session.booking?.bookingId,
    actualEntryTime: session.actualEntryTime,
    expectedExitTime: session.expectedExitTime,
    parkedMinutes: Math.round((now - new Date(session.actualEntryTime)) / 60000),
    isOverstaying: now > new Date(session.expectedExitTime).getTime(),
    amountDue: session.billing?.amountDue || 0,
  }));

  return { items, total, page, limit, flaggedEvents: flagged };
};

/** Fraud report: mismatches and refusals worth a human look. */
const fraudReport = async ({ page, limit, from, to }) => {
  const filter = { flaggedAsFraud: true };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total, byResult] = await Promise.all([
    VehicleRecognitionEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-rawModelResponse')
      .populate('parkingLot', 'name location.city')
      .populate('booking', 'bookingId vehicleNumber user')
      .lean(),
    VehicleRecognitionEvent.countDocuments(filter),
    VehicleRecognitionEvent.aggregate([
      { $match: filter },
      { $group: { _id: '$result', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    items,
    total,
    page,
    limit,
    byResult: byResult.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {}),
  };
};

module.exports = {
  listUsers,
  getUserDetail,
  setUserActive,
  listLots,
  reviewLot,
  setCommission,
  listTransactions,
  monitorActivity,
  fraudReport,
};
