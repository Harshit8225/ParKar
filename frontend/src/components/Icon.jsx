/**
 * The product's whole icon set, in one place.
 *
 * These paths were previously copied into seven files - Landing, BookingFlow,
 * DetailRow, UserMenu, LotForm, both Profiles and the driver Dashboard - each
 * with its own local <Icon> wrapper and its own stroke width. `camera`, `clock`,
 * `calendar`, `pin`, `lock`, `check` and `pencil` each existed three or four
 * times over. One set means an icon can be corrected once.
 *
 * All paths are drawn on a 24x24 grid with a 1.7 stroke and round joins, so they
 * sit optically level with Inter at the same size. There is no icon dependency:
 * a `d` attribute is cheaper than a package.
 */

export const ICON_PATHS = {
  /* ---- Navigation and chrome ---- */
  back: 'M14 6l-6 6 6 6',
  forward: 'M10 6l6 6-6 6',
  chevron: 'M6 9.5 12 15.5 18 9.5',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  plus: 'M12 5v14M5 12h14',
  search: 'M20.5 20.5l-4.6-4.6m1.6-4.4a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',

  /* ---- Status ---- */
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8.5v5m0 3h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 11v5.5M12 7.5h.01M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
  shield: 'M12 3.2 5 6v6c0 4.2 2.9 7.3 7 8.8 4.1-1.5 7-4.6 7-8.8V6l-7-2.8Zm-2.4 8.6 2 2 3.4-3.6',

  /* ---- Actions ---- */
  pencil: 'M4 20h4.5L19 9.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z',
  trash: 'M4.5 7.5h15M9.5 7.5V5.5h5v2m-8 0 .8 12a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-12',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4.5V10h-5.5',
  crosshair: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z',
  wand: 'M4 20 14 10m0 0 2.5-2.5M14 10l-2.5-2.5M18 3v3m0 12v3m3-9h-3M9 6H6m12 9h3M6 9H3',

  /* ---- Parking domain ---- */
  pin: 'M12 21s6.5-5.3 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.7 12 21 12 21Zm0-8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
  route: 'M6.5 20.5V9m0 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 0v6.5a4 4 0 0 1-4 4H9m0 0 2.5-2.5M9 20.5 11.5 23m6-14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  car: 'M5 17.5h14M6.5 17.5v-3.2a1.5 1.5 0 0 1 .44-1.06l2-2a1.5 1.5 0 0 1 1.06-.44h4a1.5 1.5 0 0 1 1.06.44l2 2a1.5 1.5 0 0 1 .44 1.06v3.2M4 13.5h16',
  bike: 'M5.5 18.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-13-3h6l3.5-7.5H12m2 0h3l1.5 7.5',
  bus: 'M7 18.5V20.5M17 18.5V20.5M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 17V5A1.5 1.5 0 0 1 6 3.5ZM4.5 11.5h15M4.5 7h15M8 15h.01M16 15h.01',
  camera:
    'M4.5 8.5h3l1.5-2.2h6L16.5 8.5h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Zm7.5 3.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  ticket:
    'M4 9.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5ZM12 7v11',
  radar:
    'M12 12v-8m0 8 5.7 5.7M4.2 12a7.8 7.8 0 1 0 15.6 0 7.8 7.8 0 0 0-15.6 0Zm3.4 0a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 0 0-8.8 0Z',
  bolt: 'M13.5 3 5.5 13.5h5L9.5 21l8-10.5h-5L13.5 3Z',

  /* ---- Money and time ---- */
  rupee: 'M7 4h10M7 9h10m-3.5-5c3 0 4 2 4 3.5S15.5 12 12 12H7l7 8',
  wallet:
    'M3.5 8A1.5 1.5 0 0 1 5 6.5h12A1.5 1.5 0 0 1 18.5 8m-15 0v10A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 1 3.5 8Zm13 4.5h.01',
  card: 'M3.5 9.5h17M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5Zm2 7.5h3',
  tag: 'M20.5 12.8 12.8 20.5a1.6 1.6 0 0 1-2.3 0L3.5 13.5V4.5a1 1 0 0 1 1-1h9l7 7a1.6 1.6 0 0 1 0 2.3ZM8 8h.01',
  clock: 'M12 7.5V12l3 2M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z',
  calendar:
    'M4.5 8.5h15m-11-4v3m7-3v3M6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5H6A1.5 1.5 0 0 0 4.5 7v12A1.5 1.5 0 0 0 6 20.5Z',

  /* ---- People and reporting ---- */
  user: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5ZM4.5 20a7.5 7.5 0 0 1 15 0',
  users:
    'M9 12a3.75 3.75 0 1 0 0-7.5A3.75 3.75 0 0 0 9 12Zm7-7.3a3.75 3.75 0 0 1 0 7.1M2.5 19.5a6.5 6.5 0 0 1 13 0m2-6.1a6.5 6.5 0 0 1 4 6.1',
  chart: 'M4.5 19.5V10m5 9.5V4.5m5 15V13m5 6.5V7.5',
  building:
    'M4.5 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5m0-9H19a1 1 0 0 1 1 1v8M3 20.5h18M7.5 8h3m-3 4h3m-3 4h3',
  mail: 'M3.5 7.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Zm0 .5 8.5 6 8.5-6',
  phone:
    'M7 3.5 9.5 8 7.8 9.8a12 12 0 0 0 4.4 4.4L14 12.5l4.5 2.5v3.5A1.5 1.5 0 0 1 17 20C10.4 19.4 4.6 13.6 4 7a1.5 1.5 0 0 1 1.5-1.6H7V3.5Z',
  chat: 'M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2v-10Z',
};

/**
 * `size` is in Tailwind's 4px steps (4 = h-4 w-4) so an icon lines up with the
 * text beside it without a one-off arbitrary class at every call site.
 */
const BOX = {
  3.5: 'h-3.5 w-3.5',
  4: 'h-4 w-4',
  4.5: 'h-[18px] w-[18px]',
  5: 'h-5 w-5',
  6: 'h-6 w-6',
  7: 'h-7 w-7',
};

const Icon = ({ name, size = 4, className = '' }) => {
  const d = ICON_PATHS[name];
  if (!d) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${BOX[size] ?? BOX[4]} ${className}`}
      fill="none"
    >
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/**
 * An icon on its own tinted tile - the repeated `grid h-9 w-9 place-items-center
 * rounded-xl bg-brand-50 text-brand-700` idiom, with the concentric radius and
 * the tones from the token set.
 */
export const IconTile = ({ name, tone = 'brand', size = 'md', className = '' }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    available: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    neutral: 'bg-slate-100 text-label-secondary',
  };
  const boxes = { sm: 'h-8 w-8 rounded-inner', md: 'h-9 w-9 rounded-control', lg: 'h-11 w-11 rounded-control' };

  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center ${boxes[size]} ${tones[tone]} ${className}`}>
      <Icon name={name} size={size === 'lg' ? 5 : 4.5} />
    </span>
  );
};

export default Icon;
