'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../models/constants');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const v = require('../../utils/validators');
const { loadManagedLot } = require('../parking/parking.service');
const service = require('./analytics.service');

const router = Router();

const rangeSchema = z.object({
  range: z.enum(['today', '7d', '30d', '90d', 'all']).default('7d'),
  lotId: v.objectId.optional(),
});

router.get(
  '/owner',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ query: rangeSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.ownerAnalytics(req.user._id, req.query);
    return ok(res, data);
  }),
);

router.get(
  '/lot/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, query: rangeSchema.pick({ range: true }) }),
  asyncHandler(async (req, res) => {
    const lot = await loadManagedLot(req.params.id, req.user);
    const data = await service.lotAnalytics(lot, req.query);
    return ok(res, data);
  }),
);

router.get(
  '/platform',
  authenticate,
  authorize(ROLES.ADMIN),
  validate({ query: z.object({ range: z.enum(['today', '7d', '30d', '90d', 'all']).default('30d') }) }),
  asyncHandler(async (req, res) => {
    const data = await service.platformAnalytics(req.query);
    return ok(res, data);
  }),
);

module.exports = router;
