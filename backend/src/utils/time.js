'use strict';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Minutes between two instants, never negative. */
const minutesBetween = (from, to) => Math.max(0, Math.round((new Date(to) - new Date(from)) / MINUTE_MS));

/** Hours between two instants as a float, never negative. */
const hoursBetween = (from, to) => Math.max(0, (new Date(to) - new Date(from)) / HOUR_MS);

/** Chargeable hours: any started hour is billed in full. */
const billableHours = (from, to) => Math.max(1, Math.ceil(hoursBetween(from, to) - 1e-9));

/** True when both instants fall on the same calendar day in the given zone. */
const isSameDay = (a, b, tz = 'Asia/Kolkata') => dayjs(a).tz(tz).isSame(dayjs(b).tz(tz), 'day');

/** Minutes since midnight, used to compare against lot operating hours. */
const minutesOfDay = (date, tz = 'Asia/Kolkata') => {
  const d = dayjs(date).tz(tz);
  return d.hour() * 60 + d.minute();
};

/** 0 = Sunday .. 6 = Saturday, in the given zone. */
const dayOfWeek = (date, tz = 'Asia/Kolkata') => dayjs(date).tz(tz).day();

/** "HH:mm" -> minutes since midnight. */
const parseClock = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

module.exports = {
  dayjs,
  MINUTE_MS,
  HOUR_MS,
  minutesBetween,
  hoursBetween,
  billableHours,
  isSameDay,
  minutesOfDay,
  dayOfWeek,
  parseClock,
};
