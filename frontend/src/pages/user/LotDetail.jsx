import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage, isConflict } from '../../api/client';
import { bookingApi, parkingApi, paymentApi, pricingApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, Field, Input, KeyValue, Select, Spinner } from '../../components/ui';
import { SpotCallout, SpotConfirming, SpotUnavailable } from '../../components/ParkingSpot';
import { useCheckout } from '../../hooks/useCheckout';
import {
  flexibleCapacity,
  flexibleUnits,
  money,
  offeredVehicleTypes,
  timeOnly,
  toLocalInputValue,
  VEHICLE_META,
  vehicleCounts,
  vehicleLabel,
} from '../../utils/format';
import Icon from '../../components/Icon';

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
    // Checked against what the facility offers once it loads.
    vehicleType: searchParams.get('vehicleType') || 'car',
    vehicleNumber: '',
    entryTime: entryFromParams(searchParams.get('entry')),
    durationHours: durationFromParams(searchParams.get('duration')),
  });

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [booking, setBooking] = useState(null);
  // POST /bookings in flight; near capacity it can take several seconds.
  const [confirming, setConfirming] = useState(false);
  // null, or the server's message when the space went to other bookings (409).
  const [conflict, setConflict] = useState(null);

  const exitTime = useMemo(() => {
    const entry = new Date(form.entryTime);
    if (Number.isNaN(entry.getTime())) return null;
    return new Date(entry.getTime() + Number(form.durationHours) * 60 * 60 * 1000);
  }, [form.entryTime, form.durationHours]);

  useEffect(() => {
    parkingApi
      .detail(id)
      .then((data) => {
        setLot(data);
        // A type the facility does not price (e.g. from an old link) is not
        // bookable here, so fall back to the first one it does.
        const offered = offeredVehicleTypes(data);
        setForm((prev) =>
          offered.length && !offered.includes(prev.vehicleType) ? { ...prev, vehicleType: offered[0] } : prev,
        );
      })
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

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    // A different window or vehicle is a fresh attempt after a lost booking.
    setConflict(null);
  };

  const handleBooking = async (event) => {
    event.preventDefault();
    setError('');
    setConflict(null);

    let result;
    setConfirming(true);
    try {
      result = await bookingApi.create({
        parkingLotId: lot.id,
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        vehicleType: form.vehicleType,
        expectedEntryTime: new Date(form.entryTime).toISOString(),
        durationHours: Number(form.durationHours),
      });
    } catch (err) {
      if (isConflict(err)) setConflict(errorMessage(err, ''));
      else setError(errorMessage(err, 'Could not create your booking.'));
      return;
    } finally {
      setConfirming(false);
    }

    setBooking(result.booking);
    try {
      if (result.payment?.settled) {
        navigate(`/app/bookings/${result.booking.bookingId}?paid=1`);
        return;
      }

      await pay(
        { ...result.payment, description: `Parking at ${lot.name}` },
        {
          onSuccess: () => navigate(`/app/bookings/${result.booking.bookingId}?paid=1`),
        },
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not take the payment.'));
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

  const offeredTypes = offeredVehicleTypes(lot);
  const offered = offeredTypes.includes(form.vehicleType);
  const availableSlots = lot.available?.[form.vehicleType] ?? 0;
  const soldOut = !offered || availableSlots <= 0;
  const indicative = lot.indicativeRates?.[form.vehicleType];
  const flexRows = lot.flexibleArea?.rows || [];
  const flexUnits = flexibleUnits(lot);

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="tap -ml-2 inline-flex w-fit items-center gap-1 rounded-capsule px-2 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50"
      >
        <Icon name="back" size={4} />
        Back to search
      </Link>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---- Facility information ---- */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-title-2 text-label">{lot.name}</h1>
                <p className="mt-1 text-footnote text-label-secondary">
                  {lot.location.address}, {lot.location.city} {lot.location.pincode}
                </p>
              </div>
              {lot.rating.count > 0 && (
                <span className="rounded-control bg-amber-50 px-3 py-1.5 text-footnote font-semibold text-amber-700">
                  {lot.rating.average.toFixed(1)} &#9733;
                  <span className="ml-1 text-caption font-normal">({lot.rating.count})</span>
                </span>
              )}
            </div>

            {lot.description && <p className="mt-3 text-footnote text-label">{lot.description}</p>}

            <div className="mt-4 flex flex-wrap gap-1.5">
              {lot.operatingHours.is24x7 ? (
                <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">Open 24/7</Badge>
              ) : (
                <Badge tone={lot.isOpenNow ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-label-secondary ring-separator'}>
                  {lot.operatingHours.openTime} - {lot.operatingHours.closeTime}
                </Badge>
              )}
              {lot.amenities.evCharging && <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">EV charging</Badge>}
              {lot.amenities.covered && <Badge tone="bg-slate-100 text-label-secondary ring-separator">Covered</Badge>}
              {lot.amenities.security && <Badge tone="bg-slate-100 text-label-secondary ring-separator">Security</Badge>}
              {lot.amenities.cctv && <Badge tone="bg-slate-100 text-label-secondary ring-separator">CCTV</Badge>}
            </div>

            <div className="mt-5 grid gap-4 border-t border-separator pt-4 sm:grid-cols-3">
              {offeredTypes.map((type) => (
                <div key={type} className="rounded-control bg-slate-50 p-4">
                  <p className="flex items-center gap-1.5 text-footnote font-medium text-label">
                    <Icon name={VEHICLE_META[type].icon} size={4} className="text-label-secondary" />
                    {vehicleLabel(type)}
                  </p>
                  <p className="mt-1 text-title-2 tabular-nums text-label">
                    {money(lot.indicativeRates?.[type]?.currentRatePerHour ?? lot.hourlyRate[type])}
                    <span className="text-footnote font-normal text-label-secondary">/hr</span>
                  </p>
                  {lot.indicativeRates?.[type]?.multiplier > 1 && (
                    <p className="text-caption text-amber-700">
                      Base {money(lot.hourlyRate[type])} &times; {lot.indicativeRates[type].multiplier} (demand)
                    </p>
                  )}
                  <p className="mt-2 text-footnote text-label-secondary">
                    Up to{' '}
                    <span className={lot.available?.[type] > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-rose-600'}>
                      {lot.available?.[type] ?? 0}
                    </span>{' '}
                    free
                  </p>
                  <p className="text-caption text-label-tertiary">
                    {lot.capacity?.[type] > 0 ? `${lot.capacity[type]} dedicated bays` : 'Flexible area only'}
                  </p>
                </div>
              ))}
            </div>

            {flexUnits > 0 && (
              <div className="mt-4 rounded-control border border-dashed border-separator-strong px-4 py-3">
                <p className="text-footnote font-medium text-label">Shared flexible area</p>
                {flexRows.length > 0 && (
                  <p className="mt-0.5 text-caption text-label-secondary">
                    {flexRows.length} row{flexRows.length === 1 ? '' : 's'} &middot; up to{' '}
                    {vehicleCounts(flexibleCapacity(flexRows), { types: offeredTypes, separator: ', or ' })}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 border-t border-separator pt-4">
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
        </div>

        {/* ---- Booking form ---- */}
        <div className="lg:col-span-2">
          <Card title="Reserve a slot" className="lg:sticky lg:top-20">
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
                  {offeredTypes.map((type) => (
                    <option key={type} value={type}>
                      {vehicleLabel(type)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Vehicle number" required>
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
                <p className="rounded-control bg-slate-50 px-3 py-2 text-footnote text-label">
                  Expected exit: <strong>{timeOnly(exitTime)}</strong>
                </p>
              )}

              {/* ---- Live price breakdown ---- */}
              <div className="rounded-control border border-separator p-4">
                {quoting ? (
                  <p className="text-footnote text-label-secondary">Calculating price...</p>
                ) : quoteError ? (
                  <p className="text-footnote text-rose-600">{quoteError}</p>
                ) : quote ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-footnote text-label-secondary">Total payable</span>
                      <span className="text-title-2 tabular-nums text-label">{money(quote.amount)}</span>
                    </div>

                    <dl className="mt-3 space-y-1.5 border-t border-separator pt-3 text-footnote">
                      <div className="flex justify-between">
                        <dt className="text-label-secondary">Base rate</dt>
                        <dd className="text-label">
                          {money(quote.baseRatePerHour)}/hr &times; {quote.durationHours}h
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
                      <div className="flex justify-between font-medium">
                        <dt className="text-label">Effective rate</dt>
                        <dd className="text-label">{money(quote.effectiveRatePerHour)}/hr</dd>
                      </div>
                    </dl>

                    {quote.multipliers.combined !== 1 && (
                      <details className="mt-3 border-t border-separator pt-3">
                        <summary className="cursor-pointer text-caption font-medium text-brand-700">
                          Why this price?
                        </summary>
                        <ul className="mt-2 space-y-1 text-caption text-label-secondary">
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
                  <p className="text-footnote text-label-secondary">Choose a time to see the price.</p>
                )}
              </div>

              {soldOut && conflict === null && (
                <Alert kind="warning">
                  {offered
                    ? `All ${vehicleLabel(form.vehicleType).toLowerCase()} spaces are taken right now. Try another facility or check back shortly.`
                    : 'This facility does not take that vehicle type.'}
                </Alert>
              )}

              {confirming && <SpotConfirming />}
              {booking?.spot && <SpotCallout spot={booking.spot} title="Spot held for you" />}

              {conflict !== null ? (
                <SpotUnavailable message={conflict} onFindOthers={() => navigate('/')} actionLabel="Search nearby facilities" />
              ) : (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={processing || confirming}
                  disabled={soldOut || !quote || quoting || !form.vehicleNumber.trim()}
                >
                  {confirming ? 'Confirming your spot' : quote ? `Pay ${money(quote.amount)} and book` : 'Book slot'}
                </Button>
              )}

              <p className="text-center text-caption text-label-secondary">
                Bookings cannot be cancelled or refunded. Up to {availableSlots} space(s) available now.
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
