import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { paymentApi, sessionApi, usersApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, EmptyState, KeyValue, Spinner, StatCard, Table, Td } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [dues, setDues] = useState(null);
  const [livePreview, setLivePreview] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { pay, processing, error: payError } = useCheckout();

  const load = async () => {
    try {
      const [dashboard, duesData] = await Promise.all([usersApi.dashboard(), paymentApi.dues()]);
      setData(dashboard);
      setDues(duesData);

      // An active session accrues overstay by the minute, so show it live.
      if (dashboard.activeSession) {
        try {
          setLivePreview(await sessionApi.previewBill(dashboard.activeSession.sessionId));
        } catch {
          setLivePreview(null);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const settleDue = async (sessionId) => {
    setNotice('');
    try {
      const { payment } = await paymentApi.sessionOrder(sessionId);
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

  if (error && !data) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner label="Loading your dashboard..." />;

  const { stats, activeSession, upcomingBookings, recentSessions } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Welcome back, {data.user.name.split(' ')[0]}</h1>
          <p className="text-sm text-ink-500">Here is what is happening with your parking.</p>
        </div>
        <Link
          to="/app/search"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Find parking
        </Link>
      </div>

      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
      {payError && <Alert kind="error">{payError}</Alert>}
      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" value={stats.totalBookings} />
        <StatCard label="Parking sessions" value={stats.totalSessions} />
        <StatCard label="Upcoming" value={stats.upcomingBookings} tone="brand" />
        <StatCard
          label="Outstanding dues"
          value={money(dues?.totalDue || 0)}
          tone={dues?.totalDue > 0 ? 'negative' : 'positive'}
          hint={dues?.count ? `${dues.count} unsettled session(s)` : 'Nothing owed'}
        />
      </div>

      {dues?.count > 0 && (
        <Card title="Unpaid overstay charges" subtitle="These were calculated automatically when you exited.">
          <div className="space-y-3">
            {dues.sessions.map((due) => (
              <div
                key={due.sessionId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 ring-1 ring-inset ring-rose-200"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {due.parkingLot} &middot; {due.vehicleNumber}
                  </p>
                  <p className="text-xs text-ink-500">
                    Exited {dateTime(due.exitTime)} &middot; overstayed {duration(due.overstayMinutes)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-rose-700">{money(due.amountDue)}</span>
                  <Button size="sm" loading={processing} onClick={() => settleDue(due.sessionId)}>
                    Pay now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeSession && (
        <Card
          title="You are parked right now"
          subtitle={`Session ${activeSession.sessionId}`}
          actions={<Badge status="active">Vehicle inside</Badge>}
        >
          <KeyValue
            rows={[
              { label: 'Facility', value: activeSession.parkingLot?.name },
              { label: 'Vehicle', value: `${activeSession.vehicleNumber} (${vehicleLabel(activeSession.vehicleType)})` },
              { label: 'Entered at', value: dateTime(activeSession.actualEntryTime) },
              { label: 'Booked until', value: dateTime(activeSession.expectedExitTime) },
              { label: 'Parked for', value: duration(livePreview?.parkedMinutes ?? activeSession.parkedMinutes) },
              {
                label: 'Overstay so far',
                value:
                  livePreview && livePreview.overstayMinutes > 0
                    ? `${duration(livePreview.overstayMinutes)} (${money(livePreview.amountDue)} due at exit)`
                    : 'None',
              },
            ]}
          />
          {livePreview?.amountDue > 0 && (
            <Alert kind="warning">
              You are past your booked exit time. {money(livePreview.amountDue)} will be charged when you leave.
            </Alert>
          )}
        </Card>
      )}

      <Card title="Upcoming bookings" padded={false}>
        {upcomingBookings.length === 0 ? (
          <EmptyState
            title="No upcoming bookings"
            description="Search for a facility near you and reserve a slot for today."
            action={
              <Link
                to="/app/search"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Find parking
              </Link>
            }
          />
        ) : (
          <Table headers={['Booking', 'Facility', 'Vehicle', 'Entry window', 'Amount', '']}>
            {upcomingBookings.map((booking) => (
              <tr key={booking.id}>
                <Td className="font-mono text-xs">{booking.bookingId}</Td>
                <Td>{booking.parkingLot?.name}</Td>
                <Td className="font-mono text-xs">{booking.vehicleNumber}</Td>
                <Td>
                  {dateTime(booking.expectedEntryTime)} &rarr; {dateTime(booking.expectedExitTime)}
                </Td>
                <Td>{money(booking.pricing?.amount)}</Td>
                <Td>
                  <Link to={`/app/bookings/${booking.bookingId}`} className="text-sm font-medium text-brand-700 hover:underline">
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Recent parking sessions" padded={false}>
        {recentSessions.length === 0 ? (
          <EmptyState title="No parking sessions yet" description="Your entry and exit history will appear here." />
        ) : (
          <Table headers={['Session', 'Facility', 'Vehicle', 'Entry', 'Exit', 'Parked', 'Overstay', 'Total']}>
            {recentSessions.map((session) => (
              <tr key={session.id}>
                <Td className="font-mono text-xs">{session.sessionId}</Td>
                <Td>{session.parkingLot?.name || '-'}</Td>
                <Td className="font-mono text-xs">{session.vehicleNumber}</Td>
                <Td>{dateTime(session.actualEntryTime)}</Td>
                <Td>{session.actualExitTime ? dateTime(session.actualExitTime) : <Badge status="active">Inside</Badge>}</Td>
                <Td>{duration(session.parkedMinutes)}</Td>
                <Td>
                  {session.billing?.overstayMinutes > 0 ? (
                    <span className="text-amber-700">{duration(session.billing.overstayMinutes)}</span>
                  ) : (
                    '-'
                  )}
                </Td>
                <Td>{money(session.billing?.totalAmount)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
