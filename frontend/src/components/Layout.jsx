import { Outlet } from 'react-router-dom';
import SiteHeader from './SiteHeader';

/**
 * Shell for every signed-in page. The header is the same one the home page
 * uses, so the navigation never changes shape as you move around.
 *
 * Takes `children` as well as an outlet: the role-specific home pages are
 * dispatched at "/" rather than nested under a panel path, so they need to be
 * wrapped directly.
 */
const Layout = ({ children }) => (
  <div className="flex min-h-full flex-col bg-slate-50">
    <SiteHeader />

    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {children ?? <Outlet />}
    </main>

    <footer className="border-t border-slate-200 bg-white py-4">
      <p className="mx-auto max-w-7xl px-4 text-xs text-ink-500 sm:px-6">
        ParKar &middot; smart parking management &middot; vehicle recognition by Gemini Vision
      </p>
    </footer>
  </div>
);

export default Layout;
