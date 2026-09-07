'use strict';

const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const gemini = require('../../services/gemini.service');
const { loadManagedLot } = require('../parking/parking.service');
const service = require('./recognition.service');

/**
 * A capture arrives either as a multipart image (`image`), as a base64 data URL
 * in the JSON body (`imageBase64`, which is what a browser webcam sends), or as
 * a manually typed plate when the camera cannot read one.
 */
const extractCapture = (req) => {
  if (req.file) {
    return { imageBuffer: req.file.buffer, mimeType: req.file.mimetype, manualPlate: null };
  }

  if (req.body.imageBase64) {
    const value = String(req.body.imageBase64);
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
    const mimeType = match ? match[1] : req.body.mimeType || 'image/jpeg';
    const data = match ? match[2] : value;

    let imageBuffer;
    try {
      imageBuffer = Buffer.from(data, 'base64');
    } catch {
      throw ApiError.badRequest('imageBase64 is not valid base64 data');
    }
    if (!imageBuffer.length) throw ApiError.badRequest('imageBase64 decoded to an empty image');

    return { imageBuffer, mimeType, manualPlate: null };
  }

  if (req.body.manualPlate) {
    return { imageBuffer: null, mimeType: null, manualPlate: req.body.manualPlate };
  }

  throw ApiError.badRequest('Provide an image file, imageBase64, or manualPlate');
};

const entry = asyncHandler(async (req, res) => {
  const capture = extractCapture(req);
  const result = await service.processEntry({
    lotId: req.body.parkingLotId,
    cameraId: req.body.cameraId || req.cameraDevice?.id,
    ...capture,
  });

  // The gate needs a definite answer, so a refusal is a 200 with allowed:false,
  // not an error status - it is a valid outcome, not a failed request.
  return ok(res, result, result.message);
});

const exit = asyncHandler(async (req, res) => {
  const capture = extractCapture(req);
  const result = await service.processExit({
    lotId: req.body.parkingLotId,
    cameraId: req.body.cameraId || req.cameraDevice?.id,
    ...capture,
  });
  return ok(res, result, result.message);
});

/** Read a plate without deciding anything - useful for camera calibration. */
const preview = asyncHandler(async (req, res) => {
  const capture = extractCapture(req);
  const recognition = await service.resolvePlate(capture);
  return ok(res, {
    plate: recognition.plate,
    confidence: recognition.confidence,
    plausibleFormat: recognition.plausibleFormat,
    vehicleTypeGuess: recognition.vehicleTypeGuess,
    notes: recognition.notes,
    latencyMs: recognition.latencyMs,
    model: recognition.model,
  });
});

const events = asyncHandler(async (req, res) => {
  const lot = await loadManagedLot(req.params.id, req.user);
  const { items, total, page, limit } = await service.listEvents(lot._id, req.query);
  return res.status(200).json({
    success: true,
    message: 'OK',
    data: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

const status = asyncHandler(async (_req, res) =>
  ok(res, {
    provider: 'gemini',
    configured: gemini.isConfigured(),
    minConfidence: service.MIN_CONFIDENCE,
    entryGrace: {
      earlyMinutes: service.EARLY_ENTRY_GRACE_MINUTES,
      lateMinutes: service.LATE_ENTRY_GRACE_MINUTES,
    },
    supportedMimeTypes: gemini.SUPPORTED_MIME_TYPES,
  }),
);

module.exports = { entry, exit, preview, events, status };
