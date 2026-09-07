/**
 * Distance and directions helpers.
 *
 * Nothing here needs an API key. Straight-line distance is computed locally,
 * and driving directions come from the public OSRM demo server, which is free
 * and keyless. The "open in Google Maps" link is a plain URL, so handing the
 * driver off to real turn-by-turn navigation costs nothing either.
 */

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in km - "as the crow flies", not the driving distance. */
export const haversineKm = (from, to) => {
  if (!from || !to) return null;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
};

export const formatKm = (km) => {
  if (km === null || km === undefined || Number.isNaN(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
};

export const formatDuration = (seconds) => {
  const total = Math.round((Number(seconds) || 0) / 60);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
};

/**
 * Driving route between two points, from the OSRM demo server.
 *
 * That server is a courtesy service with no uptime guarantee, so every caller
 * must cope with this throwing - the UI falls back to straight-line distance
 * and the Google Maps hand-off, both of which always work.
 */
export const fetchDrivingRoute = async (from, to, { signal } = {}) => {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('The directions service is unavailable.');

  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) throw new Error('No driving route was found.');

  return {
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
    path: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceKm: route.distance / 1000,
    durationSeconds: route.duration,
  };
};

/** Hand off to Google Maps for real turn-by-turn navigation. No key needed. */
export const googleDirectionsUrl = (from, to) => {
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.latitude},${to.longitude}`,
    travelmode: 'driving',
  });
  if (from) params.set('origin', `${from.latitude},${from.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
