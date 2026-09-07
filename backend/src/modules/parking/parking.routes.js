'use strict';

const { Router } = require('express');
const { authenticate, authorize, optionalAuthenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../models/constants');
const v = require('../../utils/validators');
const controller = require('./parking.controller');
const schemas = require('./parking.validation');

const router = Router();

// ---- Owner-managed routes (declared before /:id so they are not shadowed) ----
router.get(
  '/mine',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ query: schemas.ownerLotListSchema }),
  controller.myLots,
);

router.post(
  '/',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ body: schemas.createLotSchema }),
  controller.createLot,
);

router.get(
  '/:id/manage',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam }),
  controller.managedLot,
);

router.patch(
  '/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, body: schemas.updateLotSchema }),
  controller.updateLot,
);

router.post(
  '/:id/recount',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam }),
  controller.recount,
);

// ---- Public discovery ----
router.get('/search', optionalAuthenticate, validate({ query: schemas.searchSchema }), controller.search);
router.get('/:id', optionalAuthenticate, validate({ params: v.idParam }), controller.detail);
router.get(
  '/:id/availability',
  optionalAuthenticate,
  validate({ params: v.idParam, query: schemas.availabilityQuerySchema }),
  controller.availability,
);

module.exports = router;
