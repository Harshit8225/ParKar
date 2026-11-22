'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/response');
const service = require('./booking.service');

const create = asyncHandler(async (req, res) => {
  const result = await service.createBooking(req.user, req.body);
  return created(res, result, 'Booking created. Complete the payment to confirm your slot.');
});

const listMine = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listUserBookings(req.user._id, req.query);
  return paginated(res, items, { page, limit, total });
});

const detail = asyncHandler(async (req, res) => {
  const booking = await service.getBookingForUser(req.params.id, req.user);
  return ok(res, booking);
});

const spotMap = asyncHandler(async (req, res) => {
  const map = await service.getBookingSpotMap(req.params.id, req.user);
  return ok(res, map);
});

const lotBookings = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listLotBookings(req.params.id, req.user, req.query);
  return paginated(res, items, { page, limit, total });
});

module.exports = { create, listMine, detail, spotMap, lotBookings };
