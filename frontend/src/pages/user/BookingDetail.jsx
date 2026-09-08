import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { bookingApi, paymentApi, sessionApi } from '../../api/endpoints';
import Icon from '../../components/Icon';
import { Alert, Badge, Button, Card, KeyValue, Spinner } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

const BookingDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('paid') === '1';

  const [booking, setBooking] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(justPaid ? 'Payment successful. Your slot is confirmed.' : '');
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
          onSuccess: () => {
            setNotice('Payment successful. Your slot is confirmed.');
            load();
          },
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
        title={`Booking ${booking.bookingId}`}
        subtitle={booking.parkingLot?.name}
        actions={<Badge status={booking.status} />}
      >
        <KeyValue
          rows={[
            { label: 'Vehicle number', value: booking.vehicleNumber },
            { label: 'Vehicle type', value: vehicleLabel(booking.vehicleType) },
            { label: 'Expected entry', value: dateTime(booking.expectedEntryTime) },
            { label: 'Expected exit', value: dateTime(booking.expectedExitTime) },
            { label: 'Booked duration', value: `${booking.durationHours} hour(s)` },
            { label: 'Amount paid', value: money(booking.pricing?.amount) },
            { label: 'Facility address', value: booking.parkingLot?.address },
            { label: 'Facility phone', value: booking.parkingLot?.phone },
            { label: 'Booked on', value: dateTime(booking.createdAt) },
            { label: 'Paid at', value: booking.payment?.paidAt ? dateTime(booking.payment.paidAt) : undefined },
          ]}
        />

        {awaitingPayment && (
          <div className="mt-5 rounded-control bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
            <p className="text-footnote font-medium text-amber-900">This booking is not confirmed yet.</p>
            <p className="mt-1 text-footnote text-amber-800">
              Your slot is held while you complete the payment. The gate will not open until this booking is paid.
            </p>
            <Button className="mt-3" loading={processing} onClick={payNow}>
              Pay {money(booking.pricing?.amount)} now
            </Button>
          </div>
        )}

        {booking.status === 'confirmed' && (
          <div className="mt-5 rounded-control bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
            <p className="text-footnote font-medium text-emerald-900">You are ready to park.</p>
            <p className="mt-1 text-footnote text-emerald-800">
              Drive up to the entrance of {booking.parkingLot?.name}. The camera will read{' '}
              <strong className="font-mono">{booking.vehicleNumber}</strong> and the barrier will open. No QR code or printout
              is needed.
            </p>
          </div>
        )}
      </Card>

      <Card title="Price breakdown">
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
      </Card>

      {session && (
        <Card
          title="Parking session"
          subtitle={`Session ${session.sessionId}`}
          actions={<Badge status={session.status} />}
        >
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

          {session.billing?.amountDue > 0 && (
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
      )}

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
