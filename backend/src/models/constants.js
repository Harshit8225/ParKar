'use strict';

const ROLES = { USER: 'user', OWNER: 'owner', ADMIN: 'admin' };
const VEHICLE_TYPES = { BIKE: 'bike', CAR: 'car', BUS: 'bus' };

/**
 * Space each vehicle takes, in bike-sized units: 1 car space holds 2 bikes and
 * 1 bus space holds 2 cars (= 4 bikes). Each size divides the next, which is
 * what lets the flexible area be packed without fragmentation (see
 * modules/allocation/spot.layout.js).
 */
const SPACE_UNITS = { bike: 1, car: 2, bus: 4 };

/** Where an assigned spot lives: a dedicated bay, or the shared flexible area. */
const SPOT_ZONE = { FIXED: 'fixed', FLEXIBLE: 'flexible' };

const LOT_STATUS = {
  PENDING: 'pending',      // awaiting platform-admin approval
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEACTIVATED: 'deactivated',
};

const BOOKING_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',        // vehicle inside the facility
  COMPLETED: 'completed',
  PAYMENT_FAILED: 'payment_failed',
};

const SESSION_STATUS = { ACTIVE: 'active', CLOSED: 'closed', PENDING_PAYMENT: 'pending_payment' };

const PAYMENT_STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  FAILED: 'failed',
  PENDING: 'pending',
};

const PAYMENT_PURPOSE = { BOOKING: 'booking', OVERSTAY: 'overstay', FINAL: 'final' };

const RECOGNITION_EVENT = { ENTRY: 'entry', EXIT: 'exit' };

const RECOGNITION_RESULT = {
  VERIFIED: 'verified',
  NO_BOOKING: 'no_booking',
  PLATE_MISMATCH: 'plate_mismatch',
  OUTSIDE_WINDOW: 'outside_entry_window',
  UNREADABLE: 'unreadable_plate',
  DUPLICATE: 'duplicate_event',
  NO_SESSION: 'no_active_session',
};

const VEHICLE_TYPE_LIST = Object.values(VEHICLE_TYPES);

module.exports = {
  ROLES,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LIST,
  SPACE_UNITS,
  SPOT_ZONE,
  LOT_STATUS,
  BOOKING_STATUS,
  SESSION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  RECOGNITION_EVENT,
  RECOGNITION_RESULT,
};
