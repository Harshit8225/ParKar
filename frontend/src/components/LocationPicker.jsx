import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Map for placing a facility's pin.
 *
 * Coordinates drive the driver-side distance search, so typing them by hand is
 * the least reliable part of registering a facility. Clicking or dragging on a
 * map is both easier and verifiable - you can see the building.
 */

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Gorakhpur, so an empty form opens somewhere rather than in the ocean. */
const FALLBACK = [26.7606, 83.3732];

const markerIcon = L.divIcon({
  className: 'parkar-pin',
  html: `
    <svg width="30" height="40" viewBox="0 0 28 38" fill="none"
         style="display:block;filter:drop-shadow(0 3px 5px rgba(2,8,32,.4))">
      <path d="M14 1.5c-6.9 0-12.5 5.6-12.5 12.5 0 8.6 9.9 19.2 11.7 21.1a1.1 1.1 0 0 0 1.6 0C16.6 33.2 26.5 22.6 26.5 14 26.5 7.1 20.9 1.5 14 1.5Z"
            fill="#34C759" stroke="#ffffff" stroke-width="2.5"/>
      <circle cx="14" cy="14" r="5" fill="#ffffff"/>
    </svg>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 38],
});

/** Clicking anywhere on the map moves the pin there. */
const ClickToPlace = ({ onPick }) => {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
};

/** Follow the coordinates when they are edited in the number fields instead. */
const FollowPosition = ({ position }) => {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (position) map.setView(position, Math.max(map.getZoom(), 16));
  }, [map, position]);

  return null;
};

const LocationPicker = ({ latitude, longitude, onPick, className = '' }) => {
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
  const position = hasPin ? [latitude, longitude] : null;

  return (
    <div className={`overflow-hidden rounded-control border border-separator ${className}`}>
      <MapContainer
        center={position || FALLBACK}
        zoom={hasPin ? 16 : 12}
        scrollWheelZoom={false}
        className="h-64 w-full"
        style={{ background: '#E5E5EA' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <ClickToPlace onPick={onPick} />
        <FollowPosition position={position} />

        {position && (
          <Marker
            position={position}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                onPick(lat, lng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default LocationPicker;
