'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimit');
const controller = require('./auth.controller');
const schemas = require('./auth.validation');

const router = Router();

router.post('/register', authLimiter, validate({ body: schemas.registerSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: schemas.loginSchema }), controller.login);
router.post('/refresh', authLimiter, validate({ body: schemas.refreshSchema }), controller.refresh);

router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, validate({ body: schemas.updateProfileSchema }), controller.updateProfile);
router.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword,
);

module.exports = router;
