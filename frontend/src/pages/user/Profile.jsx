import { useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { authApi, uploadAvatar } from '../../api/endpoints';
import DetailRow from '../../components/DetailRow';
import { Alert, Button, Card, Field, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

/**
 * Driver account page.
 *
 * Details are read-only until you ask to change one: every editable row has its
 * own pencil, its own save, and its own error. That keeps a phone-number fix
 * from being a whole-form submit, and makes it obvious which fields the API
 * will not let you change at all - email is the sign-in address.
 */

const ICONS = {
  pencil: 'M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z',
  camera:
    'M4.5 8.5h3l1.5-2.2h6L16.5 8.5h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Zm7.5 3.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
  alert: 'M12 8.5v5m0 3h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Human labels for the fields the API reports as missing. */
const FIELD_LABELS = {
  firstName: 'first name',
  lastName: 'last name',
  phone: 'phone number',
  drivingLicenseNumber: 'driving licence number',
  avatarUrl: 'profile picture',
};

const initialsOf = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/* --------------------------------------------------------------- page ---- */

const Profile = () => {
  const { user, refreshUser } = useAuth();

  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [notice, setNotice] = useState('');

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', notice: '' });

  const missing = user?.missingProfileFields || [];
  const complete = missing.length === 0;

  const saveField = async (payload) => {
    await authApi.updateProfile(payload);
    await refreshUser();
    setNotice('Profile updated.');
  };

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    // Let the same file be chosen again after an error.
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

  if (!user) return null;

  return (
    <div>
      {/* ---- Header band, breaking out of the page container ---- */}
      <section className="relative isolate -mx-4 -mt-8 overflow-hidden sm:-mx-6">
        <img
          src="/hero-garage.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(110deg,rgba(4,9,26,0.95)_0%,rgba(8,20,52,0.85)_55%,rgba(6,14,38,0.75)_100%)]"
        />
        <div
          aria-hidden="true"
          className="parkar-pulse absolute -right-20 top-6 h-2 w-1/2 rotate-[8deg] rounded-full bg-[linear-gradient(270deg,transparent,#22d3ee,#a5f3fc)] blur-[3px]"
        />

        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-4 py-10 sm:px-6 sm:py-12">
          {/* Avatar with the upload control layered on it */}
          <div className="relative">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white/20"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-24 w-24 place-items-center rounded-2xl bg-brand-600 text-2xl font-bold text-white ring-4 ring-white/20"
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
              className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-xl bg-white text-ink-900 shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {uploading ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <Icon name="camera" className="h-4.5 w-4.5" />
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
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{user.name}</h1>
            <p className="mt-1 truncate text-sm text-slate-200/80">{user.email}</p>
            <div className="mt-3">
              {complete ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-inset ring-emerald-300/30">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  Profile complete
                </span>
              ) : (
                <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-100 ring-1 ring-inset ring-amber-300/30">
                  {missing.length} detail{missing.length > 1 ? 's' : ''} missing
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Content sits below the band in normal flow - overlapping it made the
          photograph read as part of the form rather than as a backdrop. */}
      <div className="mx-auto mt-8 max-w-3xl space-y-4">
        {!complete && (
          <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Icon name="alert" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-900">Your profile is not complete</h2>
              <p className="mt-1 text-sm leading-relaxed text-amber-800/85">
                Still to add: {missing.map((field) => FIELD_LABELS[field] || field).join(', ')}. Facilities use these
                to identify you at the gate, so finish them before your first booking.
              </p>
            </div>
          </div>
        )}

        {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}
        {avatarError && <Alert kind="error" onDismiss={() => setAvatarError('')}>{avatarError}</Alert>}
        {passwordState.notice && (
          <Alert kind="success" onDismiss={() => setPasswordState((s) => ({ ...s, notice: '' }))}>
            {passwordState.notice}
          </Alert>
        )}
      </div>

      {/* ---- The details ---- */}
      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <Card padded={false}>
          <DetailRow
            label="First name"
            value={user.firstName}
            field="firstName"
            placeholder="Arjun"
            onSave={saveField}
          />
          <DetailRow
            label="Last name"
            value={user.lastName}
            field="lastName"
            placeholder="Sharma"
            onSave={saveField}
          />
          <DetailRow
            label="Email"
            value={user.email}
            field="email"
            locked
            lockedReason="Sign-in address"
            onSave={saveField}
          />
          <DetailRow
            label="Phone"
            value={user.phone}
            field="phone"
            type="tel"
            placeholder="+91 98765 43210"
            hint="Facility staff use this if there is a problem at the gate."
            onSave={saveField}
          />
          <DetailRow
            label="Driving licence number"
            value={user.drivingLicenseNumber}
            field="drivingLicenseNumber"
            placeholder="UP53 20220001234"
            hint="As printed on your licence. Spaces and dashes are ignored."
            transform={(value) => value.toUpperCase()}
            onSave={saveField}
          />
        </Card>

        <Card
          title="Password"
          subtitle="At least 8 characters, with a capital, a lowercase and a number."
        >
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
              <Field label="New password" required>
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
              <p className="text-sm text-ink-500">Last changed is not tracked.</p>
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
