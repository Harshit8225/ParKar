'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES, LOT_STATUS, PAYMENT_STATUS, PAYMENT_PURPOSE } = require('../../models/constants');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, paginated } = require('../../utils/response');
const v = require('../../utils/validators');
const service = require('./admin.service');

const router = Router();

// Every route in this module is platform-admin only.
router.use(authenticate, authorize(ROLES.ADMIN));

const boolFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const listUsersSchema = z
  .object({
    role: z.enum(Object.values(ROLES)).optional(),
    isActive: boolFlag.optional(),
    q: z.string().trim().min(1).max(80).optional(),
  })
  .merge(v.pagination);

const listLotsSchema = z
  .object({
    status: z.enum(Object.values(LOT_STATUS)).optional(),
    city: z.string().trim().max(80).optional(),
    q: z.string().trim().min(1).max(80).optional(),
    ownerId: v.objectId.optional(),
  })
  .merge(v.pagination);

const reviewLotSchema = z.object({
  decision: z.enum(['approve', 'reject', 'deactivate', 'reactivate']),
  reason: z.string().trim().max(300).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
});

const commissionSchema = z.object({
  lotId: v.objectId.optional(),
  commissionPercent: z.coerce.number().min(0).max(100),
});

const transactionsSchema = z
  .object({
    status: z.enum(Object.values(PAYMENT_STATUS)).optional(),
    purpose: z.enum(Object.values(PAYMENT_PURPOSE)).optional(),
    lotId: v.objectId.optional(),
    userId: v.objectId.optional(),
    from: v.isoDate.optional(),
    to: v.isoDate.optional(),
  })
  .merge(v.pagination);

// ---- Users ----
router.get(
  '/users',
  validate({ query: listUsersSchema }),
  asyncHandler(async (req, res) => {
    const { items, total, page, limit } = await service.listUsers(req.query);
    return paginated(res, items, { page, limit, total });
  }),
);

router.get(
  '/users/:id',
  validate({ params: v.idParam }),
  asyncHandler(async (req, res) => ok(res, await service.getUserDetail(req.params.id))),
);

router.patch(
  '/users/:id/status',
  validate({ params: v.idParam, body: z.object({ isActive: z.coerce.boolean() }) }),
  asyncHandler(async (req, res) => {
    const user = await service.setUserActive(req.params.id, req.body.isActive, req.user);
    return ok(res, { user }, req.body.isActive ? 'Account activated' : 'Account deactivated');
  }),
);

// ---- Parking facilities ----
router.get(
  '/lots',
  validate({ query: listLotsSchema }),
  asyncHandler(async (req, res) => {
    const { items, total, page, limit } = await service.listLots(req.query);
    return paginated(res, items, { page, limit, total });
  }),
);

router.post(
  '/lots/:id/review',
  validate({ params: v.idParam, body: reviewLotSchema }),
  asyncHandler(async (req, res) => {
    const lot = await service.reviewLot(req.params.id, req.body, req.user);
    return ok(res, lot, `Facility ${req.body.decision}d`);
  }),
);

// ---- Commission ----
router.put(
  '/commission',
  validate({ body: commissionSchema }),
  asyncHandler(async (req, res) => ok(res, await service.setCommission(req.body), 'Commission updated')),
);

// ---- Money & activity ----
router.get(
  '/transactions',
  validate({ query: transactionsSchema }),
  asyncHandler(async (req, res) => {
    const { items, total, page, limit, summary } = await service.listTransactions(req.query);
    return res.status(200).json({
      success: true,
      message: 'OK',
      data: items,
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

router.get(
  '/activity',
  validate({ query: v.pagination }),
  asyncHandler(async (req, res) => {
    const { items, total, page, limit, flaggedEvents } = await service.monitorActivity(req.query);
    return res.status(200).json({
      success: true,
      message: 'OK',
      data: items,
      flaggedEvents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

router.get(
  '/fraud',
  validate({
    query: z.object({ from: v.isoDate.optional(), to: v.isoDate.optional() }).merge(v.pagination),
  }),
  asyncHandler(async (req, res) => {
    const { items, total, page, limit, byResult } = await service.fraudReport(req.query);
    return res.status(200).json({
      success: true,
      message: 'OK',
      data: items,
      byResult,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

module.exports = router;
