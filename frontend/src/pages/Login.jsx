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
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex" aria-label="ParKar home">
            <Brand size="lg" className="justify-center" />
          </Link>
          <p className="mt-3 text-sm text-ink-500">Sign in to book parking or manage your facilities.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

          <p className="text-center text-sm text-ink-500">
            No account?{' '}
            <Link to="/register" className="font-medium text-brand-700 hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Seeded demo accounts</p>
          <ul className="mt-2 space-y-1 text-sm">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-2">
                <span className="text-ink-500">{account.role}</span>
                <button
                  type="button"
                  onClick={() => setForm({ email: account.email, password: 'Parking@123' })}
                  className="font-mono text-xs text-brand-700 hover:underline"
                >
                  {account.email}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500">
            Password for all seeded accounts: <span className="font-mono">Parking@123</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
