import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { parkingApi } from '../../api/endpoints';
import { Alert, Badge, Card, EmptyState, Field, Pagination, Select, Spinner, Table, Td } from '../../components/ui';
import { money, percent } from '../../utils/format';

const STATUSES = [
  { value: '', label: 'All facilities' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Awaiting approval' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'deactivated', label: 'Deactivated' },
];

const MyLots = () => {
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      if (status) params.status = status;
      setData(await parkingApi.myLots(params));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">My parking facilities</h1>
          <p className="text-sm text-ink-500">Capacity, rates and approval status for each facility you run.</p>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Filter" className="w-48">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Link to="/owner/lots/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Register facility
          </Link>
        </div>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No facilities to show"
            description={status ? 'No facilities have this status.' : 'Register a facility to start accepting bookings.'}
            action={
              <Link to="/owner/lots/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Register facility
              </Link>
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          <Table headers={['Facility', 'City', 'Status', 'Capacity (2W / 4W)', 'Rates (2W / 4W)', 'Occupancy', 'Hours', '']}>
            {data.items.map((lot) => (
              <tr key={lot.id} className="hover:bg-slate-50">
                <Td>
                  <span className="block max-w-[16rem] truncate font-medium text-ink-900">{lot.name}</span>
                  <span className="block max-w-[16rem] truncate text-xs text-ink-500">{lot.location.address}</span>
                </Td>
                <Td>{lot.location.city}</Td>
                <Td>
                  <Badge status={lot.status} />
                  {lot.statusReason && (
                    <span className="mt-0.5 block max-w-[12rem] truncate text-xs text-ink-500" title={lot.statusReason}>
                      {lot.statusReason}
                    </span>
                  )}
                </Td>
                <Td>
                  {lot.capacity.two_wheeler} / {lot.capacity.four_wheeler}
                </Td>
                <Td>
                  {money(lot.hourlyRate.two_wheeler)} / {money(lot.hourlyRate.four_wheeler)}
                </Td>
                <Td>{percent((lot.occupancyRate || 0) * 100, 0)}</Td>
                <Td>{lot.operatingHours.is24x7 ? '24/7' : `${lot.operatingHours.openTime}-${lot.operatingHours.closeTime}`}</Td>
                <Td>
                  <Link to={`/owner/lots/${lot.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    Manage
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination pagination={data.pagination} onChange={load} />
        </Card>
      )}
    </div>
  );
};

export default MyLots;
