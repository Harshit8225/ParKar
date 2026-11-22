import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  Table,
  Td,
} from '../../components/ui';
import { dateTime, duration, money, statusLabel } from '../../utils/format';

/** How often the live view refreshes itself while the page is open. */
const REFRESH_MS = 30000;

const Activity = () => {
  const [data, setData] = useState({ items: [], pagination: null, flaggedEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (targetPage = 1, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await adminApi.activity({ page: targetPage, limit: 20 });
      setData(result);
      setPage(targetPage);
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  // Poll quietly so the table does not flash a spinner every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => load(page, true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, page]);

  const overstaying = data.items.filter((item) => item.isOverstaying).length;
  const totalDue = data.items.reduce((sum, item) => sum + (item.amountDue || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow="Platform admin" title="Live parking activity" subtitle={lastUpdated && `Updated ${dateTime(lastUpdated)}`} />
        <Button tone="secondary" onClick={() => load(page)}>
          Refresh now
        </Button>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Vehicles parked" value={data.pagination?.total ?? data.items.length} tone="brand" />
        <StatCard label="Currently overstaying" value={overstaying} tone={overstaying > 0 ? 'warning' : 'default'} />
        <StatCard label="Unpaid on this page" value={money(totalDue)} tone={totalDue > 0 ? 'negative' : 'positive'} />
      </div>

      <Card padded={false} title="Vehicles inside">
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No vehicles parked" />
        ) : (
          <>
            <Table headers={['Session', 'Vehicle', 'Facility', 'Driver', 'Entered', 'Booked exit', 'Parked', 'State']}>
              {data.items.map((item) => (
                <tr key={item.sessionId} className={item.isOverstaying ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                  <Td className="font-mono text-caption">{item.sessionId}</Td>
                  <Td className="font-mono text-caption">{item.vehicleNumber}</Td>
                  <Td>
                    <span className="block max-w-[13rem] truncate">{item.parkingLot}</span>
                    <span className="block text-caption text-label-secondary">{item.city}</span>
                  </Td>
                  <Td>
                    <span className="block max-w-[11rem] truncate">{item.user?.name || '-'}</span>
                  </Td>
                  <Td>{dateTime(item.actualEntryTime)}</Td>
                  <Td>{dateTime(item.expectedExitTime)}</Td>
                  <Td>{duration(item.parkedMinutes)}</Td>
                  <Td>
                    {item.isOverstaying ? (
                      <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Overstaying</Badge>
                    ) : (
                      <Badge status={item.status} />
                    )}
                    {item.amountDue > 0 && (
                      <span className="ml-1 text-caption font-medium text-rose-600">{money(item.amountDue)} due</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>

      {data.flaggedEvents?.length > 0 && (
        <Card padded={false} title="Recently flagged gate events">
          <Table headers={['Time', 'Facility', 'Gate', 'Plate read', 'Result', 'Message']}>
            {data.flaggedEvents.map((event) => (
              <tr key={event._id} className="bg-rose-50">
                <Td>{dateTime(event.createdAt)}</Td>
                <Td>
                  <span className="block max-w-[13rem] truncate">{event.parkingLot?.name || '-'}</span>
                </Td>
                <Td>{statusLabel(event.eventType)}</Td>
                <Td className="font-mono text-caption">{event.recognizedPlate || '-'}</Td>
                <Td>
                  <Badge tone="bg-rose-100 text-rose-700 ring-rose-200">{statusLabel(event.result)}</Badge>
                </Td>
                <Td>
                  <span className="block max-w-[22rem] truncate text-caption text-label-secondary" title={event.message}>
                    {event.message}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
};

export default Activity;
