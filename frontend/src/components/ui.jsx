import { statusLabel, statusTone } from '../utils/format';

/** Shared primitives. Kept in one file so the visual language stays consistent. */

export const Card = ({ title, subtitle, actions, children, className = '', padded = true }) => (
  <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={padded ? 'p-5' : ''}>{children}</div>
  </section>
);

const buttonTones = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-white text-ink-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
};

export const Button = ({
  children,
  tone = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed ${
      size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm'
    } ${buttonTones[tone]} ${className}`}
    {...rest}
  >
    {loading && (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
    )}
    {children}
  </button>
);

export const Field = ({ label, hint, error, required, children, className = '' }) => (
  <label className={`block ${className}`}>
    {label && (
      <span className="mb-1 block text-sm font-medium text-ink-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
    )}
    {children}
    {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
  </label>
);

const controlClasses =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500';

export const Input = ({ className = '', ...rest }) => (
  <input className={`${controlClasses} ${className}`} {...rest} />
);

export const Select = ({ className = '', children, ...rest }) => (
  <select className={`${controlClasses} ${className}`} {...rest}>
    {children}
  </select>
);

export const Textarea = ({ className = '', ...rest }) => (
  <textarea className={`${controlClasses} ${className}`} rows={3} {...rest} />
);

export const Checkbox = ({ label, className = '', ...rest }) => (
  <label className={`flex cursor-pointer items-center gap-2 text-sm text-ink-700 ${className}`}>
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      {...rest}
    />
    {label}
  </label>
);

export const Badge = ({ status, children, tone, className = '' }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
      tone || statusTone(status)
    } ${className}`}
  >
    {children || statusLabel(status)}
  </span>
);

export const Alert = ({ kind = 'info', children, onDismiss }) => {
  if (!children) return null;
  const tones = {
    info: 'bg-brand-50 text-brand-800 ring-brand-200',
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  };
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[kind]}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100" aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
};

export const Spinner = ({ label = 'Loading...', className = '' }) => (
  <div className={`flex items-center justify-center gap-3 py-10 text-sm text-ink-500 ${className}`}>
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    {label}
  </div>
);

export const EmptyState = ({ title, description, action, icon = '\u{1F17F}' }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <span aria-hidden="true" className="text-3xl opacity-40">
      {icon}
    </span>
    <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
    {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const StatCard = ({ label, value, hint, tone = 'default' }) => {
  const tones = {
    default: 'text-ink-900',
    positive: 'text-emerald-600',
    warning: 'text-amber-600',
    negative: 'text-rose-600',
    brand: 'text-brand-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
};

/** Table shell: horizontal scroll lives here so pages never overflow the body. */
export const Table = ({ headers, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className="bg-slate-50">
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              scope="col"
              className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-500"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {children}
        {empty}
      </tbody>
    </table>
  </div>
);

export const Td = ({ children, className = '' }) => (
  <td className={`whitespace-nowrap px-4 py-2.5 text-ink-700 ${className}`}>{children}</td>
);

export const Pagination = ({ pagination, onChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm">
      <span className="text-ink-500">
        Page {page} of {totalPages} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <Button tone="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button tone="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
};

export const Modal = ({ open, title, onClose, children, footer }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-ink-500 hover:text-ink-900" aria-label="Close">
            &times;
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
};

export const KeyValue = ({ rows }) => (
  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
    {rows
      .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '')
      .map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{row.label}</dt>
          <dd className="mt-0.5 truncate text-sm text-ink-900">{row.value}</dd>
        </div>
      ))}
  </dl>
);
