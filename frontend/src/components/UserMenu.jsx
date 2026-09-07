import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Avatar in the top-right corner that opens the account menu. The User model
 * carries no photo, so the avatar is the driver's initials over a brand tile -
 * swap the <img> in when an avatarUrl lands on the profile.
 */

const ROLE_LABEL = { user: 'Driver', owner: 'Parking Owner', admin: 'Platform Admin' };

/** Menu rows per role. The driver set is the one in the marketing design. */
const MENU = {
  // Payments joins the three rows from the design: with the nav bar reduced to
  // the marketing links, the avatar menu is the only way to reach that page.
  user: [
    { to: '/app/profile', label: 'Profile', icon: 'user' },
    { to: '/app', label: 'Dashboard', icon: 'chart' },
    { to: '/app/bookings', label: 'My Bookings', icon: 'calendar' },
    { to: '/app/payments', label: 'Payments', icon: 'card' },
  ],
  owner: [
    { to: '/owner/profile', label: 'Business Profile', icon: 'user' },
    { to: '/owner', label: 'Dashboard', icon: 'chart' },
    { to: '/owner/lots', label: 'My Facilities', icon: 'calendar' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'chart' },
    { to: '/admin/users', label: 'Users', icon: 'user' },
    { to: '/admin/transactions', label: 'Transactions', icon: 'calendar' },
  ],
};

const ICONS = {
  user: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.5 20a7.5 7.5 0 0 1 15 0',
  chart: 'M4.5 19.5V10m5 9.5V4.5m5 15V13m5 6.5V7.5',
  calendar:
    'M4.5 8.5h15m-11-4v3m7-3v3M6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5H6A1.5 1.5 0 0 0 4.5 7v12A1.5 1.5 0 0 0 6 20.5Z',
  card: 'M3.5 9.5h17M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Zm2 7.5h3',
};

const MenuIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70" fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const initialsOf = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const UserMenu = ({ tone = 'dark' }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on an outside click or Escape, the two things a user expects here.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const items = MENU[role] || [];
  const onLight = tone === 'light';

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full p-0.5 transition ${
          onLight ? 'hover:bg-white/15' : 'hover:bg-slate-100'
        }`}
      >
        <span className="sr-only">Account menu</span>
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white ring-2 ring-white/70"
        >
          {initialsOf(user.name)}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 transition ${open ? 'rotate-180' : ''} ${onLight ? 'text-white' : 'text-ink-500'}`}
          fill="none"
        >
          <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-ink-900 py-1.5 text-sm text-white shadow-2xl ring-1 ring-white/10"
        >
          <div className="border-b border-white/10 px-4 pb-2.5 pt-1.5">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-white/60">{ROLE_LABEL[role] || user.email}</p>
          </div>

          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-white/10"
            >
              <MenuIcon name={item.icon} />
              {item.label}
            </Link>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-2.5 text-left transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
