import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import { Alert, Badge, Card, EmptyState, Field, Input, Pagination, Spinner, StatCard, Table, Td } from '../../components/ui';
import { dateTime, statusLabel } from '../../utils/format';

const RESULT_HELP = {
  plate_mismatch: 'The plate read at the gate did not match the vehicle number on the booking.',
  no_active_session: 'A vehicle tried to exit with no open parking session.',
  no_booking: 'A vehicle arrived with no confirmed booking at that facility.',
  outside_entry_window: 'A vehicle arrived well outside its booked entry window.',
  unreadable_plate: 'The number plate could not be read with sufficient confidence.',
};

const Fraud = () => {
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [data, setData] = useState({ items: [], pagination: null, byResult: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.from) params.from = new Date(filters.from).toISOString();
      if (filters.to) params.to = new Date(`${filters.to}T23:59:59`).toISOString();
      setData(await adminApi.fraud(params));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const byResult = data.byResult || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Fraud and security report</h1>
        <p className="text-sm text-ink-500">
          Gate events the system flagged for human review. Every camera capture is recorded, whether or not the barrier opened.
        </p>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Flagged events" value={data.pagination?.total ?? 0} tone={data.pagination?.total ? 'negative' : 'positive'} />
        <StatCard label="Plate mismatches" value={byResult.plate_mismatch || 0} tone={byResult.plate_mismatch ? 'negative' : 'default'} />
        <StatCard label="Exits with no session" value={byResult.no_active_session || 0} tone={byResult.no_active_session ? 'warning' : 'default'} />
        <StatCard label="Unbooked arrivals" value={byResult.no_booking || 0} />
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card padded={false} title="Flagged gate events">
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="Nothing flagged"
            description="No vehicle mismatches or suspicious gate events were recorded in this period."
            icon="&#9989;"
          />
        ) : (
          <>
            <Table headers={['Time', 'Facility', 'Gate', 'Plate read', 'Booked plate', 'Similarity', 'Result', 'Detail']}>
              {data.items.map((event) => (
                <tr key={event._id} className="hover:bg-slate-50">
                  <Td>{dateTime(event.createdAt)}</Td>
                  <Td>
                    <span className="block max-w-[13rem] truncate">{event.parkingLot?.name || '-'}</span>
                    <span className="block text-xs text-ink-500">{event.parkingLot?.location?.city}</span>
                  </Td>
                  <Td>{statusLabel(event.eventType)}</Td>
                  <Td className="font-mono text-xs font-semibold text-rose-700">{event.recognizedPlate || 'UNREADABLE'}</Td>
                  <Td className="font-mono text-xs">{event.matchDetail?.bookedPlate || event.booking?.vehicleNumber || '-'}</Td>
                  <Td>
                    {event.matchDetail?.similarity !== undefined ? `${(event.matchDetail.similarity * 100).toFixed(0)}%` : '-'}
                  </Td>
                  <Td>
                    <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">{statusLabel(event.result)}</Badge>
                  </Td>
                  <Td>
                    <span className="block max-w-[20rem] truncate text-xs text-ink-500" title={event.message}>
                      {event.message}
                    </span>
                    {event.booking?.bookingId && (
                      <span className="block font-mono text-xs text-ink-500">{event.booking.bookingId}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>

      <Card title="What these results mean">
        <dl className="space-y-2 text-sm">
          {Object.entries(RESULT_HELP).map(([key, description]) => (
            <div key={key} className="flex flex-wrap items-baseline gap-2">
              <dt>
                <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">{statusLabel(key)}</Badge>
              </dt>
              <dd className="flex-1 text-ink-500">{description}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
};

export default Fraud;
