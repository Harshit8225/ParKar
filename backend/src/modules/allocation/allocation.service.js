'use strict';

/**
 * Space allocation: decides which booking requests get space and assigns each
 * accepted one a concrete spot.
 *
 *   Plenty of space  -> the request is allocated straight away (first come,
 *                       first served), exactly like before.
 *   Nearly full      -> requests are collected in a Redis batch for
 *                       `layout.batchWindowMs`. One request becomes the batch
 *                       leader; when the window closes it runs the revenue
 *                       optimiser over everything collected and writes a
 *                       result per request.
 *
 * Every change to a lot's spotHolds goes through this module, under the lot
 * capacity lock, so the holds, the reserved/occupied counters and the stored
 * availability always move together.
 */

const { ParkingLot, Booking, ParkingSession } = require('../../models');
const { BOOKING_STATUS, SESSION_STATUS, SPOT_ZONE, VEHICLE_TYPE_LIST } = require('../../models/constants');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const cache = require('../../services/cache.service');
const { getRedis, isRedisAvailable } = require('../../config/redis');
const { withLock, lotCapacityLock } = require('../../services/lock.service');
const layout = require('./spot.layout');

/** Pending checkouts give their space back after this long (same as before). */
const UNPAID_HOLD_TTL_MINUTES = 15;

/** A hold whose booking was never written (crashed request) is dropped after this. */
const ORPHAN_HOLD_GRACE_MS = 2 * 60 * 1000;

const DEFAULT_BATCH_WINDOW_MS = 3000;
const DEFAULT_CONTENTION_THRESHOLD = 2;
const RESULT_POLL_MS = 100;
/** How long a request waits for its batch result beyond the window itself. */
const RESULT_GRACE_MS = 8000;

const KEYS = {
  queue: (lotId) => `alloc:queue:${lotId}`,
  leader: (lotId) => `alloc:leader:${lotId}`,
  result: (requestId) => `alloc:result:${requestId}`,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const typeLabel = (type) => type;

const toHold = (requestId, spot) => ({
  booking: requestId,
  vehicleType: spot.vehicleType,
  zone: spot.zone,
  bay: spot.zone === SPOT_ZONE.FIXED ? spot.bay : undefined,
  row: spot.zone === SPOT_ZONE.FLEXIBLE ? spot.row : undefined,
  start: spot.zone === SPOT_ZONE.FLEXIBLE ? spot.start : undefined,
  size: spot.size,
  label: spot.label,
  heldAt: new Date(),
});

const plainHolds = (lot) => (lot.spotHolds || []).map((h) => (typeof h.toObject === 'function' ? h.toObject() : h));

/**
 * Write a lot's new holds together with the derived availability and any
 * counter changes, in one update. Caller holds the lot lock.
 */
const writeHolds = async (lot, holds, counterDelta = {}) => {
  const update = { $set: { spotHolds: holds, availability: layout.computeAvailability(lot, holds) } };
  const inc = Object.fromEntries(Object.entries(counterDelta).filter(([, value]) => value));
  if (Object.keys(inc).length) update.$inc = inc;
  await ParkingLot.updateOne({ _id: lot._id }, update);
  await cache.invalidateLot(lot._id.toString());
};

const addDelta = (delta, field, amount) => {
  delta[field] = (delta[field] || 0) + amount;
};

/**
 * Give back space from checkouts that were never paid, and from holds whose
 * booking was never created. Caller holds the lot lock.
 */
const releaseStaleHoldsUnlocked = async (lotId) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) return 0;

  const cutoff = new Date(Date.now() - UNPAID_HOLD_TTL_MINUTES * 60 * 1000);
  const stale = await Booking.find({
    parkingLot: lotId,
    status: BOOKING_STATUS.PENDING_PAYMENT,
    createdAt: { $lt: cutoff },
  }).select('_id vehicleType');

  const holds = plainHolds(lot);
  const releaseIds = new Set(stale.map((b) => String(b._id)));
  const delta = {};
  for (const booking of stale) addDelta(delta, `reserved.${booking.vehicleType}`, -1);

  // Orphans: the allocation succeeded but the request died before writing the booking.
  const oldHolds = holds.filter((h) => !releaseIds.has(String(h.booking)) && Date.now() - new Date(h.heldAt).getTime() > ORPHAN_HOLD_GRACE_MS);
  if (oldHolds.length) {
    const existing = await Booking.find({ _id: { $in: oldHolds.map((h) => h.booking) } }).select('_id');
    const existingIds = new Set(existing.map((b) => String(b._id)));
    for (const hold of oldHolds) {
      if (existingIds.has(String(hold.booking))) continue;
      releaseIds.add(String(hold.booking));
      addDelta(delta, `reserved.${hold.vehicleType}`, -1);
    }
  }

  if (!releaseIds.size) return 0;

  if (stale.length) {
    await Booking.updateMany(
      { _id: { $in: stale.map((b) => b._id) } },
      { $set: { status: BOOKING_STATUS.PAYMENT_FAILED, 'spot.releasedAt': new Date() } },
    );
  }
  await writeHolds(lot, holds.filter((h) => !releaseIds.has(String(h.booking))), delta);
  return releaseIds.size;
};

/**
 * Decide a batch and place the winners. Caller holds the lot lock.
 *
 * @param requests [{ id, vehicleType, revenue, arrivedAt }]
 * @returns [{ id, accepted, spot?, reason?, message? }] in request order
 */
const allocateBatchUnlocked = async (lotId, requests) => {
  await releaseStaleHoldsUnlocked(lotId);

  const lot = await ParkingLot.findById(lotId);
  if (!lot) throw ApiError.notFound('Parking facility not found');

  const holds = plainHolds(lot);
  const state = layout.buildState(lot, holds);
  const summary = layout.summarize(state);

  const { accepted } = layout.solveBatch(requests, summary);
  const spots = layout.placeSpots(state, accepted);

  const newHolds = [];
  const delta = {};
  for (const request of accepted) {
    const spot = spots.get(request.id);
    if (!spot) continue; // cannot happen while optimiser and placement agree; treated as rejected
    newHolds.push(toHold(request.id, spot));
    addDelta(delta, `reserved.${request.vehicleType}`, 1);
  }

  if (newHolds.length) await writeHolds(lot, [...holds, ...newHolds], delta);

  return requests.map((request) => {
    const spot = spots.get(request.id);
    if (spot) return { id: request.id, accepted: true, spot };

    const full = !layout.fitsAlone(request.vehicleType, summary);
    return {
      id: request.id,
      accepted: false,
      reason: full ? 'full' : 'outbid',
      message: full
        ? `No ${typeLabel(request.vehicleType)} space is available at ${lot.name} right now`
        : `The last spaces at ${lot.name} went to other bookings made at the same moment. Please try a nearby facility.`,
    };
  });
};

/** Allocate one request immediately under the lock (the uncontended path). */
const allocateNow = async (lotId, request) => {
  const [result] = await withLock(
    lotCapacityLock(String(lotId)),
    () => allocateBatchUnlocked(lotId, [request]),
    { ttlMs: 8000 },
  );
  return result;
};

/** The leader's job: wait out the window, then decide everything queued. */
const runBatch = async (redis, lotId, leaderToken, windowMs) => {
  await sleep(windowMs);

  let requests = [];
  try {
    await withLock(
      lotCapacityLock(String(lotId)),
      async () => {
        const [[, items]] = await redis.multi().lrange(KEYS.queue(lotId), 0, -1).del(KEYS.queue(lotId)).exec();
        requests = (items || []).map((item) => JSON.parse(item));
        if (!requests.length) return;

        const results = await allocateBatchUnlocked(lotId, requests);
        const write = redis.multi();
        for (const result of results) write.set(KEYS.result(result.id), JSON.stringify(result), 'EX', 120);
        await write.exec();

        logger.info(
          `Allocation batch at lot ${lotId}: ${requests.length} request(s), ${results.filter((r) => r.accepted).length} accepted`,
        );
      },
      { ttlMs: 10000 },
    );
  } catch (err) {
    // Tell every waiter rather than leaving them to time out.
    logger.error(`Allocation batch failed at lot ${lotId}:`, err.message);
    if (requests.length) {
      const write = redis.multi();
      for (const request of requests) {
        write.set(
          KEYS.result(request.id),
          JSON.stringify({ id: request.id, accepted: false, reason: 'error', message: 'This parking is busy right now. Please retry in a moment.' }),
          'EX',
          120,
        );
      }
      await write.exec().catch(() => {});
    }
  } finally {
    // Only clear the leader key if it is still ours.
    const current = await redis.get(KEYS.leader(lotId)).catch(() => null);
    if (current === leaderToken) await redis.del(KEYS.leader(lotId)).catch(() => {});
  }
};

/**
 * Join (or open) the lot's batch and wait for this request's result.
 *
 * Any waiter whose result has not appeared and who finds no leader becomes the
 * leader itself, so a request queued just after a batch was drained is picked
 * up by the next batch instead of being stranded.
 */
const joinBatch = async (lotId, request, windowMs) => {
  const redis = getRedis();
  const queueKey = KEYS.queue(lotId);
  const payload = JSON.stringify(request);

  await redis.multi().rpush(queueKey, payload).pexpire(queueKey, windowMs + 60000).exec();

  const deadline = Date.now() + windowMs + RESULT_GRACE_MS;
  while (Date.now() < deadline) {
    const raw = await redis.get(KEYS.result(request.id));
    if (raw) {
      await redis.del(KEYS.result(request.id)).catch(() => {});
      return JSON.parse(raw);
    }

    const becameLeader = await redis.set(KEYS.leader(lotId), request.id, 'PX', windowMs + 15000, 'NX');
    if (becameLeader === 'OK') {
      await runBatch(redis, lotId, request.id, windowMs);
      continue;
    }

    await sleep(RESULT_POLL_MS);
  }

  // Gave up: withdraw from the queue if still there. A hold granted after this
  // point has no booking and is reclaimed as an orphan.
  await redis.lrem(queueKey, 0, payload).catch(() => {});
  throw ApiError.conflict('This parking is busy right now. Please retry in a moment.');
};

const batchOpen = async (redis, lotId) => {
  const [leader, queued] = await Promise.all([redis.exists(KEYS.leader(lotId)), redis.llen(KEYS.queue(lotId))]);
  return Boolean(leader) || queued > 0;
};

/**
 * Ask for space for one booking.
 *
 * @param lot      the lot document (read just before; used for the contention check)
 * @param request  { id, vehicleType, revenue, arrivedAt }
 * @returns { id, accepted, spot } or { id, accepted: false, reason, message }
 */
const requestSpot = async ({ lot, request }) => {
  const lotId = String(lot._id);
  const windowMs = lot.layout?.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
  const threshold = lot.layout?.contentionThreshold ?? DEFAULT_CONTENTION_THRESHOLD;

  // Batching needs Redis (several app instances share the queue). Without it,
  // or with batching turned off, every request is served as it arrives.
  if (!isRedisAvailable() || windowMs <= 0) return allocateNow(lotId, request);

  const redis = getRedis();
  const remaining = lot.available ? lot.available[request.vehicleType] ?? 0 : 0;
  const contended = remaining <= threshold || (await batchOpen(redis, lotId));
  if (!contended) return allocateNow(lotId, request);

  return joinBatch(lotId, request, windowMs);
};

/**
 * Give back the spots held by these bookings and apply `counterDelta`
 * (e.g. { 'occupied.car': -1 }) in the same write.
 */
const releaseSpots = async (lotId, bookingIds, counterDelta = {}) =>
  withLock(
    lotCapacityLock(String(lotId)),
    async () => {
      const lot = await ParkingLot.findById(lotId);
      if (!lot) return;
      const ids = new Set(bookingIds.map(String));
      const holds = plainHolds(lot).filter((h) => !ids.has(String(h.booking)));
      await writeHolds(lot, holds, counterDelta);
    },
    { ttlMs: 8000 },
  );

/** Locked wrapper around releaseStaleHoldsUnlocked. */
const releaseStaleHolds = async (lotId) =>
  withLock(lotCapacityLock(String(lotId)), () => releaseStaleHoldsUnlocked(lotId), { ttlMs: 8000 });

/**
 * Rebuild a lot's holds and counters from its bookings. Used after a crash, by
 * the owner's "recompute" action and by the migration. Bookings that already
 * have a valid, non-conflicting spot keep it; the rest are placed fresh.
 *
 * @returns {{ held, placed, unplaced }}
 */
const rebuildLotSpots = async (lotId) =>
  withLock(
    lotCapacityLock(String(lotId)),
    async () => {
      const lot = await ParkingLot.findById(lotId);
      if (!lot) throw ApiError.notFound('Parking facility not found');

      const [reservedBookings, activeSessions] = await Promise.all([
        Booking.find({
          parkingLot: lot._id,
          status: { $in: [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.CONFIRMED] },
        }),
        ParkingSession.find({ parkingLot: lot._id, status: SESSION_STATUS.ACTIVE }).select('booking vehicleType'),
      ]);
      const insideBookings = activeSessions.length
        ? await Booking.find({ _id: { $in: activeSessions.map((s) => s.booking) } })
        : [];

      const holding = [...insideBookings, ...reservedBookings];
      const state = layout.buildState(lot, []);
      const holds = [];
      const unplacedBookings = [];

      // Pass 1: keep existing spots that are still valid and free.
      for (const booking of holding) {
        const spot = booking.spot && booking.spot.zone && !booking.spot.releasedAt ? booking.spot : null;
        if (!spot || spot.vehicleType !== booking.vehicleType) {
          unplacedBookings.push(booking);
          continue;
        }
        if (spot.zone === SPOT_ZONE.FIXED) {
          const fits = spot.bay >= 1 && spot.bay <= state.capacity[booking.vehicleType];
          if (!fits || state.fixedTaken[booking.vehicleType].has(spot.bay)) {
            unplacedBookings.push(booking);
            continue;
          }
          state.fixedTaken[booking.vehicleType].add(spot.bay);
        } else {
          const row = state.rows.find((r) => r.label === spot.row);
          const cells = row ? row.grid.slice(spot.start, spot.start + spot.size) : [];
          if (!row || cells.length !== spot.size || cells.some((c) => c !== null)) {
            unplacedBookings.push(booking);
            continue;
          }
          for (let i = spot.start; i < spot.start + spot.size; i += 1) row.grid[i] = String(booking._id);
        }
        holds.push(toHold(booking._id, spot));
      }

      // Pass 2: place everything else.
      const placed = layout.placeSpots(
        state,
        unplacedBookings.map((b) => ({ id: String(b._id), vehicleType: b.vehicleType, revenue: 0 })),
      );
      let unplaced = 0;
      for (const booking of unplacedBookings) {
        const spot = placed.get(String(booking._id));
        if (!spot) {
          unplaced += 1;
          logger.warn(`rebuildLotSpots: no space for booking ${booking.bookingId} at lot ${lot._id}`);
          continue;
        }
        holds.push(toHold(booking._id, spot));
        booking.spot = { ...spot, assignedAt: new Date(), releasedAt: undefined };
        await booking.save();
      }

      const count = (list) => list.reduce((acc, b) => ({ ...acc, [b.vehicleType]: (acc[b.vehicleType] || 0) + 1 }), {});
      const occupied = count(insideBookings);
      const reserved = count(reservedBookings);
      const counters = {};
      for (const type of VEHICLE_TYPE_LIST) {
        counters[`occupied.${type}`] = occupied[type] || 0;
        counters[`reserved.${type}`] = reserved[type] || 0;
      }

      await ParkingLot.updateOne(
        { _id: lot._id },
        { $set: { spotHolds: holds, availability: layout.computeAvailability(lot, holds), ...counters } },
      );
      await cache.invalidateLot(lot._id.toString());

      return { held: holds.length, placed: placed.size, unplaced };
    },
    { ttlMs: 30000 },
  );

module.exports = {
  requestSpot,
  allocateNow,
  allocateBatchUnlocked,
  releaseSpots,
  releaseStaleHolds,
  releaseStaleHoldsUnlocked,
  rebuildLotSpots,
  UNPAID_HOLD_TTL_MINUTES,
  KEYS,
};
