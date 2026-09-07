'use strict';

const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { normalizePlate, isPlausiblePlate } = require('../utils/plate');

/**
 * Gemini Vision adapter for number-plate recognition (ANPR).
 *
 * The API key lives only here, on the server. The frontend uploads the image to
 * our backend and never sees the key or talks to Google directly.
 *
 * The model is asked for strict JSON and pinned to a low temperature, since we
 * want transcription rather than interpretation. Every response is still
 * treated as untrusted text: it is parsed defensively and the plate is
 * validated before any booking lookup happens.
 */

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const PROMPT = [
  'You are an automatic number plate recognition (ANPR) system at a parking facility gate.',
  'Read the vehicle registration number from the number plate in this image.',
  '',
  'Rules:',
  '- Return ONLY the characters printed on the plate, uppercase, with no spaces, dashes or state name.',
  '- Do not guess or auto-correct towards a plausible format. Transcribe exactly what is legible.',
  '- If the plate is unreadable, absent, or you are not confident, set plate to null.',
  '- confidence must be your genuine certainty from 0 to 1.',
  '',
  'Respond with JSON only, matching this shape exactly:',
  '{"plate": "KA01AB1234" | null, "confidence": 0.0, "vehicleType": "two_wheeler" | "four_wheeler" | "unknown", "notes": "short reason if unreadable"}',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    plate: { type: 'string', nullable: true },
    confidence: { type: 'number' },
    vehicleType: { type: 'string', enum: ['two_wheeler', 'four_wheeler', 'unknown'] },
    notes: { type: 'string', nullable: true },
  },
  required: ['plate', 'confidence'],
};

const isConfigured = () => Boolean(env.gemini.apiKey);

/** Pull the JSON object out of a response that may be fenced or padded. */
const extractJson = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const clampConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
};

/**
 * Recognise a plate from an image buffer.
 *
 * Returns `{ plate, normalizedPlate, confidence, vehicleTypeGuess, ... }` with
 * `plate: null` when nothing legible was found - an unreadable plate is a normal
 * outcome at a gate, not an error.
 */
const recognizePlate = async ({ imageBuffer, mimeType = 'image/jpeg' }) => {
  if (!isConfigured()) {
    throw ApiError.internal(
      'Vehicle recognition is not configured on this server (GEMINI_API_KEY is missing)',
    );
  }
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    throw ApiError.badRequest('No image data was received');
  }
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw ApiError.badRequest(`Unsupported image type ${mimeType}. Use JPEG, PNG or WebP.`);
  }

  const url = `${env.gemini.apiBase}/models/${env.gemini.model}:generateContent`;
  const startedAt = Date.now();

  let response;
  try {
    response = await axios.post(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      },
      {
        // Key travels in a header, never in the URL, so it stays out of logs.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.gemini.apiKey },
        timeout: 20000,
      },
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    logger.error(`Gemini request failed (${status || 'network'}): ${detail}`);

    if (status === 429) throw new ApiError(503, 'Recognition service is rate limited. Please retry shortly.');
    if (status === 401 || status === 403) throw ApiError.internal('Recognition service rejected the API key');
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new ApiError(504, 'Recognition service timed out');
    }
    throw new ApiError(502, 'Could not reach the vehicle recognition service');
  }

  const latencyMs = Date.now() - startedAt;
  const candidate = response.data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join('') || '';
  const parsed = extractJson(text);

  if (!parsed) {
    logger.warn('Gemini returned an unparseable response:', text.slice(0, 200));
    return {
      plate: null,
      normalizedPlate: null,
      confidence: 0,
      vehicleTypeGuess: 'unknown',
      notes: 'Recognition response could not be parsed',
      latencyMs,
      model: env.gemini.model,
      raw: { text: text.slice(0, 500) },
    };
  }

  const rawPlate = parsed.plate ? normalizePlate(parsed.plate) : null;
  const confidence = clampConfidence(parsed.confidence);

  // A model can return a confidently-formatted string that is not a plate at
  // all; reject shapes that could never be a registration number.
  const plausible = rawPlate ? isPlausiblePlate(rawPlate) : false;

  return {
    plate: rawPlate || null,
    normalizedPlate: rawPlate || null,
    confidence,
    plausibleFormat: plausible,
    vehicleTypeGuess: parsed.vehicleType || 'unknown',
    notes: parsed.notes || null,
    latencyMs,
    model: env.gemini.model,
    raw: { plate: parsed.plate, confidence: parsed.confidence, notes: parsed.notes },
  };
};

module.exports = { recognizePlate, isConfigured, SUPPORTED_MIME_TYPES, extractJson };
