import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { bookingApi } from '../../api/endpoints';
import { Alert, Badge, Card, EmptyState, Field, Pagination, Select, Spinner, Table, Td } from '../../components/ui';
import { dateTime, money, vehicleLabel } from '../../utils/format';

const STATUSES = [
  { value: '', label: 'All bookings' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'active', label: 'Vehicle inside' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending_payment', label: 'Awaiting payment' },
  { value: 'payment_failed', label: 'Payment failed' },
];

const MyBookings = () => {
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (status) params.status = status;
      setData(await bookingApi.mine(params));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">My bookings</h1>
          <p className="text-sm text-ink-500">Every reservation you have made, newest first.</p>
        </div>
        <Field label="Filter" className="w-56">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <Card padded={false}>
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="No bookings found"
            description={status ? 'Try clearing the filter.' : 'Book a parking slot and it will show up here.'}
            action={
              <Link to="/app/search" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Find parking
              </Link>
            }
          />
        ) : (
          <>
            <Table headers={['Booking ID', 'Facility', 'Vehicle', 'Booked window', 'Amount', 'Status', '']}>
              {data.items.map((booking) => (
                <tr key={booking.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{booking.bookingId}</Td>
                  <Td>
                    <span className="block max-w-[16rem] truncate">{booking.parkingLot?.name || '-'}</span>
                    <span className="block text-xs text-ink-500">{booking.parkingLot?.city}</span>
                  </Td>
                  <Td>
                    <span className="block font-mono text-xs">{booking.vehicleNumber}</span>
                    <span className="block text-xs text-ink-500">{vehicleLabel(booking.vehicleType)}</span>
                  </Td>
                  <Td>
                    <span className="block text-xs">{dateTime(booking.expectedEntryTime)}</span>
                    <span className="block text-xs text-ink-500">to {dateTime(booking.expectedExitTime)}</span>
                  </Td>
                  <Td>{money(booking.pricing?.amount)}</Td>
                  <Td>
                    <Badge status={booking.status} />
                    {booking.fraudFlags?.length > 0 && (
                      <span className="ml-1 text-xs text-rose-600" title="A plate mismatch was recorded for this booking">
                        &#9888;
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Link to={`/app/bookings/${booking.bookingId}`} className="text-sm font-medium text-brand-700 hover:underline">
                      Details
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>
    </div>
  );
};

export default MyBookings;
