import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { bookingApi, parkingApi, paymentApi, pricingApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, Field, Input, KeyValue, Select, Spinner } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { money, timeOnly, toLocalInputValue, vehicleLabel } from '../../utils/format';

const DURATIONS = [1, 2, 3, 4, 6, 8, 12, 24];

/** Next quarter-hour from now - a sensible default arrival time. */
const defaultEntryTime = () => {
  const now = new Date();
  now.setMinutes(Math.ceil((now.getMinutes() + 5) / 15) * 15, 0, 0);
  return now;
};

/**
 * The landing-page and search forms pass the window the driver asked for as
 * "entry" (a datetime-local value) and "duration" (whole hours). Anything
 * missing or in the past falls back to the default.
 */
const entryFromParams = (raw) => {
  if (!raw) return toLocalInputValue(defaultEntryTime());
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed < new Date()) return toLocalInputValue(defaultEntryTime());
  return toLocalInputValue(parsed);
};

const durationFromParams = (raw) => {
  const hours = Number(raw);
  if (!Number.isFinite(hours)) return 2;
  // Snap to an offered option so the select always has a matching value.
  return DURATIONS.reduce(
    (best, option) => (Math.abs(option - hours) < Math.abs(best - hours) ? option : best),
    DURATIONS[0],
  );
};

const LotDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pay, processing, error: payError } = useCheckout();

  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    vehicleType: searchParams.get('vehicleType') || 'four_wheeler',
    vehicleNumber: '',
    entryTime: entryFromParams(searchParams.get('entry')),
    durationHours: durationFromParams(searchParams.get('duration')),
  });

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [booking, setBooking] = useState(null);

  const exitTime = useMemo(() => {
    const entry = new Date(form.entryTime);
    if (Number.isNaN(entry.getTime())) return null;
    return new Date(entry.getTime() + Number(form.durationHours) * 60 * 60 * 1000);
  }, [form.entryTime, form.durationHours]);

  useEffect(() => {
    parkingApi
      .detail(id)
      .then(setLot)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  // Re-price whenever the window or vehicle type changes, so the driver always
  // sees the number they are about to be charged. Debounced against typing.
  useEffect(() => {
    if (!lot || !exitTime) return undefined;

    const timer = setTimeout(async () => {
      setQuoting(true);
      setQuoteError('');
      try {
        setQuote(
          await pricingApi.quote({
            parkingLotId: lot.id,
            vehicleType: form.vehicleType,
            expectedEntryTime: new Date(form.entryTime).toISOString(),
            expectedExitTime: exitTime.toISOString(),
          }),
        );
      } catch (err) {
        setQuote(null);
        setQuoteError(errorMessage(err, 'Could not price this parking window.'));
      } finally {
        setQuoting(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [lot, form.vehicleType, form.entryTime, form.durationHours, exitTime]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleBooking = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const result = await bookingApi.create({
        parkingLotId: lot.id,
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        vehicleType: form.vehicleType,
        expectedEntryTime: new Date(form.entryTime).toISOString(),
        durationHours: Number(form.durationHours),
      });
      setBooking(result.booking);

      await pay(
        { ...result.payment, description: `Parking at ${lot.name}` },
        {
          onSuccess: () => navigate(`/app/bookings/${result.booking.bookingId}?paid=1`),
        },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not create your booking.'));
    }
  };

  const retryPayment = async () => {
    setError('');
    try {
      const { payment } = await paymentApi.bookingOrder(booking.bookingId);
      await pay(
        { ...payment, description: `Parking at ${lot.name}` },
        { onSuccess: () => navigate(`/app/bookings/${booking.bookingId}?paid=1`) },
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (loading) return <Spinner label="Loading facility..." />;
  if (!lot) return <Alert kind="error">{error || 'Facility not found.'}</Alert>;

  const availableSlots = lot.available[form.vehicleType];
  const soldOut = availableSlots <= 0;
  const indicative = lot.indicativeRates?.[form.vehicleType];

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        &larr; Back to search
      </Link>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---- Facility information ---- */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-ink-900">{lot.name}</h1>
                <p className="mt-1 text-sm text-ink-500">
                  {lot.location.address}, {lot.location.city} {lot.location.pincode}
                </p>
              </div>
              {lot.rating.count > 0 && (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
                  {lot.rating.average.toFixed(1)} &#9733;
                  <span className="ml-1 text-xs font-normal">({lot.rating.count})</span>
                </span>
              )}
            </div>

            {lot.description && <p className="mt-3 text-sm text-ink-700">{lot.description}</p>}

            <div className="mt-4 flex flex-wrap gap-1.5">
              {lot.operatingHours.is24x7 ? (
                <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">Open 24/7</Badge>
              ) : (
                <Badge tone={lot.isOpenNow ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                  {lot.operatingHours.openTime} - {lot.operatingHours.closeTime}
                </Badge>
              )}
              {lot.amenities.evCharging && <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">EV charging</Badge>}
              {lot.amenities.covered && <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Covered</Badge>}
              {lot.amenities.security && <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Security</Badge>}
              {lot.amenities.cctv && <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">CCTV</Badge>}
            </div>

            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              {['two_wheeler', 'four_wheeler'].map((type) =>
                lot.capacity[type] > 0 ? (
                  <div key={type} className="rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-medium text-ink-900">{vehicleLabel(type)}</p>
                    <p className="mt-1 text-2xl font-semibold text-ink-900">
                      {money(lot.indicativeRates?.[type]?.currentRatePerHour ?? lot.hourlyRate[type])}
                      <span className="text-sm font-normal text-ink-500">/hr</span>
                    </p>
                    {lot.indicativeRates?.[type]?.multiplier > 1 && (
                      <p className="text-xs text-amber-700">
                        Base {money(lot.hourlyRate[type])} &times; {lot.indicativeRates[type].multiplier} (demand)
                      </p>
                    )}
                    <p className="mt-2 text-sm text-ink-500">
                      <span className={lot.available[type] > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'}>
                        {lot.available[type]}
                      </span>{' '}
                      of {lot.capacity[type]} slots free
                    </p>
                  </div>
                ) : null,
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <KeyValue
                rows={[
                  { label: 'Contact', value: lot.contact?.phone },
                  { label: 'Email', value: lot.contact?.email },
                  {
                    label: 'Grace period',
                    value: lot.dynamicPricing ? `${lot.dynamicPricing.graceMinutes} minutes after your exit time` : undefined,
                  },
                  {
                    label: 'Overstay charge',
                    value: lot.dynamicPricing ? `${lot.dynamicPricing.overstayMultiplier}x your hourly rate` : undefined,
                  },
                  { label: 'Pricing zone', value: lot.dynamicPricing?.zone },
                ]}
              />
            </div>
          </Card>

          <Card title="How entry and exit work">
            <ol className="space-y-3 text-sm text-ink-700">
              {[
                'Book your slot and pay for the time you need.',
                'Drive up to the entrance. The camera reads your number plate.',
                'The plate is matched against your booking and the barrier opens.',
                'At exit, the camera reads your plate again and the system calculates your actual parking time.',
                'If you stayed past your booked exit time, an overstay charge is generated automatically.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* ---- Booking form ---- */}
        <div className="lg:col-span-2">
          <Card title="Reserve a slot" subtitle="Bookings are for today only." className="lg:sticky lg:top-20">
            <form onSubmit={handleBooking} className="space-y-4">
              {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
              {payError && (
                <Alert kind="error">
                  {payError}
                  {booking && (
                    <div className="mt-2">
                      <Button size="sm" tone="secondary" onClick={retryPayment} loading={processing}>
                        Retry payment
                      </Button>
                    </div>
                  )}
                </Alert>
              )}

              <Field label="Vehicle type" required>
                <Select value={form.vehicleType} onChange={update('vehicleType')}>
                  {lot.capacity.four_wheeler > 0 && <option value="four_wheeler">Four-wheeler (car)</option>}
                  {lot.capacity.two_wheeler > 0 && <option value="two_wheeler">Two-wheeler (bike)</option>}
                </Select>
              </Field>

              <Field
                label="Vehicle number"
                required
                hint="This is what the camera will match at the gate, so enter it exactly."
              >
                <Input
                  value={form.vehicleNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, vehicleNumber: event.target.value.toUpperCase() }))}
                  placeholder="KA01AB1234"
                  required
                  minLength={4}
                  maxLength={15}
                  className="font-mono uppercase"
                />
              </Field>

              <Field label="Expected entry time" required>
                <Input type="datetime-local" value={form.entryTime} onChange={update('entryTime')} required />
              </Field>

              <Field label="Parking duration" required>
                <Select value={form.durationHours} onChange={update('durationHours')}>
                  {DURATIONS.map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} hour{hours > 1 ? 's' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              {exitTime && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-ink-700">
                  Expected exit: <strong>{timeOnly(exitTime)}</strong>
                </p>
              )}

              {/* ---- Live price breakdown ---- */}
              <div className="rounded-lg border border-slate-200 p-4">
                {quoting ? (
                  <p className="text-sm text-ink-500">Calculating price...</p>
                ) : quoteError ? (
                  <p className="text-sm text-rose-600">{quoteError}</p>
                ) : quote ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-ink-500">Total payable</span>
                      <span className="text-2xl font-semibold text-ink-900">{money(quote.amount)}</span>
                    </div>

                    <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-ink-500">Base rate</dt>
                        <dd className="text-ink-700">
                          {money(quote.baseRatePerHour)}/hr &times; {quote.durationHours}h
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
                      <div className="flex justify-between font-medium">
                        <dt className="text-ink-700">Effective rate</dt>
                        <dd className="text-ink-900">{money(quote.effectiveRatePerHour)}/hr</dd>
                      </div>
                    </dl>

                    {quote.multipliers.combined !== 1 && (
                      <details className="mt-3 border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer text-xs font-medium text-brand-700">
                          Why this price?
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-ink-500">
                          <li>Occupancy: &times;{quote.multipliers.occupancy}</li>
                          <li>
                            Peak hours: &times;{quote.multipliers.peakHour}
                            {quote.factors.peakWindows?.length ? ` (${quote.factors.peakWindows.join(', ')})` : ''}
                          </li>
                          <li>Location zone: &times;{quote.multipliers.location} ({quote.factors.zone})</li>
                          <li>Day of week: &times;{quote.multipliers.dayOfWeek}</li>
                          {quote.multipliers.cappedFrom && (
                            <li className="text-emerald-700">Capped from &times;{quote.multipliers.cappedFrom}</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-500">Choose a time to see the price.</p>
                )}
              </div>

              {soldOut && (
                <Alert kind="warning">
                  All {vehicleLabel(form.vehicleType).toLowerCase()} slots are taken right now. Try another facility or check back shortly.
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={processing}
                disabled={soldOut || !quote || quoting || !form.vehicleNumber.trim()}
              >
                {quote ? `Pay ${money(quote.amount)} and book` : 'Book slot'}
              </Button>

              <p className="text-center text-xs text-ink-500">
                Bookings cannot be cancelled or refunded. {availableSlots} slot(s) available now.
                {indicative?.activePeakWindows?.length ? ` Peak pricing active: ${indicative.activePeakWindows.join(', ')}.` : ''}
              </p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LotDetail;
