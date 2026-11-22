import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { errorMessage } from '../../api/client';
import { analyticsApi, bookingApi, parkingApi, paymentApi, recognitionApi, sessionApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LinkButton,
  Pagination,
  Segmented,
  Select,
  Spinner,
  StatCard,
  Table,
  Td,
} from '../../components/ui';
import PricingRules from './PricingRules';
import { SpotTag } from '../../components/ParkingSpot';
import {
  dateTime,
  duration,
  flexibleCapacity,
  flexibleUnits,
  money,
  offeredVehicleTypes,
  percent,
  statusLabel,
  VEHICLE_META,
  VEHICLE_TYPES,
  vehicleCounts,
  vehicleLabel,
} from '../../utils/format';
import Icon from '../../components/Icon';
import { axisTick, gridStroke, series, tooltipLabelStyle, tooltipStyle } from '../../utils/chartTheme';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'sessions', label: 'Live sessions' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'pricing', label: 'Dynamic pricing' },
  { key: 'gate', label: 'Gate events' },
];

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
      <Link
        to="/owner/lots"
        className="tap -ml-2 inline-flex w-fit items-center gap-1 rounded-capsule px-2 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50"
      >
        <Icon name="back" size={4} />
        Back to my facilities
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title-2 text-label">{lot.name}</h1>
            <Badge status={lot.status} />
          </div>
          <p className="mt-1 text-footnote text-label-secondary">
            {lot.location.address}, {lot.location.city}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="secondary" onClick={recount}>
            Recompute counters
          </Button>
          <LinkButton to={`/owner/lots/${id}/edit`} icon="pencil">
            Edit facility
          </LinkButton>
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

      <Segmented
        options={TABS.map((item) => ({ value: item.key, label: item.label }))}
        value={tab}
        onChange={setTab}
        className="max-w-full overflow-x-auto"
      />

      {tab === 'overview' && <Overview lot={lot} analytics={analytics} onRefresh={loadLot} />}
      {tab === 'reservations' && <Reservations lotId={id} />}
      {tab === 'sessions' && <Sessions lotId={id} />}
      {tab === 'transactions' && <Transactions lotId={id} />}
      {tab === 'pricing' && <PricingRules lotId={id} lot={lot} />}
      {tab === 'gate' && <GateEvents lotId={id} />}
    </div>
  );
};

/** Sum a { bike, car, bus } object. */
const total = (counts) => VEHICLE_TYPES.reduce((sum, type) => sum + (Number(counts?.[type]) || 0), 0);

const Overview = ({ lot, analytics, onRefresh }) => {
  const offered = offeredVehicleTypes(lot);
  // `available` overlaps between types (the flexible zone is shared), so it is
  // never summed - each type is listed as "up to N" instead.
  const headline = offered.includes('car') ? 'car' : offered[0];
  const flexRows = lot.layout?.flexibleRows || lot.flexibleArea?.rows || [];
  const flexUnits = flexibleUnits(lot);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Occupancy" value={percent((lot.occupancyRate || 0) * 100)} tone="brand" />
        <StatCard label="Vehicles parked" value={total(lot.occupied)} />
        <StatCard label="Reserved (not arrived)" value={total(lot.reserved)} />
        <StatCard
          label="Can still take"
          value={headline ? `${lot.available?.[headline] ?? 0} ${VEHICLE_META[headline].plural}` : '-'}
          hint={
            offered.length > 1
              ? `or ${vehicleCounts(lot.available, { types: offered.filter((type) => type !== headline) })}`
              : undefined
          }
          tone="positive"
        />
        <StatCard label="Revenue (30d)" value={money(analytics?.revenue?.window?.gross || 0)} />
        <StatCard label="Avg. duration" value={duration(analytics?.averageParkingDuration?.averageParkedMinutes || 0)} />
      </div>

      {lot.spotMap && <SpotMap spotMap={lot.spotMap} onRefresh={onRefresh} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Capacity by vehicle type">
          <div className="space-y-4">
            {VEHICLE_TYPES.map((type) => {
              const capacity = lot.capacity?.[type] || 0;
              const occupied = lot.occupied?.[type] || 0;
              const reserved = lot.reserved?.[type] || 0;
              const available = lot.available?.[type] || 0;
              if (!capacity && !offered.includes(type) && !occupied && !reserved) return null;
              // What this type could reach right now: already placed plus what
              // still fits. Fixed bays alone undercount once the flexible zone is used.
              const scale = Math.max(1, occupied + reserved + available, capacity);
              return (
                <div key={type}>
                  <div className="flex items-baseline justify-between gap-3 text-footnote">
                    <span className="font-medium text-label">{vehicleLabel(type)}</span>
                    <span className="text-right text-label-secondary">
                      {occupied} parked + {reserved} reserved &middot; up to {available} more
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-capsule bg-slate-100">
                    <span className="block bg-brand-600" style={{ width: `${(occupied / scale) * 100}%` }} title="Parked" />
                    <span className="block bg-amber-400" style={{ width: `${(reserved / scale) * 100}%` }} title="Reserved" />
                  </div>
                  <p className="mt-1 text-caption text-label-secondary">
                    {offered.includes(type) ? `Base rate ${money(lot.hourlyRate[type])}/hr` : 'Not offered (no rate)'} &middot;{' '}
                    {capacity} dedicated bay{capacity === 1 ? '' : 's'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 border-t border-separator pt-3 text-caption text-label-secondary">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-brand-600" /> Parked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-amber-400" /> Reserved
            </span>
          </div>
        </Card>

        <Card title="Configuration">
          <dl className="space-y-2 text-footnote">
            {[
              ['Operating hours', lot.operatingHours.is24x7 ? '24/7' : `${lot.operatingHours.openTime} - ${lot.operatingHours.closeTime}`],
              [
                'Flexible area',
                flexUnits > 0
                  ? `${flexRows.length || '-'} row(s), ${flexUnits} units (up to ${vehicleCounts(flexibleCapacity(flexRows), { separator: ' / ' })})`
                  : 'None',
              ],
              ['Booking batch window', lot.layout?.batchWindowMs !== undefined ? `${lot.layout.batchWindowMs} ms` : 'Default'],
              ['Contention threshold', lot.layout?.contentionThreshold ?? 'Default'],
              ['Dynamic pricing', lot.pricing?.dynamicPricingEnabled ? 'Enabled' : 'Disabled'],
              ['Overstay multiplier', `${lot.pricing?.overstayMultiplier}x`],
              ['Grace period', `${lot.pricing?.graceMinutes} minutes`],
              ['Minimum charge', `${lot.pricing?.minChargeHours} hour(s)`],
              ['Platform commission', lot.commissionPercent !== undefined ? `${lot.commissionPercent}%` : 'Platform default'],
              ['EV charging', lot.amenities.evCharging ? 'Available' : 'Not available'],
              ['Rating', lot.rating.count ? `${lot.rating.average.toFixed(1)} from ${lot.rating.count} reviews` : 'No reviews yet'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-separator pb-1.5 last:border-0">
                <dt className="text-label-secondary">{label}</dt>
                <dd className="text-right font-medium text-label">{value}</dd>
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
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" tick={axisTick} tickFormatter={(value) => value.slice(5)} />
                  <YAxis tick={axisTick} />
                  <Tooltip formatter={(value) => money(value)} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="revenue" stroke={series[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Vehicle arrivals by hour">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.peakHours} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="hour" tick={axisTick} interval={3} />
                  <YAxis tick={axisTick} allowDecimals={false} />
                  <Tooltip labelFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                  <Bar dataKey="entries" fill={series[0]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------ spot map ---- */

/**
 * One colour per vehicle type, from the ramps index.css re-maps for dark mode,
 * so the map reads the same in either theme. Free space stays neutral.
 */
const VEHICLE_TONE = {
  bike: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  car: 'bg-brand-100 text-brand-800 ring-brand-300',
  bus: 'bg-amber-100 text-amber-800 ring-amber-300',
};
const FREE_TONE = 'bg-surface text-label-tertiary ring-separator';

/**
 * Live picture of the floor: dedicated bays as tiles grouped by type, and each
 * flexible row as a strip of markers coloured by whatever is parked across them.
 */
const SpotMap = ({ spotMap, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);
  const fixed = spotMap.fixed || {};
  const rows = spotMap.rows || [];
  const fixedTypes = VEHICLE_TYPES.filter((type) => fixed[type]?.length);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (!fixedTypes.length && !rows.length) return null;

  return (
    <Card
      title="Spot map"
      actions={
        <Button tone="secondary" size="sm" icon="refresh" loading={refreshing} onClick={refresh}>
          Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        {fixedTypes.map((type) => {
          const bays = fixed[type];
          const taken = bays.filter((bay) => bay.taken).length;
          return (
            <div key={type}>
              <p className="flex items-center gap-1.5 text-footnote font-medium text-label">
                <Icon name={VEHICLE_META[type].icon} size={4} className="text-label-secondary" />
                {vehicleLabel(type)} bays
                <span className="font-normal text-label-secondary">
                  &middot; {taken} of {bays.length} taken
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bays.map((bay) => (
                  <span
                    key={bay.label}
                    title={`${bay.label} - ${bay.taken ? `booking ${bay.bookingId || '(unknown)'}` : 'free'}`}
                    className={`inline-flex h-8 items-center justify-center rounded-inner px-2 font-mono text-caption font-medium ring-1 ring-inset ${
                      bay.taken ? VEHICLE_TONE[type] : FREE_TONE
                    } ${type === 'bus' ? 'min-w-20' : type === 'car' ? 'min-w-14' : 'min-w-11'}`}
                  >
                    {bay.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {rows.length > 0 && (
          <div className={fixedTypes.length ? 'border-t border-separator pt-5' : ''}>
            <p className="text-footnote font-medium text-label">Flexible area</p>
            <div className="mt-2 space-y-3">
              {rows.map((row) => {
                const cells = row.cells || [];
                const used = cells.filter((cell) => cell.vehicleType).length;
                return (
                  <div key={row.label}>
                    <p className="text-caption text-label-secondary">
                      Row <span className="font-mono font-semibold text-label">{row.label}</span> &middot; {used} of{' '}
                      {row.units ?? cells.length} units in use
                    </p>
                    {/* Scrolls sideways rather than wrapping: a row is a line
                        on the ground, and wrapping would break that picture. */}
                    <div className="mt-1.5 overflow-x-auto pb-1">
                      <div className="flex w-max">
                        {cells.map((cell, index) => {
                          const prev = cells[index - 1];
                          const next = cells[index + 1];
                          // Cells of one booking join into a single block.
                          const joinsPrev = cell.bookingId && prev?.bookingId === cell.bookingId;
                          const joinsNext = cell.bookingId && next?.bookingId === cell.bookingId;
                          const tip = [
                            cell.label,
                            cell.vehicleType ? vehicleLabel(cell.vehicleType) : 'free',
                            cell.spotLabel,
                            cell.bookingId && `booking ${cell.bookingId}`,
                          ]
                            .filter(Boolean)
                            .join(' - ');
                          return (
                            <span
                              key={cell.index ?? index}
                              title={tip}
                              className={`grid h-9 w-7 place-items-center font-mono text-[10px] ring-1 ring-inset ${
                                cell.vehicleType ? VEHICLE_TONE[cell.vehicleType] : FREE_TONE
                              } ${joinsPrev ? '' : 'ml-0.5 rounded-l-inner'} ${joinsNext ? '' : 'rounded-r-inner'}`}
                            >
                              {(cell.index ?? index) + 1}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-separator pt-3 text-caption text-label-secondary">
        {VEHICLE_TYPES.map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded ring-1 ring-inset ${VEHICLE_TONE[type]}`} /> {vehicleLabel(type)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded ring-1 ring-inset ${FREE_TONE}`} /> Free
        </span>
      </div>
    </Card>
  );
};

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
        <EmptyState title="No reservations" />
      ) : (
        <>
          <Table headers={['Booking', 'Driver', 'Vehicle', 'Spot', 'Entry window', 'Duration', 'Amount', 'Status']}>
            {items.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-50">
                <Td className="font-mono text-caption">{booking.bookingId}</Td>
                <Td>
                  <span className="block max-w-[12rem] truncate">{booking.user?.name || '-'}</span>
                  <span className="block max-w-[12rem] truncate text-caption text-label-secondary">{booking.user?.email}</span>
                </Td>
                <Td>
                  <span className="block font-mono text-caption">{booking.vehicleNumber}</span>
                  <span className="block text-caption text-label-secondary">{vehicleLabel(booking.vehicleType)}</span>
                </Td>
                <Td>
                  <SpotTag spot={booking.spot} />
                </Td>
                <Td>
                  <span className="block text-caption">{dateTime(booking.expectedEntryTime)}</span>
                  <span className="block text-caption text-label-secondary">to {dateTime(booking.expectedExitTime)}</span>
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
        <EmptyState title="No sessions" />
      ) : (
        <>
          <Table headers={['Session', 'Vehicle', 'Driver', 'Entry', 'Booked exit', 'Parked', 'Overstay', 'Due']}>
            {items.map((session) => (
              <tr key={session.id} className={session.isOverstaying ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                <Td className="font-mono text-caption">{session.sessionId}</Td>
                <Td>
                  <span className="block font-mono text-caption">{session.vehicleNumber}</span>
                  <span className="block text-caption text-label-secondary">{vehicleLabel(session.vehicleType)}</span>
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
          <EmptyState title="No transactions" />
        ) : (
          <>
            <Table headers={['Transaction', 'Date', 'Driver', 'Booking', 'Purpose', 'Amount', 'Commission', 'Your share', 'Status']}>
              {items.map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-caption">{txn.transactionId}</Td>
                  <Td>{dateTime(txn.createdAt)}</Td>
                  <Td>
                    <span className="block max-w-[10rem] truncate">{txn.user?.name || '-'}</span>
                  </Td>
                  <Td className="font-mono text-caption">{txn.booking?.bookingId || '-'}</Td>
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
  unreadable_plate: 'bg-slate-100 text-label-secondary ring-separator',
  duplicate_event: 'bg-slate-100 text-label-secondary ring-separator',
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
        <EmptyState title="No gate events" />
      ) : (
        <>
          <Table headers={['Time', 'Gate', 'Plate read', 'Confidence', 'Result', 'Booking', 'Message']}>
            {items.map((event) => (
              <tr key={event._id} className={event.flaggedAsFraud ? 'bg-rose-50' : 'hover:bg-slate-50'}>
                <Td>{dateTime(event.createdAt)}</Td>
                <Td>
                  <Badge tone={event.eventType === 'entry' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-100 text-label-secondary ring-separator'}>
                    {statusLabel(event.eventType)}
                  </Badge>
                </Td>
                <Td className="font-mono text-caption">{event.recognizedPlate || '-'}</Td>
                <Td>{event.confidence !== undefined ? `${(event.confidence * 100).toFixed(0)}%` : '-'}</Td>
                <Td>
                  <Badge tone={RESULT_TONE[event.result]}>{statusLabel(event.result)}</Badge>
                </Td>
                <Td className="font-mono text-caption">{event.booking?.bookingId || '-'}</Td>
                <Td>
                  <span className="block max-w-[20rem] truncate text-caption text-label-secondary" title={event.message}>
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
