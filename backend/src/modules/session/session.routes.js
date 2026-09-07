'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES, SESSION_STATUS } = require('../../models/constants');
const v = require('../../utils/validators');
const controller = require('./session.controller');

const router = Router();

const listSchema = z
  .object({
    status: z.enum(Object.values(SESSION_STATUS)).optional(),
    vehicleNumber: z.string().trim().max(15).optional(),
  })
  .merge(v.pagination);

const codeParam = z.object({ id: z.string().trim().min(6).max(40) });

router.get('/mine', authenticate, validate({ query: listSchema }), controller.listMine);

router.get(
  '/lot/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, query: listSchema }),
  controller.lotSessions,
);

router.get('/:id/preview-bill', authenticate, validate({ params: codeParam }), controller.preview);
router.get('/:id', authenticate, validate({ params: codeParam }), controller.detail);

module.exports = router;
