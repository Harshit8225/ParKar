import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = {
  user: [
    { to: '/app', label: 'Dashboard', end: true },
    { to: '/app/search', label: 'Find Parking' },
    { to: '/app/bookings', label: 'My Bookings' },
    { to: '/app/payments', label: 'Payments' },
  ],
  owner: [
    { to: '/owner', label: 'Dashboard', end: true },
    { to: '/owner/lots', label: 'My Facilities' },
    { to: '/owner/lots/new', label: 'Register Facility' },
    { to: '/owner/gate', label: 'Gate Terminal' },
    { to: '/owner/profile', label: 'Business Profile' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/facilities', label: 'Facilities' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/transactions', label: 'Transactions' },
    { to: '/admin/activity', label: 'Live Activity' },
    { to: '/admin/fraud', label: 'Fraud Report' },
  ],
};

const ROLE_LABEL = { user: 'Driver', owner: 'Parking Owner', admin: 'Platform Admin' };

const Layout = () => {
  const { user, logout, role } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = NAV[role] || [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={links[0]?.to || '/'} className="flex items-center gap-2 shrink-0">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              P
            </span>
            <span className="text-base font-semibold text-ink-900">Smart Parking</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-slate-50 hover:text-ink-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink-900">{user?.name}</p>
              <p className="text-xs text-ink-500">{ROLE_LABEL[role]}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 ring-1 ring-slate-300 transition hover:bg-slate-50 hover:text-ink-900"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-lg p-2 text-ink-500 ring-1 ring-slate-300 lg:hidden"
              aria-expanded={menuOpen}
              aria-label="Toggle navigation"
            >
              <span aria-hidden="true">&#9776;</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="Mobile" className="border-t border-slate-100 bg-white px-4 py-2 lg:hidden">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-50'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="mx-auto max-w-7xl px-4 text-xs text-ink-500 sm:px-6">
          Smart Parking Management System &middot; modular monolith &middot; vehicle recognition by Gemini Vision
        </p>
      </footer>
    </div>
  );
};

export default Layout;
