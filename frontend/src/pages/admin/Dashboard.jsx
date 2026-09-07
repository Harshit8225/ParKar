import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { errorMessage } from '../../api/client';
import { analyticsApi } from '../../api/endpoints';
import { Alert, Card, Field, Select, Spinner, StatCard, Table, Td } from '../../components/ui';
import { duration, money, percent } from '../../utils/format';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
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
      .platform({ range })
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <Spinner label="Loading platform analytics..." />;
  if (error && !data) return <Alert kind="error">{error}</Alert>;
  if (!data) return null;

  const { users, facilities, occupancy, revenue, bookings, dailySeries, peakHours, topLots, duration: durationStats, security } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Platform overview</h1>
          <p className="text-sm text-ink-500">Activity across every facility and account on the platform.</p>
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

      {data.pendingApprovals > 0 && (
        <Alert kind="warning">
          {data.pendingApprovals} parking facilit{data.pendingApprovals === 1 ? 'y is' : 'ies are'} waiting for approval.{' '}
          <Link to="/admin/facilities?status=pending" className="font-medium underline">
            Review now
          </Link>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Drivers" value={users.drivers} />
        <StatCard label="Parking owners" value={users.owners} />
        <StatCard label="Facilities" value={facilities.approved || 0} hint={`${data.pendingApprovals} pending`} />
        <StatCard label={`Gross revenue (${range})`} value={money(revenue.window.gross)} tone="brand" />
        <StatCard label="Platform commission" value={money(revenue.window.platformCommission)} tone="positive" />
        <StatCard label="Vehicles parked now" value={data.activeSessions} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Revenue and commission" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={chartAxis} tickFormatter={(value) => value.slice(5)} />
                <YAxis tick={chartAxis} />
                <Tooltip formatter={(value) => money(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="revenue" stroke="#1f43ec" strokeWidth={2} dot={false} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Platform totals">
          <dl className="space-y-2.5 text-sm">
            {[
              ['Gross revenue (all time)', money(revenue.allTime.gross)],
              ['Commission earned', money(revenue.allTime.platformCommission)],
              ['Owner payouts', money(revenue.allTime.ownerEarning)],
              ['Transactions', revenue.allTime.transactionCount],
              ['Bookings in period', bookings.total],
              ['Average parking time', duration(durationStats.averageParkedMinutes)],
              ['Overstay rate', percent(durationStats.overstayRate, 1)],
              ['Platform occupancy', percent(occupancy.occupancyRate)],
              ['Free slots now', occupancy.totalAvailable],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-semibold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Arrivals by hour" subtitle="When vehicles enter facilities platform-wide">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHours} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="hour" tick={chartAxis} interval={2} />
                <YAxis tick={chartAxis} allowDecimals={false} />
                <Tooltip labelFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="entries" fill="#598bff" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top earning facilities" padded={false}>
          <Table headers={['Facility', 'City', 'Revenue', 'Transactions']}>
            {topLots.length === 0 ? (
              <tr>
                <Td className="text-ink-500" >No revenue recorded in this period.</Td>
              </tr>
            ) : (
              topLots.map((lot) => (
                <tr key={lot.lotId}>
                  <Td>
                    <span className="block max-w-[14rem] truncate font-medium">{lot.name}</span>
                  </Td>
                  <Td>{lot.city}</Td>
                  <Td className="font-medium">{money(lot.revenue)}</Td>
                  <Td>{lot.transactions}</Td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      </div>

      {security.flaggedRecognitionEvents > 0 && (
        <Alert kind="warning">
          {security.flaggedRecognitionEvents} gate event(s) were flagged as possible vehicle mismatches in this period.{' '}
          <Link to="/admin/fraud" className="font-medium underline">
            Open the fraud report
          </Link>
        </Alert>
      )}
    </div>
  );
};

export default Dashboard;
