import { Link } from 'react-router-dom';
import { statusLabel, statusTone } from '../utils/format';
import Icon from './Icon';

/**
 * Shared primitives. Kept in one file so the visual language stays consistent.
 *
 * Two rules hold this together. Corners follow the concentric chain from
 * index.css - a card is `rounded-card` (22px) and a control inside it with 8px
 * of gap is `rounded-control` (14px), so nested corners stay parallel instead
 * of drifting. And anything you press is a capsule with `.tap` on it, so the
 * whole product answers a touch the same way.
 */

export const Card = ({ title, subtitle, actions, children, className = '', padded = true }) => (
  <section
    className={`rounded-card border border-separator bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.12)] ${className}`}
  >
    {(title || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-separator px-5 py-4">
        <div>
          {title && <h2 className="text-headline text-label">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-footnote text-label-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={padded ? 'p-5' : ''}>{children}</div>
  </section>
);

/**
 * Tones carry their own hover and disabled states. Note that in dark mode
 * `brand-700` is *lighter* than `brand-600` (see index.css), so a single
 * `hover:bg-brand-700` brightens on dark and deepens on light without a
 * variant here.
 */
const buttonTones = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none',
  secondary:
    'bg-surface text-label ring-1 ring-separator-strong hover:bg-slate-50 disabled:text-label-tertiary',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-label-tertiary',
  /**
   * For the dark photographic hero bands only. Those bands are dark in BOTH
   * themes, so these two tones are deliberately absolute rather than tokenised:
   * `bg-surface` would go dark in dark mode and vanish into the photograph, and
   * `text-slate-900` would invert to white, leaving white text on a white
   * button. The literal is the same near-black as the dark surface.
   */
  light: 'bg-white text-[#1C1C1E] shadow-lg shadow-black/25 hover:bg-white/90',
  ghostLight: 'text-white ring-1 ring-inset ring-white/30 hover:bg-white/10',
};

const buttonSizes = {
  sm: 'px-3.5 py-1.5 text-footnote',
  md: 'px-4 py-2 text-footnote',
  lg: 'px-6 py-3 text-callout',
};

/**
 * Shared by Button and LinkButton so the two can never drift apart - a link
 * that looks like a button has to *be* the button, or the product grows two
 * subtly different primary actions.
 *
 * Capsule, always: the radius is half the height, so the shape is the
 * affordance and it reads as pressable at any size.
 */
const buttonClasses = (tone, size, className) =>
  `tap inline-flex items-center justify-center gap-2 rounded-capsule font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${
    buttonSizes[size] ?? buttonSizes.md
  } ${buttonTones[tone] ?? buttonTones.primary} ${className}`;

export const Button = ({
  children,
  tone = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  icon,
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={buttonClasses(tone, size, className)}
    {...rest}
  >
    {loading ? (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
    ) : (
      icon && <Icon name={icon} size={4} />
    )}
    {children}
  </button>
);

/**
 * A router link wearing the Button's clothes. Replaces the hand-rolled
 * `<Link className="rounded-lg bg-brand-600 px-4 py-2 ...">` that had been
 * copied into half a dozen pages, each a little different.
 *
 * Pass `to` for an internal route or `href` for an external one - an external
 * link opens in a new tab and is marked up accordingly.
 */
export const LinkButton = ({ to, href, children, tone = 'primary', size = 'md', className = '', icon, ...rest }) => {
  const content = (
    <>
      {icon && <Icon name={icon} size={4} />}
      {children}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={buttonClasses(tone, size, className)}
        {...rest}
      >
        {content}
        <Icon name="external" size={3.5} className="opacity-60" />
      </a>
    );
  }

  return (
    <Link to={to} className={buttonClasses(tone, size, className)} {...rest}>
      {content}
    </Link>
  );
};

export const Field = ({ label, hint, error, required, children, className = '' }) => (
  <label className={`block ${className}`}>
    {label && (
      <span className="mb-1.5 block text-footnote font-medium text-label">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
    )}
    {children}
    {hint && !error && <span className="mt-1.5 block text-caption text-label-secondary">{hint}</span>}
    {error && <span className="mt-1.5 block text-caption text-rose-600">{error}</span>}
  </label>
);

/**
 * A control sits inside a card (22px) with roughly 8px of breathing room, so
 * `rounded-control` is 14px by the concentric rule. The focus treatment is a
 * ring rather than a border swap, so the box never changes size on focus -
 * that would nudge everything after it.
 */
const controlClasses =
  'w-full rounded-control border border-separator-strong bg-surface px-3.5 py-2.5 text-callout text-label placeholder:text-label-tertiary transition-[box-shadow,border-color] duration-200 ease-cupertino focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50 disabled:text-label-tertiary';

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
  <label className={`flex cursor-pointer items-center gap-2.5 text-footnote text-label ${className}`}>
    <input
      type="checkbox"
      className="h-4 w-4 rounded-[5px] border-separator-strong text-brand-600 accent-brand-600 focus:ring-brand-500"
      {...rest}
    />
    {label}
  </label>
);

export const Badge = ({ status, children, tone, className = '' }) => (
  <span
    className={`inline-flex items-center rounded-capsule px-2.5 py-0.5 text-caption font-medium ring-1 ring-inset ${
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
      className={`flex items-start justify-between gap-3 rounded-control px-4 py-3 text-footnote ring-1 ring-inset ${tones[kind]}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="tap shrink-0 rounded-capsule px-1 text-lg leading-none opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
};

export const Spinner = ({ label = 'Loading...', className = '' }) => (
  <div className={`flex items-center justify-center gap-3 py-10 text-footnote text-label-secondary ${className}`}>
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    {label}
  </div>
);

export const EmptyState = ({ title, description, action, icon = '\u{1F17F}' }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <span aria-hidden="true" className="text-3xl opacity-30">
      {icon}
    </span>
    <h3 className="text-headline text-label">{title}</h3>
    {description && <p className="max-w-md text-footnote text-label-secondary">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const StatCard = ({ label, value, hint, tone = 'default' }) => {
  const tones = {
    default: 'text-label',
    positive: 'text-emerald-600',
    warning: 'text-amber-600',
    negative: 'text-rose-600',
    brand: 'text-brand-700',
  };
  return (
    <div className="rounded-card border border-separator bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="eyebrow text-label-secondary">{label}</p>
      {/* Tabular figures so a live counter does not jitter as digits change. */}
      <p className={`mt-1.5 text-title-3 tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-caption text-label-secondary">{hint}</p>}
    </div>
  );
};

/** Table shell: horizontal scroll lives here so pages never overflow the body. */
export const Table = ({ headers, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-separator text-footnote">
      <thead className="bg-slate-50">
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              scope="col"
              className="eyebrow whitespace-nowrap px-4 py-3 text-left text-label-secondary"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-separator bg-surface">
        {children}
        {empty}
      </tbody>
    </table>
  </div>
);

export const Td = ({ children, className = '' }) => (
  <td className={`whitespace-nowrap px-4 py-3 text-label-secondary ${className}`}>{children}</td>
);

export const Pagination = ({ pagination, onChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-separator px-5 py-3 text-footnote">
      <span className="text-label-secondary tabular-nums">
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

/**
 * The scrim is blurred as well as darkened, which is what makes the panel feel
 * like it is in front of the page rather than painted onto it. The panel itself
 * is `rounded-sheet` (28px) - the outermost radius in the chain.
 */
export const Modal = ({ open, title, onClose, children, footer }) => {
  if (!open) return null;
  return (
    <div className="glass-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-thick w-full max-w-lg rounded-sheet"
      >
        <header className="flex items-center justify-between border-b border-separator px-5 py-4">
          <h2 className="text-headline text-label">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="tap grid h-8 w-8 place-items-center rounded-capsule text-lg leading-none text-label-secondary hover:bg-slate-100 hover:text-label"
            aria-label="Close"
          >
            &times;
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-separator px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
};

/**
 * The heading every panel page opens with. Pages had been hand-rolling this
 * with four different title sizes and three different subtitle colours.
 */
export const PageHeader = ({ eyebrow, title, subtitle, actions, className = '' }) => (
  <header className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-1.5 text-label-tertiary">{eyebrow}</p>}
      <h1 className="text-title-2 text-label">{title}</h1>
      {subtitle && <p className="mt-1.5 max-w-2xl text-footnote text-label-secondary">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

/**
 * A stat with an icon, as on the driver dashboard. Distinct from StatCard: this
 * one is a *link target* and carries an icon tile, so it is the interactive
 * cousin - hence `.tap-lift` and the shadow that deepens on hover.
 */
export const Tile = ({ icon, tone = 'brand', label, value, hint, to, className = '' }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    available: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    neutral: 'bg-slate-100 text-label-secondary',
  };

  const body = (
    <>
      {icon && (
        <span aria-hidden="true" className={`grid h-9 w-9 place-items-center rounded-control ${tones[tone]}`}>
          <Icon name={icon} size={4.5} />
        </span>
      )}
      <span className="mt-3.5 block">
        <span className="eyebrow block text-label-tertiary">{label}</span>
        <span className="mt-1 block text-title-3 tabular-nums text-label">{value}</span>
        {hint && <span className="mt-0.5 block text-caption text-label-secondary">{hint}</span>}
      </span>
    </>
  );

  const shell = `block rounded-card border border-separator bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`;

  if (to) {
    return (
      <Link to={to} className={`tap-lift ${shell} hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_12px_32px_-12px_rgba(0,0,0,0.18)]`}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
};

/**
 * iOS-style segmented control, for the tabbed facility manager.
 *
 * The selected pill is a sibling that slides, rather than a background on the
 * active button - that way the movement is one transform on one element and
 * composites on the GPU, instead of two colour transitions fighting each other.
 */
export const Segmented = ({ options, value, onChange, className = '' }) => {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="tablist"
      className={`relative inline-flex rounded-capsule bg-slate-100 p-1 ${className}`}
      style={{ '--seg-count': options.length, '--seg-index': index }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-capsule bg-surface shadow-sm transition-transform duration-300 ease-cupertino"
        style={{
          width: `calc((100% - 0.5rem) / var(--seg-count))`,
          transform: `translateX(calc(var(--seg-index) * 100%))`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={`tap relative z-10 flex-1 whitespace-nowrap rounded-capsule px-4 py-1.5 text-footnote font-medium transition-colors duration-200 ${
            option.value === value ? 'text-label' : 'text-label-secondary hover:text-label'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/**
 * An occupancy or utilisation bar. The fill is a scaleX transform rather than a
 * width, so animating it never triggers layout.
 */
export const Meter = ({ value, tone, label, className = '' }) => {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  // Availability is the product's whole point, so the colour carries meaning:
  // mint while there is room, amber when it is tight, red when it is full.
  const resolved = tone || (pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'available');
  const fills = {
    available: 'bg-emerald-500',
    warn: 'bg-amber-500',
    danger: 'bg-rose-500',
    brand: 'bg-brand-500',
  };

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="eyebrow text-label-tertiary">{label}</span>
          <span className="text-caption tabular-nums text-label-secondary">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Occupancy'}
        className="h-1.5 overflow-hidden rounded-capsule bg-slate-200"
      >
        <div
          className={`h-full origin-left rounded-capsule transition-transform duration-500 ease-cupertino ${fills[resolved]}`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
};

/**
 * A pressable chip, for amenities and boolean flags that read better as
 * something you toggle than as a checkbox in a list.
 */
export const Chip = ({ label, checked, onChange, icon, className = '' }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
    className={`tap inline-flex items-center gap-2 rounded-capsule border px-3.5 py-2 text-footnote font-medium ${
      checked
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : 'border-separator-strong bg-surface text-label-secondary hover:text-label'
    } ${className}`}
  >
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
        checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-separator-strong'
      }`}
    >
      {checked && <Icon name="check" size={3.5} className="h-2.5 w-2.5" />}
    </span>
    {icon && <Icon name={icon} size={4} />}
    {label}
  </button>
);

export const KeyValue = ({ rows }) => (
  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
    {rows
      .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '')
      .map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="eyebrow text-label-tertiary">{row.label}</dt>
          <dd className="mt-1 truncate text-footnote text-label">{row.value}</dd>
        </div>
      ))}
  </dl>
);
