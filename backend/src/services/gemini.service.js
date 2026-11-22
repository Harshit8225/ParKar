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
  '{"plate": "KA01AB1234" | null, "confidence": 0.0, "vehicleType": "bike" | "car" | "bus" | "unknown", "notes": "short reason if unreadable"}',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    plate: { type: 'string', nullable: true },
    confidence: { type: 'number' },
    vehicleType: { type: 'string', enum: ['bike', 'car', 'bus', 'unknown'] },
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
          // Gemini 2.5 is a thinking model and its reasoning tokens are drawn
          // from this same budget. Transcribing a plate needs no reasoning, so
          // thinking is switched off - that keeps the whole budget for the
          // answer and roughly halves the latency. The ceiling is generous
          // anyway: the JSON is ~30 tokens, and running out silently produces
          // an empty response that reads exactly like an unreadable plate.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 512,
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
    // A truncated answer looks identical to an unreadable plate downstream, so
    // say which it was - this is the difference between "clean the camera" and
    // "the token budget is too small".
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      logger.error(
        `Gemini stopped early (${finishReason}); no plate was returned. Output tokens: ` +
          `${response.data?.usageMetadata?.candidatesTokenCount ?? 0}, thinking: ` +
          `${response.data?.usageMetadata?.thoughtsTokenCount ?? 0}.`,
      );
    } else {
      logger.warn('Gemini returned an unparseable response:', text.slice(0, 200));
    }

    return {
      plate: null,
      normalizedPlate: null,
      confidence: 0,
      vehicleTypeGuess: 'unknown',
      notes:
        finishReason && finishReason !== 'STOP'
          ? `Recognition was cut short (${finishReason})`
          : 'Recognition response could not be parsed',
      latencyMs,
      model: env.gemini.model,
      raw: { text: text.slice(0, 500), finishReason },
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
