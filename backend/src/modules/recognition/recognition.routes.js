'use strict';

const { Router } = require('express');
const multer = require('multer');
const { z } = require('zod');
const { authenticate, authorize, authenticateCameraOrStaff } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { recognitionLimiter } = require('../../middleware/rateLimit');
const { ROLES, RECOGNITION_EVENT, RECOGNITION_RESULT } = require('../../models/constants');
const v = require('../../utils/validators');
const gemini = require('../../services/gemini.service');
const controller = require('./recognition.controller');

const router = Router();

/**
 * Images are held in memory and forwarded straight to Gemini - nothing is ever
 * written to disk, so a gate capture leaves no image behind.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!gemini.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`Unsupported image type ${file.mimetype}`));
    }
    return cb(null, true);
  },
});

const captureSchema = z
  .object({
    parkingLotId: v.objectId,
    cameraId: z.string().trim().max(60).optional(),
    imageBase64: z.string().min(32).optional(),
    mimeType: z.string().trim().max(60).optional(),
    manualPlate: v.plateNumber.optional(),
  })
  .passthrough();

const eventsQuerySchema = z
  .object({
    eventType: z.enum(Object.values(RECOGNITION_EVENT)).optional(),
    result: z.enum(Object.values(RECOGNITION_RESULT)).optional(),
    flaggedOnly: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .merge(v.pagination);

// Gate endpoints: a camera device key, or a signed-in owner/admin operator.
router.post(
  '/entry',
  authenticateCameraOrStaff,
  recognitionLimiter,
  upload.single('image'),
  validate({ body: captureSchema }),
  controller.entry,
);

router.post(
  '/exit',
  authenticateCameraOrStaff,
  recognitionLimiter,
  upload.single('image'),
  validate({ body: captureSchema }),
  controller.exit,
);

router.post(
  '/preview',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  recognitionLimiter,
  upload.single('image'),
  validate({ body: captureSchema.partial({ parkingLotId: true }) }),
  controller.preview,
);

router.get('/status', authenticate, authorize(ROLES.OWNER, ROLES.ADMIN), controller.status);

router.get(
  '/events/:id',
  authenticate,
  authorize(ROLES.OWNER, ROLES.ADMIN),
  validate({ params: v.idParam, query: eventsQuerySchema }),
  controller.events,
);

module.exports = router;
