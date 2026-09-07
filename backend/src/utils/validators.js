'use strict';

const { z } = require('zod');
const { VEHICLE_TYPE_LIST } = require('../models/constants');

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

const idParam = z.object({ id: objectId });

const vehicleType = z.enum(VEHICLE_TYPE_LIST);

/** Query strings arrive as text, so page/limit are coerced and bounded. */
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format');

const plateNumber = z
  .string()
  .trim()
  .toUpperCase()
  .min(4, 'Vehicle number is too short')
  .max(15, 'Vehicle number is too long')
  .regex(/^[A-Z0-9\s-]+$/, 'Vehicle number may only contain letters, digits, spaces and dashes');

const isoDate = z.coerce.date({ errorMap: () => ({ message: 'Must be a valid date/time' }) });

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

const multiplier = z.coerce.number().min(0.1).max(5);

const money = z.coerce.number().min(0).max(1000000);

module.exports = {
  objectId,
  idParam,
  vehicleType,
  pagination,
  clockTime,
  plateNumber,
  isoDate,
  latitude,
  longitude,
  multiplier,
  money,
};
