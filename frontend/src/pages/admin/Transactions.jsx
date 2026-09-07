import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { adminApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
  StatCard,
  Table,
  Td,
} from '../../components/ui';
import { dateTime, money, statusLabel } from '../../utils/format';

const Transactions = () => {
  const [filters, setFilters] = useState({ status: '', purpose: '', from: '', to: '' });
  const [data, setData] = useState({ items: [], pagination: null, summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [commission, setCommission] = useState('');
  const [savingCommission, setSavingCommission] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.status) params.status = filters.status;
      if (filters.purpose) params.purpose = filters.purpose;
      if (filters.from) params.from = new Date(filters.from).toISOString();
      if (filters.to) params.to = new Date(`${filters.to}T23:59:59`).toISOString();
      setData(await adminApi.transactions(params));
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

  const applyCommission = async () => {
    if (commission === '') return;
    setSavingCommission(true);
    setError('');
    try {
      const result = await adminApi.setCommission({ commissionPercent: Number(commission) });
      setNotice(
        result.scope === 'platform'
          ? `Cleared ${result.overridesCleared} per-facility override(s). ${result.note}`
          : 'Commission updated.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingCommission(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Transactions</h1>
        <p className="text-sm text-ink-500">Every payment on the platform, with the commission split recorded at capture time.</p>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="info" onDismiss={() => setNotice('')}>{notice}</Alert>}

      {data.summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Gross collected" value={money(data.summary.gross)} tone="brand" />
          <StatCard label="Platform commission" value={money(data.summary.platformCommission)} tone="positive" />
          <StatCard label="Owner payouts" value={money(data.summary.ownerPayouts)} />
        </div>
      )}

      <Card title="Platform commission" subtitle="Clearing per-facility overrides makes every facility fall back to the platform default.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Commission percent" className="w-52">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
              placeholder="10"
            />
          </Field>
          <Button tone="secondary" loading={savingCommission} onClick={applyCommission} disabled={commission === ''}>
            Clear per-facility overrides
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          The platform-wide default itself is set with the <code>PLATFORM_COMMISSION_PERCENT</code> environment variable.
          Per-facility rates are set when approving a facility.
        </p>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="created">Pending</option>
              <option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Purpose">
            <Select value={filters.purpose} onChange={(event) => setFilters((prev) => ({ ...prev, purpose: event.target.value }))}>
              <option value="">All purposes</option>
              <option value="booking">Pre-booking</option>
              <option value="overstay">Overstay</option>
              <option value="final">Final settlement</option>
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No transactions" description="Adjust the filters to see more." />
        ) : (
          <>
            <Table
              headers={['Transaction', 'Date', 'Driver', 'Facility', 'Booking', 'Purpose', 'Amount', 'Commission', 'Payout', 'Status']}
            >
              {data.items.map((txn) => (
                <tr key={txn._id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{txn.transactionId}</Td>
                  <Td>{dateTime(txn.createdAt)}</Td>
                  <Td>
                    <span className="block max-w-[10rem] truncate">{txn.user?.name || '-'}</span>
                  </Td>
                  <Td>
                    <span className="block max-w-[12rem] truncate">{txn.parkingLot?.name || '-'}</span>
                  </Td>
                  <Td className="font-mono text-xs">{txn.booking?.bookingId || '-'}</Td>
                  <Td>{statusLabel(txn.purpose)}</Td>
                  <Td className="font-medium">{money(txn.amount)}</Td>
                  <Td className="text-emerald-700">{money(txn.settlement?.platformCommission)}</Td>
                  <Td>{money(txn.settlement?.ownerEarning)}</Td>
                  <Td>
                    <Badge status={txn.status} />
                    {txn.failureReason && (
                      <span className="mt-0.5 block max-w-[10rem] truncate text-xs text-rose-600" title={txn.failureReason}>
                        {txn.failureReason}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>
    </div>
  );
};

export default Transactions;
