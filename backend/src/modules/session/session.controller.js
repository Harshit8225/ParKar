'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/response');
const service = require('./session.service');

const listMine = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listUserSessions(req.user._id, req.query);
  return paginated(res, items, { page, limit, total });
});

const lotSessions = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.listLotSessions(req.params.id, req.user, req.query);
  return paginated(res, items, { page, limit, total });
});

const detail = asyncHandler(async (req, res) => {
  const session = await service.getSession(req.params.id, req.user);
  return ok(res, session);
});

const preview = asyncHandler(async (req, res) => {
  const bill = await service.previewBill(req.params.id, req.user);
  return ok(res, bill, 'Live bill preview');
});

module.exports = { listMine, lotSessions, detail, preview };
