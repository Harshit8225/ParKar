import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandMark, BrandWord } from './Brand';
import UserMenu from './UserMenu';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/**
 * The one header the whole product uses.
 *
 * Drivers and visitors get the marketing links - everything personal to them
 * lives in the avatar menu instead, so the bar stays as short as the design.
 * Owners and admins keep their panel links, because those panels have pages
 * that have nowhere else to live.
 *
 * This is the product's only floating layer that is always on screen, so it is
 * where Liquid Glass belongs: `.glass` gives it the blur, the saturation lift
 * and the half-pixel top highlight that make content appear to pass *under* it.
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

/**
 * Which single nav link should look active.
 *
 * NavLink's own matching highlights every ancestor, so "/owner/lots/new" lights
 * up both "My Facilities" and "Register Facility". Picking the longest matching
 * path instead means exactly one link is ever active, and it keeps working as
 * panels gain deeper routes.
 */
const activeLinkFor = (pathname, links = []) => {
  const matches = links.filter((link) =>
    link.end ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`),
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, link) => (link.to.length > best.to.length ? link : best)).to;
};

/** Sun and moon on one path each, so the button carries no icon dependency. */
const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light appearance' : 'Switch to dark appearance'}
      aria-pressed={dark}
      className="tap grid h-9 w-9 place-items-center rounded-capsule text-label-secondary hover:bg-slate-100 hover:text-label"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none">
        {dark ? (
          <path
            d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 2.8v2.1M12 19.1v2.1M4.3 4.3l1.5 1.5M18.2 18.2l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.3 19.7l1.5-1.5M18.2 5.8l1.5-1.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
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
  const activeLink = activeLinkFor(pathname, panelLinks);
  const onLanding = pathname === '/';
  // Anchors have to be absolute once we are away from the landing page.
  const marketingHref = (hash) => (onLanding ? hash : `/${hash}`);

  return (
    <header
      // At the top of the page the bar is weightless; once content slides
      // beneath it, the separator and shadow fade in to establish the layer.
      className={`glass sticky top-0 z-50 transition-[box-shadow,border-color] duration-300 ease-cupertino ${
        scrolled || menuOpen ? 'border-b border-separator' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="ParKar home">
          <BrandMark size="sm" />
          <BrandWord className="text-lg" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {panelLinks
            ? panelLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={activeLink === link.to ? 'page' : undefined}
                  className={`tap rounded-capsule px-3.5 py-2 text-footnote font-medium ${
                    activeLink === link.to
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-label-secondary hover:bg-slate-100 hover:text-label'
                  }`}
                >
                  {link.label}
                </Link>
              ))
            : MARKETING_LINKS.map((link) => (
                <a
                  key={link.hash}
                  href={marketingHref(link.hash)}
                  className="tap rounded-capsule px-3.5 py-2 text-footnote font-medium text-label-secondary hover:bg-slate-100 hover:text-label"
                >
                  {link.label}
                </a>
              ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {loading ? (
            <span aria-hidden="true" className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <>
              <Link
                to="/login"
                className="tap rounded-capsule px-3.5 py-2 text-footnote font-medium text-label hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="tap hidden rounded-capsule bg-brand-600 px-4 py-2 text-footnote font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 sm:block"
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
            className="tap grid h-9 w-9 place-items-center rounded-capsule text-label-secondary ring-1 ring-separator-strong hover:bg-slate-100 md:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none">
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
        <nav aria-label="Mobile" className="border-t border-separator px-4 pb-3 pt-2 md:hidden">
          {panelLinks
            ? panelLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={activeLink === link.to ? 'page' : undefined}
                  className={`tap block rounded-control px-3.5 py-2.5 text-footnote font-medium ${
                    activeLink === link.to
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-label hover:bg-slate-100'
                  }`}
                >
                  {link.label}
                </Link>
              ))
            : MARKETING_LINKS.map((link) => (
                <a
                  key={link.hash}
                  href={marketingHref(link.hash)}
                  onClick={() => setMenuOpen(false)}
                  className="tap block rounded-control px-3.5 py-2.5 text-footnote font-medium text-label hover:bg-slate-100"
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
