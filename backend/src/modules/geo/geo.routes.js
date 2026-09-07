'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { optionalAuthenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const v = require('../../utils/validators');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const cache = require('../../services/cache.service');
const logger = require('../../utils/logger');

/**
 * Reverse geocoding, proxied.
 *
 * Turns the browser's coordinates into a place name so the search box can say
 * "Bichhia, Gorakhpur" rather than "26.7586, 83.3732".
 *
 * This has to be a server call. Nominatim is free and needs no API key, but its
 * usage policy requires an identifying User-Agent and rejects browser-style
 * requests with a 403 - so the browser cannot call it directly. Proxying also
 * lets us honour the "no bulk requests" rule with a cache: coordinates are
 * rounded to ~100 m and held for a day, so panning around one neighbourhood
 * costs a single upstream call.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const CONTACT = 'ParKar/1.0 (smart parking; contact: hello@parkar.app)';
const UPSTREAM_TIMEOUT_MS = 6000;
const CACHE_TTL_SECONDS = 86400;

const reverseSchema = z.object({
  latitude: v.latitude,
  longitude: v.longitude,
});

/** ~100 m of precision is plenty for a place name, and makes the cache useful. */
const cacheKey = (latitude, longitude) =>
  `geo:reverse:${latitude.toFixed(3)},${longitude.toFixed(3)}`;

/**
 * Build a short label from the address parts, most specific first. Nominatim's
 * display_name runs to a postcode and country, which is too long for an input.
 */
const buildLabel = (payload) => {
  const address = payload.address || {};
  const locality =
    address.suburb ||
    address.neighbourhood ||
    address.village ||
    address.town ||
    address.city_district ||
    address.hamlet;
  const city = address.city || address.town || address.county || address.state_district;

  const parts = [locality, city, address.state].filter(Boolean);
  // Drop the repetition when the locality and city resolve to the same place.
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);

  if (unique.length > 0) return unique.slice(0, 3).join(', ');
  return payload.display_name ? payload.display_name.split(',').slice(0, 3).join(',').trim() : null;
};

const router = Router();

router.get(
  '/reverse',
  optionalAuthenticate,
  validate({ query: reverseSchema }),
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.query;
    const key = cacheKey(latitude, longitude);

    const cached = await cache.get(key);
    if (cached) return ok(res, { ...cached, cached: true });

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    // Street level: the facility form wants a road and house number. buildLabel
    // still reduces it to a short locality line for the search box.
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');

    let payload;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': CONTACT, Accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
      payload = await response.json();
    } catch (err) {
      logger.warn('Reverse geocoding failed:', err.message);
      // The caller can still search by coordinates, so this is not fatal there.
      throw new ApiError(502, 'Could not resolve that location right now');
    }

    const address = payload.address || {};
    // A street-level line for forms that ask for one, without the country and
    // postcode tail that display_name carries.
    const streetParts = [
      address.house_number,
      address.road || address.pedestrian || address.residential,
      address.suburb || address.neighbourhood || address.village,
    ].filter(Boolean);

    const result = {
      label: buildLabel(payload),
      address: streetParts.length > 0 ? streetParts.join(', ') : payload.display_name || null,
      city: address.city || address.town || address.county || address.state_district || null,
      state: address.state || null,
      pincode: address.postcode || null,
      country: address.country || null,
    };

    if (result.label) await cache.set(key, result, CACHE_TTL_SECONDS);
    return ok(res, result);
  }),
);

module.exports = router;
