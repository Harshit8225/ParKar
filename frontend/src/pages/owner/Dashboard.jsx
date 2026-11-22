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
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  LinkButton,
  Meter,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  Td,
} from '../../components/ui';
import { axisTick, gridStroke, series, tooltipLabelStyle, tooltipStyle } from '../../utils/chartTheme';
import { duration, money, offeredVehicleTypes, percent, vehicleCounts } from '../../utils/format';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

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
      <PageHeader
        eyebrow="Parking owner"
        title="Facility analytics"
        subtitle={`Across ${data.lotCount} facilit${data.lotCount === 1 ? 'y' : 'ies'}.`}
        actions={
          <Field label="Period" className="w-48">
            <Select value={range} onChange={(event) => setRange(event.target.value)}>
              {RANGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        }
      />

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      {data.lotCount === 0 ? (
        <Card>
          <EmptyState
            title="No facilities yet"
            action={
              <LinkButton to="/owner/lots/new" icon="plus">Register a facility</LinkButton>
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
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} tickFormatter={(value) => value.slice(5)} />
                    <YAxis tick={axisTick} />
                    <Tooltip
                      formatter={(value, name) => (name === 'revenue' ? money(value) : value)}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                    />
                    <Line type="monotone" dataKey="revenue" stroke={series[0]} strokeWidth={2} dot={false} name="revenue" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Entries by hour">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHours} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="hour" tick={axisTick} interval={3} />
                    <YAxis tick={axisTick} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(hour) => `${String(hour).padStart(2, '0')}:00`}
                      contentStyle={tooltipStyle}
                      labelStyle={tooltipLabelStyle}
                    />
                    <Bar dataKey="entries" fill={series[0]} radius={[3, 3, 0, 0]} name="entries" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Earnings summary" className="lg:col-span-1">
              <dl className="space-y-3 text-footnote">
                {[
                  ['Gross revenue (all time)', money(revenue.allTime.gross)],
                  ['Platform commission', money(revenue.allTime.platformCommission)],
                  ['Your earnings', money(revenue.allTime.ownerEarning)],
                  ['Transactions', revenue.allTime.transactionCount],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-b border-separator pb-2 last:border-0">
                    <dt className="text-label-secondary">{label}</dt>
                    <dd className="font-semibold tabular-nums text-label">{value}</dd>
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
              <Table headers={['Facility', 'Status', 'Occupancy', 'Free now (up to)', '']}>
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="block max-w-[16rem] truncate font-medium">{lot.name}</span>
                    </Td>
                    <Td>
                      <Badge status={lot.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Meter value={lot.occupancyRate} className="w-16" />
                        <span className="text-caption tabular-nums">{percent(lot.occupancyRate, 0)}</span>
                      </div>
                    </Td>
                    <Td className="tabular-nums text-caption">
                      {vehicleCounts(lot.available, { types: offeredVehicleTypes(lot) })}
                    </Td>
                    <Td>
                      <Link to={`/owner/lots/${lot.id}`} className="tap rounded-capsule px-2.5 py-1 text-footnote font-medium text-brand-700 hover:bg-brand-50">
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
