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
 * Tiles come from CARTO's free basemap and the route from OSRM, so the whole
 * map works without an API key.
 *
 * Leaflet's default marker points at image files that a bundler rewrites, so
 * pins are built from HTML with divIcon instead. That also lets a pin carry the
 * price, which is the entire reason to look at a map of parking.
 */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const pinIcon = (label, { selected = false, soldOut = false } = {}) => {
  const background = soldOut ? '#94a3b8' : selected ? '#0f172a' : '#1f43ec';

  return L.divIcon({
    className: 'parkar-pin',
    html: `
      <div style="transform:scale(${selected ? 1.14 : 1});transform-origin:bottom center">
        <div style="
          background:${background};
          color:#fff;
          font:600 12px/1 ui-sans-serif,system-ui,sans-serif;
          padding:6px 9px;
          border-radius:9px;
          white-space:nowrap;
          box-shadow:0 6px 16px -4px rgba(2,8,32,.55);
          border:1.5px solid rgba(255,255,255,.9);
        ">${label}</div>
        <div style="
          width:9px;height:9px;
          background:${background};
          margin:-5px auto 0;
          transform:rotate(45deg);
          border-right:1.5px solid rgba(255,255,255,.9);
          border-bottom:1.5px solid rgba(255,255,255,.9);
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 34],
  });
};

/**
 * Keeps the right thing in frame: the whole route once directions are drawn,
 * otherwise every pin plus the driver.
 */
const FitToContent = ({ points, routePath }) => {
  const map = useMap();

  useEffect(() => {
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
  }, [map, points, routePath]);

  return null;
};

/** Leaflet measures its container on mount; a just-revealed parent reads as 0. */
const InvalidateOnMount = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(timer);
  }, [map]);
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
    <div className={`overflow-hidden rounded-2xl border border-slate-200 ${className}`}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        className="h-[22rem] w-full sm:h-[28rem]"
        style={{ background: '#eef2f7' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <FitToContent points={points} routePath={route?.path} />
        <InvalidateOnMount />

        {/* ---- The driving route, when the driver has asked for directions ---- */}
        {route?.path?.length > 1 && (
          <>
            {/* Casing underneath, so the line stays legible over any tile */}
            <Polyline positions={route.path} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
            <Polyline positions={route.path} pathOptions={{ color: '#1f43ec', weight: 5, opacity: 0.95 }} />
          </>
        )}

        {/* ---- Where the driver is ---- */}
        {userLocation && (
          <>
            {userLocation.accuracyMeters > 0 && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={Math.min(userLocation.accuracyMeters, 2000)}
                pathOptions={{ color: '#f97316', weight: 1, fillColor: '#f97316', fillOpacity: 0.08 }}
              />
            )}
            <CircleMarker
              center={[userLocation.latitude, userLocation.longitude]}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#f97316', fillOpacity: 1 }}
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
              icon={pinIcon(available > 0 ? `${money(rate)}/hr` : 'Full', {
                selected: lot.id === selectedId,
                soldOut: available <= 0,
              })}
              keyboard
              alt={`${lot.name}, ${available} slots free`}
              eventHandlers={{ click: () => onSelect(lot) }}
            >
              <Tooltip direction="top" offset={[0, -38]} opacity={1}>
                <span className="font-semibold">{lot.name}</span>
                <br />
                {available > 0 ? `${available} slots free` : 'No free slots'}
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
