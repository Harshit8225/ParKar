'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../models/constants');
const v = require('../../utils/validators');
const controller = require('./booking.controller');
const schemas = require('./booking.validation');

const router = Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.USER),
  validate({ body: schemas.createBookingSchema }),
  controller.create,
);

router.get(
  '/mine',
  authenticate,
  validate({ query: schemas.listMineSchema }),
  controller.listMine,
);

router.get(
  '/lot/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, query: schemas.lotBookingsSchema }),
  controller.lotBookings,
);

// Floor plan with this booking's spot highlighted and directions from the gate.
router.get(
  '/:id/spot-map',
  authenticate,
  validate({ params: z.object({ id: z.string().trim().min(6).max(40) }) }),
  controller.spotMap,
);

// Accepts either the Mongo id or the human-facing booking code (BK-XXXXXXXX).
router.get(
  '/:id',
  authenticate,
  validate({ params: z.object({ id: z.string().trim().min(6).max(40) }) }),
  controller.detail,
);

module.exports = router;
