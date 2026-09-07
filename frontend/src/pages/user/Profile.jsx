import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { Alert, Button, Card, Field, Input, KeyValue } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { dateTime } from '../../utils/format';

/**
 * Driver account page - the "Profile" row in the avatar menu lands here. The
 * API only lets a driver change their name, phone and password; email and role
 * are shown read-only because they are identity, not preferences.
 */
const Profile = () => {
  const { user, refreshUser } = useAuth();

  const [details, setDetails] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [detailsState, setDetailsState] = useState({ saving: false, error: '', notice: '' });

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', notice: '' });

  const initials = String(user?.name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const saveDetails = async (event) => {
    event.preventDefault();
    setDetailsState({ saving: true, error: '', notice: '' });
    try {
      // Send only what changed; the API rejects an empty update.
      const payload = {};
      if (details.name.trim() !== user.name) payload.name = details.name.trim();
      if ((details.phone || '').trim() !== (user.phone || '')) payload.phone = details.phone.trim();

      if (Object.keys(payload).length === 0) {
        setDetailsState({ saving: false, error: '', notice: 'Nothing to save.' });
        return;
      }

      await authApi.updateProfile(payload);
      await refreshUser();
      setDetailsState({ saving: false, error: '', notice: 'Profile updated.' });
    } catch (err) {
      setDetailsState({ saving: false, error: errorMessage(err, 'Could not save your profile.'), notice: '' });
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordState({ saving: false, error: 'The two new passwords do not match.', notice: '' });
      return;
    }

    setPasswordState({ saving: true, error: '', notice: '' });
    try {
      await authApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordState({ saving: false, error: '', notice: 'Password changed.' });
    } catch (err) {
      setPasswordState({ saving: false, error: errorMessage(err, 'Could not change your password.'), notice: '' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-lg font-semibold text-white"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900">{user?.name}</h1>
          <p className="truncate text-sm text-ink-500">{user?.email}</p>
        </div>
      </div>

      <Card title="Account" subtitle="Details we cannot change from here.">
        <KeyValue
          rows={[
            { label: 'Email', value: user?.email },
            { label: 'Account type', value: 'Driver' },
            { label: 'Member since', value: dateTime(user?.createdAt) },
            { label: 'Last sign-in', value: dateTime(user?.lastLoginAt) },
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your details" subtitle="Used on bookings and receipts.">
          <form onSubmit={saveDetails} className="space-y-4">
            {detailsState.error && <Alert kind="error">{detailsState.error}</Alert>}
            {detailsState.notice && <Alert kind="success">{detailsState.notice}</Alert>}

            <Field label="Full name" required>
              <Input
                value={details.name}
                onChange={(event) => setDetails((prev) => ({ ...prev, name: event.target.value }))}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>

            <Field label="Phone" hint="Facility staff use this if there is a problem at the gate.">
              <Input
                type="tel"
                value={details.phone}
                onChange={(event) => setDetails((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="+91 98765 43210"
              />
            </Field>

            <Button type="submit" loading={detailsState.saving}>
              Save changes
            </Button>
          </form>
        </Card>

        <Card title="Password" subtitle="At least 8 characters, with a capital, a lowercase and a number.">
          <form onSubmit={savePassword} className="space-y-4">
            {passwordState.error && <Alert kind="error">{passwordState.error}</Alert>}
            {passwordState.notice && <Alert kind="success">{passwordState.notice}</Alert>}

            <Field label="Current password" required>
              <Input
                type="password"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))}
                required
                autoComplete="current-password"
              />
            </Field>

            <Field label="New password" required>
              <Input
                type="password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>

            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>

            <Button type="submit" loading={passwordState.saving}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
