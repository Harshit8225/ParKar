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

export const vehicleLabel = (type) => (type === 'two_wheeler' ? 'Two-wheeler' : 'Four-wheeler');

export const statusLabel = (status) =>
  String(status || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

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
