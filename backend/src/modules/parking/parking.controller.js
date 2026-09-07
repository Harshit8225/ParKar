'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, paginated } = require('../../utils/response');
const service = require('./parking.service');

const search = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.searchLots(req.query);
  return paginated(res, items, { page, limit, total });
});

const detail = asyncHandler(async (req, res) => {
  const lot = await service.getLotDetail(req.params.id);
  return ok(res, lot);
});

const availability = asyncHandler(async (req, res) => {
  const data = await service.getAvailability(req.params.id, req.query.vehicleType);
  return ok(res, data);
});

const createLot = asyncHandler(async (req, res) => {
  const lot = await service.createLot(req.user, req.body);
  return created(res, lot, 'Parking facility registered and submitted for approval');
});

const updateLot = asyncHandler(async (req, res) => {
  const lot = await service.updateLot(req.params.id, req.user, req.body);
  return ok(res, lot, 'Parking facility updated');
});

const myLots = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listOwnerLots(req.user._id, req.query);
  return paginated(res, items, { page, limit, total });
});

const managedLot = asyncHandler(async (req, res) => {
  const lot = await service.getManagedLot(req.params.id, req.user);
  return ok(res, lot);
});

const recount = asyncHandler(async (req, res) => {
  const lot = await service.recomputeCounters(req.params.id);
  return ok(res, lot, 'Counters recomputed from live sessions and bookings');
});

module.exports = { search, detail, availability, createLot, updateLot, myLots, managedLot, recount };
