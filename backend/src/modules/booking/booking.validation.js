'use strict';

const { z } = require('zod');
const { BOOKING_STATUS } = require('../../models/constants');
const v = require('../../utils/validators');

const MAX_DURATION_HOURS = 24;

const createBookingSchema = z
  .object({
    parkingLotId: v.objectId,
    vehicleNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    expectedEntryTime: v.isoDate,
    // Either give an explicit exit time, or a duration and let the server derive it.
    expectedExitTime: v.isoDate.optional(),
    durationHours: z.coerce.number().int().min(1).max(MAX_DURATION_HOURS).optional(),
  })
  .refine((value) => value.expectedExitTime || value.durationHours, {
    path: ['durationHours'],
    message: 'Provide either an exit time or a parking duration',
  })
  .refine(
    (value) => !value.expectedExitTime || value.expectedExitTime > value.expectedEntryTime,
    { path: ['expectedExitTime'], message: 'Exit time must be after entry time' },
  )
  .transform((value) => {
    const expectedExitTime =
      value.expectedExitTime || new Date(value.expectedEntryTime.getTime() + value.durationHours * 60 * 60 * 1000);
    const durationHours = Math.max(1, Math.ceil((expectedExitTime - value.expectedEntryTime) / (60 * 60 * 1000)));
    return { ...value, expectedExitTime, durationHours };
  })
  .refine((value) => value.durationHours <= MAX_DURATION_HOURS, {
    path: ['durationHours'],
    message: `Bookings cannot exceed ${MAX_DURATION_HOURS} hours`,
  });

const listMineSchema = z
  .object({
    status: z.enum(Object.values(BOOKING_STATUS)).optional(),
  })
  .merge(v.pagination);

const lotBookingsSchema = z
  .object({
    status: z.enum(Object.values(BOOKING_STATUS)).optional(),
    from: v.isoDate.optional(),
    to: v.isoDate.optional(),
    vehicleNumber: z.string().trim().max(15).optional(),
  })
  .merge(v.pagination);

module.exports = { createBookingSchema, listMineSchema, lotBookingsSchema, MAX_DURATION_HOURS };
