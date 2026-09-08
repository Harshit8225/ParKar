import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  KeyValue,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
} from '../../components/ui';
import { dateOnly, money, percent } from '../../utils/format';

const STATUSES = [
  { value: '', label: 'All facilities' },
  { value: 'pending', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'deactivated', label: 'Deactivated' },
];

/** Which actions make sense for a facility in a given state. */
const decisionsFor = (status) =>
  ({
    pending: [
      { value: 'approve', label: 'Approve', tone: 'success' },
      { value: 'reject', label: 'Reject', tone: 'danger' },
    ],
    approved: [{ value: 'deactivate', label: 'Deactivate', tone: 'danger' }],
    rejected: [{ value: 'approve', label: 'Approve', tone: 'success' }],
    deactivated: [{ value: 'reactivate', label: 'Reactivate', tone: 'success' }],
  })[status] || [];

const Facilities = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    city: '',
    q: '',
  });
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ decision: '', reason: '', commissionPercent: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (filters.status) params.status = filters.status;
      if (filters.city.trim()) params.city = filters.city.trim();
      if (filters.q.trim()) params.q = filters.q.trim();
      setData(await adminApi.lots(params));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // Keep the status filter in the URL so the dashboard can deep-link to it.
    setSearchParams(filters.status ? { status: filters.status } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const openReview = (lot, decision) => {
    setReview(lot);
    setReviewForm({ decision, reason: '', commissionPercent: lot.commissionPercent ?? '' });
  };

  const submitReview = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = { decision: reviewForm.decision };
      if (reviewForm.reason.trim()) payload.reason = reviewForm.reason.trim();
      if (reviewForm.decision === 'approve' && reviewForm.commissionPercent !== '') {
        payload.commissionPercent = Number(reviewForm.commissionPercent);
      }
      await adminApi.reviewLot(review.id, payload);
      setNotice(`${review.name} was ${reviewForm.decision}d.`);
      setReview(null);
      load(data.pagination?.page || 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform admin" title="Parking facilities" subtitle="Approve new facilities, and deactivate ones that must stop taking bookings." />

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City">
            <Input
              value={filters.city}
              onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
              placeholder="Bengaluru"
            />
          </Field>
          <Field label="Search by name or address">
            <Input value={filters.q} onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No facilities found" description="Adjust the filters to see more." />
        ) : (
          <>
            <Table headers={['Facility', 'Owner', 'City', 'Capacity', 'Occupancy', 'Commission', 'Status', 'Actions']}>
              {data.items.map((lot) => (
                <tr key={lot.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="block max-w-[15rem] truncate font-medium text-label">{lot.name}</span>
                    <span className="block max-w-[15rem] truncate text-caption text-label-secondary">{lot.location.address}</span>
                  </Td>
                  <Td>
                    <span className="block max-w-[11rem] truncate">{lot.owner?.name || '-'}</span>
                    <span className="block max-w-[11rem] truncate text-caption text-label-secondary">{lot.owner?.email}</span>
                  </Td>
                  <Td>{lot.location.city}</Td>
                  <Td>
                    {lot.capacity.two_wheeler} 2W / {lot.capacity.four_wheeler} 4W
                  </Td>
                  <Td>{percent((lot.occupancyRate || 0) * 100, 0)}</Td>
                  <Td>{lot.commissionPercent !== undefined ? `${lot.commissionPercent}%` : 'Default'}</Td>
                  <Td>
                    <Badge status={lot.status} />
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {decisionsFor(lot.status).map((action) => (
                        <Button key={action.value} size="sm" tone={action.tone} onClick={() => openReview(lot, action.value)}>
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(review)}
        title={`${reviewForm.decision ? reviewForm.decision.charAt(0).toUpperCase() + reviewForm.decision.slice(1) : 'Review'} facility`}
        onClose={() => setReview(null)}
        footer={
          <>
            <Button tone="secondary" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              tone={reviewForm.decision === 'reject' || reviewForm.decision === 'deactivate' ? 'danger' : 'success'}
              loading={submitting}
              onClick={submitReview}
            >
              Confirm
            </Button>
          </>
        }
      >
        {review && (
          <div className="space-y-4">
            <KeyValue
              rows={[
                { label: 'Facility', value: review.name },
                { label: 'Owner', value: `${review.owner?.name} (${review.owner?.email})` },
                { label: 'Address', value: `${review.location.address}, ${review.location.city}` },
                { label: 'Capacity', value: `${review.capacity.two_wheeler} two-wheeler, ${review.capacity.four_wheeler} four-wheeler` },
                {
                  label: 'Rates',
                  value: `${money(review.hourlyRate.two_wheeler)} 2W / ${money(review.hourlyRate.four_wheeler)} 4W per hour`,
                },
                {
                  label: 'Hours',
                  value: review.operatingHours.is24x7
                    ? '24/7'
                    : `${review.operatingHours.openTime} - ${review.operatingHours.closeTime}`,
                },
                { label: 'Registered', value: dateOnly(review.createdAt) },
                { label: 'EV charging', value: review.amenities.evCharging ? 'Yes' : 'No' },
              ]}
            />

            {reviewForm.decision === 'approve' && (
              <Field
                label="Platform commission for this facility (%)"
                hint="Leave blank to use the platform default."
              >
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={reviewForm.commissionPercent}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, commissionPercent: event.target.value }))}
                />
              </Field>
            )}

            <Field
              label="Note"
              hint={
                reviewForm.decision === 'reject' || reviewForm.decision === 'deactivate'
                  ? 'The owner sees this reason on their facility page.'
                  : 'Optional.'
              }
            >
              <Input
                value={reviewForm.reason}
                onChange={(event) => setReviewForm((prev) => ({ ...prev, reason: event.target.value }))}
                maxLength={300}
              />
            </Field>

            {reviewForm.decision === 'deactivate' && (
              <Alert kind="warning">
                Deactivation is refused while vehicles are still parked at this facility.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Facilities;
