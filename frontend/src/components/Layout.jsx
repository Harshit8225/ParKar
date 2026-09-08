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
  // bg-canvas, not bg-white: the canvas is the base content layer, so cards
  // read as lifted off it - and on OLED in dark mode it is true black.
  <div className="flex min-h-full flex-col bg-canvas">
    <SiteHeader />

    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {children ?? <Outlet />}
    </main>

    <footer className="border-t border-separator py-5">
      <p className="mx-auto max-w-7xl px-4 text-caption text-label-tertiary sm:px-6">
        ParKar &middot; smart parking management &middot; vehicle recognition by Gemini Vision
      </p>
    </footer>
  </div>
);

export default Layout;
