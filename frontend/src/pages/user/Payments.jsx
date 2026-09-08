import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { paymentApi } from '../../api/endpoints';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  StatCard,
  Table,
  Td,
} from '../../components/ui';
import { dateTime, money, statusLabel } from '../../utils/format';

const PURPOSE_LABEL = { booking: 'Pre-booking', overstay: 'Overstay', final: 'Final settlement' };

const Payments = () => {
  const [filters, setFilters] = useState({ purpose: '', status: '' });
  const [data, setData] = useState({ items: [], pagination: null });
  const [dues, setDues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (filters.purpose) params.purpose = filters.purpose;
      if (filters.status) params.status = filters.status;
      const [history, duesData] = await Promise.all([paymentApi.mine(params), paymentApi.dues()]);
      setData(history);
      setDues(duesData);
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

  const totalPaid = data.items.filter((txn) => txn.status === 'paid').reduce((sum, txn) => sum + txn.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Driver"
        title="Payment history"
        subtitle="Every transaction on your account, including overstay charges."
      />

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Transactions on this page" value={data.pagination?.total ?? data.items.length} />
        <StatCard label="Paid on this page" value={money(totalPaid)} tone="positive" />
        <StatCard
          label="Outstanding"
          value={money(dues?.totalDue || 0)}
          tone={dues?.totalDue > 0 ? 'negative' : 'positive'}
          hint={dues?.count ? `${dues.count} session(s) to settle` : 'All settled'}
        />
      </div>

      <Card
        padded={false}
        title="Transactions"
        actions={
          <div className="flex flex-wrap gap-2">
            <Field className="w-44">
              <Select value={filters.purpose} onChange={(event) => setFilters((prev) => ({ ...prev, purpose: event.target.value }))}>
                <option value="">All purposes</option>
                <option value="booking">Pre-booking</option>
                <option value="overstay">Overstay</option>
              </Select>
            </Field>
            <Field className="w-40">
              <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="created">Pending</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No transactions" description="Payments you make will be listed here." />
        ) : (
          <>
            <Table headers={['Transaction ID', 'Date', 'Facility', 'Booking', 'Purpose', 'Amount', 'Status']}>
              {data.items.map((txn) => (
                <tr key={txn.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-caption">{txn.transactionId}</Td>
                  <Td>{dateTime(txn.createdAt)}</Td>
                  <Td>
                    <span className="block max-w-[14rem] truncate">{txn.parkingLot?.name || '-'}</span>
                  </Td>
                  <Td className="font-mono text-caption">{txn.booking?.bookingId || '-'}</Td>
                  <Td>{PURPOSE_LABEL[txn.purpose] || statusLabel(txn.purpose)}</Td>
                  <Td className="font-medium tabular-nums text-label">{money(txn.amount)}</Td>
                  <Td>
                    <Badge status={txn.status} />
                    {txn.failureReason && (
                      <span className="mt-0.5 block max-w-[12rem] truncate text-caption text-rose-600" title={txn.failureReason}>
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

export default Payments;
