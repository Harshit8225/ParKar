'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { paymentLimiter } = require('../../middleware/rateLimit');
const { ROLES } = require('../../models/constants');
const v = require('../../utils/validators');
const controller = require('./payment.controller');
const schemas = require('./payment.validation');

const router = Router();

router.get('/config', controller.config);

router.post(
  '/verify',
  authenticate,
  paymentLimiter,
  validate({ body: schemas.verifySchema }),
  controller.verify,
);

router.post(
  '/failed',
  authenticate,
  paymentLimiter,
  validate({ body: schemas.failureSchema }),
  controller.fail,
);

router.post(
  '/booking-order',
  authenticate,
  paymentLimiter,
  validate({ body: schemas.bookingOrderSchema }),
  controller.bookingOrder,
);

router.post(
  '/session-order',
  authenticate,
  paymentLimiter,
  validate({ body: schemas.sessionOrderSchema }),
  controller.sessionOrder,
);

router.get('/mine', authenticate, validate({ query: schemas.historySchema }), controller.myTransactions);
router.get('/mine/dues', authenticate, controller.myDues);

router.get(
  '/lot/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, query: schemas.lotLedgerSchema }),
  controller.lotTransactions,
);

module.exports = router;
