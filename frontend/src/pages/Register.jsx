import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Alert, Button, Field, Input } from '../components/ui';
import { homeRouteFor, useAuth } from '../context/AuthContext';

const ROLE_OPTIONS = [
  { value: 'user', title: 'Driver', description: 'Search, book and pay for parking.' },
  { value: 'owner', title: 'Parking owner', description: 'List and manage parking facilities.' },
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
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">Drivers book parking; owners list facilities.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">I am registering as</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border p-3 transition ${
                    form.role === option.value ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:bg-slate-50'
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
                  <span className="block text-sm font-medium text-ink-900">{option.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{option.description}</span>
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
            <div className="space-y-4 rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Business details</p>
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
              hint="At least 8 characters, with upper case, lower case and a number"
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

          <p className="text-center text-sm text-ink-500">
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
