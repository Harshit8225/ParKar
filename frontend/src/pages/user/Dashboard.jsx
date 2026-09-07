import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { paymentApi, sessionApi, usersApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, KeyValue, Spinner } from '../../components/ui';
import { useCheckout } from '../../hooks/useCheckout';
import { dateTime, duration, money, vehicleLabel } from '../../utils/format';

/**
 * Driver dashboard: only what needs attention right now - money owed, and the
 * vehicle currently in a bay. Reservation and session history live in My
 * Bookings, reachable from the avatar menu.
 */

const ICONS = {
  ticket:
    'M4 9.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5ZM12 7v11',
  clock: 'M12 7.5V12l3 2M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z',
  calendar:
    'M4.5 8.5h15m-11-4v3m7-3v3M6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5H6A1.5 1.5 0 0 0 4.5 7v12A1.5 1.5 0 0 0 6 20.5Z',
  rupee: 'M7 4h10M7 9h10m-3.5-5c3 0 4 2 4 3.5S15.5 12 12 12H7l7 8',
  camera:
    'M4.5 8.5h3l1.5-2.2h6L16.5 8.5h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Zm7.5 3.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Stat tile with enough presence to anchor the top of the page. */
const Tile = ({ icon, label, value, hint, tone = 'default' }) => {
  const tones = {
    default: 'text-ink-900',
    brand: 'text-brand-700',
    positive: 'text-emerald-600',
    negative: 'text-rose-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
};

const GATE_STEPS = [
  {
    icon: 'camera',
    title: 'The camera reads your plate',
    copy: 'Drive up to the entrance and stop at the line. The gate matches the plate against your booking and lifts the barrier. Nothing to scan or show.',
  },
  {
    icon: 'clock',
    title: 'Your stay is timed from the real entry',
    copy: 'Billing runs from the moment you actually drive in, not from the time you booked, so arriving a few minutes late costs you nothing.',
  },
  {
    icon: 'rupee',
    title: 'Overstay settles itself',
    copy: 'Past your booked exit there is a grace period, then extra time is charged at the facility rate. It appears here, and you can pay it from this page.',
  },
];

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
      {/* ---- Full-bleed header band, breaking out of the page container ---- */}
      <section className="relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(110deg,rgba(4,9,26,0.94)_0%,rgba(8,20,52,0.82)_55%,rgba(6,14,38,0.72)_100%)]"
        />
        {/* Cyan light strip, as on the home page hero */}
        <div
          aria-hidden="true"
          className="parkar-pulse absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-full bg-[linear-gradient(270deg,transparent,#22d3ee,#a5f3fc)] blur-[3px]"
        />

        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Driver dashboard</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome back, {data.user.name.split(' ')[0]}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200/85 sm:text-base">
            {activeSession
              ? 'Your vehicle is inside a facility right now. The card below tracks your stay by the minute.'
              : dues?.count > 0
                ? 'You have an unsettled overstay charge. Clear it below and you are free to book again.'
                : 'Nothing needs your attention. Pick a window on the home page and the map will show what is free near you.'}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lg shadow-black/20 transition hover:bg-slate-100"
            >
              Book parking
            </Link>
            <Link
              to="/app/bookings"
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 transition hover:bg-white/10"
            >
              My bookings
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Stats, lifted over the band ---- */}
      <div className="relative z-10 -mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="ticket" label="Total bookings" value={stats.totalBookings} />
        <Tile icon="clock" label="Parking sessions" value={stats.totalSessions} />
        <Tile icon="calendar" label="Upcoming" value={stats.upcomingBookings} tone="brand" />
        <Tile
          icon="rupee"
          label="Outstanding dues"
          value={money(dues?.totalDue || 0)}
          tone={dues?.totalDue > 0 ? 'negative' : 'positive'}
          hint={dues?.count ? `${dues.count} unsettled session(s)` : 'Nothing owed'}
        />
      </div>

      <div className="mt-6 space-y-6">
        {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
        {payError && <Alert kind="error">{payError}</Alert>}
        {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

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
          <div className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Icon name="check" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-emerald-900">You are all settled</h2>
              <p className="mt-1 text-sm leading-relaxed text-emerald-800/80">
                No vehicle inside a facility and nothing outstanding. Anything you book from here on shows up in My
                Bookings the moment payment clears.
              </p>
            </div>
          </div>
        )}

        {/* ---- What happens at the gate: the part drivers ask about most ---- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">What happens at the gate</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
            ParKar bills your real stay, not your reservation. Here is how that works in practice, so nothing at the
            barrier is a surprise.
          </p>

          <div className="mt-7 grid gap-7 md:grid-cols-3">
            {GATE_STEPS.map((step, index) => (
              <article key={step.title}>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
                    <Icon name={step.icon} className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.1em] text-accent-600">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{step.copy}</p>
              </article>
            ))}
          </div>

          <p className="mt-7 border-t border-slate-100 pt-5 text-xs leading-relaxed text-ink-500">
            Enter your number plate exactly as it appears on the vehicle - the gate matches it character by character.
            If a barrier does not open, the facility staff can verify your booking by hand.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
