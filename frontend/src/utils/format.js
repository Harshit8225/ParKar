const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export const money = (amount) => currencyFormatter.format(Number(amount) || 0);

export const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '-';

export const timeOnly = (value) =>
  value
    ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '-';

export const dateOnly = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export const duration = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

export const statusLabel = (status) =>
  String(status || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/* ------------------------------------------------------------ vehicles ---- */

/**
 * Every vehicle type the platform knows, in display order. Each per-vehicle
 * object on a lot (`capacity`, `available`, `hourlyRate`, ...) is keyed by
 * these, so pages iterate this list rather than spelling the keys out.
 *
 * `units` is space on the ground in bike-sized markers: one car space holds two
 * bikes, one bus space holds two cars.
 */
export const VEHICLE_TYPES = ['bike', 'car', 'bus'];

export const VEHICLE_META = {
  bike: { label: 'Bike', plural: 'bikes', units: 1, icon: 'bike' },
  car: { label: 'Car', plural: 'cars', units: 2, icon: 'car' },
  bus: { label: 'Bus', plural: 'buses', units: 4, icon: 'bus' },
};

/** Falls back to a readable form of the raw key for pre-migration bookings. */
export const vehicleLabel = (type) => VEHICLE_META[type]?.label || statusLabel(type) || '-';

/** "1 bike", "3 buses". */
export const vehicleCount = (type, count) => {
  const n = Number(count) || 0;
  const meta = VEHICLE_META[type];
  if (!meta) return `${n}`;
  return `${n} ${n === 1 ? meta.label.toLowerCase() : meta.plural}`;
};

/**
 * Types a lot actually accepts. A type with no hourly rate is not offered there,
 * whether or not it has bays. Falls back to every type when a lot object has no
 * rates on it (some summary lists omit them).
 */
export const offeredVehicleTypes = (lot) => {
  if (!lot?.hourlyRate) return VEHICLE_TYPES;
  return VEHICLE_TYPES.filter((type) => Number(lot.hourlyRate[type]) > 0);
};

/** "4 bikes / 10 cars / 1 bus" for a { bike, car, bus } object. */
export const vehicleCounts = (counts, { types = VEHICLE_TYPES, skipZero = false, separator = ' / ' } = {}) => {
  const parts = types
    .filter((type) => !skipZero || Number(counts?.[type]) > 0)
    .map((type) => vehicleCount(type, counts?.[type]));
  return parts.length ? parts.join(separator) : '-';
};

/**
 * How many of each type a set of flexible rows could hold if it were empty. A
 * vehicle cannot straddle two rows, so each row is floored on its own.
 */
export const flexibleCapacity = (rows = []) =>
  VEHICLE_TYPES.reduce((acc, type) => {
    const size = VEHICLE_META[type].units;
    acc[type] = rows.reduce((sum, row) => sum + Math.floor((Number(row.units) || 0) / size), 0);
    return acc;
  }, {});

/** Total markers in a lot's shared flexible zone, from whichever shape it carries. */
export const flexibleUnits = (lot) => {
  if (lot?.flexibleArea?.totalUnits !== undefined) return Number(lot.flexibleArea.totalUnits) || 0;
  const rows = lot?.flexibleArea?.rows || lot?.layout?.flexibleRows || [];
  return rows.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
};

/**
 * Badge classes per status, so a status colour is never chosen inline.
 *
 * There are only five meanings here, so they are named once and the statuses
 * map onto them. Previously each of the thirteen statuses spelled out its own
 * class string, which is how `deactivated` ended up a slightly different grey
 * from `completed` for no reason.
 *
 * The ramps invert in dark mode (see index.css), so one string is correct in
 * both themes.
 */
const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  live: 'bg-brand-50 text-brand-700 ring-brand-200',
  waiting: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200',
  idle: 'bg-slate-100 text-label-secondary ring-slate-200',
};

const STATUS_TONES = {
  confirmed: 'good',
  approved: 'good',
  paid: 'good',
  active: 'live',
  completed: 'idle',
  closed: 'idle',
  created: 'idle',
  deactivated: 'idle',
  pending: 'waiting',
  pending_payment: 'waiting',
  payment_failed: 'bad',
  rejected: 'bad',
  failed: 'bad',
};

export const statusTone = (status) => TONES[STATUS_TONES[status]] || TONES.idle;

/** Format an <input type="datetime-local"> value from a Date, in local time. */
export const toLocalInputValue = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const percent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;
