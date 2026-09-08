import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { bookingApi, sessionApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  LinkButton,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Spinner,
  Table,
  Td,
} from '../../components/ui';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

/**
 * Everything that has happened to this driver's parking, in one place: the
 * reservations they made, and the record of their vehicle actually entering and
 * leaving. The dashboard links here rather than duplicating either list.
 */

const TABS = [
  { value: 'bookings', label: 'Reservations' },
  { value: 'sessions', label: 'Parking sessions' },
];

const BOOKING_STATUSES = [
  { value: '', label: 'All bookings' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'active', label: 'Vehicle inside' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending_payment', label: 'Awaiting payment' },
  { value: 'payment_failed', label: 'Payment failed' },
];

const SESSION_STATUSES = [
  { value: '', label: 'All sessions' },
  { value: 'active', label: 'Vehicle inside' },
  { value: 'closed', label: 'Closed' },
  { value: 'pending_payment', label: 'Awaiting payment' },
];

const MyBookings = () => {
  const [tab, setTab] = useState('bookings');
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 15 };
      if (status) params.status = status;
      setData(await (tab === 'bookings' ? bookingApi.mine(params) : sessionApi.mine(params)));
    } catch (err) {
      setError(errorMessage(err));
      setData({ items: [], pagination: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status]);

  const switchTab = (key) => {
    if (key === tab) return;
    // The two lists have different status vocabularies, so clear the filter.
    setStatus('');
    setTab(key);
  };

  const statuses = tab === 'bookings' ? BOOKING_STATUSES : SESSION_STATUSES;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Driver"
        title="My bookings"
        subtitle={
          tab === 'bookings'
            ? 'Every reservation you have made, newest first.'
            : 'Every time your vehicle entered and left a facility.'
        }
        actions={
          <Field label="Filter" className="w-56">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        }
      />

      <Segmented options={TABS} value={tab} onChange={switchTab} />

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <Card padded={false}>
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={tab === 'bookings' ? 'No bookings found' : 'No parking sessions yet'}
            description={
              status
                ? 'Try clearing the filter.'
                : tab === 'bookings'
                  ? 'Book a parking slot and it will show up here.'
                  : 'Your entry and exit record appears here once you have parked.'
            }
            action={<LinkButton to="/">Book parking</LinkButton>}
          />
        ) : (
          <>
            {tab === 'bookings' ? (
              <Table headers={['Booking ID', 'Facility', 'Vehicle', 'Booked window', 'Amount', 'Status', '']}>
                {data.items.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-caption">{booking.bookingId}</Td>
                    <Td>
                      <span className="block max-w-[16rem] truncate">{booking.parkingLot?.name || '-'}</span>
                      <span className="block text-caption text-label-secondary">{booking.parkingLot?.city}</span>
                    </Td>
                    <Td>
                      <span className="block font-mono text-caption">{booking.vehicleNumber}</span>
                      <span className="block text-caption text-label-secondary">{vehicleLabel(booking.vehicleType)}</span>
                    </Td>
                    <Td>
                      <span className="block text-caption">{dateTime(booking.expectedEntryTime)}</span>
                      <span className="block text-caption text-label-secondary">to {dateTime(booking.expectedExitTime)}</span>
                    </Td>
                    <Td className="font-medium tabular-nums text-label">{money(booking.pricing?.amount)}</Td>
                    <Td>
                      <Badge status={booking.status} />
                      {booking.fraudFlags?.length > 0 && (
                        <span
                          className="ml-1 text-caption text-rose-600"
                          title="A plate mismatch was recorded for this booking"
                        >
                          &#9888;
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Link
                        to={`/app/bookings/${booking.bookingId}`}
                        className="tap rounded-capsule px-2.5 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Details
                      </Link>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table headers={['Session', 'Facility', 'Vehicle', 'Entry', 'Exit', 'Parked', 'Overstay', 'Total']}>
                {data.items.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-caption">{session.sessionId}</Td>
                    <Td>
                      <span className="block max-w-[16rem] truncate">{session.parkingLot?.name || '-'}</span>
                    </Td>
                    <Td>
                      <span className="block font-mono text-caption">{session.vehicleNumber}</span>
                      <span className="block text-caption text-label-secondary">{vehicleLabel(session.vehicleType)}</span>
                    </Td>
                    <Td className="text-caption">{dateTime(session.actualEntryTime)}</Td>
                    <Td className="text-caption">
                      {session.actualExitTime ? dateTime(session.actualExitTime) : <Badge status="active">Inside</Badge>}
                    </Td>
                    <Td className="tabular-nums">{duration(session.parkedMinutes)}</Td>
                    <Td className="tabular-nums">
                      {session.billing?.overstayMinutes > 0 ? (
                        <span className="font-medium text-amber-700">{duration(session.billing.overstayMinutes)}</span>
                      ) : (
                        '-'
                      )}
                    </Td>
                    <Td className="font-medium tabular-nums text-label">{money(session.billing?.totalAmount)}</Td>
                  </tr>
                ))}
              </Table>
            )}
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>
    </div>
  );
};

export default MyBookings;
