import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { bookingApi, geoApi, parkingApi, pricingApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useCheckout } from '../hooks/useCheckout';
import Icon from './Icon';
import { Button } from './ui';
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

const FIELD_LABEL = 'eyebrow mb-1.5 block text-label-tertiary';
/**
 * These fields sit inside the glass sheet (28px) with ~14px of padding, so the
 * concentric rule puts them at `rounded-control`. Focus is a ring rather than a
 * border swap, so the control never changes size and the row cannot reflow.
 */
const FIELD =
  'w-full rounded-control border border-separator bg-surface px-3.5 py-3 text-callout text-label transition-[box-shadow,border-color] duration-200 ease-cupertino placeholder:text-label-tertiary hover:border-separator-strong focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';

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
    <div className="rounded-card border border-separator bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="tap -ml-2 inline-flex items-center gap-1 rounded-capsule px-2 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50"
      >
        <Icon name="back" size={4} />
        Back to all pins
      </button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-title-3 text-label">{lot.name}</h3>
          <p className="mt-1 text-footnote text-label-secondary">
            {lot.location.address}
            {lot.location.city ? `, ${lot.location.city}` : ''}
          </p>
        </div>
        {lot.rating.count > 0 && (
          <span className="rounded-capsule bg-amber-50 px-3 py-1.5 text-footnote font-semibold tabular-nums text-amber-700">
            {lot.rating.average.toFixed(1)} &#9733;
            <span className="ml-1 text-caption font-normal">({lot.rating.count})</span>
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {amenities.map((item) => (
          <span
            key={item}
            className="rounded-capsule bg-slate-100 px-2.5 py-1 text-caption font-medium text-label-secondary ring-1 ring-inset ring-separator"
          >
            {item}
          </span>
        ))}
      </div>

      {/* ---- How far, and how to get there. The route is already drawn: it is
              fetched the moment this facility is picked, not on request. ---- */}
      <div className="mt-5 rounded-control border border-separator bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {routing ? (
              <p className="inline-flex items-center gap-2 text-footnote font-medium text-label-secondary">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-capsule border-2 border-current border-t-transparent"
                />
                Drawing your route...
              </p>
            ) : route ? (
              <p className="inline-flex items-center gap-2 text-footnote font-semibold text-label">
                <Icon name="route" size={4} className="text-brand-600" />
                {formatKm(route.distanceKm)} by road &middot; about {formatDuration(route.durationSeconds)} driving
              </p>
            ) : straightLine ? (
              <p className="text-footnote font-semibold text-label">{straightLine} from you, in a straight line</p>
            ) : (
              <p className="text-footnote font-medium text-label-secondary">Share your location to see how far this is.</p>
            )}
            <p className="mt-0.5 text-caption text-label-secondary">
              {route ? 'The blue line on the map is this route.' : 'Your route appears on the map above.'}
            </p>
          </div>

          <a
            href={googleDirectionsUrl(userLocation, lot.location)}
            target="_blank"
            rel="noreferrer noopener"
            className="tap inline-flex items-center gap-1.5 rounded-capsule bg-surface px-4 py-2.5 text-footnote font-semibold text-label ring-1 ring-separator-strong hover:bg-slate-50"
          >
            Navigate in Google Maps
            <Icon name="external" size={3.5} className="opacity-60" />
          </a>
        </div>

        {routeError && <p className="mt-2.5 text-caption font-medium text-amber-700">{routeError}</p>}
      </div>

      <dl className="mt-5 grid gap-4 border-t border-separator pt-5 sm:grid-cols-3">
        <div>
          <dt className="eyebrow text-label-tertiary">Vehicle</dt>
          <dd className="mt-1 text-footnote font-semibold text-label">{vehicleLabel(vehicleType)}</dd>
        </div>
        <div>
          <dt className="eyebrow text-label-tertiary">Free slots</dt>
          <dd className={`mt-1 text-footnote font-semibold ${soldOut ? 'text-rose-600' : 'text-emerald-600'}`}>
            {available} of {lot.capacity[vehicleType]}
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-label-tertiary">Your window</dt>
          <dd className="mt-1 text-footnote font-semibold text-label">
            {timeOnly(parkingWindow.entry)} &rarr; {timeOnly(parkingWindow.exit)} ({parkingWindow.hours}h)
          </dd>
        </div>
      </dl>

      {lot.description && <p className="mt-4 text-footnote leading-relaxed text-label-secondary">{lot.description}</p>}

      {/* ---- Price and confirmation ---- */}
      <form onSubmit={book} className="mt-5 grid gap-4 border-t border-separator pt-5 sm:grid-cols-2">
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
          <span className="mt-1.5 block text-caption text-label-secondary">The gate camera matches this exactly.</span>
        </label>

        <div className="rounded-control bg-slate-50 p-4 ring-1 ring-inset ring-separator">
          {quoting ? (
            <p className="text-footnote text-label-secondary">Pricing your window...</p>
          ) : quoteError ? (
            <p className="text-footnote text-rose-600">{quoteError}</p>
          ) : quote ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="eyebrow text-label-tertiary">Total payable</span>
                {/* Tabular figures: the total re-prices as the window changes,
                    and proportional digits would make it jump sideways. */}
                <span className="text-title-2 tabular-nums text-label">{money(quote.amount)}</span>
              </div>
              <dl className="mt-3 space-y-1 border-t border-separator pt-3 text-caption">
                <div className="flex justify-between">
                  <dt className="text-label-secondary">Rate</dt>
                  <dd className="font-medium text-label">
                    {money(quote.effectiveRatePerHour)}/hr &times; {quote.durationHours}h
                  </dd>
                </div>
                {quote.multipliers.combined !== 1 && (
                  <div className="flex justify-between">
                    <dt className="text-label-secondary">Demand pricing</dt>
                    <dd className={quote.multipliers.combined > 1 ? 'text-amber-700' : 'text-emerald-700'}>
                      &times;{quote.multipliers.combined}
                    </dd>
                  </div>
                )}
                {quote.coupon && (
                  <div className="flex justify-between">
                    <dt className="text-label-secondary">
                      Code {quote.coupon.code} ({quote.coupon.discountPercent}% off)
                    </dt>
                    <dd className="font-medium text-emerald-700">-{money(quote.discountAmount)}</dd>
                  </div>
                )}
              </dl>

              {/* Discount code. Only offered when the server has any configured. */}
              {quote.couponsAvailable &&
                (quote.coupon ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-inner bg-emerald-50 px-3 py-2 ring-1 ring-inset ring-emerald-200">
                    <span className="text-caption font-semibold text-emerald-800">{quote.coupon.code} applied</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon('');
                        setCouponInput('');
                      }}
                      className="tap rounded-capsule px-2 py-0.5 text-caption font-medium text-emerald-700 hover:bg-emerald-100"
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
                      className="min-w-0 flex-1 rounded-inner border border-separator-strong bg-surface px-3 py-2 text-caption font-medium uppercase tracking-wider text-label placeholder:font-normal placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                    />
                    <Button
                      size="sm"
                      onClick={() => setAppliedCoupon(couponInput.trim())}
                      disabled={!couponInput.trim()}
                      className="shrink-0"
                    >
                      Apply
                    </Button>
                  </div>
                ))}
            </>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          {error && <p className="mb-3 text-footnote font-medium text-rose-600">{error}</p>}
          {payError && <p className="mb-3 text-footnote font-medium text-rose-600">{payError}</p>}
          {soldOut && (
            <p className="mb-3 rounded-control bg-amber-50 px-3.5 py-2.5 text-footnote text-amber-800">
              Every {vehicleLabel(vehicleType).toLowerCase()} slot here is taken right now. Pick another pin.
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={processing}
            disabled={soldOut || quoting || !quote || !vehicleNumber.trim()}
            className="w-full sm:w-auto"
          >
            {!quote
              ? 'Book this slot'
              : quote.amount <= 0
                ? 'Confirm booking (free)'
                : `Pay ${money(quote.amount)} and book`}
          </Button>
          <p className="mt-3 text-caption text-label-tertiary">Bookings cannot be cancelled or refunded once paid.</p>
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
    /**
     * The one panel that floats over the hero photograph, so it is the
     * product's flagship Liquid Glass surface: the deck lighting behind it
     * tints the material through `saturate()`, and the half-pixel top highlight
     * catches the light the way a real lip would.
     */
    <div className="glass-thick overflow-hidden rounded-sheet">
      <form onSubmit={search} className="p-5 sm:p-7">
        <h2 className="text-title-3 text-label">Book your parking space now</h2>

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
                className={`tap absolute inset-y-1.5 left-1.5 grid w-9 place-items-center rounded-inner ${
                  usingGps ? 'text-brand-700' : 'text-label-tertiary hover:text-brand-700'
                } hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-label-tertiary disabled:hover:bg-transparent`}
              >
                {locating ? (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-capsule border-2 border-current border-t-transparent"
                  />
                ) : (
                  <Icon name="pin" size={4.5} />
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

          <Button type="submit" size="lg" loading={searching} className="w-full lg:w-auto">
            {searching ? 'Searching' : 'Find parking'}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {usingGps && (
            <span className="text-caption font-medium text-emerald-700">
              Searching around your location - edit the field to search somewhere else.
            </span>
          )}
          {!canSearch && (
            <span className="inline-flex items-center gap-1.5 text-caption font-medium text-label-secondary">
              <Icon name="lock" size={3.5} />
              Sign in to see parking near you
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-footnote font-medium text-rose-600">{error}</p>}
      </form>

      {/* ---- Map, and the facility the driver picks from it ---- */}
      {results !== null && (
        <div className="border-t border-separator bg-slate-50/70 p-5 sm:p-7">
          {results.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-footnote font-semibold text-label">No facilities with free slots matched</p>
              <p className="mt-1 text-footnote text-label-secondary">
                Try a different area, or shift your window - facilities fill up fast at peak hours.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-footnote font-semibold text-label">
                  {results.length} {results.length === 1 ? 'facility' : 'facilities'} with free slots
                </p>
                <p className="text-caption text-label-secondary">
                  {selected ? 'Pick another pin to compare.' : 'Tap a pin to see its details and price.'}
                </p>
              </div>

              {/* The map stays put once a pin is chosen, so the drawn route and
                  the details are readable together. */}
              <Suspense
                fallback={
                  <div className="mt-4 grid h-[22rem] place-items-center rounded-card border border-separator bg-slate-100 text-footnote text-label-secondary sm:h-[28rem]">
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
                <p className="mt-3 text-caption text-label-secondary">
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
