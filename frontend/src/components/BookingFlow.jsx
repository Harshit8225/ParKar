import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { bookingApi, parkingApi, pricingApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useCheckout } from '../hooks/useCheckout';
import { money, timeOnly, toLocalInputValue } from '../utils/format';

/**
 * The whole booking journey, inline on the landing page: pick a window, see
 * matching facilities, price one, and pay for it without ever changing page.
 *
 * Search and pricing are public endpoints, so a visitor who is not signed in
 * still sees real facilities and a real quote; only the final confirmation
 * needs an account, and that is the one place we hand off to /login.
 */

/** Bengaluru city centre, used when the browser will not share a location. */
const FALLBACK_COORDS = { latitude: 12.9757, longitude: 77.6068 };

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

const PinIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path
      d="M12 21s6.5-5.3 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.7 12 21 12 21Zm0-8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FIELD_LABEL = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500';
const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-ink-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100';

/* --------------------------------------------------------- booking panel ---- */

/** Live quote plus the plate, for the facility the driver picked. */
const ConfirmPanel = ({ lot, window: parkingWindow, vehicleType, onCancel }) => {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const { pay, processing, error: payError } = useCheckout();

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');

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
      })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(errorMessage(err, 'Could not price this window.'));
        }
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lot.id, vehicleType, parkingWindow.entry, parkingWindow.exit]);

  const confirm = async (event) => {
    event.preventDefault();
    setError('');

    // Only a signed-in driver can hold a slot, so send them through login and
    // bring them back to this facility with the window already filled in.
    if (!isAuthenticated || role !== 'user') {
      const params = new URLSearchParams({
        vehicleType,
        entry: toLocalInputValue(parkingWindow.entry),
        duration: String(parkingWindow.hours),
      });
      navigate('/login', { state: { from: `/app/parking/${lot.id}?${params.toString()}` } });
      return;
    }

    try {
      const result = await bookingApi.create({
        parkingLotId: lot.id,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        vehicleType,
        expectedEntryTime: parkingWindow.entry.toISOString(),
        durationHours: parkingWindow.hours,
      });

      await pay(
        { ...result.payment, description: `Parking at ${lot.name}` },
        { onSuccess: () => navigate(`/app/bookings/${result.booking.bookingId}?paid=1`) },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not create your booking.'));
    }
  };

  const guest = !isAuthenticated || role !== 'user';

  return (
    <form onSubmit={confirm} className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">Confirm your booking</p>
          <h4 className="mt-1 truncate text-base font-semibold text-ink-900">{lot.name}</h4>
          <p className="truncate text-sm text-ink-500">{lot.location.address}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-500 transition hover:bg-white hover:text-ink-900"
        >
          Change facility
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={FIELD_LABEL}>Vehicle number</span>
          <input
            value={vehicleNumber}
            onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            placeholder="KA01AB1234"
            required={!guest}
            minLength={4}
            maxLength={15}
            className={`${FIELD} font-mono uppercase tracking-wider`}
          />
          <span className="mt-1.5 block text-xs text-ink-500">The gate camera matches this exactly.</span>
        </label>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
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
              <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Rate</dt>
                  <dd className="font-medium text-ink-700">
                    {money(quote.effectiveRatePerHour)}/hr &times; {quote.durationHours}h
                  </dd>
                </div>
                {quote.multipliers.combined !== 1 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Demand</dt>
                    <dd className={quote.multipliers.combined > 1 ? 'text-amber-700' : 'text-emerald-700'}>
                      &times;{quote.multipliers.combined}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-500">Window</dt>
                  <dd className="text-ink-700">
                    {timeOnly(parkingWindow.entry)} &rarr; {timeOnly(parkingWindow.exit)}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      {payError && <p className="mt-3 text-sm font-medium text-rose-600">{payError}</p>}

      <button
        type="submit"
        disabled={processing || (!guest && (quoting || !quote || !vehicleNumber.trim()))}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:shadow-none sm:w-auto"
      >
        {processing && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {guest ? 'Sign in to confirm' : quote ? `Pay ${money(quote.amount)} and book` : 'Book this slot'}
      </button>

      <p className="mt-2.5 text-xs text-ink-500">
        {guest
          ? 'Your facility and window are kept - you will land straight back here.'
          : 'Bookings cannot be cancelled or refunded once paid.'}
      </p>
    </form>
  );
};

/* ---------------------------------------------------------- result card ---- */

const ResultCard = ({ lot, vehicleType, onSelect }) => {
  const available = lot.available[vehicleType];
  const rate = lot.hourlyRate[vehicleType];
  const capacity = lot.capacity[vehicleType];

  return (
    <li className="group flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-ink-900">{lot.name}</h4>
          {lot.rating.count > 0 && (
            <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
              {lot.rating.average.toFixed(1)} &#9733;
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-500">{lot.location.address}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {lot.distanceKm !== undefined && <span>{lot.distanceKm} km away</span>}
          {lot.operatingHours.is24x7 && <span className="text-brand-700">Open 24/7</span>}
          {lot.amenities.evCharging && <span className="text-emerald-700">EV charging</span>}
          {lot.amenities.covered && <span>Covered</span>}
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-bold text-ink-900">
          {money(rate)}
          <span className="text-xs font-normal text-ink-500">/hr</span>
        </p>
        <p className={`text-xs font-medium ${available > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {available} of {capacity} free
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSelect(lot)}
        disabled={available <= 0}
        className="rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {available > 0 ? 'Book' : 'Full'}
      </button>
    </li>
  );
};

/* ----------------------------------------------------------------- flow ---- */

const BookingFlow = () => {
  const [form, setForm] = useState(() => {
    const arrival = defaultArrival();
    return {
      location: '',
      arrival: toLocalInputValue(arrival),
      departure: toLocalInputValue(new Date(arrival.getTime() + 2 * 60 * 60 * 1000)),
      vehicleType: 'four_wheeler',
    };
  });

  const [coords, setCoords] = useState(null);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [widened, setWidened] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchedWindow, setSearchedWindow] = useState(null);

  // Ask once, in the background. Distance sorting is a bonus, not a gate.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(FALLBACK_COORDS);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setCoords(FALLBACK_COORDS),
      { timeout: 8000 },
    );
  }, []);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setError('');
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

    const parkingWindow = readWindow();
    if (!parkingWindow) return;

    setSearching(true);
    setError('');
    setWidened(false);
    setSelected(null);

    const query = form.location.trim();
    const params = {
      vehicleType: form.vehicleType,
      availableOnly: 'true',
      sortBy: 'distance',
      limit: 6,
      page: 1,
    };
    if (query.length >= 2) params.q = query;
    if (coords) {
      params.latitude = coords.latitude;
      params.longitude = coords.longitude;
      params.radiusKm = 25;
    }

    try {
      let { items } = await parkingApi.search(params);

      // A typed place may sit outside the radius - "Mumbai" while you are in
      // Bengaluru. Retry on the text alone so what was typed wins.
      if (items.length === 0 && params.q) {
        const { latitude, longitude, radiusKm, ...textOnly } = params;
        const wider = await parkingApi.search(textOnly);
        if (wider.items.length > 0) {
          items = wider.items;
          setWidened(true);
        }
      }

      setResults(items);
      setSearchedWindow(parkingWindow);
    } catch (err) {
      setError(errorMessage(err, 'Could not search for parking.'));
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const durationLabel = useMemo(() => {
    const entry = new Date(form.arrival);
    const exit = new Date(form.departure);
    if (Number.isNaN(entry.getTime()) || Number.isNaN(exit.getTime()) || exit <= entry) return null;
    const hours = (exit - entry) / (60 * 60 * 1000);
    return hours >= 1 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours * 60)}m`;
  }, [form.arrival, form.departure]);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_70px_-20px_rgba(2,8,32,0.55)] ring-1 ring-black/5 backdrop-blur-xl">
      <form onSubmit={search} className="p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold uppercase tracking-[0.06em] text-ink-900 sm:text-lg">
            Book your parking space now
          </h2>
          {durationLabel && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {durationLabel} of parking
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3.5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className={FIELD_LABEL}>Enter location</span>
            <span className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-slate-400">
                <PinIcon />
              </span>
              <input
                type="text"
                value={form.location}
                onChange={update('location')}
                placeholder="Area, city or facility"
                className={`${FIELD} pl-10`}
              />
            </span>
          </label>

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

        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      </form>

      {/* ---- Results and confirmation, inline under the form ---- */}
      {results !== null && (
        <div className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-7">
          {selected && searchedWindow ? (
            <ConfirmPanel
              lot={selected}
              window={searchedWindow}
              vehicleType={form.vehicleType}
              onCancel={() => setSelected(null)}
            />
          ) : results.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-semibold text-ink-900">No facilities with free slots matched</p>
              <p className="mt-1 text-sm text-ink-500">
                Try a different area, or widen your window - facilities fill up fast at peak hours.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  {results.length} {results.length === 1 ? 'facility' : 'facilities'} with free slots
                </p>
                <p className="text-xs text-ink-500">Pick one to see the price for your window.</p>
              </div>

              {widened && (
                <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Nothing matched &quot;{form.location.trim()}&quot; near you, so these are matches anywhere.
                </p>
              )}

              <ul className="mt-4 space-y-2.5">
                {results.map((lot) => (
                  <ResultCard key={lot.id} lot={lot} vehicleType={form.vehicleType} onSelect={setSelected} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingFlow;
