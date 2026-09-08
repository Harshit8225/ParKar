import { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatKm, haversineKm } from '../utils/geo';
import { money } from '../utils/format';

/**
 * Map of the facilities a search returned, the driver's own position, and - once
 * they ask for it - the driving route between the two.
 *
 * Tiles come from OpenStreetMap and the route from OSRM, so the whole map works
 * without an API key.
 *
 * Leaflet's default marker points at image files that a bundler rewrites, so
 * pins are drawn as inline SVG through divIcon instead - which also keeps them
 * crisp at any zoom and recolourable per state.
 */

/**
 * OpenStreetMap's own tile server: genuinely keyless. CARTO's basemaps look
 * quieter but now stamp "API KEY REQUIRED" across every anonymous tile, so they
 * are not an option without signing up.
 */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Pin geometry: a teardrop whose tip is the exact coordinate. */
const PIN_WIDTH = 28;
const PIN_HEIGHT = 38;

/**
 * A plain blue map drop. The facility's name, free slots and distance live in
 * the tooltip, so the pin itself stays a single clean shape rather than a
 * label - a dozen price badges on one city centre was unreadable.
 */
const pinIcon = ({ selected = false, soldOut = false } = {}) => {
  /**
   * These are literal colours, not theme tokens, and deliberately so: the
   * OpenStreetMap tiles underneath are always light, whichever theme the app is
   * in. A pin that followed --tint would turn pale in dark mode and disappear
   * into the tiles. They are the same System palette values, hard-set.
   */
  const fill = soldOut ? '#8E8E93' : selected ? '#1C1C1E' : '#007AFF';
  const scale = selected ? 1.18 : 1;
  const width = PIN_WIDTH * scale;
  const height = PIN_HEIGHT * scale;

  return L.divIcon({
    className: 'parkar-pin',
    html: `
      <svg width="${width}" height="${height}" viewBox="0 0 28 38" fill="none"
           style="display:block;filter:drop-shadow(0 3px 5px rgba(2,8,32,.35))">
        <path d="M14 1.5c-6.9 0-12.5 5.6-12.5 12.5 0 8.6 9.9 19.2 11.7 21.1a1.1 1.1 0 0 0 1.6 0C16.6 33.2 26.5 22.6 26.5 14 26.5 7.1 20.9 1.5 14 1.5Z"
              fill="${fill}" stroke="#ffffff" stroke-width="2.5"/>
        <circle cx="14" cy="14" r="5" fill="#ffffff"/>
      </svg>
    `,
    iconSize: [width, height],
    // The drawn tip sits a touch above the bottom of the box, so anchor to the
    // tip rather than the box - otherwise every pin floats a pixel or two off.
    iconAnchor: [width / 2, height * 0.96],
    tooltipAnchor: [0, -height * 0.9],
  });
};

/**
 * Keeps the right thing in frame: the whole route once directions are drawn,
 * otherwise every pin plus the driver.
 *
 * invalidateSize() has to run *before* every fit. Leaflet measures its
 * container on mount, and this map mounts into a panel that was hidden a moment
 * earlier, so the first measurement is too small - fitting against it picks a
 * zoom for a tiny viewport and the result looks wildly zoomed out. The fit is
 * then repeated once layout has settled, because the first pass can still land
 * mid-transition.
 */
const FitToContent = ({ points, routePath }) => {
  const map = useMap();

  useEffect(() => {
    const fit = () => {
      map.invalidateSize();

      if (routePath?.length > 1) {
        map.fitBounds(L.latLngBounds(routePath), { padding: [56, 56] });
        return;
      }
      if (points.length === 0) return;
      if (points.length === 1) {
        map.setView(points[0], 15);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    };

    fit();
    const settle = setTimeout(fit, 150);
    return () => clearTimeout(settle);
  }, [map, points, routePath]);

  return null;
};

const ParkingMap = ({
  lots,
  userLocation,
  vehicleType,
  selectedId,
  onSelect,
  route = null,
  className = '',
}) => {
  const points = useMemo(() => {
    const coords = lots.map((lot) => [lot.location.latitude, lot.location.longitude]);
    if (userLocation) coords.push([userLocation.latitude, userLocation.longitude]);
    return coords;
  }, [lots, userLocation]);

  const center = points[0] || [26.7606, 83.3732];

  return (
    <div className={`overflow-hidden rounded-card border border-separator ${className}`}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        className="h-[22rem] w-full sm:h-[28rem]"
        style={{ background: '#E5E5EA' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <FitToContent points={points} routePath={route?.path} />

        {/* ---- The driving route, when the driver has asked for directions ---- */}
        {route?.path?.length > 1 && (
          <>
            {/* Casing underneath, so the line stays legible over any tile */}
            <Polyline positions={route.path} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
            <Polyline positions={route.path} pathOptions={{ color: '#007AFF', weight: 5, opacity: 0.95 }} />
          </>
        )}

        {/* ---- Where the driver is ---- */}
        {userLocation && (
          <>
            {userLocation.accuracyMeters > 0 && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={Math.min(userLocation.accuracyMeters, 2000)}
                pathOptions={{ color: '#FF3B30', weight: 1, fillColor: '#FF3B30', fillOpacity: 0.08 }}
              />
            )}
            <CircleMarker
              center={[userLocation.latitude, userLocation.longitude]}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#FF3B30', fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {userLocation.label || 'You are here'}
              </Tooltip>
            </CircleMarker>
          </>
        )}

        {/* ---- The facilities ---- */}
        {lots.map((lot) => {
          const available = lot.available[vehicleType];
          const rate = lot.hourlyRate[vehicleType];
          const away = formatKm(haversineKm(userLocation, lot.location));

          return (
            <Marker
              key={lot.id}
              position={[lot.location.latitude, lot.location.longitude]}
              icon={pinIcon({ selected: lot.id === selectedId, soldOut: available <= 0 })}
              keyboard
              // City-centre facilities sit a few hundred metres apart, so pins
              // overlap: lift the hovered one, and keep the chosen one on top.
              riseOnHover
              zIndexOffset={lot.id === selectedId ? 1000 : 0}
              alt={`${lot.name}, ${available} slots free`}
              eventHandlers={{ click: () => onSelect(lot) }}
            >
              {/* Positioned by the icon's tooltipAnchor, so it tracks the
                  pin's size when the chosen one grows. */}
              <Tooltip direction="top" opacity={1}>
                <span className="font-semibold">{lot.name}</span>
                <br />
                {available > 0 ? `${money(rate)}/hr · ${available} slots free` : 'No free slots'}
                {away ? ` · ${away} away` : ''}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default ParkingMap;
