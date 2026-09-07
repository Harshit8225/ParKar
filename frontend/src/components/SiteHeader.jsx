import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Brand from './Brand';
import UserMenu from './UserMenu';
import { useAuth } from '../context/AuthContext';

/**
 * The one header the whole product uses.
 *
 * Drivers and visitors get the marketing links - everything personal to them
 * lives in the avatar menu instead, so the bar stays as short as the design.
 * Owners and admins keep their panel links, because those panels have pages
 * that have nowhere else to live.
 */

const MARKETING_LINKS = [
  { hash: '#features', label: 'Features' },
  { hash: '#contact', label: 'Contact' },
  { hash: '#support', label: 'Support' },
];

const PANEL_LINKS = {
  owner: [
    { to: '/owner', label: 'Dashboard', end: true },
    { to: '/owner/lots', label: 'My Facilities' },
    { to: '/owner/lots/new', label: 'Register Facility' },
    { to: '/owner/gate', label: 'Gate Terminal' },
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

const SiteHeader = () => {
  const { isAuthenticated, loading, role } = useAuth();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile sheet whenever the route changes under it.
  useEffect(() => setMenuOpen(false), [pathname]);

  const panelLinks = PANEL_LINKS[role];
  const onLanding = pathname === '/';
  // Anchors have to be absolute once we are away from the landing page.
  const marketingHref = (hash) => (onLanding ? hash : `/${hash}`);

  return (
    <header
      className={`sticky top-0 z-50 bg-white/85 backdrop-blur-lg transition-shadow ${
        scrolled || menuOpen ? 'border-b border-slate-200/80 shadow-sm' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="shrink-0" aria-label="ParKar home">
          <Brand size="sm" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {panelLinks
            ? panelLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))
            : MARKETING_LINKS.map((link) => (
                <a
                  key={link.hash}
                  href={marketingHref(link.hash)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-slate-100 hover:text-brand-700"
                >
                  {link.label}
                </a>
              ))}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? (
            <span aria-hidden="true" className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 sm:block"
              >
                Get started
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="rounded-lg p-2 text-ink-500 ring-1 ring-slate-300 transition hover:bg-slate-50 md:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
              <path
                d={menuOpen ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-slate-100 bg-white px-4 py-2 md:hidden">
          {panelLinks
            ? panelLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-50'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))
            : MARKETING_LINKS.map((link) => (
                <a
                  key={link.hash}
                  href={marketingHref(link.hash)}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-slate-50"
                >
                  {link.label}
                </a>
              ))}
        </nav>
      )}
    </header>
  );
};

export default SiteHeader;
