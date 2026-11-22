import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import Brand from '../components/Brand';
import { Alert, Button, Field, Input } from '../components/ui';
import { homeRouteFor, useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { role: 'Driver', email: 'driver1@parking.dev' },
  { role: 'Parking owner', email: 'owner1@parking.dev' },
  { role: 'Platform admin', email: 'admin@parking.dev' },
];

const Login = () => {
  const { login, isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from || homeRouteFor(role)} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form);
      navigate(location.state?.from || homeRouteFor(user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  return (
    <div className="relative isolate flex min-h-full items-center justify-center px-4 py-12">
      {/* A single soft bloom behind the card, so the page has depth without
          resorting to a busy background. Pure paint - no layout, no cost. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--tint)_18%,transparent)_0%,transparent_100%)]"
      />

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex" aria-label="ParKar home">
            <Brand size="lg" className="justify-center" />
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-sheet border border-separator bg-surface p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_64px_-24px_rgba(0,0,0,0.18)]"
        >
          {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

          <Field label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" required>
            <Input
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="current-password"
              required
              placeholder="Your password"
            />
          </Field>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Sign in
          </Button>

          <p className="text-center text-footnote text-label-secondary">
            No account?{' '}
            <Link to="/register" className="font-medium text-brand-700 hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <div className="mt-5 rounded-card border border-dashed border-separator-strong p-4">
          <p className="eyebrow text-label-tertiary">Seeded demo accounts</p>
          <ul className="mt-3 space-y-1 text-footnote">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-2">
                <span className="text-label-secondary">{account.role}</span>
                <button
                  type="button"
                  onClick={() => setForm({ email: account.email, password: 'Parking@123' })}
                  className="tap rounded-tight px-1.5 py-0.5 font-mono text-caption text-brand-700 hover:bg-brand-50"
                >
                  {account.email}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-label-tertiary">
            Password for all seeded accounts: <span className="font-mono text-label-secondary">Parking@123</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
