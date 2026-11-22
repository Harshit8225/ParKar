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
  KeyValue,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
} from '../../components/ui';
import { dateOnly, dateTime, money } from '../../utils/format';

const ROLE_LABEL = { user: 'Driver', owner: 'Parking owner', admin: 'Administrator' };

const Users = () => {
  const [filters, setFilters] = useState({ role: '', isActive: '', q: '' });
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (filters.role) params.role = filters.role;
      if (filters.isActive) params.isActive = filters.isActive;
      if (filters.q.trim()) params.q = filters.q.trim();
      setData(await adminApi.users(params));
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

  const toggleActive = async (user) => {
    setBusyId(user.id);
    setError('');
    try {
      await adminApi.setUserStatus(user.id, !user.isActive);
      setNotice(`${user.name} was ${user.isActive ? 'deactivated' : 'activated'}.`);
      load(data.pagination?.page || 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId('');
    }
  };

  const openDetail = async (user) => {
    setDetailLoading(true);
    setDetail({ user });
    try {
      setDetail(await adminApi.userDetail(user.id));
    } catch (err) {
      setError(errorMessage(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform admin" title="User management" />

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Role">
            <Select value={filters.role} onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="">All roles</option>
              <option value="user">Drivers</option>
              <option value="owner">Parking owners</option>
              <option value="admin">Administrators</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={filters.isActive} onChange={(event) => setFilters((prev) => ({ ...prev, isActive: event.target.value }))}>
              <option value="">All accounts</option>
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </Select>
          </Field>
          <Field label="Search by name, email or phone">
            <Input value={filters.q} onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card padded={false}>
        {loading ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <>
            <Table headers={['Name', 'Email', 'Role', 'Activity', 'Joined', 'Last login', 'Status', 'Actions']}>
              {data.items.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-label">{user.name}</Td>
                  <Td>
                    <span className="block max-w-[14rem] truncate">{user.email}</span>
                    {user.phone && <span className="block text-caption text-label-secondary">{user.phone}</span>}
                  </Td>
                  <Td>{ROLE_LABEL[user.role]}</Td>
                  <Td>
                    {user.role === 'owner'
                      ? `${user.lotCount ?? 0} facilit${user.lotCount === 1 ? 'y' : 'ies'}`
                      : user.role === 'user'
                        ? `${user.bookingCount ?? 0} bookings · ${money(user.totalSpend || 0)}`
                        : '-'}
                  </Td>
                  <Td>{dateOnly(user.createdAt)}</Td>
                  <Td>{user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Never'}</Td>
                  <Td>
                    <Badge tone={user.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button size="sm" tone="secondary" onClick={() => openDetail(user)}>
                        View
                      </Button>
                      {user.role !== 'admin' && (
                        <Button
                          size="sm"
                          tone={user.isActive ? 'danger' : 'success'}
                          loading={busyId === user.id}
                          onClick={() => toggleActive(user)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination pagination={data.pagination} onChange={load} />
          </>
        )}
      </Card>

      <Modal open={Boolean(detail)} title="User details" onClose={() => setDetail(null)}>
        {detailLoading ? (
          <Spinner />
        ) : detail ? (
          <div className="space-y-5">
            <KeyValue
              rows={[
                { label: 'Name', value: detail.user.name },
                { label: 'Email', value: detail.user.email },
                { label: 'Phone', value: detail.user.phone },
                { label: 'Role', value: ROLE_LABEL[detail.user.role] },
                { label: 'Status', value: detail.user.isActive ? 'Active' : 'Deactivated' },
                { label: 'Joined', value: dateOnly(detail.user.createdAt) },
                { label: 'Last login', value: detail.user.lastLoginAt ? dateTime(detail.user.lastLoginAt) : 'Never' },
              ]}
            />

            {detail.ownerProfile && (
              <div className="border-t border-separator pt-4">
                <p className="mb-2 eyebrow text-label-tertiary">Business</p>
                <KeyValue
                  rows={[
                    { label: 'Business name', value: detail.ownerProfile.businessName },
                    { label: 'GST', value: detail.ownerProfile.gstNumber },
                    { label: 'Verified', value: detail.ownerProfile.isVerified ? 'Yes' : 'No' },
                    { label: 'Address', value: detail.ownerProfile.address },
                  ]}
                />
              </div>
            )}

            {detail.lots?.length > 0 && (
              <div className="border-t border-separator pt-4">
                <p className="mb-2 eyebrow text-label-tertiary">Facilities</p>
                <ul className="space-y-1.5 text-footnote">
                  {detail.lots.map((lot) => (
                    <li key={lot.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{lot.name}</span>
                      <Badge status={lot.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.recentBookings?.length > 0 && (
              <div className="border-t border-separator pt-4">
                <p className="mb-2 eyebrow text-label-tertiary">Recent bookings</p>
                <ul className="space-y-1.5 text-footnote">
                  {detail.recentBookings.map((booking) => (
                    <li key={booking._id} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        <span className="font-mono text-caption">{booking.bookingId}</span> &middot; {booking.parkingLot?.name}
                      </span>
                      <Badge status={booking.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default Users;
