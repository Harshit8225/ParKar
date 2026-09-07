'use strict';

/**
 * Number-plate helpers. Plates arriving from OCR carry spaces, dashes and the
 * usual O/0 and I/1 confusions, so comparison happens on a normalised form.
 */

const OCR_CONFUSIONS = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', Z: '2', B: '8', G: '6' };

/** Uppercase and strip every character that is not a letter or a digit. */
const normalizePlate = (plate) =>
  String(plate || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Collapse characters OCR commonly swaps, so KA-01-AB-1234 == KA01ABI234 fuzzily. */
const canonicalPlate = (plate) =>
  normalizePlate(plate)
    .split('')
    .map((char) => OCR_CONFUSIONS[char] || char)
    .join('');

/** Levenshtein distance, used to score near-misses from the vision model. */
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
};

/**
 * Compare a recognised plate against a booked plate.
 * Returns the match kind plus a 0..1 similarity so callers can decide whether a
 * near-miss should open the gate or be flagged for review.
 */
const comparePlates = (recognized, booked, { maxEditDistance = 1 } = {}) => {
  const a = normalizePlate(recognized);
  const b = normalizePlate(booked);

  if (!a || !b) return { match: false, kind: 'invalid', similarity: 0, distance: Infinity };
  if (a === b) return { match: true, kind: 'exact', similarity: 1, distance: 0 };

  const ca = canonicalPlate(recognized);
  const cb = canonicalPlate(booked);
  if (ca === cb) return { match: true, kind: 'ocr-equivalent', similarity: 0.98, distance: 0 };

  const distance = editDistance(ca, cb);
  const similarity = 1 - distance / Math.max(ca.length, cb.length);
  return {
    match: distance <= maxEditDistance,
    kind: distance <= maxEditDistance ? 'fuzzy' : 'mismatch',
    similarity: Number(similarity.toFixed(3)),
    distance,
  };
};

/** Loose sanity check for Indian plate shapes (also accepts BH-series). */
const isPlausiblePlate = (plate) => {
  const value = normalizePlate(plate);
  if (value.length < 6 || value.length > 11) return false;
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/.test(value) || /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(value);
};

module.exports = { normalizePlate, canonicalPlate, comparePlates, isPlausiblePlate, editDistance };
