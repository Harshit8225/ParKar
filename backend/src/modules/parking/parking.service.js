'use strict';

const crypto = require('crypto');
const { ParkingLot, ParkingOwner, PricingRule, ParkingSession, Booking } = require('../../models');
const { LOT_STATUS, ROLES, SESSION_STATUS, BOOKING_STATUS, VEHICLE_TYPE_LIST, SPOT_ZONE } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const cache = require('../../services/cache.service');
const { withLock, lotCapacityLock } = require('../../services/lock.service');
const layout = require('../allocation/spot.layout');
const pricingService = require('../pricing/pricing.service');
const { DEFAULT_PRICING_RULE } = require('../pricing/pricing.defaults');

const EARTH_RADIUS_KM = 6371;

/** Public projection of a lot: everything a driver needs, nothing internal. */
const toPublicLot = (lot, extras = {}) => {
  const doc = typeof lot.toObject === 'function' ? lot.toObject({ virtuals: true }) : lot;
  const stored = doc.available || doc.availability || {};
  const available = VEHICLE_TYPE_LIST.reduce((acc, type) => ({ ...acc, [type]: stored[type] || 0 }), {});

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
    maxCapacity: layout.computeMaxCapacity(doc),
    flexibleArea: layout.flexibleAreaSummary(doc),
    occupied: doc.occupied,
    hourlyRate: doc.hourlyRate,
    operatingHours: doc.operatingHours,
    amenities: doc.amenities,
    rating: doc.rating,
    status: doc.status,
    images: doc.images || [],
    occupancyRate: typeof doc.occupancyRate === 'number' ? doc.occupancyRate : layout.computeOccupancyRate(doc),
    ...extras,
  };
};

/** Owner/admin view adds the operational and revenue-relevant fields. */
const toManagedLot = (lot) => {
  const doc = typeof lot.toObject === 'function' ? lot.toObject({ virtuals: true }) : lot;
  return {
    ...toPublicLot(lot),
    reserved: doc.reserved,
    layout: {
      flexibleRows: (doc.layout?.flexibleRows || []).map((row) => ({ label: row.label, units: row.units })),
      batchWindowMs: doc.layout?.batchWindowMs ?? 3000,
      contentionThreshold: doc.layout?.contentionThreshold ?? 2,
    },
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

  // Availability is stored on the lot (kept in step with its spot holds by the
  // allocation module), so it can be filtered and sorted on directly.
  if (availableOnly === true) {
    pipeline.push({
      $match: vehicleType
        ? { [`availability.${vehicleType}`]: { $gt: 0 } }
        : { $or: VEHICLE_TYPE_LIST.map((type) => ({ [`availability.${type}`]: { $gt: 0 } })) },
    });
  }

  const sortStage = {
    distance: latitude !== undefined ? { distanceMeters: 1 } : { 'rating.average': -1 },
    rate: vehicleType ? { [`hourlyRate.${vehicleType}`]: 1 } : { 'hourlyRate.car': 1 },
    rating: { 'rating.average': -1, 'rating.count': -1 },
    availability: vehicleType
      ? { [`availability.${vehicleType}`]: -1 }
      : { 'availability.car': -1, 'availability.bike': -1, 'availability.bus': -1 },
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
    return toPublicLot(
      { ...doc, occupancyRate: layout.computeOccupancyRate(doc) },
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
  for (const vehicleType of VEHICLE_TYPE_LIST) {
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
    const lot = await ParkingLot.findById(lotId).select('capacity occupied reserved availability status name');
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
    layout: input.layout,
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
 * Edit a lot. Space that a booking currently holds may not be removed: a fixed
 * bay or flexible-row marker with a vehicle assigned to it must survive the
 * edit, otherwise a driver would arrive at a spot that no longer exists.
 *
 * Runs under the lot lock because a capacity or layout change re-derives
 * availability from the spot holds, which the allocator also writes.
 */
const updateLot = async (lotId, actor, updates) => {
  await loadManagedLot(lotId, actor);
  return withLock(lotCapacityLock(String(lotId)), () => applyLotUpdate(lotId, actor, updates), { ttlMs: 8000 });
};

const applyLotUpdate = async (lotId, actor, updates) => {
  const lot = await loadManagedLot(lotId, actor);
  const holds = (lot.spotHolds || []).map((h) => h.toObject());

  if (updates.capacity) {
    for (const vehicleType of VEHICLE_TYPE_LIST) {
      const next = updates.capacity[vehicleType];
      if (next === undefined) continue;
      const highestHeld = holds
        .filter((h) => h.zone === SPOT_ZONE.FIXED && h.vehicleType === vehicleType)
        .reduce((max, h) => Math.max(max, h.bay), 0);
      if (next < highestHeld) {
        throw ApiError.conflict(
          `Cannot reduce ${vehicleType} bays to ${next}: bay ${layout.fixedLabel(vehicleType, highestHeld)} is assigned to a current booking`,
        );
      }
      lot.capacity[vehicleType] = next;
    }
  }

  if (updates.layout) {
    if (updates.layout.flexibleRows) {
      const rows = new Map(updates.layout.flexibleRows.map((row) => [row.label, row.units]));
      const blocked = holds.find(
        (h) => h.zone === SPOT_ZONE.FLEXIBLE && (!rows.has(h.row) || h.start + h.size > rows.get(h.row)),
      );
      if (blocked) {
        throw ApiError.conflict(
          `Cannot change flexible row ${blocked.row}: markers ${blocked.label} are assigned to a current booking`,
        );
      }
      lot.layout.flexibleRows = updates.layout.flexibleRows;
    }
    if (updates.layout.batchWindowMs !== undefined) lot.layout.batchWindowMs = updates.layout.batchWindowMs;
    if (updates.layout.contentionThreshold !== undefined) lot.layout.contentionThreshold = updates.layout.contentionThreshold;
  }

  if (updates.hourlyRate) {
    for (const vehicleType of VEHICLE_TYPE_LIST) {
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

  // Booking codes for the owner's spot map, so each held spot can be traced.
  const holdIds = (lot.spotHolds || []).map((h) => h.booking);
  const bookings = holdIds.length ? await Booking.find({ _id: { $in: holdIds } }).select('bookingId').lean() : [];
  const bookingCodes = new Map(bookings.map((b) => [String(b._id), b.bookingId]));

  return {
    ...toManagedLot(lot),
    pricingRule: rule,
    activeSessions,
    upcomingBookings,
    spotMap: layout.buildSpotMap(lot, bookingCodes),
  };
};

/**
 * Rebuild occupied/reserved and the spot holds from the sessions and bookings
 * that actually exist. A safety valve for drift after a crash mid-transaction.
 */
const recomputeCounters = async (lotId) => {
  // Required lazily: the allocation module loads the models this file also uses.
  const allocation = require('../allocation/allocation.service');
  await allocation.rebuildLotSpots(lotId);
  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');
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
