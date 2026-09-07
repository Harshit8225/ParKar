import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { authApi, usersApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { dateOnly } from '../../utils/format';

const BusinessProfile = () => {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    usersApi
      .ownerProfile()
      .then(setProfile)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving('profile');
    setError('');
    setNotice('');
    try {
      const updated = await usersApi.updateOwnerProfile({
        businessName: profile.businessName,
        contactEmail: profile.contactEmail || undefined,
        contactPhone: profile.contactPhone || undefined,
        gstNumber: profile.gstNumber || undefined,
        address: profile.address || undefined,
        payoutDetails: {
          accountHolder: profile.payoutDetails?.accountHolder || undefined,
          accountNumberLast4: profile.payoutDetails?.accountNumberLast4 || undefined,
          ifsc: profile.payoutDetails?.ifsc || undefined,
        },
      });
      setProfile(updated);
      setNotice('Business profile updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving('');
    }
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setSaving('account');
    setError('');
    setNotice('');
    try {
      await authApi.updateProfile({ name: account.name, phone: account.phone || undefined });
      await refreshUser();
      setNotice('Account details updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving('');
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    setSaving('password');
    setError('');
    setNotice('');
    try {
      await authApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice('Password changed. Other sessions have been signed out.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving('');
    }
  };

  if (loading) return <Spinner label="Loading your profile..." />;

  const patchProfile = (field) => (event) => setProfile((prev) => ({ ...prev, [field]: event.target.value }));
  const patchPayout = (field) => (event) =>
    setProfile((prev) => ({ ...prev, payoutDetails: { ...prev.payoutDetails, [field]: event.target.value } }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Business profile</h1>
        <p className="text-sm text-ink-500">Your operator details, payout information and account settings.</p>
      </div>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      {profile && (
        <Card
          title="Operator details"
          actions={
            profile.isVerified ? (
              <Badge status="approved">Verified {profile.verifiedAt ? dateOnly(profile.verifiedAt) : ''}</Badge>
            ) : (
              <Badge status="pending">Awaiting verification</Badge>
            )
          }
        >
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Business name" required>
              <Input value={profile.businessName || ''} onChange={patchProfile('businessName')} required minLength={2} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact email">
                <Input type="email" value={profile.contactEmail || ''} onChange={patchProfile('contactEmail')} />
              </Field>
              <Field label="Contact phone">
                <Input value={profile.contactPhone || ''} onChange={patchProfile('contactPhone')} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GST number">
                <Input value={profile.gstNumber || ''} onChange={patchProfile('gstNumber')} maxLength={20} />
              </Field>
              <Field label="Business address">
                <Input value={profile.address || ''} onChange={patchProfile('address')} maxLength={300} />
              </Field>
            </div>

            <fieldset className="rounded-lg bg-slate-50 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Payout details</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Account holder">
                  <Input value={profile.payoutDetails?.accountHolder || ''} onChange={patchPayout('accountHolder')} />
                </Field>
                <Field label="Account number (last 4)" hint="Only the last four digits are stored.">
                  <Input
                    value={profile.payoutDetails?.accountNumberLast4 || ''}
                    onChange={patchPayout('accountNumberLast4')}
                    maxLength={4}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="IFSC code">
                  <Input
                    value={profile.payoutDetails?.ifsc || ''}
                    onChange={(event) => patchPayout('ifsc')({ target: { value: event.target.value.toUpperCase() } })}
                    maxLength={11}
                    className="font-mono uppercase"
                  />
                </Field>
              </div>
            </fieldset>

            <Button type="submit" loading={saving === 'profile'}>
              Save business profile
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account details">
          <form onSubmit={saveAccount} className="space-y-4">
            <Field label="Your name" required>
              <Input value={account.name} onChange={(event) => setAccount((p) => ({ ...p, name: event.target.value }))} required />
            </Field>
            <Field label="Phone">
              <Input value={account.phone} onChange={(event) => setAccount((p) => ({ ...p, phone: event.target.value }))} />
            </Field>
            <Field label="Email" hint="Your sign-in email cannot be changed here.">
              <Input value={user?.email || ''} disabled />
            </Field>
            <Button type="submit" loading={saving === 'account'}>
              Save account details
            </Button>
          </form>
        </Card>

        <Card title="Change password" subtitle="Changing your password signs out every other session.">
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password" required>
              <Input
                type="password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords((p) => ({ ...p, currentPassword: event.target.value }))}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" required hint="At least 8 characters, with upper case, lower case and a number.">
              <Input
                type="password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords((p) => ({ ...p, newPassword: event.target.value }))}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords((p) => ({ ...p, confirmPassword: event.target.value }))}
                required
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" loading={saving === 'password'}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default BusinessProfile;
