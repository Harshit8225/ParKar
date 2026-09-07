'use strict';

const { Router } = require('express');
const { authenticate, authorize, optionalAuthenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../models/constants');
const v = require('../../utils/validators');
const controller = require('./pricing.controller');
const schemas = require('./pricing.validation');

const router = Router();

// Anyone may price a window - the quote is what the booking form displays.
router.post('/quote', optionalAuthenticate, validate({ body: schemas.quoteSchema }), controller.quote);

const managerOnly = [authenticate, authorize(ROLES.OWNER, ROLES.ADMIN)];

router.get('/rules/:id', ...managerOnly, validate({ params: v.idParam }), controller.getRule);
router.put(
  '/rules/:id',
  ...managerOnly,
  validate({ params: v.idParam, body: schemas.updateRuleSchema }),
  controller.updateRule,
);
router.post(
  '/rules/:id/simulate',
  ...managerOnly,
  validate({ params: v.idParam, body: schemas.simulateSchema }),
  controller.simulate,
);

module.exports = router;
