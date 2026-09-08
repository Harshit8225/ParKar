import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { authApi, uploadAvatar, usersApi } from '../../api/endpoints';
import DetailRow from '../../components/DetailRow';
import { Alert, Button, Card, Field, Input, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { dateOnly } from '../../utils/format';
import Icon from '../../components/Icon';

/**
 * Owner profile. Same shape as the driver's - read-only rows, each with its own
 * edit - but split across the two records an owner has: the person who signs
 * in, and the business that gets paid.
 */

const FIELD_LABELS = {
  firstName: 'first name',
  lastName: 'last name',
  phone: 'phone number',
  avatarUrl: 'profile picture',
};

const initialsOf = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const Profile = () => {
  const { user, refreshUser, ownerProfile, setOwnerProfile } = useAuth();

  const [profile, setProfile] = useState(ownerProfile || null);
  const [loading, setLoading] = useState(!ownerProfile);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', notice: '' });

  useEffect(() => {
    if (profile) return;
    usersApi
      .ownerProfile()
      .then(setProfile)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [profile]);

  const missing = user?.missingProfileFields || [];
  const complete = missing.length === 0;

  /** Rows on the personal record go through the auth API. */
  const saveAccountField = async (payload) => {
    await authApi.updateProfile(payload);
    await refreshUser();
    setNotice('Profile updated.');
  };

  /** Rows on the business record go through the owner-profile API. */
  const saveBusinessField = async (payload) => {
    const updated = await usersApi.updateOwnerProfile(payload);
    setProfile(updated);
    setOwnerProfile(updated);
    setNotice('Business details updated.');
  };

  /** Payout fields are nested, so they need wrapping before they are sent. */
  const savePayoutField = async (payload) => {
    const [field, value] = Object.entries(payload)[0];
    await saveBusinessField({ payoutDetails: { ...profile?.payoutDetails, [field]: value } });
  };

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('That image is over 5 MB. Pick a smaller one.');
      return;
    }

    setUploading(true);
    setAvatarError('');
    try {
      await uploadAvatar(file);
      await refreshUser();
      setNotice('Profile picture updated.');
    } catch (err) {
      setAvatarError(err.message || 'The image could not be uploaded.');
    } finally {
      setUploading(false);
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
      setPasswordOpen(false);
      setPasswordState({ saving: false, error: '', notice: 'Password changed.' });
    } catch (err) {
      setPasswordState({ saving: false, error: errorMessage(err, 'Could not change your password.'), notice: '' });
    }
  };

  if (loading) return <Spinner label="Loading your profile..." />;
  if (!user) return null;

  return (
    <div>
      {/* ---- Header band ---- */}
      <section className="band-teal relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          width="1600"
          height="500"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div aria-hidden="true" className="band-wash absolute inset-0" />
        <div
          aria-hidden="true"
          className="parkar-pulse band-strip absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-capsule blur-[3px]"
        />

        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-4 py-10 sm:px-6 sm:py-12">
          <div className="relative">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-24 w-24 rounded-card object-cover ring-4 ring-white/20" />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-24 w-24 place-items-center rounded-card bg-emerald-600 text-title-3 font-bold text-white ring-4 ring-white/25"
              >
                {initialsOf(user.name)}
              </span>
            )}

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-label={user.avatarUrl ? 'Change profile picture' : 'Upload a profile picture'}
              title={user.avatarUrl ? 'Change profile picture' : 'Upload a profile picture'}
              className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-control bg-white text-[#1C1C1E] shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-capsule border-2 border-current border-t-transparent"
                />
              ) : (
                <Icon name="camera" size={4.5} />
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={pickPhoto}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-title-1 text-white">{user.name}</h1>
            <p className="mt-1 truncate text-footnote text-white/70">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {complete ? (
                <span className="inline-flex items-center gap-1.5 rounded-capsule bg-mint/15 px-3 py-1 text-caption font-medium text-mint ring-1 ring-inset ring-mint/30">
                  <Icon name="check" size={3.5} />
                  Profile complete
                </span>
              ) : (
                <span className="rounded-capsule bg-gold/15 px-3 py-1 text-caption font-medium text-gold ring-1 ring-inset ring-gold/30">
                  {missing.length} detail{missing.length > 1 ? 's' : ''} missing
                </span>
              )}
              {profile?.isVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-capsule bg-white/10 px-3 py-1 text-caption font-medium text-white ring-1 ring-inset ring-white/20">
                  <Icon name="check" size={3.5} />
                  Business verified{profile.verifiedAt ? ` · ${dateOnly(profile.verifiedAt)}` : ''}
                </span>
              ) : (
                <span className="rounded-capsule bg-white/10 px-3 py-1 text-caption font-medium text-white/80 ring-1 ring-inset ring-white/20">
                  Business awaiting verification
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-8 max-w-3xl space-y-4">
        {!complete && (
          <div className="flex items-start gap-4 rounded-card border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-amber-100 text-amber-700">
              <Icon name="alert" size={5} />
            </span>
            <div className="min-w-0">
              <h2 className="text-headline text-amber-900">Your profile is not complete</h2>
              <p className="mt-1 text-footnote leading-relaxed text-amber-800/85">
                Still to add: {missing.map((field) => FIELD_LABELS[field] || field).join(', ')}. Drivers and platform
                admins see this when they look up who runs a facility.
              </p>
            </div>
          </div>
        )}

        {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}
        {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
        {avatarError && <Alert kind="error" onDismiss={() => setAvatarError('')}>{avatarError}</Alert>}
        {passwordState.notice && (
          <Alert kind="success" onDismiss={() => setPasswordState((s) => ({ ...s, notice: '' }))}>
            {passwordState.notice}
          </Alert>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <Card padded={false}>
          <DetailRow label="First name" value={user.firstName} field="firstName" placeholder="Ravi" onSave={saveAccountField} />
          <DetailRow label="Last name" value={user.lastName} field="lastName" placeholder="Menon" onSave={saveAccountField} />
          <DetailRow
            label="Email"
            value={user.email}
            field="email"
            locked
            lockedReason="Sign-in address"
            onSave={saveAccountField}
          />
          <DetailRow
            label="Phone"
            value={user.phone}
            field="phone"
            type="tel"
            placeholder="+91 98450 11111"
            onSave={saveAccountField}
          />
        </Card>

        <Card title="Business" padded={false}>
          <DetailRow
            label="Business name"
            value={profile?.businessName}
            field="businessName"
            placeholder="MG Road Parking Services"
            onSave={saveBusinessField}
          />
          <DetailRow
            label="Contact email"
            value={profile?.contactEmail}
            field="contactEmail"
            type="email"
            hint="Shown to drivers on your facility pages."
            onSave={saveBusinessField}
          />
          <DetailRow
            label="Contact phone"
            value={profile?.contactPhone}
            field="contactPhone"
            type="tel"
            onSave={saveBusinessField}
          />
          <DetailRow
            label="GST number"
            value={profile?.gstNumber}
            field="gstNumber"
            transform={(value) => value.toUpperCase()}
            onSave={saveBusinessField}
          />
          <DetailRow
            label="Business address"
            value={profile?.address}
            field="address"
            onSave={saveBusinessField}
          />
        </Card>

        <Card title="Payout" subtitle="Where your earnings are settled after commission." padded={false}>
          <DetailRow
            label="Account holder"
            value={profile?.payoutDetails?.accountHolder}
            field="accountHolder"
            onSave={savePayoutField}
          />
          <DetailRow
            label="Account number"
            value={profile?.payoutDetails?.accountNumberLast4}
            displayValue={
              profile?.payoutDetails?.accountNumberLast4
                ? `•••• ${profile.payoutDetails.accountNumberLast4}`
                : ''
            }
            field="accountNumberLast4"
            placeholder="4321"
            hint="Only the last four digits are stored."
            onSave={savePayoutField}
          />
          <DetailRow
            label="IFSC code"
            value={profile?.payoutDetails?.ifsc}
            field="ifsc"
            placeholder="HDFC0001234"
            transform={(value) => value.toUpperCase()}
            onSave={savePayoutField}
          />
        </Card>

        <Card title="Password" subtitle="Changing it signs out every other session.">
          {passwordOpen ? (
            <form onSubmit={savePassword} className="space-y-4">
              {passwordState.error && <Alert kind="error">{passwordState.error}</Alert>}

              <Field label="Current password" required>
                <Input
                  type="password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords((p) => ({ ...p, currentPassword: event.target.value }))}
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Field label="New password" required hint="At least 8 characters, with a capital, a lowercase and a number.">
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
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>

              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={passwordState.saving}>
                  Change password
                </Button>
                <Button
                  type="button"
                  size="sm"
                  tone="secondary"
                  onClick={() => setPasswordOpen(false)}
                  disabled={passwordState.saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-footnote text-label-secondary">Last changed is not tracked.</p>
              <Button size="sm" tone="secondary" onClick={() => setPasswordOpen(true)}>
                Change
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Profile;
