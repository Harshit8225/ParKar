'use strict';

const crypto = require('crypto');
const { ParkingLot, ParkingOwner, PricingRule, ParkingSession, Booking } = require('../../models');
const { LOT_STATUS, ROLES, SESSION_STATUS, BOOKING_STATUS } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const pricingService = require('../pricing/pricing.service');
const { DEFAULT_PRICING_RULE } = require('../pricing/pricing.defaults');

const EARTH_RADIUS_KM = 6371;

/** Public projection of a lot: everything a driver needs, nothing internal. */
const toPublicLot = (lot, extras = {}) => {
  const doc = typeof lot.toObject === 'function' ? lot.toObject({ virtuals: true }) : lot;
  const available = doc.available || {
    two_wheeler: Math.max(0, doc.capacity.two_wheeler - doc.occupied.two_wheeler - doc.reserved.two_wheeler),
    four_wheeler: Math.max(0, doc.capacity.four_wheeler - doc.occupied.four_wheeler - doc.reserved.four_wheeler),
  };

  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    contact: doc.contact,
    location: {
      address: doc.location.address,
      city: doc.location.city,
      state: doc.location.state,
      pincode: doc.location.pincode,
      latitude: doc.location.geo.coordinates[1],
      longitude: doc.location.geo.coordinates[0],
    },
    capacity: doc.capacity,
    available,
    occupied: doc.occupied,
    hourlyRate: doc.hourlyRate,
    operatingHours: doc.operatingHours,
    amenities: doc.amenities,
    rating: doc.rating,
    status: doc.status,
    images: doc.images || [],
    occupancyRate: doc.occupancyRate,
    ...extras,
  };
};

/** Owner/admin view adds the operational and revenue-relevant fields. */
const toManagedLot = (lot) => {
  const doc = typeof lot.toObject === 'function' ? lot.toObject({ virtuals: true }) : lot;
  return {
    ...toPublicLot(lot),
    reserved: doc.reserved,
    pricing: doc.pricing,
    commissionPercent: doc.commissionPercent,
    statusReason: doc.statusReason,
    approvedAt: doc.approvedAt,
    owner: doc.owner && doc.owner._id ? { id: doc.owner._id.toString(), name: doc.owner.name, email: doc.owner.email } : doc.owner,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))).toFixed(2));
};

const searchCacheKey = (params) =>
  cache.KEYS.lotSearch(crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 20));

/**
 * Driver-facing discovery. Geo search uses the 2dsphere index via $geoNear so
 * distance is computed by MongoDB; city/text search falls back to a plain find.
 * Results are cached briefly because this is the hottest read path.
 */
const searchLots = async (params) => {
  const cacheKey = searchCacheKey(params);
  const cached = await cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const {
    latitude,
    longitude,
    radiusKm,
    city,
    q,
    vehicleType,
    evCharging,
    open24x7,
    availableOnly,
    minRating,
    maxRate,
    sortBy,
    page,
    limit,
  } = params;

  const match = { status: LOT_STATUS.APPROVED };
  if (city) match['location.city'] = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (evCharging === true) match['amenities.evCharging'] = true;
  if (open24x7 === true) match['operatingHours.is24x7'] = true;
  if (minRating !== undefined) match['rating.average'] = { $gte: minRating };
  if (maxRate !== undefined && vehicleType) match[`hourlyRate.${vehicleType}`] = { $lte: maxRate };
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = [
      { name: new RegExp(safe, 'i') },
      { 'location.address': new RegExp(safe, 'i') },
      { 'location.city': new RegExp(safe, 'i') },
    ];
  }

  const pipeline = [];
  if (latitude !== undefined && longitude !== undefined) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        key: 'location.geo',
        query: match,
      },
    });
  } else {
    pipeline.push({ $match: match });
  }

  // Availability is derived, so compute it in the pipeline to filter and sort on it.
  pipeline.push({
    $addFields: {
      availableTwoWheeler: {
        $max: [0, { $subtract: ['$capacity.two_wheeler', { $add: ['$occupied.two_wheeler', '$reserved.two_wheeler'] }] }],
      },
      availableFourWheeler: {
        $max: [
          0,
          { $subtract: ['$capacity.four_wheeler', { $add: ['$occupied.four_wheeler', '$reserved.four_wheeler'] }] },
        ],
      },
    },
  });

  if (availableOnly === true) {
    const field = vehicleType === 'two_wheeler' ? '$availableTwoWheeler' : vehicleType === 'four_wheeler' ? '$availableFourWheeler' : null;
    pipeline.push({
      $match: field
        ? { $expr: { $gt: [field, 0] } }
        : { $expr: { $gt: [{ $add: ['$availableTwoWheeler', '$availableFourWheeler'] }, 0] } },
    });
  }

  const sortStage = {
    distance: latitude !== undefined ? { distanceMeters: 1 } : { 'rating.average': -1 },
    rate: vehicleType ? { [`hourlyRate.${vehicleType}`]: 1 } : { 'hourlyRate.four_wheeler': 1 },
    rating: { 'rating.average': -1, 'rating.count': -1 },
    availability: { availableFourWheeler: -1, availableTwoWheeler: -1 },
  }[sortBy];
  pipeline.push({ $sort: sortStage });

  pipeline.push({
    $facet: {
      items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await ParkingLot.aggregate(pipeline);
  const rawItems = result?.items || [];
  const total = result?.total?.[0]?.count || 0;

  const items = rawItems.map((doc) => {
    const available = { two_wheeler: doc.availableTwoWheeler, four_wheeler: doc.availableFourWheeler };
    const totalCapacity = doc.capacity.two_wheeler + doc.capacity.four_wheeler;
    const used =
      doc.occupied.two_wheeler + doc.occupied.four_wheeler + doc.reserved.two_wheeler + doc.reserved.four_wheeler;
    return toPublicLot(
      { ...doc, available, occupancyRate: totalCapacity ? Number((used / totalCapacity).toFixed(4)) : 0 },
      {
        distanceKm: doc.distanceMeters !== undefined ? Number((doc.distanceMeters / 1000).toFixed(2)) : undefined,
        isOpenNow: isLotOpenNow(doc),
      },
    );
  });

  const payload = { items, total, page, limit };
  await cache.set(cacheKey, payload, cache.TTL.search);
  return payload;
};

/** Operating-hours check on a plain object (aggregation output has no methods). */
const isLotOpenNow = (doc, at = new Date()) => {
  const { parseClock, minutesOfDay } = require('../../utils/time');
  const hours = doc.operatingHours || {};
  if (hours.is24x7) return true;
  const open = parseClock(hours.openTime);
  const close = parseClock(hours.closeTime);
  if (open === null || close === null) return true;
  const now = minutesOfDay(at);
  return close > open ? now >= open && now <= close : now >= open || now <= close;
};

/** Full detail page for a driver, including the live dynamic-price preview. */
const getLotDetail = async (lotId) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
  if (lot.status !== LOT_STATUS.APPROVED) throw ApiError.notFound('This parking facility is not available');

  const rule = await pricingService.getRuleForLot(lot._id);
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const indicativeRates = {};
  for (const vehicleType of ['two_wheeler', 'four_wheeler']) {
    if (!lot.hourlyRate[vehicleType]) continue;
    try {
      const priced = await pricingService.quote({ lot, vehicleType, entryTime: now, exitTime: oneHourLater, rule });
      indicativeRates[vehicleType] = {
        baseRatePerHour: priced.baseRatePerHour,
        currentRatePerHour: priced.effectiveRatePerHour,
        multiplier: priced.multipliers.combined,
        activePeakWindows: priced.factors.peakWindows,
      };
    } catch {
      // A misconfigured rate should not break the detail page.
    }
  }

  return toPublicLot(lot, {
    isOpenNow: lot.isOpenAt(now),
    indicativeRates,
    dynamicPricing: {
      enabled: lot.pricing.dynamicPricingEnabled,
      zone: rule.locationFactor?.zoneLabel || 'standard',
      graceMinutes: lot.pricing.graceMinutes,
      overstayMultiplier: lot.pricing.overstayMultiplier,
    },
  });
};

/** Live availability, cached for a few seconds since it changes constantly. */
const getAvailability = async (lotId, vehicleType) => {
  const payload = await cache.remember(cache.KEYS.lotAvailability(lotId), cache.TTL.availability, async () => {
    const lot = await ParkingLot.findById(lotId).select('capacity occupied reserved status name');
    if (!lot) throw ApiError.notFound('Parking facility not found');
    return {
      lotId: lot._id.toString(),
      name: lot.name,
      status: lot.status,
      capacity: lot.capacity,
      occupied: lot.occupied,
      reserved: lot.reserved,
      available: lot.available,
      updatedAt: new Date().toISOString(),
    };
  });

  if (vehicleType) {
    return { ...payload, requestedVehicleType: vehicleType, availableSlots: payload.available[vehicleType] };
  }
  return payload;
};

const buildGeo = (location) => ({
  type: 'Point',
  coordinates: [location.longitude, location.latitude],
});

/** Register a lot. It stays pending until a platform admin approves it. */
const createLot = async (ownerUser, input) => {
  const ownerProfile = await ParkingOwner.findOne({ user: ownerUser._id });

  const lot = await ParkingLot.create({
    owner: ownerUser._id,
    ownerProfile: ownerProfile ? ownerProfile._id : undefined,
    name: input.name,
    description: input.description,
    contact: input.contact || { email: ownerUser.email, phone: ownerUser.phone },
    location: {
      address: input.location.address,
      city: input.location.city,
      state: input.location.state,
      pincode: input.location.pincode,
      geo: buildGeo(input.location),
    },
    capacity: input.capacity,
    hourlyRate: input.hourlyRate,
    operatingHours: input.operatingHours,
    amenities: input.amenities,
    pricing: input.pricing,
    images: input.images,
    status: LOT_STATUS.PENDING,
  });

  // Seed a rule from the platform default so the owner has something to tune.
  await PricingRule.create({
    parkingLot: lot._id,
    owner: ownerUser._id,
    ...DEFAULT_PRICING_RULE,
  });

  if (ownerProfile) {
    ownerProfile.lotCount = await ParkingLot.countDocuments({ owner: ownerUser._id });
    await ownerProfile.save();
  }

  await cache.invalidateLot(lot._id.toString());
  return toManagedLot(lot);
};

/** Load a lot the caller is allowed to manage (its owner, or any admin). */
const loadManagedLot = async (lotId, actor) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
  if (actor.role !== ROLES.ADMIN && lot.owner.toString() !== actor._id.toString()) {
    throw ApiError.forbidden('You do not manage this parking facility');
  }
  return lot;
};

/**
 * Edit a lot. Capacity may not drop below what is currently taken, otherwise
 * availability would go negative and the gate would start rejecting valid
 * bookings. An approved lot re-enters review when its capacity or rates change.
 */
const updateLot = async (lotId, actor, updates) => {
  const lot = await loadManagedLot(lotId, actor);

  if (updates.capacity) {
    for (const vehicleType of ['two_wheeler', 'four_wheeler']) {
      if (updates.capacity[vehicleType] === undefined) continue;
      const committed = lot.occupied[vehicleType] + lot.reserved[vehicleType];
      if (updates.capacity[vehicleType] < committed) {
        throw ApiError.conflict(
          `Cannot reduce ${vehicleType.replace('_', ' ')} capacity to ${updates.capacity[vehicleType]}: ${committed} slots are currently occupied or reserved`,
        );
      }
      lot.capacity[vehicleType] = updates.capacity[vehicleType];
    }
  }

  if (updates.hourlyRate) {
    for (const vehicleType of ['two_wheeler', 'four_wheeler']) {
      if (updates.hourlyRate[vehicleType] !== undefined) lot.hourlyRate[vehicleType] = updates.hourlyRate[vehicleType];
    }
  }

  if (updates.location) {
    Object.assign(lot.location, {
      address: updates.location.address ?? lot.location.address,
      city: updates.location.city ?? lot.location.city,
      state: updates.location.state ?? lot.location.state,
      pincode: updates.location.pincode ?? lot.location.pincode,
    });
    if (updates.location.latitude !== undefined && updates.location.longitude !== undefined) {
      lot.location.geo = buildGeo(updates.location);
    }
  }

  for (const field of ['name', 'description', 'images']) {
    if (updates[field] !== undefined) lot[field] = updates[field];
  }
  for (const group of ['contact', 'operatingHours', 'amenities', 'pricing']) {
    if (updates[group]) Object.assign(lot[group], updates[group]);
  }

  await lot.save();
  await cache.invalidateLot(lot._id.toString());
  return toManagedLot(lot);
};

const listOwnerLots = async (ownerId, { status, page, limit }) => {
  const filter = { owner: ownerId };
  if (status) filter.status = status;

  const [lots, total] = await Promise.all([
    ParkingLot.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ParkingLot.countDocuments(filter),
  ]);

  return { items: lots.map(toManagedLot), total, page, limit };
};

const getManagedLot = async (lotId, actor) => {
  const lot = await loadManagedLot(lotId, actor);
  const [rule, activeSessions, upcomingBookings] = await Promise.all([
    PricingRule.findOne({ parkingLot: lot._id }).lean(),
    ParkingSession.countDocuments({ parkingLot: lot._id, status: SESSION_STATUS.ACTIVE }),
    Booking.countDocuments({ parkingLot: lot._id, status: BOOKING_STATUS.CONFIRMED }),
  ]);

  return { ...toManagedLot(lot), pricingRule: rule, activeSessions, upcomingBookings };
};

/**
 * Recompute occupied/reserved from the sessions and bookings that actually
 * exist. A safety valve for drift after a crash mid-transaction.
 */
const recomputeCounters = async (lotId) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');

  const [sessions, bookings] = await Promise.all([
    ParkingSession.aggregate([
      { $match: { parkingLot: lot._id, status: SESSION_STATUS.ACTIVE } },
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { parkingLot: lot._id, status: BOOKING_STATUS.CONFIRMED } },
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } },
    ]),
  ]);

  const asMap = (rows) => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
  const occupied = asMap(sessions);
  const reserved = asMap(bookings);

  lot.occupied.two_wheeler = occupied.two_wheeler || 0;
  lot.occupied.four_wheeler = occupied.four_wheeler || 0;
  lot.reserved.two_wheeler = reserved.two_wheeler || 0;
  lot.reserved.four_wheeler = reserved.four_wheeler || 0;
  await lot.save();

  await cache.invalidateLot(lot._id.toString());
  return toManagedLot(lot);
};

module.exports = {
  searchLots,
  getLotDetail,
  getAvailability,
  createLot,
  updateLot,
  listOwnerLots,
  getManagedLot,
  loadManagedLot,
  recomputeCounters,
  toPublicLot,
  toManagedLot,
  haversineKm,
  isLotOpenNow,
};
