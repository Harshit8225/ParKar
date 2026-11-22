import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { bookingApi, paymentApi, sessionApi } from '../../api/endpoints';
import Icon from '../../components/Icon';
import ParkingFloorPlan from '../../components/ParkingFloorPlan';
import { SpotCallout } from '../../components/ParkingSpot';
import { Alert, Badge, Button, Card, KeyValue, Spinner } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

const BookingDetail = () => {
  const { id } = useParams();

  const [booking, setBooking] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The card headline already says 'Booking confirmed', so a successful
  // booking payment needs no separate banner.
  const [notice, setNotice] = useState('');
  const { pay, processing, error: payError } = useCheckout();

  const load = useCallback(async () => {
    try {
      const data = await bookingApi.detail(id);
      setBooking(data);

      // The session carries the actual entry/exit times and the final bill.
      if (data.session) {
        const sessionId = typeof data.session === 'string' ? data.session : data.session.sessionId || data.session._id;
        try {
          setSession(await sessionApi.detail(sessionId));
        } catch {
          setSession(null);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const payNow = async () => {
    setError('');
    try {
      const { payment } = await paymentApi.bookingOrder(booking.bookingId);
      await pay(
        { ...payment, description: `Parking at ${booking.parkingLot?.name}` },
        {
          onSuccess: () => load(),
        },
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const paySessionDue = async () => {
    setError('');
    try {
      const { payment } = await paymentApi.sessionOrder(session.sessionId);
      await pay(payment, {
        onSuccess: () => {
          setNotice('Overstay charge paid. Thank you.');
          load();
        },
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (loading) return <Spinner label="Loading booking..." />;
  if (!booking) return <Alert kind="error">{error || 'Booking not found.'}</Alert>;

  const awaitingPayment = booking.status === 'pending_payment' || booking.status === 'payment_failed';
  const receipt = session?.receipt;
  const spot = booking.spot;
  // Before and during the stay the spot is the most useful thing on the page.
  const upcoming = ['pending_payment', 'payment_failed', 'confirmed', 'active'].includes(booking.status);
  const headline =
    {
      confirmed: 'Booking confirmed',
      active: 'You are parked',
      pending_payment: 'Payment pending',
      payment_failed: 'Payment failed',
    }[booking.status] || `Booking ${booking.bookingId}`;

  return (
    <div className="space-y-6">
      <Link
        to="/app/bookings"
        className="tap -ml-2 inline-flex w-fit items-center gap-1 rounded-capsule px-2 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50"
      >
        <Icon name="back" size={4} />
        Back to my bookings
      </Link>

      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {payError && <Alert kind="error">{payError}</Alert>}

      <Card
        title={headline}
        subtitle={`${booking.parkingLot?.name || ''} · ${booking.bookingId}`}
        actions={<Badge status={booking.status} />}
      >
        {spot && upcoming ? (
          <>
            <SpotCallout spot={spot} title={booking.status === 'active' ? 'You are parked at' : 'Your spot'} />
            <div className="mt-4">
              <ParkingFloorPlan bookingId={booking.bookingId} />
            </div>
          </>
        ) : (
          <p className="text-footnote text-label-secondary">
            {vehicleLabel(booking.vehicleType)} <span className="font-mono">{booking.vehicleNumber}</span> ·{' '}
            {dateTime(booking.expectedEntryTime)} · {money(booking.pricing?.amount)}
          </p>
        )}

        {awaitingPayment && (
          <div className="mt-4 rounded-control bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
            <p className="text-footnote font-medium text-amber-900">
              Your spot is held while you pay. The gate opens once this booking is paid.
            </p>
            <Button className="mt-3" loading={processing} onClick={payNow}>
              Pay {money(booking.pricing?.amount)} now
            </Button>
          </div>
        )}

        {session?.billing?.amountDue > 0 && (
          <div className="mt-4 rounded-control bg-rose-50 p-4 ring-1 ring-inset ring-rose-200">
            <p className="text-footnote font-medium text-rose-900">
              {money(session.billing.amountDue)} is outstanding for overstaying.
            </p>
            <Button className="mt-3" tone="danger" loading={processing} onClick={paySessionDue}>
              Pay {money(session.billing.amountDue)}
            </Button>
          </div>
        )}
      </Card>

      {/* Everything else stays one tap away rather than filling the page.
          Open by default once the booking is over, when the bill is the point. */}
      <details
        open={!upcoming}
        className="group rounded-card border border-separator bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.12)]"
      >
        <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-headline text-label">Booking details</span>
          <Icon name="chevron" size={4} className="text-label-tertiary transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-6 border-t border-separator p-5">
          <KeyValue
            rows={[
              { label: 'Vehicle number', value: booking.vehicleNumber },
              { label: 'Vehicle type', value: vehicleLabel(booking.vehicleType) },
              { label: 'Parking spot', value: spot?.label },
              { label: 'Expected entry', value: dateTime(booking.expectedEntryTime) },
              { label: 'Expected exit', value: dateTime(booking.expectedExitTime) },
              { label: 'Booked duration', value: `${booking.durationHours} hour(s)` },
              { label: 'Facility address', value: booking.parkingLot?.address },
              { label: 'Facility phone', value: booking.parkingLot?.phone },
              { label: 'Booked on', value: dateTime(booking.createdAt) },
              { label: 'Paid at', value: booking.payment?.paidAt ? dateTime(booking.payment.paidAt) : undefined },
            ]}
          />

          <div>
            <p className="eyebrow mb-2.5 text-label-tertiary">Price breakdown</p>
            {/* Every figure in a bill is tabular, so the decimal points line up
                down the column and the total reads as the sum of what is above. */}
            <dl className="space-y-2 text-footnote tabular-nums">
              {(booking.pricing?.breakdown || []).map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-label-secondary">{line.label}</dt>
                  <dd className="text-label">{money(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-separator pt-2.5">
                <dt className="text-headline text-label">Total</dt>
                <dd className="text-headline text-label">{money(booking.pricing?.amount)}</dd>
              </div>
            </dl>

            {booking.pricing?.multipliers && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-separator pt-4 text-caption sm:grid-cols-4">
                {[
                  ['Occupancy', booking.pricing.multipliers.occupancy],
                  ['Peak hours', booking.pricing.multipliers.peakHour],
                  ['Location', booking.pricing.multipliers.location],
                  ['Day of week', booking.pricing.multipliers.dayOfWeek],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="eyebrow text-label-tertiary">{label}</p>
                    <p className="mt-1 font-semibold tabular-nums text-label">&times;{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {session && (
            <div>
              <p className="eyebrow mb-2.5 text-label-tertiary">Parking session {session.sessionId}</p>
              <KeyValue
                rows={[
                  { label: 'Actual entry', value: dateTime(session.actualEntryTime) },
                  { label: 'Actual exit', value: session.actualExitTime ? dateTime(session.actualExitTime) : 'Still parked' },
                  { label: 'Total parked', value: duration(session.parkedMinutes) },
                  {
                    label: 'Overstay',
                    value:
                      session.billing?.overstayMinutes > 0
                        ? `${duration(session.billing.overstayMinutes)} (${duration(session.billing.chargeableOverstayMinutes)} chargeable)`
                        : 'None',
                  },
                  { label: 'Overstay charge', value: money(session.billing?.overstayAmount) },
                  { label: 'Total charged', value: money(session.billing?.totalAmount) },
                ]}
              />

              {receipt && (
                <div className="mt-5 rounded-control border border-separator p-4">
                  <p className="eyebrow text-label-tertiary">Final bill</p>
                  <dl className="mt-2.5 space-y-1.5 text-footnote tabular-nums">
                    {(receipt.breakdown || []).map((line, index) => (
                      <div key={`${line.label}-${index}`} className="flex justify-between gap-4">
                        <dt className="text-label-secondary">{line.label}</dt>
                        <dd className="text-label">{money(line.amount)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t border-separator pt-2.5">
                      <dt className="text-headline text-label">Total</dt>
                      <dd className="text-headline text-label">{money(receipt.charges.total)}</dd>
                    </div>
                  </dl>
                </div>
              )}

            </div>
          )}
        </div>
      </details>

      {booking.fraudFlags?.length > 0 && (
        <Card title="Security notices">
          <ul className="space-y-2 text-footnote">
            {booking.fraudFlags.map((flag, index) => (
              <li key={index} className="rounded-control bg-rose-50 px-3 py-2 text-rose-800 ring-1 ring-inset ring-rose-200">
                <p className="font-medium">{flag.detail}</p>
                <p className="text-caption">
                  {dateTime(flag.at)}
                  {flag.similarity !== undefined ? ` · plate similarity ${(flag.similarity * 100).toFixed(0)}%` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default BookingDetail;
