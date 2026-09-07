import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { bookingApi, geoApi, parkingApi, pricingApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useCheckout } from '../hooks/useCheckout';
import { money, timeOnly, toLocalInputValue, vehicleLabel } from '../utils/format';
import { fetchDrivingRoute, formatDuration, formatKm, googleDirectionsUrl, haversineKm } from '../utils/geo';

/**
 * The booking journey, inline on the home page and in three steps:
 *
 *   search -> map of what is nearby -> the facility the driver picked
 *
 * Searching requires an account, so a visitor is sent to sign in before any
 * facility is revealed. Once a pin is clicked the map stays on screen next to
 * the details, which is what makes "how far is it" and "show me the way"
 * answerable in the same view.
 */

/** Leaflet is a third of the bundle and is only needed once a search returns. */
const ParkingMap = lazy(() => import('./ParkingMap'));

const VEHICLE_OPTIONS = [
  { value: 'four_wheeler', label: 'Four-wheeler (car)' },
  { value: 'two_wheeler', label: 'Two-wheeler (bike)' },
];

/** Next quarter-hour: the earliest arrival anyone can realistically make. */
const defaultArrival = () => {
  const now = new Date();
  now.setMinutes(Math.ceil((now.getMinutes() + 5) / 15) * 15, 0, 0);
  return now;
};

const ICONS = {
  pin: 'M12 21s6.5-5.3 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.7 12 21 12 21Zm0-8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
  back: 'M14 6l-6 6 6 6',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
  route: 'M6.5 20.5V9m0 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 0v6.5a4 4 0 0 1-4 4H9m0 0 2.5-2.5M9 20.5 11.5 23m6-14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FIELD_LABEL = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500';
const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-ink-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100';

/* ------------------------------------------------------- facility detail ---- */

const FacilityPanel = ({
  lot,
  window: parkingWindow,
  vehicleType,
  userLocation,
  route,
  routing,
  routeError,
  onBack,
}) => {
  const navigate = useNavigate();
  const { pay, processing, error: payError } = useCheckout();

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');

  // `couponInput` is what is being typed; `appliedCoupon` is what the quote was
  // priced with. Keeping them apart stops every keystroke re-pricing.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');

  useEffect(() => {
    let cancelled = false;
    setQuoting(true);
    setQuoteError('');

    pricingApi
      .quote({
        parkingLotId: lot.id,
        vehicleType,
        expectedEntryTime: parkingWindow.entry.toISOString(),
        expectedExitTime: parkingWindow.exit.toISOString(),
        couponCode: appliedCoupon || undefined,
      })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((err) => {
        if (!cancelled) {
          // A rejected code must not wipe the price; drop the code and re-quote.
          if (appliedCoupon) setAppliedCoupon('');
          setQuoteError(errorMessage(err, 'Could not price this window.'));
        }
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lot.id, vehicleType, parkingWindow.entry, parkingWindow.exit, appliedCoupon]);

  const available = lot.available[vehicleType];
  const soldOut = available <= 0;

  // Straight-line distance is instant and always available; the driving figure
  // replaces it once the route comes back.
  const straightLine = formatKm(haversineKm(userLocation, lot.location));

  const amenities = [
    lot.operatingHours.is24x7 ? 'Open 24/7' : `${lot.operatingHours.openTime} - ${lot.operatingHours.closeTime}`,
    lot.amenities.evCharging && 'EV charging',
    lot.amenities.covered && 'Covered',
    lot.amenities.security && 'Security on site',
    lot.amenities.cctv && 'CCTV',
  ].filter(Boolean);

  const book = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const result = await bookingApi.create({
        parkingLotId: lot.id,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        vehicleType,
        expectedEntryTime: parkingWindow.entry.toISOString(),
        durationHours: parkingWindow.hours,
        couponCode: appliedCoupon || undefined,
      });

      // A fully-discounted booking is already confirmed by the server - there is
      // no order to take to the gateway.
      if (result.payment?.settled) {
        navigate(`/app/bookings/${result.booking.bookingId}?paid=1`);
        return;
      }

      await pay(
        { ...result.payment, description: `Parking at ${lot.name}` },
        { onSuccess: () => navigate(`/app/bookings/${result.booking.bookingId}?paid=1`) },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not create your booking.'));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition hover:text-brand-800"
      >
        <Icon name="back" />
        Back to all pins
      </button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-ink-900">{lot.name}</h3>
          <p className="mt-1 text-sm text-ink-500">
            {lot.location.address}
            {lot.location.city ? `, ${lot.location.city}` : ''}
          </p>
        </div>
        {lot.rating.count > 0 && (
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
            {lot.rating.average.toFixed(1)} &#9733;
            <span className="ml-1 text-xs font-normal">({lot.rating.count})</span>
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {amenities.map((item) => (
          <span
            key={item}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-ink-700 ring-1 ring-inset ring-slate-200"
          >
            {item}
          </span>
        ))}
      </div>

      {/* ---- How far, and how to get there. The route is already drawn: it is
              fetched the moment this facility is picked, not on request. ---- */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {routing ? (
              <p className="inline-flex items-center gap-2 text-sm font-medium text-ink-500">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Drawing your route...
              </p>
            ) : route ? (
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Icon name="route" className="h-4 w-4 text-brand-600" />
                {formatKm(route.distanceKm)} by road &middot; about {formatDuration(route.durationSeconds)} driving
              </p>
            ) : straightLine ? (
              <p className="text-sm font-semibold text-ink-900">{straightLine} from you, in a straight line</p>
            ) : (
              <p className="text-sm font-medium text-ink-500">Share your location to see how far this is.</p>
            )}
            <p className="mt-0.5 text-xs text-ink-500">
              {route ? 'The blue line on the map is this route.' : 'Your route appears on the map above.'}
            </p>
          </div>

          <a
            href={googleDirectionsUrl(userLocation, lot.location)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-slate-300 transition hover:bg-white"
          >
            Navigate in Google Maps
            <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </div>

        {routeError && <p className="mt-2.5 text-xs font-medium text-amber-700">{routeError}</p>}
      </div>

      <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Vehicle</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{vehicleLabel(vehicleType)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Free slots</dt>
          <dd className={`mt-1 text-sm font-semibold ${soldOut ? 'text-rose-600' : 'text-emerald-600'}`}>
            {available} of {lot.capacity[vehicleType]}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Your window</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">
            {timeOnly(parkingWindow.entry)} &rarr; {timeOnly(parkingWindow.exit)} ({parkingWindow.hours}h)
          </dd>
        </div>
      </dl>

      {lot.description && <p className="mt-4 text-sm leading-relaxed text-ink-500">{lot.description}</p>}

      {/* ---- Price and confirmation ---- */}
      <form onSubmit={book} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
        <label className="block">
          <span className={FIELD_LABEL}>Vehicle number</span>
          <input
            value={vehicleNumber}
            onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            placeholder="UP53AB1234"
            required
            minLength={4}
            maxLength={15}
            className={`${FIELD} font-mono uppercase tracking-wider`}
          />
          <span className="mt-1.5 block text-xs text-ink-500">The gate camera matches this exactly.</span>
        </label>

        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          {quoting ? (
            <p className="text-sm text-ink-500">Pricing your window...</p>
          ) : quoteError ? (
            <p className="text-sm text-rose-600">{quoteError}</p>
          ) : quote ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Total payable</span>
                <span className="text-2xl font-bold text-ink-900">{money(quote.amount)}</span>
              </div>
              <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Rate</dt>
                  <dd className="font-medium text-ink-700">
                    {money(quote.effectiveRatePerHour)}/hr &times; {quote.durationHours}h
                  </dd>
                </div>
                {quote.multipliers.combined !== 1 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Demand pricing</dt>
                    <dd className={quote.multipliers.combined > 1 ? 'text-amber-700' : 'text-emerald-700'}>
                      &times;{quote.multipliers.combined}
                    </dd>
                  </div>
                )}
                {quote.coupon && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">
                      Code {quote.coupon.code} ({quote.coupon.discountPercent}% off)
                    </dt>
                    <dd className="font-medium text-emerald-700">-{money(quote.discountAmount)}</dd>
                  </div>
                )}
              </dl>

              {/* Discount code. Only offered when the server has any configured. */}
              {quote.couponsAvailable &&
                (quote.coupon ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-inset ring-emerald-200">
                    <span className="text-xs font-semibold text-emerald-800">{quote.coupon.code} applied</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon('');
                        setCouponInput('');
                      }}
                      className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                      placeholder="Discount code"
                      aria-label="Discount code"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-900 placeholder:font-normal placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <button
                      type="button"
                      onClick={() => setAppliedCoupon(couponInput.trim())}
                      disabled={!couponInput.trim()}
                      className="shrink-0 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      Apply
                    </button>
                  </div>
                ))}
            </>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
          {payError && <p className="mb-3 text-sm font-medium text-rose-600">{payError}</p>}
          {soldOut && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Every {vehicleLabel(vehicleType).toLowerCase()} slot here is taken right now. Pick another pin.
            </p>
          )}

          <button
            type="submit"
            disabled={soldOut || processing || quoting || !quote || !vehicleNumber.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none sm:w-auto"
          >
            {processing && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {!quote
              ? 'Book this slot'
              : quote.amount <= 0
                ? 'Confirm booking (free)'
                : `Pay ${money(quote.amount)} and book`}
          </button>
          <p className="mt-2.5 text-xs text-ink-500">Bookings cannot be cancelled or refunded once paid.</p>
        </div>
      </form>
    </div>
  );
};

/* ----------------------------------------------------------------- flow ---- */

const BookingFlow = () => {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => {
    const arrival = defaultArrival();
    return {
      location: '',
      arrival: toLocalInputValue(arrival),
      departure: toLocalInputValue(new Date(arrival.getTime() + 2 * 60 * 60 * 1000)),
      vehicleType: 'four_wheeler',
    };
  });

  // Where the driver is. Used for the map marker, the distances, and routing -
  // independently of whether the search itself was by location or by text.
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  // 'gps' once the pin has filled the field, back to 'manual' the moment the
  // driver edits it. This is what decides how the search is run.
  const [locationSource, setLocationSource] = useState('manual');

  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [searchedWindow, setSearchedWindow] = useState(null);

  const [route, setRoute] = useState(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const routeRequest = useRef(null);

  const canSearch = isAuthenticated && role === 'user';
  // The field holds a place the pin resolved, and has not been edited since.
  const usingGps = locationSource === 'gps' && Boolean(form.location.trim());

  /** Resolve the browser position once, and hand it to every caller waiting. */
  const requestPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('This browser cannot share your location.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
            label: 'You are here',
          };
          setUserLocation(next);
          resolve(next);
        },
        () => reject(new Error('We could not get your location.')),
        { timeout: 10000, enableHighAccuracy: true },
      );
    });

  // Ask a signed-in driver once, quietly: the map is much more useful with the
  // driver on it. A refusal is not an error here - the text search still works.
  useEffect(() => {
    if (!canSearch || userLocation) return;
    requestPosition().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSearch]);

  /**
   * Picking a facility draws the route to it straight away - the driver should
   * not have to ask twice. Re-runs when the selection changes, and also once
   * the position arrives if it was still pending on the first click.
   */
  useEffect(() => {
    routeRequest.current?.abort();
    setRoute(null);
    setRouteError('');

    if (!selected || !userLocation) return undefined;

    const controller = new AbortController();
    routeRequest.current = controller;
    setRouting(true);

    fetchDrivingRoute(userLocation, selected.location, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setRoute(result);
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        // OSRM is a free courtesy service, so failing here has to be survivable:
        // the straight-line distance and the Google Maps hand-off both remain.
        setRouteError(`${err.message} You can still open the route in Google Maps.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouting(false);
      });

    return () => controller.abort();
  }, [selected?.id, userLocation]);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setError('');
    // Typing over a location the pin filled in makes it a plain text search.
    if (field === 'location') setLocationSource('manual');
  };

  /** Send a visitor to sign in, and bring them back to this page afterwards. */
  const requireAccount = () => navigate('/login', { state: { from: '/' } });

  /**
   * The pin button: resolve the browser position, name it, and put that name in
   * the field. The search still runs on the coordinates - the text is there so
   * the driver can see where "here" is, and edit it to go somewhere else.
   */
  const fillFromCurrentLocation = async () => {
    if (!canSearch) {
      requireAccount();
      return;
    }

    setLocating(true);
    setError('');
    try {
      const position = await requestPosition();
      let label = null;
      try {
        label = (await geoApi.reverse(position.latitude, position.longitude)).label;
      } catch {
        // Naming is a nicety; the coordinates are what actually drive the search.
        label = null;
      }
      setForm((prev) => ({
        ...prev,
        location: label || `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}`,
      }));
      setLocationSource('gps');
    } catch (err) {
      setError(`${err.message} Allow location access, or type an area instead.`);
    } finally {
      setLocating(false);
    }
  };

  /** Validate the two datetimes into the window every later step works from. */
  const readWindow = () => {
    const entry = new Date(form.arrival);
    const exit = new Date(form.departure);
    if (Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime())) {
      setError('Pick an arrival and a departure time.');
      return null;
    }
    if (exit <= entry) {
      setError('Departure has to be after arrival.');
      return null;
    }
    const hours = Math.min(24, Math.max(1, Math.ceil((exit - entry) / (60 * 60 * 1000))));
    return { entry, exit, hours };
  };

  const search = async (event) => {
    event.preventDefault();

    // Nothing about the facilities is revealed to a visitor.
    if (!canSearch) {
      requireAccount();
      return;
    }

    const query = form.location.trim();
    const byGps = usingGps && Boolean(userLocation);
    if (!byGps && query.length < 2) {
      setError('Type an area to search, or tap the pin to use where you are.');
      return;
    }

    const parkingWindow = readWindow();
    if (!parkingWindow) return;

    setSearching(true);
    setError('');
    setSelected(null);

    const params = {
      vehicleType: form.vehicleType,
      availableOnly: 'true',
      limit: 24,
      page: 1,
    };

    // The two modes stay separate on purpose. A typed area searches on the text
    // alone - clipping it to the driver's GPS radius would silently hide the
    // place they asked for. Only the pin's coordinates sort by distance.
    if (byGps) {
      params.latitude = userLocation.latitude;
      params.longitude = userLocation.longitude;
      params.radiusKm = 25;
      params.sortBy = 'distance';
    } else {
      params.q = query;
      params.sortBy = 'rate';
    }

    try {
      const { items } = await parkingApi.search(params);
      setResults(items);
      setSearchedWindow(parkingWindow);
    } catch (err) {
      setError(errorMessage(err, 'Could not search for parking.'));
      setResults(null);
    } finally {
      setSearching(false);
    }
  };


  return (
    <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_70px_-20px_rgba(2,8,32,0.55)] ring-1 ring-black/5 backdrop-blur-xl">
      <form onSubmit={search} className="p-5 sm:p-7">
        <h2 className="text-base font-bold uppercase tracking-[0.06em] text-ink-900 sm:text-lg">
          Book your parking space now
        </h2>

        <div className="mt-5 grid gap-3.5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="block">
            <label htmlFor="parkar-location" className={FIELD_LABEL}>
              Location
            </label>
            <div className="relative">
              {/* The pin is the "use my location" control: tapping it fills this
                  field with the driver's own neighbourhood. */}
              <button
                type="button"
                onClick={fillFromCurrentLocation}
                disabled={locating}
                title="Use my current location"
                aria-label="Use my current location"
                className={`absolute inset-y-1.5 left-1.5 grid w-9 place-items-center rounded-lg transition ${
                  usingGps ? 'text-brand-700' : 'text-slate-400 hover:text-brand-700'
                } hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
              >
                {locating ? (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : (
                  <Icon name="pin" className="h-4.5 w-4.5" />
                )}
              </button>
              <input
                id="parkar-location"
                type="text"
                value={form.location}
                onChange={update('location')}
                placeholder="Type an area, or tap the pin"
                className={`${FIELD} pl-12`}
              />
            </div>
          </div>

          <label className="block">
            <span className={FIELD_LABEL}>Arrival date/time</span>
            <input type="datetime-local" value={form.arrival} onChange={update('arrival')} className={FIELD} />
          </label>

          <label className="block">
            <span className={FIELD_LABEL}>Departure date/time</span>
            <input type="datetime-local" value={form.departure} onChange={update('departure')} className={FIELD} />
          </label>

          <label className="block">
            <span className={FIELD_LABEL}>Vehicle type</span>
            <select value={form.vehicleType} onChange={update('vehicleType')} className={FIELD}>
              {VEHICLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={searching}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none lg:w-auto"
          >
            {searching && (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {searching ? 'Searching' : 'Find parking'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {usingGps && (
            <span className="text-xs font-medium text-emerald-700">
              Searching around your location - edit the field to search somewhere else.
            </span>
          )}
          {!canSearch && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <Icon name="lock" className="h-3.5 w-3.5" />
              Sign in to see parking near you
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      </form>

      {/* ---- Map, and the facility the driver picks from it ---- */}
      {results !== null && (
        <div className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-7">
          {results.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-semibold text-ink-900">No facilities with free slots matched</p>
              <p className="mt-1 text-sm text-ink-500">
                Try a different area, or shift your window - facilities fill up fast at peak hours.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  {results.length} {results.length === 1 ? 'facility' : 'facilities'} with free slots
                </p>
                <p className="text-xs text-ink-500">
                  {selected ? 'Pick another pin to compare.' : 'Tap a pin to see its details and price.'}
                </p>
              </div>

              {/* The map stays put once a pin is chosen, so the drawn route and
                  the details are readable together. */}
              <Suspense
                fallback={
                  <div className="mt-4 grid h-[22rem] place-items-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-ink-500 sm:h-[28rem]">
                    Loading map...
                  </div>
                }
              >
                <ParkingMap
                  lots={results}
                  userLocation={userLocation}
                  vehicleType={form.vehicleType}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  route={route}
                  className="mt-4"
                />
              </Suspense>

              {!userLocation && (
                <p className="mt-3 text-xs text-ink-500">
                  Share your location to see how far each facility is and to get directions.
                </p>
              )}

              {selected && searchedWindow && (
                <div className="mt-4">
                  <FacilityPanel
                    lot={selected}
                    window={searchedWindow}
                    vehicleType={form.vehicleType}
                    userLocation={userLocation}
                    route={route}
                    routing={routing}
                    routeError={routeError}
                    onBack={() => setSelected(null)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingFlow;
