import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import Brand from '../components/Brand';
import { Alert, Button, Field, Input } from '../components/ui';
import { homeRouteFor, useAuth } from '../context/AuthContext';

const ROLE_OPTIONS = [
  { value: 'user', title: 'Driver' },
  { value: 'owner', title: 'Parking owner' },
];

const Register = () => {
  const { register, isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    businessName: '',
    gstNumber: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to={homeRouteFor(role)} replace />;

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    // Checked here so the user is not told about it by a 422 round trip.
    if (form.password !== form.confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { confirmPassword, businessName, gstNumber, address, ...rest } = form;
      const payload =
        form.role === 'owner' ? { ...rest, businessName, gstNumber: gstNumber || undefined, address: address || undefined } : rest;
      if (!payload.phone) delete payload.phone;

      const user = await register(payload);
      navigate(homeRouteFor(user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-full items-center justify-center px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--tint)_18%,transparent)_0%,transparent_100%)]"
      />

      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex" aria-label="ParKar home">
            <Brand size="md" className="justify-center" />
          </Link>
          <h1 className="mt-4 text-title-2 text-label">Create your account</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-sheet border border-separator bg-surface p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_64px_-24px_rgba(0,0,0,0.18)]"
        >
          {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

          <fieldset>
            <legend className="mb-2.5 text-footnote font-medium text-label">I am registering as</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => (
                // A card inside the form card (22px) with ~10px of gap, so the
                // concentric rule puts this at 14px.
                <label
                  key={option.value}
                  className={`tap cursor-pointer rounded-control border p-3.5 ${
                    form.role === option.value
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                      : 'border-separator-strong hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={form.role === option.value}
                    onChange={update('role')}
                    className="sr-only"
                  />
                  <span className="block text-footnote font-medium text-label">{option.title}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Full name" required>
            <Input value={form.name} onChange={update('name')} required minLength={2} autoComplete="name" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={update('email')} required autoComplete="email" />
            </Field>
            <Field label="Phone" hint="Optional">
              <Input value={form.phone} onChange={update('phone')} autoComplete="tel" placeholder="+91 98765 43210" />
            </Field>
          </div>

          {form.role === 'owner' && (
            <div className="space-y-4 rounded-control bg-slate-50 p-4">
              <p className="eyebrow text-label-tertiary">Business details</p>
              <Field label="Business name" required>
                <Input value={form.businessName} onChange={update('businessName')} required minLength={2} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GST number" hint="Optional">
                  <Input value={form.gstNumber} onChange={update('gstNumber')} />
                </Field>
                <Field label="Business address" hint="Optional">
                  <Input value={form.address} onChange={update('address')} />
                </Field>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Password"
              required
              hint="8+ characters, upper and lower case, a number"
            >
              <Input
                type="password"
                value={form.password}
                onChange={update('password')}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password" required>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Create account
          </Button>

          <p className="text-center text-footnote text-label-secondary">
            Already registered?{' '}
            <Link to="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
