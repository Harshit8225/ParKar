import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { paymentApi, sessionApi, usersApi } from '../../api/endpoints';
import Icon from '../../components/Icon';
import { Alert, Badge, Button, Card, KeyValue, LinkButton, Spinner, Tile } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

/**
 * Driver dashboard: only what needs attention right now - money owed, and the
 * vehicle currently in a bay. Reservation and session history live in My
 * Bookings, reachable from the avatar menu.
 */

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

  const { stats, activeSession } = data;
  const allClear = !activeSession && !dues?.count;

  return (
    <div>
      {/* ---- Full-bleed header band, breaking out of the page container.
              The wash and the strip colour come from `.band-brand` in
              index.css, the same definition HeroBand and HeroScene use. ---- */}
      <section className="band-brand relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          width="1600"
          height="600"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div aria-hidden="true" className="band-wash absolute inset-0" />
        {/* Cyan light strip, as on the home page hero */}
        <div
          aria-hidden="true"
          className="parkar-pulse band-strip absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-capsule blur-[3px]"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-12">
          <p className="eyebrow text-cyan-200/90">Driver dashboard</p>
          <h1 className="mt-2.5 text-title-1 text-white">Welcome back, {data.user.name.split(' ')[0]}</h1>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LinkButton to="/" tone="light" size="lg">
              Book parking
            </LinkButton>
            <LinkButton to="/app/bookings" tone="ghostLight" size="lg">
              My bookings
            </LinkButton>
          </div>
        </div>
      </section>

      {/* ---- Stats, lifted over the band ---- */}
      <div className="relative z-10 -mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="ticket" label="Total bookings" value={stats.totalBookings} to="/app/bookings" />
        <Tile icon="clock" label="Parking sessions" value={stats.totalSessions} to="/app/bookings" />
        <Tile icon="calendar" tone="brand" label="Upcoming" value={stats.upcomingBookings} to="/app/bookings" />
        <Tile
          icon="rupee"
          tone={dues?.totalDue > 0 ? 'danger' : 'available'}
          label="Outstanding dues"
          value={money(dues?.totalDue || 0)}
          hint={dues?.count ? `${dues.count} unsettled session(s)` : 'Nothing owed'}
          to="/app/payments"
        />
      </div>

      <div className="mt-6 space-y-6">
        {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
        {payError && <Alert kind="error">{payError}</Alert>}
        {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

        {dues?.count > 0 && (
          <Card title="Unpaid overstay charges">
            <div className="space-y-3">
              {dues.sessions.map((due) => (
                <div
                  key={due.sessionId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-rose-50 px-4 py-3.5 ring-1 ring-inset ring-rose-200"
                >
                  <div className="min-w-0">
                    <p className="text-footnote font-medium text-label">
                      {due.parkingLot} &middot; <span className="font-mono">{due.vehicleNumber}</span>
                    </p>
                    <p className="text-caption text-label-secondary">
                      Exited {dateTime(due.exitTime)} &middot; overstayed {duration(due.overstayMinutes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-callout font-semibold tabular-nums text-rose-700">{money(due.amountDue)}</span>
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
                {
                  label: 'Vehicle',
                  value: `${activeSession.vehicleNumber} (${vehicleLabel(activeSession.vehicleType)})`,
                },
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

        {allClear && (
          <div className="flex items-center gap-4 rounded-card border border-emerald-200 bg-emerald-50 p-5">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-emerald-100 text-emerald-700"
            >
              <Icon name="check" size={5} />
            </span>
            <h2 className="text-headline text-emerald-900">You are all settled</h2>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
