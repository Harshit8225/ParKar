import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

/**
 * Avatar in the top-right corner that opens the account menu. Shows the picture
 * from the profile, falling back to initials on a brand tile until one is set.
 */

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
    { to: '/owner/profile', label: 'Profile', icon: 'user' },
    { to: '/owner', label: 'Dashboard', icon: 'chart' },
    { to: '/owner/lots', label: 'My Facilities', icon: 'calendar' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'chart' },
    { to: '/admin/users', label: 'Users', icon: 'user' },
    { to: '/admin/transactions', label: 'Transactions', icon: 'calendar' },
  ],
};

/** Just the given name - the menu is for the person, not their job title. */
const firstNameOf = (user) =>
  user.firstName || String(user.name || '').trim().split(/\s+/)[0] || 'Account';

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
        className={`tap relative flex items-center gap-1.5 rounded-capsule p-0.5 ${
          onLight ? 'hover:bg-white/15' : 'hover:bg-slate-100'
        }`}
      >
        <span className="sr-only">Account menu</span>
        {/* An unfinished profile is worth noticing without being nagged about. */}
        {user.profileComplete === false && (
          <span
            aria-hidden="true"
            title="Your profile is incomplete"
            className="absolute -right-0.5 -top-0.5 z-10 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-surface"
          />
        )}
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            aria-hidden="true"
            className="h-9 w-9 rounded-full object-cover ring-2 ring-surface"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white ring-2 ring-surface"
          >
            {initialsOf(user.name)}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 transition-transform duration-300 ease-cupertino ${
            open ? 'rotate-180' : ''
          } ${onLight ? 'text-white' : 'text-label-secondary'}`}
          fill="none"
        >
          <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          /**
           * Deliberately opaque rather than glass. A menu is read, not looked
           * through: blurred page content behind short rows of text costs
           * legibility for no gain, and the row hover states are much easier to
           * follow against a solid surface. The elevation comes from the shadow
           * and the hairline border instead.
           *
           * It reads from the label tokens rather than being pinned to white
           * text, which is what put white-on-white here in dark mode.
           */
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-control border border-separator bg-surface py-1.5 text-footnote text-label shadow-[0_2px_4px_rgba(0,0,0,0.06),0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <div className="border-b border-separator px-4 pb-2.5 pt-1.5">
            <p className="truncate font-medium">{firstNameOf(user)}</p>
          </div>

          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 transition-colors duration-150 ease-cupertino hover:bg-slate-100"
            >
              <Icon name={item.icon} size={4} className="opacity-70" />
              {item.label}
            </Link>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-separator px-4 py-2.5 text-left transition-colors duration-150 ease-cupertino hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
