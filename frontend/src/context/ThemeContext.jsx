import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Light or dark, driven by a class on <html>.
 *
 * Light is the default on a first visit, deliberately: the OS preference is not
 * consulted, so a new driver always lands on the breathable off-white theme and
 * dark is something they choose. Once chosen it persists.
 *
 * The class is applied by an inline script in index.html before first paint, so
 * a returning dark-mode visitor never sees a white flash. This provider owns the
 * same key and keeps React's view of it in sync afterwards.
 */

const STORAGE_KEY = 'parkar-theme';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggle: () => {} });

/**
 * localStorage throws outright - not returns null - in some hardened privacy
 * modes, so every access is guarded. Failing to read a preference is not a
 * reason to fail to render the app.
 */
const readStored = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
};

const writeStored = (theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private mode: the choice holds for this session only. */
  }
};

/** Keep the browser chrome (Safari's bar, Chrome's title bar) on our palette. */
const syncMeta = (theme) => {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#F2F2F7');
};

export const ThemeProvider = ({ children }) => {
  // Seeded from the DOM rather than from storage: the pre-paint script has
  // already decided, and reading its result keeps the two from disagreeing on
  // the first render.
  const [theme, setThemeState] = useState(() => {
    if (typeof document === 'undefined') return 'light';
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return readStored() ?? 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    syncMeta(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    const resolved = next === 'dark' ? 'dark' : 'light';
    writeStored(resolved);
    setThemeState(resolved);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      writeStored(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
