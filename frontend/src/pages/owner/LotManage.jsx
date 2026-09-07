import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { errorMessage } from '../../api/client';
import { analyticsApi, bookingApi, parkingApi, paymentApi, recognitionApi, sessionApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, EmptyState, Field, Pagination, Select, Spinner, StatCard, Table, Td } from '../../components/ui';
import PricingRules from './PricingRules';
import { dateTime, duration, money, percent, statusLabel, vehicleLabel } from '../../utils/format';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'sessions', label: 'Live sessions' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'pricing', label: 'Dynamic pricing' },
  { key: 'gate', label: 'Gate events' },
];

const chartAxis = { stroke: '#94a3b8', fontSize: 11 };

const LotManage = () => {
  const { id } = useParams();
  const [tab, setTab] = useState('overview');
  const [lot, setLot] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadLot = useCallback(async () => {
    try {
      const [lotData, analyticsData] = await Promise.all([
        parkingApi.manage(id),
        analyticsApi.lot(id, { range: '30d' }).catch(() => null),
      ]);
      setLot(lotData);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadLot();
  }, [loadLot]);

  const recount = async () => {
    setNotice('');
    try {
      await parkingApi.recount(id);
      setNotice('Counters recomputed from live sessions and reservations.');
      loadLot();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (loading) return <Spinner label="Loading facility..." />;
  if (!lot) return <Alert kind="error">{error || 'Facility not found.'}</Alert>;

  return (
    <div className="space-y-6">
      <Link to="/owner/lots" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        &larr; Back to my facilities
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-900">{lot.name}</h1>
            <Badge status={lot.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {lot.location.address}, {lot.location.city}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="secondary" onClick={recount}>
            Recompute counters
          </Button>
          <Link to={`/owner/lots/${id}/edit`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Edit facility
          </Link>
        </div>
      </div>

      {lot.status === 'pending' && (
        <Alert kind="warning">
          This facility is awaiting platform approval. It will not appear in driver search until an administrator approves it.
        </Alert>
      )}
      {lot.statusReason && lot.status !== 'approved' && <Alert kind="info">Administrator note: {lot.statusReason}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Facility sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview lot={lot} analytics={analytics} />}
      {tab === 'reservations' && <Reservations lotId={id} />}
      {tab === 'sessions' && <Sessions lotId={id} />}
      {tab === 'transactions' && <Transactions lotId={id} />}
      {tab === 'pricing' && <PricingRules lotId={id} lot={lot} />}
      {tab === 'gate' && <GateEvents lotId={id} />}
    </div>
  );
};

const Overview = ({ lot, analytics }) => (
  <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Occupancy" value={percent((lot.occupancyRate || 0) * 100)} tone="brand" />
      <StatCard label="Vehicles parked" value={lot.occupied.two_wheeler + lot.occupied.four_wheeler} />
      <StatCard label="Reserved (not arrived)" value={lot.reserved.two_wheeler + lot.reserved.four_wheeler} />
      <StatCard
        label="Free slots"
        value={lot.available.two_wheeler + lot.available.four_wheeler}
        hint={`${lot.available.two_wheeler} 2W / ${lot.available.four_wheeler} 4W`}
        tone="positive"
      />
      <StatCard label="Revenue (30d)" value={money(analytics?.revenue?.window?.gross || 0)} />
      <StatCard label="Avg. duration" value={duration(analytics?.averageParkingDuration?.averageParkedMinutes || 0)} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Capacity by vehicle type">
        <div className="space-y-4">
          {['two_wheeler', 'four_wheeler'].map((type) => {
            const capacity = lot.capacity[type];
            if (!capacity) return null;
            const occupied = lot.occupied[type];
            const reserved = lot.reserved[type];
            return (
              <div key={type}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink-900">{vehicleLabel(type)}</span>
                  <span className="text-ink-500">
                    {occupied} parked + {reserved} reserved of {capacity}
                  </span>
                </div>
                <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block bg-brand-600" style={{ width: `${(occupied / capacity) * 100}%` }} title="Parked" />
                  <span className="block bg-amber-400" style={{ width: `${(reserved / capacity) * 100}%` }} title="Reserved" />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Base rate {money(lot.hourlyRate[type])}/hr &middot; {lot.available[type]} free
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-brand-600" /> Parked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-amber-400" /> Reserved
          </span>
        </div>
      </Card>

      <Card title="Configuration">
        <dl className="space-y-2 text-sm">
          {[
            ['Operating hours', lot.operatingHours.is24x7 ? '24/7' : `${lot.operatingHours.openTime} - ${lot.operatingHours.closeTime}`],
            ['Dynamic pricing', lot.pricing?.dynamicPricingEnabled ? 'Enabled' : 'Disabled'],
            ['Overstay multiplier', `${lot.pricing?.overstayMultiplier}x`],
            ['Grace period', `${lot.pricing?.graceMinutes} minutes`],
            ['Minimum charge', `${lot.pricing?.minChargeHours} hour(s)`],
            ['Platform commission', lot.commissionPercent !== undefined ? `${lot.commissionPercent}%` : 'Platform default'],
            ['EV charging', lot.amenities.evCharging ? 'Available' : 'Not available'],
            ['Rating', lot.rating.count ? `${lot.rating.average.toFixed(1)} from ${lot.rating.count} reviews` : 'No reviews yet'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0">
              <dt className="text-ink-500">{label}</dt>
              <dd className="text-right font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>

    {analytics && (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue, last 30 days">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailySeries} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={chartAxis} tickFormatter={(value) => value.slice(5)} />
                <YAxis tick={chartAxis} />
                <Tooltip formatter={(value) => money(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="revenue" stroke="#1f43ec" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Vehicle arrivals by hour">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.peakHours} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="hour" tick={chartAxis} interval={3} />
                <YAxis tick={chartAxis} allowDecimals={false} />
                <Tooltip labelFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="entries" fill="#598bff" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    )}
  </div>
);

/** Generic paginated list, so each tab is a thin wrapper over a fetcher. */
const useList = (fetcher, deps = []) => {
  const [data, setData] = useState({ items: [], pagination: null, summary: null, byResult: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        setData(await fetcher(page));
        setError('');
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return { ...data, loading, error, load };
};

const Reservations = ({ lotId }) => {
  const [status, setStatus] = useState('');
  const { items, pagination, loading, error, load } = useList(
    (page) => bookingApi.forLot(lotId, { page, limit: 15, ...(status ? { status } : {}) }),
    [lotId, status],
  );

  return (
    <Card
      padded={false}
      title="Reservations"
      subtitle="Every booking made for this facility."
      actions={
        <Field className="w-48">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="active">Vehicle inside</option>
            <option value="completed">Completed</option>
            <option value="pending_payment">Awaiting payment</option>
            <option value="payment_failed">Payment failed</option>
          </Select>
        </Field>
      }
    >
      {error && <div className="p-5"><Alert kind="error">{error}</Alert></div>}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No reservations" description="Bookings for this facility will appear here." />
      ) : (
        <>
          <Table headers={['Booking', 'Driver', 'Vehicle', 'Entry window', 'Duration', 'Amount', 'Status']}>
            {items.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">{booking.bookingId}</Td>
                <Td>
                  <span className="block max-w-[12rem] truncate">{booking.user?.name || '-'}</span>
                  <span className="block max-w-[12rem] truncate text-xs text-ink-500">{booking.user?.email}</span>
                </Td>
                <Td>
                  <span className="block font-mono text-xs">{booking.vehicleNumber}</span>
                  <span className="block text-xs text-ink-500">{vehicleLabel(booking.vehicleType)}</span>
                </Td>
                <Td>
                  <span className="block text-xs">{dateTime(booking.expectedEntryTime)}</span>
                  <span className="block text-xs text-ink-500">to {dateTime(booking.expectedExitTime)}</span>
                </Td>
                <Td>{booking.durationHours}h</Td>
                <Td>{money(booking.pricing?.amount)}</Td>
                <Td>
                  <Badge status={booking.status} />
                  {booking.fraudFlags?.length > 0 && <span className="ml-1 text-rose-600" title="Plate mismatch recorded">&#9888;</span>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination pagination={pagination} onChange={load} />
        </>
      )}
    </Card>
  );
};

const Sessions = ({ lotId }) => {
  const [status, setStatus] = useState('active');
  const { items, pagination, loading, error, load } = useList(
    (page) => sessionApi.forLot(lotId, { page, limit: 15, ...(status ? { status } : {}) }),
    [lotId, status],
  );

  return (
    <Card
      padded={false}
      title="Parking sessions"
      subtitle="Vehicles currently inside and completed sessions."
      actions={
        <Field className="w-48">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Currently inside</option>
            <option value="pending_payment">Exited, unpaid</option>
            <option value="closed">Closed</option>
            <option value="">All sessions</option>
          </Select>
        </Field>
      }
    >
      {error && <div className="p-5"><Alert kind="error">{error}</Alert></div>}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No sessions" description="Vehicles admitted at the gate will appear here." />
      ) : (
        <>
          <Table headers={['Session', 'Vehicle', 'Driver', 'Entry', 'Booked exit', 'Parked', 'Overstay', 'Due']}>
            {items.map((session) => (
              <tr key={session.id} className={session.isOverstaying ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                <Td className="font-mono text-xs">{session.sessionId}</Td>
                <Td>
                  <span className="block font-mono text-xs">{session.vehicleNumber}</span>
                  <span className="block text-xs text-ink-500">{vehicleLabel(session.vehicleType)}</span>
                </Td>
                <Td>
                  <span className="block max-w-[12rem] truncate">{session.user?.name || '-'}</span>
                </Td>
                <Td>{dateTime(session.actualEntryTime)}</Td>
                <Td>{dateTime(session.expectedExitTime)}</Td>
                <Td>{duration(session.parkedMinutes)}</Td>
                <Td>
                  {session.isOverstaying ? (
                    <span className="font-medium text-amber-700">{duration(session.liveOverstayMinutes)}</span>
                  ) : session.billing?.overstayMinutes > 0 ? (
                    duration(session.billing.overstayMinutes)
                  ) : (
                    '-'
                  )}
                </Td>
                <Td>
                  {session.billing?.amountDue > 0 ? (
                    <span className="font-medium text-rose-600">{money(session.billing.amountDue)}</span>
                  ) : (
                    <Badge status={session.status} />
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination pagination={pagination} onChange={load} />
        </>
      )}
    </Card>
  );
};

const Transactions = ({ lotId }) => {
  const { items, pagination, summary, loading, error, load } = useList(
    (page) => paymentApi.forLot(lotId, { page, limit: 15 }),
    [lotId],
  );

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Gross collected" value={money(summary.gross)} />
          <StatCard label="Platform commission" value={money(summary.platformCommission)} tone="warning" />
          <StatCard label="Your earnings" value={money(summary.ownerEarning)} tone="positive" />
        </div>
      )}

      <Card padded={false} title="Transactions">
        {error && <div className="p-5"><Alert kind="error">{error}</Alert></div>}
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No transactions" description="Payments for this facility will appear here." />
        ) : (
          <>
            <Table headers={['Transaction', 'Date', 'Driver', 'Booking', 'Purpose', 'Amount', 'Commission', 'Your share', 'Status']}>
              {items.map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{txn.transactionId}</Td>
                  <Td>{dateTime(txn.createdAt)}</Td>
                  <Td>
                    <span className="block max-w-[10rem] truncate">{txn.user?.name || '-'}</span>
                  </Td>
                  <Td className="font-mono text-xs">{txn.booking?.bookingId || '-'}</Td>
                  <Td>{statusLabel(txn.purpose)}</Td>
                  <Td className="font-medium">{money(txn.amount)}</Td>
                  <Td className="text-amber-700">{money(txn.settlement?.platformCommission)}</Td>
                  <Td className="text-emerald-700">{money(txn.settlement?.ownerEarning)}</Td>
                  <Td>
                    <Badge status={txn.status} />
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={pagination} onChange={load} />
          </>
        )}
      </Card>
    </div>
  );
};

const RESULT_TONE = {
  verified: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  plate_mismatch: 'bg-rose-50 text-rose-700 ring-rose-200',
  no_booking: 'bg-amber-50 text-amber-700 ring-amber-200',
  no_active_session: 'bg-rose-50 text-rose-700 ring-rose-200',
  outside_entry_window: 'bg-amber-50 text-amber-700 ring-amber-200',
  unreadable_plate: 'bg-slate-100 text-slate-600 ring-slate-200',
  duplicate_event: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const GateEvents = ({ lotId }) => {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const { items, pagination, loading, error, load } = useList(
    (page) => recognitionApi.events(lotId, { page, limit: 20, ...(flaggedOnly ? { flaggedOnly: 'true' } : {}) }),
    [lotId, flaggedOnly],
  );

  return (
    <Card
      padded={false}
      title="Gate recognition events"
      subtitle="Every camera capture at this facility, whether or not the barrier opened."
      actions={
        <Field className="w-52">
          <Select value={flaggedOnly ? 'flagged' : 'all'} onChange={(event) => setFlaggedOnly(event.target.value === 'flagged')}>
            <option value="all">All events</option>
            <option value="flagged">Flagged for review only</option>
          </Select>
        </Field>
      }
    >
      {error && <div className="p-5"><Alert kind="error">{error}</Alert></div>}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No gate events" description="Camera captures at the entry and exit gates will appear here." />
      ) : (
        <>
          <Table headers={['Time', 'Gate', 'Plate read', 'Confidence', 'Result', 'Booking', 'Message']}>
            {items.map((event) => (
              <tr key={event._id} className={event.flaggedAsFraud ? 'bg-rose-50' : 'hover:bg-slate-50'}>
                <Td>{dateTime(event.createdAt)}</Td>
                <Td>
                  <Badge tone={event.eventType === 'entry' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
                    {statusLabel(event.eventType)}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs">{event.recognizedPlate || '-'}</Td>
                <Td>{event.confidence !== undefined ? `${(event.confidence * 100).toFixed(0)}%` : '-'}</Td>
                <Td>
                  <Badge tone={RESULT_TONE[event.result]}>{statusLabel(event.result)}</Badge>
                </Td>
                <Td className="font-mono text-xs">{event.booking?.bookingId || '-'}</Td>
                <Td>
                  <span className="block max-w-[20rem] truncate text-xs text-ink-500" title={event.message}>
                    {event.message}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination pagination={pagination} onChange={load} />
        </>
      )}
    </Card>
  );
};

export default LotManage;
