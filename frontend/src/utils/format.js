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

/** Tailwind classes per status, so a badge colour never has to be chosen inline. */
export const statusTone = (status) =>
  ({
    confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    active: 'bg-blue-50 text-blue-700 ring-blue-200',
    completed: 'bg-slate-100 text-slate-600 ring-slate-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200',
    pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
    payment_failed: 'bg-rose-50 text-rose-700 ring-rose-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    deactivated: 'bg-slate-100 text-slate-500 ring-slate-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    failed: 'bg-rose-50 text-rose-700 ring-rose-200',
    created: 'bg-slate-100 text-slate-600 ring-slate-200',
  })[status] || 'bg-slate-100 text-slate-600 ring-slate-200';

/** Format an <input type="datetime-local"> value from a Date, in local time. */
export const toLocalInputValue = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const percent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;
