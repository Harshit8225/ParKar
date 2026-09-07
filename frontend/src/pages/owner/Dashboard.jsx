import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { errorMessage } from '../../api/client';
import { analyticsApi } from '../../api/endpoints';
import { Alert, Badge, Card, EmptyState, Field, Select, Spinner, StatCard, Table, Td } from '../../components/ui';
import { duration, money, percent } from '../../utils/format';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const chartAxis = { stroke: '#94a3b8', fontSize: 11 };

const Dashboard = () => {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    analyticsApi
      .owner({ range })
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <Spinner label="Loading your analytics..." />;
  if (error && !data) return <Alert kind="error">{error}</Alert>;
  if (!data) return null;

  const { occupancy, revenue, duration: durationStats, bookings, dailySeries, peakHours, lots, security } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Facility analytics</h1>
          <p className="text-sm text-ink-500">
            Across {data.lotCount} facilit{data.lotCount === 1 ? 'y' : 'ies'}.
          </p>
        </div>
        <Field label="Period" className="w-48">
          <Select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      {data.lotCount === 0 ? (
        <Card>
          <EmptyState
            title="No facilities yet"
            description="Register your first parking facility. A platform administrator will review and approve it."
            action={
              <Link to="/owner/lots/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Register a facility
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Current occupancy" value={percent(occupancy.occupancyRate)} tone="brand" />
            <StatCard label="Vehicles parked" value={occupancy.vehiclesParked} hint={`${occupancy.totalReserved} reserved`} />
            <StatCard label="Available slots" value={occupancy.totalAvailable} hint={`of ${occupancy.totalCapacity}`} tone="positive" />
            <StatCard label={`Revenue (${range})`} value={money(revenue.window.gross)} hint={`${money(revenue.window.ownerEarning)} after commission`} />
            <StatCard label="Reservations" value={bookings.total} hint={`${bookings.byStatus?.confirmed || 0} awaiting entry`} />
            <StatCard label="Avg. parking time" value={duration(durationStats.averageParkedMinutes)} hint={`${percent(durationStats.overstayRate, 0)} overstayed`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Revenue over time" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySeries} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={chartAxis} tickFormatter={(value) => value.slice(5)} />
                    <YAxis tick={chartAxis} />
                    <Tooltip
                      formatter={(value, name) => (name === 'revenue' ? money(value) : value)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#1f43ec" strokeWidth={2} dot={false} name="revenue" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Entries by hour" subtitle="When vehicles actually arrive">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHours} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="hour" tick={chartAxis} interval={3} />
                    <YAxis tick={chartAxis} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="entries" fill="#598bff" radius={[3, 3, 0, 0]} name="entries" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Earnings summary" className="lg:col-span-1">
              <dl className="space-y-3 text-sm">
                {[
                  ['Gross revenue (all time)', money(revenue.allTime.gross)],
                  ['Platform commission', money(revenue.allTime.platformCommission)],
                  ['Your earnings', money(revenue.allTime.ownerEarning)],
                  ['Transactions', revenue.allTime.transactionCount],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="font-semibold text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {security.flaggedRecognitionEvents > 0 && (
                <Alert kind="warning">
                  {security.flaggedRecognitionEvents} gate event(s) were flagged for review in this period.
                </Alert>
              )}
            </Card>

            <Card title="Your facilities" className="lg:col-span-2" padded={false}>
              <Table headers={['Facility', 'Status', 'Occupancy', 'Free (2W / 4W)', '']}>
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="block max-w-[16rem] truncate font-medium">{lot.name}</span>
                    </Td>
                    <Td>
                      <Badge status={lot.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`block h-full rounded-full ${
                              lot.occupancyRate > 85 ? 'bg-rose-500' : lot.occupancyRate > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, lot.occupancyRate)}%` }}
                          />
                        </span>
                        <span className="text-xs">{percent(lot.occupancyRate, 0)}</span>
                      </div>
                    </Td>
                    <Td>
                      {lot.available.two_wheeler} / {lot.available.four_wheeler}
                    </Td>
                    <Td>
                      <Link to={`/owner/lots/${lot.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        Manage
                      </Link>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
